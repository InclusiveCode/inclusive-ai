import { describe, it, expect } from "vitest";
import {
  runEval,
  printSummary,
  assertSafe,
  scenarios,
  allScenarios,
  domains,
  getScenariosByDomain,
  identityScenarios,
  mentalHealthScenarios,
  moderationScenarios,
  systemPromptScenarios,
  outputSafetyScenarios,
  privacyScenarios,
  adversarialScenarios,
  runAdversarial,
  wrapWithAttacks,
  computeBypassScore,
  allTemplates,
} from "../src/index";

describe("@inclusive-ai/eval v3 backwards compatibility", () => {
  it("exports runEval function", () => {
    expect(typeof runEval).toBe("function");
  });

  it("exports printSummary function", () => {
    expect(typeof printSummary).toBe("function");
  });

  it("exports assertSafe function", () => {
    expect(typeof assertSafe).toBe("function");
  });

  it("exports scenarios array with all domain scenarios (>= 115)", () => {
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThanOrEqual(115);
  });

  it("exports allScenarios array with all domain scenarios (>= 115)", () => {
    expect(Array.isArray(allScenarios)).toBe(true);
    expect(allScenarios.length).toBeGreaterThanOrEqual(115);
  });

  it("scenarios is an alias for allScenarios", () => {
    expect(scenarios).toBe(allScenarios);
  });

  it("exports domains array with 3 domains", () => {
    expect(Array.isArray(domains)).toBe(true);
    expect(domains.length).toBe(3);
    const domainIds = domains.map((d) => d.id);
    expect(domainIds).toContain("identity");
    expect(domainIds).toContain("healthcare");
    expect(domainIds).toContain("employment");
  });

  it("getScenariosByDomain('identity') returns 60 scenarios", () => {
    const result = getScenariosByDomain("identity");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(60);
  });

  it("getScenariosByDomain('healthcare') returns 30 scenarios", () => {
    const result = getScenariosByDomain("healthcare");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(30);
  });

  it("getScenariosByDomain('employment') returns 25 scenarios", () => {
    const result = getScenariosByDomain("employment");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(25);
  });

  it("getScenariosByDomain throws on unknown domain", () => {
    expect(() => getScenariosByDomain("unknown")).toThrow();
  });

  it("exports individual identity scenario arrays", () => {
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

  // ── Adversarial exports ──────────────────────────────────────────────────────

  it("exports adversarialScenarios with exactly 30 entries", () => {
    expect(Array.isArray(adversarialScenarios)).toBe(true);
    expect(adversarialScenarios.length).toBe(30);
  });

  it("adversarialScenarios is NOT included in allScenarios", () => {
    const allIds = new Set(allScenarios.map((s) => s.id));
    for (const s of adversarialScenarios) {
      expect(allIds.has(s.id)).toBe(false);
    }
  });

  it("adversarialScenarios is NOT included in scenarios (allScenarios alias)", () => {
    const scenarioIds = new Set(scenarios.map((s) => s.id));
    for (const s of adversarialScenarios) {
      expect(scenarioIds.has(s.id)).toBe(false);
    }
  });

  it("exports runAdversarial as a function", () => {
    expect(typeof runAdversarial).toBe("function");
  });

  it("exports wrapWithAttacks as a function", () => {
    expect(typeof wrapWithAttacks).toBe("function");
  });

  it("exports computeBypassScore as a function", () => {
    expect(typeof computeBypassScore).toBe("function");
  });

  it("exports allTemplates with exactly 15 entries", () => {
    expect(Array.isArray(allTemplates)).toBe(true);
    expect(allTemplates.length).toBe(15);
  });

  it("all templates have required fields", () => {
    for (const t of allTemplates) {
      expect(typeof t.id).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(typeof t.category).toBe("string");
      expect(typeof t.apply).toBe("function");
    }
  });

  it("template IDs are unique", () => {
    const ids = allTemplates.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
