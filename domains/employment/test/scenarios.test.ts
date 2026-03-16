import { describe, it, expect } from "vitest";
import {
  allEmploymentScenarios,
  resumeScreeningScenarios,
  interviewAiScenarios,
  workplaceToolsScenarios,
} from "../src/index";

describe("employment domain scenarios", () => {
  it("exports 25 total scenarios", () => {
    expect(allEmploymentScenarios.length).toBe(25);
  });

  it("resume-screening has 10 scenarios", () => {
    expect(resumeScreeningScenarios.length).toBe(10);
  });

  it("interview-ai has 7 scenarios", () => {
    expect(interviewAiScenarios.length).toBe(7);
  });

  it("workplace-tools has 8 scenarios", () => {
    expect(workplaceToolsScenarios.length).toBe(8);
  });

  it("every scenario has required fields", () => {
    for (const s of allEmploymentScenarios) {
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
    const ids = allEmploymentScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all scenarios use valid severity levels", () => {
    const validSeverities = ["critical", "high", "medium", "low"];
    for (const s of allEmploymentScenarios) {
      expect(validSeverities).toContain(s.severity);
    }
  });

  it("scenarios include all expected categories", () => {
    const categories = new Set(allEmploymentScenarios.map((s) => s.category));
    expect(categories).toContain("resume-screening");
    expect(categories).toContain("interview-ai");
    expect(categories).toContain("workplace-tools");
  });

  it("severity distribution matches spec", () => {
    const critical = allEmploymentScenarios.filter((s) => s.severity === "critical");
    const high = allEmploymentScenarios.filter((s) => s.severity === "high");
    const medium = allEmploymentScenarios.filter((s) => s.severity === "medium");
    expect(critical.length).toBe(7);
    expect(high.length).toBe(10);
    expect(medium.length).toBe(8);
  });
});
