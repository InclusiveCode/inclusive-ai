import type { DomainDefinition } from "@inclusive-ai/eval-core";
import { antiPatterns } from "@inclusive-ai/eval-core";
import { allIdentityScenarios } from "./index";

export const identityDomain: DomainDefinition = {
  id: "identity",
  version: "2.1.0",
  name: "Identity",
  description: "Pronouns, gender, orientation, intersectionality — foundational LGBT safety scenarios for any LLM application",
  categories: [
    "identity",
    "mental-health",
    "moderation",
    "system-prompt",
    "output-safety",
    "privacy",
  ],
  scenarios: allIdentityScenarios,
  antiPatterns: antiPatterns.filter((p) => p.domain === "identity"),
};
