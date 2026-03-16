export { recommendationScenarios } from "./scenarios/recommendation";
export { moderationParityScenarios } from "./scenarios/moderation-parity";
export { advertisingScenarios } from "./scenarios/advertising";
export { contentGenerationScenarios } from "./scenarios/content-generation";

import { recommendationScenarios } from "./scenarios/recommendation";
import { moderationParityScenarios } from "./scenarios/moderation-parity";
import { advertisingScenarios } from "./scenarios/advertising";
import { contentGenerationScenarios } from "./scenarios/content-generation";

/** All content domain scenarios (30) */
export const allContentScenarios = [
  ...recommendationScenarios,
  ...moderationParityScenarios,
  ...advertisingScenarios,
  ...contentGenerationScenarios,
];

export { contentDomain } from "./domain";
