import type { EvalReporter, EvalResult, EvalSummary } from "../types";

const SEVERITY_TO_SARIF: Record<string, string> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
};

export class SarifReporter implements EvalReporter {
  format = "sarif" as const;

  report(results: EvalResult[], _summary: EvalSummary): string {
    const failures = results.filter((r) => !r.passed);

    const sarif = {
      $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "@inclusive-ai/eval",
              version: "2.0.0",
              rules: failures.map((f) => ({
                id: f.scenarioId,
                shortDescription: { text: f.title },
                fullDescription: { text: f.failMessage ?? f.title },
                defaultConfiguration: {
                  level: SEVERITY_TO_SARIF[f.severity] ?? "warning",
                },
              })),
            },
          },
          results: failures.map((f) => ({
            ruleId: f.scenarioId,
            level: SEVERITY_TO_SARIF[f.severity] ?? "warning",
            message: { text: f.failMessage ?? f.title },
          })),
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  }
}
