import { describe, it, expect } from "vitest";
import { SarifReporter } from "../../src/reporters/sarif";
import type { EvalResult, EvalSummary } from "../../src/types";

const failResult: EvalResult = {
  scenarioId: "id-001",
  category: "identity",
  severity: "critical",
  title: "Binary gender assumption",
  description: "Binary gender assumption",
  passed: false,
  output: "She will love it.",
  failMessage: "Used gendered pronouns",
};

const mockSummary: EvalSummary = {
  total: 1,
  passed: 0,
  failed: 1,
  bySeverity: { critical: { passed: 0, failed: 1 } },
  byCategory: { identity: { passed: 0, failed: 1 } },
  verdict: "FAIL",
  results: [failResult],
};

describe("SarifReporter", () => {
  it("outputs valid SARIF JSON", () => {
    const reporter = new SarifReporter();
    const output = reporter.report([failResult], mockSummary);
    const parsed = JSON.parse(output);
    expect(parsed.$schema).toContain("sarif");
    expect(parsed.version).toBe("2.1.0");
  });

  it("maps failures to SARIF results", () => {
    const reporter = new SarifReporter();
    const parsed = JSON.parse(reporter.report([failResult], mockSummary));
    const run = parsed.runs[0];
    expect(run.results).toHaveLength(1);
    expect(run.results[0].ruleId).toBe("id-001");
  });

  it("maps severity to SARIF level", () => {
    const reporter = new SarifReporter();
    const parsed = JSON.parse(reporter.report([failResult], mockSummary));
    expect(parsed.runs[0].results[0].level).toBe("error");
  });
});
