/**
 * Live run history: choosing the baseline to compare against (spec §4).
 * Pass only live runs, oldest first. The simulated baseline stays the precomputed run.
 */
import { compareRuns } from "./compare";
import type { Run } from "./types";

function fullyOk(run: Run): boolean {
  return run.responses.a.status === "ok" && run.responses.b.status === "ok";
}

/** Most recent fully-ok run of the unedited baseline instruction, other than `latest`, ignoring compatibility. */
export function latestOkBaseline(runs: Run[], latest: Run, baselineInstruction: string): Run | null {
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (r.id === latest.id || r.instruction !== baselineInstruction || !fullyOk(r)) continue;
    return r;
  }
  return null;
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

/**
 * Why there is nothing to compare yet, or null when a comparison (or a refusal reason
 * against the most recent ok baseline) can be shown.
 */
export function emptyCompareState(
  runs: Run[],
  latest: Run | null,
  baselineInstruction: string,
): "no_live_run" | "baseline_only" | "baseline_errors" | null {
  if (!latest) return "no_live_run";
  if (selectBaseline(runs, latest, baselineInstruction)) return null;
  if (latestOkBaseline(runs, latest, baselineInstruction)) return null;
  const baselineRuns = runs.filter((r) => r.instruction === baselineInstruction);
  if (baselineRuns.length === 0) return "no_live_run";
  return baselineRuns.some(fullyOk) ? "baseline_only" : "baseline_errors";
}
