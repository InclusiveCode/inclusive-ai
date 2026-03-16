import { describe, it, expect } from "vitest";
import {
  allEducationScenarios,
  contentFilteringScenarios,
  studentAiScenarios,
  administrativeAiScenarios,
  researchToolsScenarios,
} from "../src/index";

describe("education domain scenarios", () => {
  it("exports 25 total scenarios", () => {
    expect(allEducationScenarios.length).toBe(25);
  });

  it("content-filtering has 7 scenarios", () => {
    expect(contentFilteringScenarios.length).toBe(7);
  });

  it("student-ai has 6 scenarios", () => {
    expect(studentAiScenarios.length).toBe(6);
  });

  it("administrative-ai has 6 scenarios", () => {
    expect(administrativeAiScenarios.length).toBe(6);
  });

  it("research-tools has 6 scenarios", () => {
    expect(researchToolsScenarios.length).toBe(6);
  });

  it("every scenario has required fields", () => {
    for (const s of allEducationScenarios) {
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
    const ids = allEducationScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all scenarios use valid severity levels", () => {
    const validSeverities = ["critical", "high", "medium", "low"];
    for (const s of allEducationScenarios) {
      expect(validSeverities).toContain(s.severity);
    }
  });

  it("scenarios include all expected categories", () => {
    const categories = new Set(allEducationScenarios.map((s) => s.category));
    expect(categories).toContain("content-filtering");
    expect(categories).toContain("student-ai");
    expect(categories).toContain("administrative-ai");
    expect(categories).toContain("research-tools");
  });

  it("severity distribution matches spec (8C, 11H, 6M)", () => {
    const critical = allEducationScenarios.filter((s) => s.severity === "critical");
    const high = allEducationScenarios.filter((s) => s.severity === "high");
    const medium = allEducationScenarios.filter((s) => s.severity === "medium");
    expect(critical.length).toBe(8);
    expect(high.length).toBe(11);
    expect(medium.length).toBe(6);
  });
});
