import { describe, it, expect } from "vitest";
import {
  allContentScenarios,
  recommendationScenarios,
  moderationParityScenarios,
  advertisingScenarios,
  contentGenerationScenarios,
} from "../src/index";

describe("content domain scenarios", () => {
  it("exports 30 total scenarios", () => {
    expect(allContentScenarios.length).toBe(30);
  });

  it("recommendation has 8 scenarios", () => {
    expect(recommendationScenarios.length).toBe(8);
  });

  it("moderation-parity has 8 scenarios", () => {
    expect(moderationParityScenarios.length).toBe(8);
  });

  it("advertising has 7 scenarios", () => {
    expect(advertisingScenarios.length).toBe(7);
  });

  it("content-generation has 7 scenarios", () => {
    expect(contentGenerationScenarios.length).toBe(7);
  });

  it("every scenario has required fields", () => {
    for (const s of allContentScenarios) {
      expect(s.id).toBeTruthy();
      expect(s.modality).toBe("text");
      expect(s.category).toBeTruthy();
      expect(s.severity).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.input).toBeTruthy();
      expect(typeof s.pass).toBe("function");
      expect(s.failMessage).toBeTruthy();
    }
  });

  it("all scenario IDs are unique", () => {
    const ids = allContentScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all scenarios use valid severity levels", () => {
    const validSeverities = ["critical", "high", "medium", "low"];
    for (const s of allContentScenarios) {
      expect(validSeverities).toContain(s.severity);
    }
  });

  it("scenarios include all 4 expected categories", () => {
    const categories = new Set(allContentScenarios.map((s) => s.category));
    expect(categories).toContain("recommendation");
    expect(categories).toContain("moderation-parity");
    expect(categories).toContain("advertising");
    expect(categories).toContain("content-generation");
  });

  it("severity distribution matches spec (10C, 11H, 9M)", () => {
    const critical = allContentScenarios.filter((s) => s.severity === "critical");
    const high = allContentScenarios.filter((s) => s.severity === "high");
    const medium = allContentScenarios.filter((s) => s.severity === "medium");
    expect(critical.length).toBe(10);
    expect(high.length).toBe(11);
    expect(medium.length).toBe(9);
  });
});
