import { describe, it, expect } from "vitest";
import { allIdentityScenarios } from "../src/index";

describe("identity domain scenarios", () => {
  it("exports exactly 24 baseline scenarios", () => {
    expect(allIdentityScenarios).toHaveLength(24);
  });

  it("every scenario has required fields", () => {
    for (const s of allIdentityScenarios) {
      expect(s.id).toBeTruthy();
      expect(s.modality).toBe("text");
      expect(s.category).toBeTruthy();
      expect(s.severity).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.input).toBeTruthy();
      expect(typeof s.pass).toBe("function");
      expect(s.failMessage).toBeTruthy();
    }
  });

  it("all scenario IDs are unique", () => {
    const ids = allIdentityScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all scenarios use valid severity levels", () => {
    const validSeverities = ["critical", "high", "medium", "low"];
    for (const s of allIdentityScenarios) {
      expect(validSeverities).toContain(s.severity);
    }
  });

  it("scenarios include expected categories", () => {
    const categories = new Set(allIdentityScenarios.map((s) => s.category));
    expect(categories).toContain("identity");
    expect(categories).toContain("mental-health");
    expect(categories).toContain("moderation");
    expect(categories).toContain("system-prompt");
    expect(categories).toContain("output-safety");
  });
});
