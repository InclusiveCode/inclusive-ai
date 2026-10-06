/**
 * L7 helper: the simulated-mode behavior matrix of a lab library.
 *
 * For every scenario, every subset of the documented snippet rules, and every injected fault,
 * it records response statuses, text digests, matched rules, failure modes, every check result
 * (status, flags, evidence excerpts with provenance, omission terms), and the headline.
 * Character offsets are left out on purpose: D29 and D37 renamed the fictional people, which shifts
 * offsets without changing behavior. Old names are mapped to the new names before hashing, so a
 * library from before the renames and one after them produce the same matrix if and only if
 * behavior is unchanged.
 *
 * The library is passed in, so the same code produced the committed fixture from the pre-live-mode
 * base commit (e46a537) and checks the current code in the acceptance test.
 */
import { createHash } from "node:crypto";

export interface SimLib {
  scenarios: Array<{ id: string; baselineInstruction: string }>;
  SNIPPET_RULES: Array<{ id: string; snippet: string }>;
  SIMULATOR_VERSION: string;
  SIMULATED_CONFIG: unknown;
  simulatedResponder: unknown;
  // Loosely typed so libraries from different commits fit.
  runScenario: (...args: never[]) => Promise<unknown>;
  scenarioVerdict: (results: never) => { headline: string };
}

/** D29 and D37 renames of the fictional people and company (old → new). */
const D29_NAMES: Array<[RegExp, string]> = [
  [/Riley Hart/g, "Riley Quillfeather"],
  [/Alex Novak/g, "Alex Brambleton"],
  [/Harbor Analytics/g, "Quillmark Analytics"],
  [/Rowan Ellis/g, "Rowan Thistlecombe"],
];

function d29(text: string | undefined): string | null {
  if (text === undefined) return null;
  let out = text;
  for (const [re, to] of D29_NAMES) out = out.replace(re, to);
  return out;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

export const SIM_FAULTS = ["none", "model_error", "timeout", "credentials_unavailable", "malformed_result"] as const;

interface RunLike {
  responses: Record<"a" | "b", { status: string; text?: string; error?: string; rulesMatched?: string[]; failureModesApplied?: string[] }>;
  results: Array<{
    checkId: string;
    variant: string;
    status: string;
    flags: string[];
    evidence: Array<{ variant: string; excerpt: string; provenance?: string }>;
    omissionTerms?: string[];
  }>;
}

/** Map of `scenario|snippet ids|fault` → digest of that run's behavior. */
export async function simulatedMatrix(lib: SimLib): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const run = lib.runScenario as unknown as (...a: unknown[]) => Promise<RunLike>;
  const verdict = lib.scenarioVerdict as unknown as (r: unknown) => { headline: string };
  for (const s of lib.scenarios) {
    const n = lib.SNIPPET_RULES.length;
    for (let mask = 0; mask < 1 << n; mask++) {
      const picked = lib.SNIPPET_RULES.filter((_, i) => mask & (1 << i));
      const instruction = [s.baselineInstruction, ...picked.map((r) => r.snippet)].join("\n");
      for (const fault of SIM_FAULTS) {
        const r = await run(s, instruction, lib.simulatedResponder, lib.SIMULATED_CONFIG, {
          id: "matrix",
          createdAt: "2026-10-05T00:00:00.000Z",
          mode: "simulated",
          responderVersion: lib.SIMULATOR_VERSION,
          fault,
        });
        const row = {
          responses: (["a", "b"] as const).map((v) => ({
            status: r.responses[v].status,
            text: sha(d29(r.responses[v].text) ?? "<none>"),
            error: r.responses[v].error ?? null,
            rulesMatched: r.responses[v].rulesMatched ?? null,
            failureModesApplied: r.responses[v].failureModesApplied ?? null,
          })),
          results: r.results.map((x) => ({
            checkId: x.checkId,
            variant: x.variant,
            status: x.status,
            flags: x.flags,
            evidence: x.evidence.map((e) => `${e.variant}:${d29(e.excerpt)}:${e.provenance ?? ""}`),
            omissionTerms: x.omissionTerms ?? null,
          })),
          headline: verdict(r.results).headline,
        };
        out[`${s.id}|${picked.map((p) => p.id).join("+") || "baseline"}|${fault}`] = sha(JSON.stringify(row));
      }
    }
  }
  return out;
}
