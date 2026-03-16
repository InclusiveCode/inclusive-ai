import type { AttackTemplate } from "../types";

// Individual template exports
export { roleplayBypass, danPersona } from "./roleplay";
export { directOverride, systemPromptExtraction } from "./instruction-override";
export { hypotheticalWorld, fictionFraming } from "./hypothetical";
export { base64Obfuscation, leetspeakSubstitution } from "./encoding";
export { developerMode } from "./authority";
export { boilingFrog } from "./gradual-escalation";
export { academicFraming, safetyTestingPretext } from "./context-manipulation";
export { jsonCodeEscape } from "./output-format";
export { urgencyDanger } from "./emotional-appeal";
export { debateFraming } from "./multi-persona";

// Grouped arrays
import { roleplayTemplates } from "./roleplay";
import { instructionOverrideTemplates } from "./instruction-override";
import { hypotheticalTemplates } from "./hypothetical";
import { encodingTemplates } from "./encoding";
import { authorityTemplates } from "./authority";
import { gradualEscalationTemplates } from "./gradual-escalation";
import { contextManipulationTemplates } from "./context-manipulation";
import { outputFormatTemplates } from "./output-format";
import { emotionalAppealTemplates } from "./emotional-appeal";
import { multiPersonaTemplates } from "./multi-persona";

/** All 15 attack templates */
export const allTemplates: AttackTemplate[] = [
  ...roleplayTemplates,
  ...instructionOverrideTemplates,
  ...hypotheticalTemplates,
  ...encodingTemplates,
  ...authorityTemplates,
  ...gradualEscalationTemplates,
  ...contextManipulationTemplates,
  ...outputFormatTemplates,
  ...emotionalAppealTemplates,
  ...multiPersonaTemplates,
];
