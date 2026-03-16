// Public API — @inclusive-ai/adversarial@1.0.0

// Types
export type {
  AttackCategory,
  AttackTemplate,
  AttackContext,
  AdversarialResult,
  BypassScore,
  RunAdversarialOptions,
} from "./types";
export { ADVERSARIAL_CATEGORIES } from "./types";

// Templates
export { allTemplates } from "./templates/index";
export {
  roleplayBypass,
  danPersona,
  directOverride,
  systemPromptExtraction,
  hypotheticalWorld,
  fictionFraming,
  base64Obfuscation,
  leetspeakSubstitution,
  developerMode,
  boilingFrog,
  academicFraming,
  safetyTestingPretext,
  jsonCodeEscape,
  urgencyDanger,
  debateFraming,
} from "./templates/index";

// Runner
export { wrapWithAttacks, runAdversarial } from "./runner";

// Scoring
export { computeBypassScore } from "./scoring";

// Reporter
export { AdversarialReporter } from "./reporter";

// Scenarios
export { outingScenarios } from "./scenarios/outing";
export { conversionTherapyScenarios } from "./scenarios/conversion-therapy";
export { misgenderingScenarios } from "./scenarios/misgendering";
export { moderationBypassScenarios } from "./scenarios/moderation-bypass";
export { identityExtractionScenarios } from "./scenarios/identity-extraction";

// Aggregated scenario array
import { outingScenarios } from "./scenarios/outing";
import { conversionTherapyScenarios } from "./scenarios/conversion-therapy";
import { misgenderingScenarios } from "./scenarios/misgendering";
import { moderationBypassScenarios } from "./scenarios/moderation-bypass";
import { identityExtractionScenarios } from "./scenarios/identity-extraction";

/** All 30 standalone adversarial scenarios */
export const adversarialScenarios = [
  ...outingScenarios,
  ...conversionTherapyScenarios,
  ...misgenderingScenarios,
  ...moderationBypassScenarios,
  ...identityExtractionScenarios,
];
