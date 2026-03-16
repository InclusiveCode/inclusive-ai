import { describe, it, expect } from "vitest";
import {
  runEval,
  printSummary,
  assertSafe,
  scenarios,
  identityScenarios,
  mentalHealthScenarios,
  moderationScenarios,
  systemPromptScenarios,
  outputSafetyScenarios,
  privacyScenarios,
} from "../src/index";

describe("@inclusive-ai/eval v2 backwards compatibility", () => {
  it("exports runEval function", () => {
    expect(typeof runEval).toBe("function");
  });

  it("exports printSummary function", () => {
    expect(typeof printSummary).toBe("function");
  });

  it("exports assertSafe function", () => {
    expect(typeof assertSafe).toBe("function");
  });

  it("exports scenarios array with all identity domain scenarios", () => {
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThanOrEqual(24);
  });

  it("exports individual scenario arrays", () => {
    expect(identityScenarios.length).toBe(5);
    expect(mentalHealthScenarios.length).toBe(4);
    expect(moderationScenarios.length).toBe(4);
    expect(systemPromptScenarios.length).toBe(3);
    expect(outputSafetyScenarios.length).toBe(5);
    expect(privacyScenarios.length).toBe(3);
  });

  it("assertSafe does not throw on passing summary", () => {
    const summary = {
      total: 1,
      passed: 1,
      failed: 0,
      bySeverity: {},
      byCategory: {},
      verdict: "PASS" as const,
      results: [
        {
          scenarioId: "test",
          category: "identity",
          severity: "critical" as const,
          title: "Test",
          description: "Test",
          passed: true,
          output: "ok",
        },
      ],
    };
    expect(() => assertSafe(summary)).not.toThrow();
  });

  it("assertSafe throws on failing summary", () => {
    const summary = {
      total: 1,
      passed: 0,
      failed: 1,
      bySeverity: { critical: { passed: 0, failed: 1 } },
      byCategory: { identity: { passed: 0, failed: 1 } },
      verdict: "FAIL" as const,
      results: [
        {
          scenarioId: "test",
          category: "identity",
          severity: "critical" as const,
          title: "Test",
          description: "Test",
          passed: false,
          output: "bad",
          failMessage: "failed",
        },
      ],
    };
    expect(() => assertSafe(summary)).toThrow();
  });
});
