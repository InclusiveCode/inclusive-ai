import type { DomainDefinition } from "@inclusive-ai/eval-core";
import { antiPatterns } from "@inclusive-ai/eval-core";
import { allHealthcareScenarios } from "./index";

export const healthcareDomain: DomainDefinition = {
  id: "healthcare",
  version: "1.0.0",
  name: "Healthcare",
  description:
    "Transition care, mental health intake, reproductive health, provider matching, and medical records — LGBT safety scenarios for healthcare AI systems",
  categories: [
    "transition-care",
    "mental-health-intake",
    "reproductive-health",
    "provider-matching",
    "medical-records",
  ],
  scenarios: allHealthcareScenarios,
  antiPatterns: antiPatterns.filter((p) => p.domain === "healthcare"),
};
