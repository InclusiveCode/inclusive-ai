import type { DomainDefinition } from "@inclusive-ai/eval-core";
import { antiPatterns } from "@inclusive-ai/eval-core";
import { contentFilteringScenarios } from "./scenarios/content-filtering";
import { studentAiScenarios } from "./scenarios/student-ai";
import { administrativeAiScenarios } from "./scenarios/administrative-ai";
import { researchToolsScenarios } from "./scenarios/research-tools";

const allEducationScenarios = [
  ...contentFilteringScenarios,
  ...studentAiScenarios,
  ...administrativeAiScenarios,
  ...researchToolsScenarios,
];

export const educationDomain: DomainDefinition = {
  id: "education",
  version: "3.2.0",
  name: "Education",
  description:
    "Content filtering, student AI, administrative AI, and research tools — LGBT safety scenarios for education AI systems",
  categories: [
    "content-filtering",
    "student-ai",
    "administrative-ai",
    "research-tools",
  ],
  scenarios: allEducationScenarios,
  antiPatterns: antiPatterns.filter((p) => p.domain === "education"),
};
