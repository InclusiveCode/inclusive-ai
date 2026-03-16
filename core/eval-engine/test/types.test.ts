import { describe, it, expect } from "vitest";
import type {
  TextEvalScenario,
  EvalScenario,
  AnyEvalScenario,
  EvalResult,
  EvalSummary,
  Severity,
} from "../src/types";
import { KNOWN_CATEGORIES } from "../src/types";

describe("types", () => {
  it("KNOWN_CATEGORIES includes all original categories", () => {
    const originals = [
      "identity",
      "moderation",
      "mental-health",
      "system-prompt",
      "output-safety",
      "privacy",
    ];
    for (const cat of originals) {
      expect(KNOWN_CATEGORIES).toContain(cat);
    }
  });

  it("KNOWN_CATEGORIES includes new domain categories", () => {
    expect(KNOWN_CATEGORIES).toContain("transition-care");
    expect(KNOWN_CATEGORIES).toContain("content-filtering");
    expect(KNOWN_CATEGORIES).toContain("resume-screening");
    expect(KNOWN_CATEGORIES).toContain("recommendation");
  });

  it("TextEvalScenario is assignable to EvalScenario (v1 compat)", () => {
    const scenario: TextEvalScenario = {
      id: "test-001",
      title: "Test scenario",
      description: "Test scenario",
      category: "identity",
      severity: "critical",
      modality: "text",
      input: "test input",
      pass: (output: string) => output.includes("pass"),
      failMessage: "Should have passed",
    };
    // EvalScenario is an alias for TextEvalScenario
    const v1: EvalScenario = scenario;
    expect(v1.id).toBe("test-001");
  });

  it("AnyEvalScenario discriminates on modality", () => {
    const textScenario: AnyEvalScenario = {
      id: "t-001",
      title: "Text test",
      description: "Text test",
      category: "identity",
      severity: "high",
      modality: "text",
      input: "hello",
      pass: () => true,
      failMessage: "fail",
    };

    const multiTurnScenario: AnyEvalScenario = {
      id: "mt-001",
      title: "Multi-turn test",
      category: "identity",
      severity: "high",
      modality: "multi-turn",
      turns: [
        { role: "user", content: "hello" },
        { role: "user", content: "follow up" },
      ],
      pass: (responses: string[]) => responses.length === 2,
    };

    expect(textScenario.modality).toBe("text");
    expect(multiTurnScenario.modality).toBe("multi-turn");
  });

  it("Severity includes all four levels", () => {
    const levels: Severity[] = ["critical", "high", "medium", "low"];
    expect(levels).toHaveLength(4);
  });

  it("EvalSummary.bySeverity uses string keys (not fixed union)", () => {
    const summary: EvalSummary = {
      total: 1,
      passed: 1,
      failed: 0,
      bySeverity: { critical: { passed: 1, failed: 0 } },
      byCategory: { identity: { passed: 1, failed: 0 } },
      verdict: "PASS",
      results: [],
    };
    expect(summary.bySeverity["critical"]).toBeDefined();
  });
});
