/**
 * Live run history: choosing the baseline to compare against (spec §4).
 * Pass only live runs, oldest first. The simulated baseline stays the precomputed run.
 */
import { compareRuns, modelIdentityProblem, returnedModels, sameSetup } from "./compare";
import type { Run } from "./types";

function fullyOk(run: Run): boolean {
  return run.responses.a.status === "ok" && run.responses.b.status === "ok";
}

function last<T>(items: T[]): T | undefined {
  return items.length > 0 ? items[items.length - 1] : undefined;
}

/** Most recent fully-ok run of the unedited baseline instruction that `compareRuns` accepts against `latest`. */
export function selectBaseline(runs: Run[], latest: Run, baselineInstruction: string): Run | null {
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (r.id === latest.id || r.instruction !== baselineInstruction || !fullyOk(r)) continue;
    if (compareRuns(r, latest).compatible) return r;
  }
  return null;
}

export type EmptyCompareState = "no_live_run" | "baseline_only" | "baseline_errors";

/** What "5. Compare runs" shows for the latest live run. */
export type LiveComparePlan =
  /** Nothing to compare yet, and why. */
  | { empty: EmptyCompareState }
  /** Compare with this baseline: `compareRuns` shows the comparison or why it is refused. */
  | { baseline: Run }
  /** The latest run alone is not comparable (its A and B model ids differ or one is missing). */
  | { notComparable: string };

/** Both versions completed and reported the same model id: the only kind of run that can be a baseline. */
function usable(run: Run): boolean {
  return returnedModels(run).consistent;
}

/**
 * What "5. Compare runs" shows for the latest live run (spec §4).
 *
 * - A compatible fully-ok baseline is always used. Such a baseline is always usable, because
 *   `compareRuns` refuses a run whose versions disagree on, or omit, the model id.
 * - Otherwise a latest run of the unedited instruction is never compared with a baseline of another
 *   model or settings:
 *   - usable → it is the new baseline for its setup ("baseline only");
 *   - otherwise, compared with a usable baseline of the same setup, so the reason shown is its own
 *     (a version that did not complete, or A/B model ids that differ or are missing);
 *   - with no such baseline: a fully-ok run's own model-id reason ("not comparable"), else
 *     "baseline had errors".
 * - An edited latest run is compared with an ok baseline of the same setup, else the most recent
 *   ok baseline of any setup, so the refusal reason is shown, including the
 *   "click Run baseline live with this model first" hint for another model.
 *
 * Among same-setup ok baselines, a usable one is preferred, then the most recent.
 */
export function planLiveComparison(runs: Run[], latest: Run | null, baselineInstruction: string): LiveComparePlan {
  if (!latest) return { empty: "no_live_run" };
  const compatible = selectBaseline(runs, latest, baselineInstruction);
  if (compatible) return { baseline: compatible };
  const okBaselines = runs.filter((r) => r.id !== latest.id && r.instruction === baselineInstruction && fullyOk(r));
  const sameSetupOks = okBaselines.filter((r) => sameSetup(r, latest));
  const usableSameSetup = last(sameSetupOks.filter(usable));
  if (latest.instruction === baselineInstruction) {
    if (usable(latest)) return { empty: "baseline_only" };
    // Only a usable baseline, so the reason `compareRuns` shows is about the latest run itself.
    if (usableSameSetup) return { baseline: usableSameSetup };
    const problem = fullyOk(latest) ? modelIdentityProblem(latest) : null;
    return problem ? { notComparable: problem } : { empty: "baseline_errors" };
  }
  const sameSetupOk = usableSameSetup ?? last(sameSetupOks);
  const fallback = sameSetupOk ?? last(okBaselines);
  if (fallback) return { baseline: fallback };
  return { empty: runs.some((r) => r.instruction === baselineInstruction) ? "baseline_errors" : "no_live_run" };
}

/** The empty state from `planLiveComparison`, or null when a comparison or a not-comparable reason is shown. */
export function emptyCompareState(runs: Run[], latest: Run | null, baselineInstruction: string): EmptyCompareState | null {
  const plan = planLiveComparison(runs, latest, baselineInstruction);
  return "empty" in plan ? plan.empty : null;
}
