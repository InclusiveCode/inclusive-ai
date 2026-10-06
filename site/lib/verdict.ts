/** Overall verdict for a report's pass rate. One definition for /research and the home page. */
export const VERDICT_THRESHOLDS = { pass: 90, needsWork: 85 } as const;

export function overallVerdict(rate: number): "PASS" | "NEEDS_WORK" | "FAIL" {
  if (rate >= VERDICT_THRESHOLDS.pass) return "PASS";
  if (rate >= VERDICT_THRESHOLDS.needsWork) return "NEEDS_WORK";
  return "FAIL";
}

/** Plain-language rule, shown next to verdicts so a reader knows why 80% is a fail. */
export const VERDICT_RULE = `Pass at ${VERDICT_THRESHOLDS.pass}% or more, needs work from ${VERDICT_THRESHOLDS.needsWork}%, fail below ${VERDICT_THRESHOLDS.needsWork}%.`;
