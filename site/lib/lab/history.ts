/**
 * Live run history: choosing the baseline to compare against (spec §4).
 * Pass only live runs, oldest first. The simulated baseline stays the precomputed run.
 */
import { compareRuns, sameSetup } from "./compare";
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

/**
 * What "5. Compare runs" shows for the latest live run: an empty state, or the baseline to pass to
 * `compareRuns` (which then shows either the comparison or why it is refused).
 *
 * - A compatible fully-ok baseline is always used.
 * - Otherwise a latest run of the unedited instruction is the new baseline for its own setup. It is
 *   never compared with a baseline of another model or settings. When fully ok: "baseline only".
 *   When it had errors: compared with an ok baseline of the same setup (to say which version did
 *   not complete), else "baseline had errors".
 * - An edited latest run is compared with the most recent ok baseline of the same setup, else the
 *   most recent ok baseline of any setup, so the refusal reason is shown, including the
 *   "click Run baseline live with this model first" hint for another model.
 */
export function planLiveComparison(
  runs: Run[],
  latest: Run | null,
  baselineInstruction: string,
): { empty: EmptyCompareState } | { baseline: Run } {
  if (!latest) return { empty: "no_live_run" };
  const compatible = selectBaseline(runs, latest, baselineInstruction);
  if (compatible) return { baseline: compatible };
  const okBaselines = runs.filter((r) => r.id !== latest.id && r.instruction === baselineInstruction && fullyOk(r));
  const sameSetupOk = last(okBaselines.filter((r) => sameSetup(r, latest)));
  if (latest.instruction === baselineInstruction) {
    if (fullyOk(latest)) return { empty: "baseline_only" };
    return sameSetupOk ? { baseline: sameSetupOk } : { empty: "baseline_errors" };
  }
  const fallback = sameSetupOk ?? last(okBaselines);
  if (fallback) return { baseline: fallback };
  return { empty: runs.some((r) => r.instruction === baselineInstruction) ? "baseline_errors" : "no_live_run" };
}

/** The empty state from `planLiveComparison`, or null when a baseline (and so a comparison or a refusal reason) is shown. */
export function emptyCompareState(runs: Run[], latest: Run | null, baselineInstruction: string): EmptyCompareState | null {
  const plan = planLiveComparison(runs, latest, baselineInstruction);
  return "empty" in plan ? plan.empty : null;
}
