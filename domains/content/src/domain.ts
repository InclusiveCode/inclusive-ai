import type { DomainDefinition } from "@inclusive-ai/eval-core";
import { antiPatterns } from "@inclusive-ai/eval-core";
import { recommendationScenarios } from "./scenarios/recommendation";
import { moderationParityScenarios } from "./scenarios/moderation-parity";
import { advertisingScenarios } from "./scenarios/advertising";
import { contentGenerationScenarios } from "./scenarios/content-generation";

const allContentScenarios = [
  ...recommendationScenarios,
  ...moderationParityScenarios,
  ...advertisingScenarios,
  ...contentGenerationScenarios,
];

export const contentDomain: DomainDefinition = {
  id: "content",
  version: "3.2.0",
  name: "Content Platforms",
  description:
    "Recommendation, moderation parity, advertising, and content generation — LGBTQIA+ safety scenarios for content platform AI systems",
  categories: [
    "recommendation",
    "moderation-parity",
    "advertising",
    "content-generation",
  ],
  scenarios: allContentScenarios,
  antiPatterns: antiPatterns.filter((p) => p.domain === "content"),
};
