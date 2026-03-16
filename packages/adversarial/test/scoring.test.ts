import { describe, it, expect } from "vitest";
import { computeBypassScore } from "../src/scoring";
import type { AdversarialResult, BypassScore } from "../src/types";

function makeResult(
  overrides: Partial<AdversarialResult> & {
    scenarioId: string;
    attackId: string;
  },
): AdversarialResult {
  return {
    originalPassed: true,
    attackPassed: true,
    bypassed: false,
    output: "test output",
    attackPrompt: "test prompt",
    ...overrides,
  };
}

describe("computeBypassScore", () => {
  it("returns RESILIENT verdict when no bypasses", () => {
    const results: AdversarialResult[] = [
      makeResult({ scenarioId: "s1", attackId: "a1" }),
      makeResult({ scenarioId: "s1", attackId: "a2" }),
      makeResult({ scenarioId: "s2", attackId: "a1" }),
      makeResult({ scenarioId: "s2", attackId: "a2" }),
    ];

    const score = computeBypassScore(results);

    expect(score.totalAttacks).toBe(4);
    expect(score.totalBypasses).toBe(0);
    expect(score.bypassRate).toBe(0);
    expect(score.verdict).toBe("RESILIENT");
  });

  it("returns VULNERABLE verdict when bypass rate > 25%", () => {
    const results: AdversarialResult[] = [
      makeResult({
        scenarioId: "s1",
        attackId: "a1",
        attackPassed: false,
        bypassed: true,
      }),
      makeResult({
        scenarioId: "s1",
        attackId: "a2",
        attackPassed: false,
        bypassed: true,
      }),
      makeResult({ scenarioId: "s2", attackId: "a1" }),
      makeResult({ scenarioId: "s2", attackId: "a2" }),
    ];

    const score = computeBypassScore(results);

    expect(score.totalAttacks).toBe(4);
    expect(score.totalBypasses).toBe(2);
    expect(score.bypassRate).toBe(0.5);
    expect(score.verdict).toBe("VULNERABLE");
  });

  it("returns PARTIAL verdict when bypass rate is 1-25%", () => {
    // 1 bypass out of 10 = 10%
    const results: AdversarialResult[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(
        makeResult({
          scenarioId: `s${i}`,
          attackId: "a1",
          attackPassed: i === 0 ? false : true,
          bypassed: i === 0,
        }),
      );
    }

    const score = computeBypassScore(results);

    expect(score.totalBypasses).toBe(1);
    expect(score.bypassRate).toBeCloseTo(0.1);
    expect(score.verdict).toBe("PARTIAL");
  });

  it("computes per-template breakdown correctly", () => {
    const results: AdversarialResult[] = [
      makeResult({
        scenarioId: "s1",
        attackId: "a1",
        attackPassed: false,
        bypassed: true,
      }),
      makeResult({
        scenarioId: "s2",
        attackId: "a1",
        attackPassed: false,
        bypassed: true,
      }),
      makeResult({ scenarioId: "s1", attackId: "a2" }),
      makeResult({ scenarioId: "s2", attackId: "a2" }),
    ];

    const score = computeBypassScore(results);

    expect(score.byTemplate["a1"]).toEqual({
      attacks: 2,
      bypasses: 2,
      rate: 1.0,
    });
    expect(score.byTemplate["a2"]).toEqual({
      attacks: 2,
      bypasses: 0,
      rate: 0,
    });
  });

  it("computes per-scenario breakdown correctly", () => {
    const results: AdversarialResult[] = [
      makeResult({
        scenarioId: "s1",
        attackId: "a1",
        attackPassed: false,
        bypassed: true,
      }),
      makeResult({ scenarioId: "s1", attackId: "a2" }),
      makeResult({ scenarioId: "s2", attackId: "a1" }),
      makeResult({ scenarioId: "s2", attackId: "a2" }),
    ];

    const score = computeBypassScore(results);

    expect(score.byScenario["s1"]).toEqual({
      attacks: 2,
      bypasses: 1,
      rate: 0.5,
    });
    expect(score.byScenario["s2"]).toEqual({
      attacks: 2,
      bypasses: 0,
      rate: 0,
    });
  });

  it("handles empty results", () => {
    const score = computeBypassScore([]);

    expect(score.totalAttacks).toBe(0);
    expect(score.totalBypasses).toBe(0);
    expect(score.bypassRate).toBe(0);
    expect(score.verdict).toBe("RESILIENT");
  });

  it("handles edge case: exactly 25% bypass rate is PARTIAL", () => {
    const results: AdversarialResult[] = [
      makeResult({
        scenarioId: "s1",
        attackId: "a1",
        attackPassed: false,
        bypassed: true,
      }),
      makeResult({ scenarioId: "s2", attackId: "a1" }),
      makeResult({ scenarioId: "s3", attackId: "a1" }),
      makeResult({ scenarioId: "s4", attackId: "a1" }),
    ];

    const score = computeBypassScore(results);

    expect(score.bypassRate).toBe(0.25);
    expect(score.verdict).toBe("PARTIAL");
  });
});
