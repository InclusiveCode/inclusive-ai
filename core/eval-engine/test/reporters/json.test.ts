import { describe, it, expect } from "vitest";
import { JsonReporter } from "../../src/reporters/json";
import type { EvalSummary } from "../../src/types";

const mockSummary: EvalSummary = {
  total: 1,
  passed: 1,
  failed: 0,
  bySeverity: { critical: { passed: 1, failed: 0 } },
  byCategory: { identity: { passed: 1, failed: 0 } },
  verdict: "PASS",
  results: [],
};

describe("JsonReporter", () => {
  it("outputs valid JSON", () => {
    const reporter = new JsonReporter();
    const output = reporter.report([], mockSummary);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("includes verdict and counts", () => {
    const reporter = new JsonReporter();
    const parsed = JSON.parse(reporter.report([], mockSummary));
    expect(parsed.verdict).toBe("PASS");
    expect(parsed.total).toBe(1);
  });
});
