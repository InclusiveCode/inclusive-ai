import type { EvalReporter, EvalResult, EvalSummary } from "../types";

export class JsonReporter implements EvalReporter {
  format = "json" as const;

  report(_results: EvalResult[], summary: EvalSummary): string {
    return JSON.stringify(summary, null, 2);
  }
}
