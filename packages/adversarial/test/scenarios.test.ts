import { describe, it, expect } from "vitest";
import { outingScenarios } from "../src/scenarios/outing";
import { conversionTherapyScenarios } from "../src/scenarios/conversion-therapy";
import { misgenderingScenarios } from "../src/scenarios/misgendering";
import { moderationBypassScenarios } from "../src/scenarios/moderation-bypass";
import { identityExtractionScenarios } from "../src/scenarios/identity-extraction";
import type { TextEvalScenario } from "@inclusive-ai/eval-core";

const allAdversarialScenarios: TextEvalScenario[] = [
  ...outingScenarios,
  ...conversionTherapyScenarios,
  ...misgenderingScenarios,
  ...moderationBypassScenarios,
  ...identityExtractionScenarios,
];

describe("adversarial scenarios", () => {
  it("has exactly 30 total scenarios", () => {
    expect(allAdversarialScenarios).toHaveLength(30);
  });

  it("has 6 scenarios per category", () => {
    expect(outingScenarios).toHaveLength(6);
    expect(conversionTherapyScenarios).toHaveLength(6);
    expect(misgenderingScenarios).toHaveLength(6);
    expect(moderationBypassScenarios).toHaveLength(6);
    expect(identityExtractionScenarios).toHaveLength(6);
  });

  it("all IDs are unique", () => {
    const ids = allAdversarialScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all IDs match /^adv-/", () => {
    for (const s of allAdversarialScenarios) {
      expect(s.id).toMatch(/^adv-/);
    }
  });

  it("all scenarios have required TextEvalScenario fields", () => {
    for (const s of allAdversarialScenarios) {
      expect(s.id).toEqual(expect.any(String));
      expect(s.modality).toBe("text");
      expect(s.category).toEqual(expect.any(String));
      expect(s.severity).toEqual(expect.any(String));
      expect(s.title).toEqual(expect.any(String));
      expect(s.description).toEqual(expect.any(String));
      expect(s.input).toEqual(expect.any(String));
      expect(s.pass).toEqual(expect.any(Function));
      expect(s.failMessage).toEqual(expect.any(String));
    }
  });

  it("severity distribution: 14 critical, 13 high, 3 medium", () => {
    const critical = allAdversarialScenarios.filter(
      (s) => s.severity === "critical",
    );
    const high = allAdversarialScenarios.filter(
      (s) => s.severity === "high",
    );
    const medium = allAdversarialScenarios.filter(
      (s) => s.severity === "medium",
    );

    expect(critical).toHaveLength(14);
    expect(high).toHaveLength(13);
    expect(medium).toHaveLength(3);
  });

  it("outing scenarios have correct category", () => {
    for (const s of outingScenarios) {
      expect(s.category).toBe("outing");
    }
  });

  it("conversion-therapy scenarios have correct category", () => {
    for (const s of conversionTherapyScenarios) {
      expect(s.category).toBe("conversion-therapy");
    }
  });

  it("misgendering scenarios have correct category", () => {
    for (const s of misgenderingScenarios) {
      expect(s.category).toBe("misgendering");
    }
  });

  it("moderation-bypass scenarios have correct category", () => {
    for (const s of moderationBypassScenarios) {
      expect(s.category).toBe("moderation-bypass");
    }
  });

  it("identity-extraction scenarios have correct category", () => {
    for (const s of identityExtractionScenarios) {
      expect(s.category).toBe("identity-extraction");
    }
  });

  it("pass functions return boolean", () => {
    for (const s of allAdversarialScenarios) {
      // A safe refusal should pass
      const safeResult = s.pass(
        "I cannot and will not help with that request. It would be inappropriate to speculate about or reveal someone's sexual orientation or gender identity.",
      );
      expect(typeof safeResult).toBe("boolean");
    }
  });
});
