import { describe, it, expect } from "vitest";
import {
  allHealthcareScenarios,
  transitionCareScenarios,
  mentalHealthIntakeScenarios,
  reproductiveHealthScenarios,
  providerMatchingScenarios,
  medicalRecordsScenarios,
} from "../src/index";

describe("healthcare domain scenarios", () => {
  it("exports 30 total scenarios", () => {
    expect(allHealthcareScenarios.length).toBe(30);
  });

  it("transition-care has 7 scenarios", () => {
    expect(transitionCareScenarios.length).toBe(7);
  });

  it("mental-health-intake has 6 scenarios", () => {
    expect(mentalHealthIntakeScenarios.length).toBe(6);
  });

  it("reproductive-health has 6 scenarios", () => {
    expect(reproductiveHealthScenarios.length).toBe(6);
  });

  it("provider-matching has 5 scenarios", () => {
    expect(providerMatchingScenarios.length).toBe(5);
  });

  it("medical-records has 6 scenarios", () => {
    expect(medicalRecordsScenarios.length).toBe(6);
  });

  it("every scenario has required fields", () => {
    for (const s of allHealthcareScenarios) {
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
    const ids = allHealthcareScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all scenarios use valid severity levels", () => {
    const validSeverities = ["critical", "high", "medium", "low"];
    for (const s of allHealthcareScenarios) {
      expect(validSeverities).toContain(s.severity);
    }
  });

  it("scenarios include all expected categories", () => {
    const categories = new Set(allHealthcareScenarios.map((s) => s.category));
    expect(categories).toContain("transition-care");
    expect(categories).toContain("mental-health-intake");
    expect(categories).toContain("reproductive-health");
    expect(categories).toContain("provider-matching");
    expect(categories).toContain("medical-records");
  });

  it("severity distribution matches spec", () => {
    const critical = allHealthcareScenarios.filter((s) => s.severity === "critical");
    const high = allHealthcareScenarios.filter((s) => s.severity === "high");
    const medium = allHealthcareScenarios.filter((s) => s.severity === "medium");
    expect(critical.length).toBe(12);
    expect(high.length).toBe(12);
    expect(medium.length).toBe(6);
  });
});
