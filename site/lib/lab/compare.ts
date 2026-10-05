/**
 * Compares two runs check by check. Refuses unless both runs used the same
 * scenario, rubric, checks, mode, responder, and config. Human overrides are
 * never an input here, so they cannot change a classification.
 */
import type { CheckStatus, ResponseRecord, ResponseStatus, ResultVariant, Run, RunConfig } from "./types";

export type RowClass = "improved" | "regressed" | "unchanged" | "inconclusive";

export interface CompareRow {
  checkId: string;
  variant: ResultVariant;
  before: CheckStatus;
  after: CheckStatus;
  classification: RowClass;
  /** Live runs only: both runs used the same instruction, so any difference is run-to-run variation. */
  variation?: true;
}

export type Comparison =
  | { compatible: false; reason: string }
  | { compatible: true; instructionUnchanged: boolean; rows: CompareRow[]; summary: Record<RowClass, number> };

function sameConfig(x: RunConfig, y: RunConfig): boolean {
  return x.provider === y.provider && x.model === y.model && x.temperature === y.temperature && x.maxTokens === y.maxTokens;
}

/** The model ids the provider reported for each version. Consistent = both ok with the same id. */
export function returnedModels(run: Run): { a?: string; b?: string; consistent: boolean } {
  const { a, b } = run.responses;
  return {
    a: a.returnedModel,
    b: b.returnedModel,
    consistent: a.status === "ok" && b.status === "ok" && a.returnedModel !== undefined && a.returnedModel === b.returnedModel,
  };
}

const INCOMPLETE: Record<Exclude<ResponseStatus, "ok">, string> = {
  timeout: "timed out",
  model_error: "model error",
  credentials_unavailable: "credentials unavailable",
  provider_refused: "declined by the provider",
  not_run: "not run",
};

function incompleteReason(r: ResponseRecord): string | null {
  if (r.status === "ok") return null;
  if (r.status === "not_run" && r.error === "Cancelled") return "cancelled";
  return INCOMPLETE[r.status];
}

/** Live runs: why a run is unusable for comparison (incomplete versions first, then model identity), or null. */
function modelIdentityProblem(run: Run): string | null {
  // A refusal of one version while the other completed (ok) is the asymmetry the D34 note
  // highlights; never suggest rerunning until it goes away. If the other version also failed,
  // the asymmetry is not established and the reasons below name both, with a rerun hint.
  const { a, b } = run.responses;
  const refusedOnly =
    a.status === "provider_refused" && b.status === "ok" ? "A" : b.status === "provider_refused" && a.status === "ok" ? "B" : null;
  if (refusedOnly) {
    return `Version ${refusedOnly} was declined by the provider's safety system — not comparable (see the note under “3. Review findings”)`;
  }
  const ra = incompleteReason(run.responses.a);
  const rb = incompleteReason(run.responses.b);
  if (ra && rb) return `Versions A and B did not complete (A: ${ra}; B: ${rb}) — rerun to compare`;
  if (ra) return `Version A did not complete (${ra}) — rerun to compare`;
  if (rb) return `Version B did not complete (${rb}) — rerun to compare`;
  const m = returnedModels(run);
  if (m.a !== undefined && m.b !== undefined && m.a !== m.b) return "Versions A and B were answered by different model versions";
  const missing = (["a", "b"] as const).filter((v) => m[v] === undefined).map((v) => v.toUpperCase());
  if (missing.length > 0) {
    return `Version${missing.length > 1 ? "s" : ""} ${missing.join(" and ")} did not return a model id, so the model version is unknown`;
  }
  return null;
}

export function classify(before: CheckStatus, after: CheckStatus): RowClass {
  const decided = (s: CheckStatus) => s === "pass" || s === "fail";
  if (!decided(before) || !decided(after)) return "inconclusive";
  if (before === after) return "unchanged";
  return before === "fail" ? "improved" : "regressed";
}

const SETUP_FIELDS = ["scenarioId", "scenarioVersion", "rubricVersion", "checksHash", "mode", "responderVersion"] as const;

/**
 * Same scenario, rubric, checks, mode, responder, and requested config: everything `compareRuns`
 * checks before it looks at the responses.
 */
export function sameSetup(x: Run, y: Run): boolean {
  return SETUP_FIELDS.every((f) => x[f] === y[f]) && sameConfig(x.config, y.config);
}

/** Shown for an edited live run when the only ok baselines used another model or settings. */
export const LIVE_CONFIG_DIFFERS = "config differs (provider, model, temperature, or max tokens) — click “Run baseline live” with this model first.";

export function compareRuns(before: Run, after: Run): Comparison {
  for (const f of SETUP_FIELDS) {
    if (before[f] !== after[f]) {
      return { compatible: false, reason: `${f} differs (${before[f]} vs ${after[f]}).` };
    }
  }
  if (!sameConfig(before.config, after.config)) {
    const reason = before.mode === "live" ? LIVE_CONFIG_DIFFERS : "config differs (provider, model, temperature, or max tokens).";
    return { compatible: false, reason };
  }
  const live = before.mode === "live";
  if (live) {
    const problem = modelIdentityProblem(before) ?? modelIdentityProblem(after);
    if (problem) return { compatible: false, reason: problem };
    if (before.responses.a.returnedModel !== after.responses.a.returnedModel) {
      return { compatible: false, reason: "Different model versions answered the two runs" };
    }
  }

  const key = (r: { checkId: string; variant: ResultVariant }) => `${r.checkId}/${r.variant}`;
  const afterByKey = new Map(after.results.map((r) => [key(r), r]));
  const seen = new Set<string>();
  const rows: CompareRow[] = [];
  for (const b of before.results) {
    const k = key(b);
    if (seen.has(k)) continue;
    seen.add(k);
    const a = afterByKey.get(k);
    const afterStatus: CheckStatus = a ? a.status : "error";
    rows.push({ checkId: b.checkId, variant: b.variant, before: b.status, after: afterStatus, classification: classify(b.status, afterStatus) });
  }
  for (const a of after.results) {
    const k = key(a);
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ checkId: a.checkId, variant: a.variant, before: "error", after: a.status, classification: "inconclusive" });
  }

  const summary: Record<RowClass, number> = { improved: 0, regressed: 0, unchanged: 0, inconclusive: 0 };
  for (const r of rows) summary[r.classification] += 1;

  const instructionUnchanged = before.instructionFingerprint === after.instructionFingerprint && before.instruction === after.instruction;
  if (live && instructionUnchanged) for (const r of rows) r.variation = true;

  return { compatible: true, instructionUnchanged, rows, summary };
}
