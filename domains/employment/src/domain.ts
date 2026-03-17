import type { DomainDefinition } from "@inclusive-ai/eval-core";
import { antiPatterns } from "@inclusive-ai/eval-core";
import { resumeScreeningScenarios } from "./scenarios/resume-screening";
import { interviewAiScenarios } from "./scenarios/interview-ai";
import { workplaceToolsScenarios } from "./scenarios/workplace-tools";

const allEmploymentScenarios = [
  ...resumeScreeningScenarios,
  ...interviewAiScenarios,
  ...workplaceToolsScenarios,
];

export const employmentDomain: DomainDefinition = {
  id: "employment",
  version: "3.2.0",
  name: "Employment",
  description:
    "Resume screening, interview AI, and workplace tools — LGBTQIA+ safety scenarios for employment and HR AI systems",
  categories: [
    "resume-screening",
    "interview-ai",
    "workplace-tools",
  ],
  scenarios: allEmploymentScenarios,
  antiPatterns: antiPatterns.filter((p) => p.domain === "employment"),
};
