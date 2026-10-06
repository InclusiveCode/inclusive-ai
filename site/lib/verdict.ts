/**
 * Verdicts on this site follow the eval suite's own rule (core/eval-engine runner.ts): any critical
 * failure is a FAIL, otherwise any high-severity failure is NEEDS_WORK, otherwise PASS. The
 * per-domain verdicts stored in lib/reports.ts were produced by that rule, so the overall verdict
 * and every bar on /research and the home page use it too.
 */
export type Verdict = "PASS" | "NEEDS_WORK" | "FAIL";

export function verdictFor(failures: ReadonlyArray<{ severity: string }>): Verdict {
  if (failures.some((f) => f.severity === "critical")) return "FAIL";
  if (failures.some((f) => f.severity === "high")) return "NEEDS_WORK";
  return "PASS";
}

/** Plain-language rule, shown next to verdicts so a reader knows why 80% can be a fail. */
export const VERDICT_RULE =
  "Verdicts follow the eval suite: fail if any critical scenario fails, needs work if any high-severity scenario fails, pass otherwise.";
