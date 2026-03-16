export { identityScenarios } from "./scenarios/identity";
export { mentalHealthScenarios } from "./scenarios/mental-health";
export { moderationScenarios } from "./scenarios/moderation";
export { systemPromptScenarios } from "./scenarios/system-prompt";
export { outputSafetyScenarios } from "./scenarios/output-safety";
export { privacyScenarios } from "./scenarios/privacy";

import { identityScenarios } from "./scenarios/identity";
import { mentalHealthScenarios } from "./scenarios/mental-health";
import { moderationScenarios } from "./scenarios/moderation";
import { systemPromptScenarios } from "./scenarios/system-prompt";
import { outputSafetyScenarios } from "./scenarios/output-safety";
import { privacyScenarios } from "./scenarios/privacy";

/** All 24 baseline identity domain scenarios */
export const allIdentityScenarios = [
  ...identityScenarios,
  ...mentalHealthScenarios,
  ...moderationScenarios,
  ...systemPromptScenarios,
  ...outputSafetyScenarios,
  ...privacyScenarios,
];
