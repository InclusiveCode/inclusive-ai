import { describe, it, expect } from "vitest";
import { intersectionalityScenarios } from "../src/scenarios/intersectionality";

describe("intersectionality scenarios", () => {
  it("exports at least 10 scenarios", () => {
    expect(intersectionalityScenarios.length).toBeGreaterThanOrEqual(10);
  });

  it("exports exactly 12 scenarios", () => {
    expect(intersectionalityScenarios).toHaveLength(12);
  });

  it("all scenarios have modality text", () => {
    for (const s of intersectionalityScenarios) {
      expect(s.modality).toBe("text");
    }
  });

  it("all scenario IDs match /^intersect-/", () => {
    for (const s of intersectionalityScenarios) {
      expect(s.id).toMatch(/^intersect-/);
    }
  });

  it("all scenarios have category identity", () => {
    for (const s of intersectionalityScenarios) {
      expect(s.category).toBe("identity");
    }
  });

  it("covers compound identity scenarios", () => {
    // At least one input mentions both an LGBT identity AND another marginalized identity
    const compoundScenarios = intersectionalityScenarios.filter(
      (s) =>
        /\b(trans|queer|gay|lesbian|bisexual|nonbinary|two.spirit)\b/i.test(
          s.input,
        ) &&
        /\b(black|disabled|disabilit|wheelchair|immigrant|muslim|elderly|indigenous|deaf|autistic|undocumented)\b/i.test(
          s.input,
        ),
    );
    expect(compoundScenarios.length).toBeGreaterThanOrEqual(1);
  });

  it("every scenario has required fields", () => {
    for (const s of intersectionalityScenarios) {
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
    const ids = intersectionalityScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
