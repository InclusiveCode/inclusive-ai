import type { DomainDefinition } from "@inclusive-ai/eval-core";
import { antiPatterns } from "@inclusive-ai/eval-core";
import { allEmploymentScenarios } from "./index";

export const employmentDomain: DomainDefinition = {
  id: "employment",
  version: "1.0.0",
  name: "Employment",
  description:
    "Resume screening, interview AI, and workplace tools — LGBT safety scenarios for employment and HR AI systems",
  categories: [
    "resume-screening",
    "interview-ai",
    "workplace-tools",
  ],
  scenarios: allEmploymentScenarios,
  antiPatterns: antiPatterns.filter((p) => p.domain === "employment"),
};
