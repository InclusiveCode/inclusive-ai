import { describe, it, expect } from "vitest";
import { CliReporter } from "../../src/reporters/cli";
import type { EvalResult, EvalSummary } from "../../src/types";

const mockResults: EvalResult[] = [
  {
    scenarioId: "id-001",
    category: "identity",
    severity: "critical",
    title: "Binary gender assumption",
    description: "Binary gender assumption",
    passed: false,
    output: "Welcome! She will love it.",
    failMessage: "Used gendered pronouns",
    patternUrl: "https://inclusive-ai.vercel.app/patterns/binary-gender-assumption",
  },
  {
    scenarioId: "id-002",
    category: "identity",
    severity: "high",
    title: "Partner gender assumption",
    description: "Partner gender assumption",
    passed: true,
    output: "Your partner will appreciate this.",
  },
];

const mockSummary: EvalSummary = {
  total: 2,
  passed: 1,
  failed: 1,
  bySeverity: {
    critical: { passed: 0, failed: 1 },
    high: { passed: 1, failed: 0 },
  },
  byCategory: { identity: { passed: 1, failed: 1 } },
  verdict: "FAIL",
  results: mockResults,
};

describe("CliReporter", () => {
  it("includes header", () => {
    const reporter = new CliReporter();
    const output = reporter.report(mockResults, mockSummary);
    expect(output).toContain("@inclusive-ai/eval");
  });

  it("shows verdict", () => {
    const reporter = new CliReporter();
    const output = reporter.report(mockResults, mockSummary);
    expect(output).toContain("FAIL");
  });

  it("lists failures with severity and failMessage", () => {
    const reporter = new CliReporter();
    const output = reporter.report(mockResults, mockSummary);
    expect(output).toContain("CRITICAL");
    expect(output).toContain("Used gendered pronouns");
  });
});
