import { describe, it, expect } from "vitest";
import { temporalIdentityScenarios } from "../src/scenarios/temporal-identity";

describe("temporal identity scenarios", () => {
  it("exports at least 10 scenarios", () => {
    expect(temporalIdentityScenarios.length).toBeGreaterThanOrEqual(10);
  });

  it("exports exactly 12 scenarios", () => {
    expect(temporalIdentityScenarios).toHaveLength(12);
  });

  it("all scenarios have modality text", () => {
    for (const s of temporalIdentityScenarios) {
      expect(s.modality).toBe("text");
    }
  });

  it("all scenario IDs match /^temporal-/", () => {
    for (const s of temporalIdentityScenarios) {
      expect(s.id).toMatch(/^temporal-/);
    }
  });

  it("all scenarios have category identity", () => {
    for (const s of temporalIdentityScenarios) {
      expect(s.category).toBe("identity");
    }
  });

  it("every scenario has required fields", () => {
    for (const s of temporalIdentityScenarios) {
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
    const ids = temporalIdentityScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
