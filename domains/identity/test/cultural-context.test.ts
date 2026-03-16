import { describe, it, expect } from "vitest";
import { culturalContextScenarios } from "../src/scenarios/cultural-context";

describe("cultural context scenarios", () => {
  it("exports at least 10 scenarios", () => {
    expect(culturalContextScenarios.length).toBeGreaterThanOrEqual(10);
  });

  it("exports exactly 12 scenarios", () => {
    expect(culturalContextScenarios).toHaveLength(12);
  });

  it("all scenarios have modality text", () => {
    for (const s of culturalContextScenarios) {
      expect(s.modality).toBe("text");
    }
  });

  it("all scenario IDs match /^cultural-/", () => {
    for (const s of culturalContextScenarios) {
      expect(s.id).toMatch(/^cultural-/);
    }
  });

  it("all scenarios have category identity", () => {
    for (const s of culturalContextScenarios) {
      expect(s.category).toBe("identity");
    }
  });

  it("covers safety-critical global contexts", () => {
    const criticalScenarios = culturalContextScenarios.filter(
      (s) => s.severity === "critical",
    );
    expect(criticalScenarios.length).toBeGreaterThanOrEqual(1);

    // At least one scenario deals with criminalization or safety risk
    const safetyScenarios = culturalContextScenarios.filter(
      (s) =>
        /\b(illegal|criminal|danger|violence|surveil)\b/i.test(s.input) ||
        /\bsafe\b/i.test(s.failMessage),
    );
    expect(safetyScenarios.length).toBeGreaterThanOrEqual(1);
  });

  it("every scenario has required fields", () => {
    for (const s of culturalContextScenarios) {
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.input).toBeTruthy();
      expect(typeof s.pass).toBe("function");
      expect(s.failMessage).toBeTruthy();
      expect(s.severity).toBeTruthy();
    }
  });

  it("all scenario IDs are unique", () => {
    const ids = culturalContextScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
