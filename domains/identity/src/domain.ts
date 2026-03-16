import type { DomainDefinition } from "@inclusive-ai/eval-core";
import { antiPatterns } from "@inclusive-ai/eval-core";
import { identityScenarios } from "./scenarios/identity";
import { mentalHealthScenarios } from "./scenarios/mental-health";
import { moderationScenarios } from "./scenarios/moderation";
import { systemPromptScenarios } from "./scenarios/system-prompt";
import { outputSafetyScenarios } from "./scenarios/output-safety";
import { privacyScenarios } from "./scenarios/privacy";
import { intersectionalityScenarios } from "./scenarios/intersectionality";
import { culturalContextScenarios } from "./scenarios/cultural-context";
import { temporalIdentityScenarios } from "./scenarios/temporal-identity";

const allIdentityScenarios = [
  ...identityScenarios,
  ...mentalHealthScenarios,
  ...moderationScenarios,
  ...systemPromptScenarios,
  ...outputSafetyScenarios,
  ...privacyScenarios,
  ...intersectionalityScenarios,
  ...culturalContextScenarios,
  ...temporalIdentityScenarios,
];

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
