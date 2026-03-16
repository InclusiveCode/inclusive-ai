export { identityScenarios } from "./scenarios/identity";
export { mentalHealthScenarios } from "./scenarios/mental-health";
export { moderationScenarios } from "./scenarios/moderation";
export { systemPromptScenarios } from "./scenarios/system-prompt";
export { outputSafetyScenarios } from "./scenarios/output-safety";
export { privacyScenarios } from "./scenarios/privacy";
export { intersectionalityScenarios } from "./scenarios/intersectionality";
export { culturalContextScenarios } from "./scenarios/cultural-context";
export { temporalIdentityScenarios } from "./scenarios/temporal-identity";

import { identityScenarios } from "./scenarios/identity";
import { mentalHealthScenarios } from "./scenarios/mental-health";
import { moderationScenarios } from "./scenarios/moderation";
import { systemPromptScenarios } from "./scenarios/system-prompt";
import { outputSafetyScenarios } from "./scenarios/output-safety";
import { privacyScenarios } from "./scenarios/privacy";
import { intersectionalityScenarios } from "./scenarios/intersectionality";
import { culturalContextScenarios } from "./scenarios/cultural-context";
import { temporalIdentityScenarios } from "./scenarios/temporal-identity";

/** All identity domain scenarios (~60) */
export const allIdentityScenarios = [
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

export { identityDomain } from "./domain";
