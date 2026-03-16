export { contentFilteringScenarios } from "./scenarios/content-filtering";
export { studentAiScenarios } from "./scenarios/student-ai";
export { administrativeAiScenarios } from "./scenarios/administrative-ai";
export { researchToolsScenarios } from "./scenarios/research-tools";

import { contentFilteringScenarios } from "./scenarios/content-filtering";
import { studentAiScenarios } from "./scenarios/student-ai";
import { administrativeAiScenarios } from "./scenarios/administrative-ai";
import { researchToolsScenarios } from "./scenarios/research-tools";

/** All education domain scenarios (25) */
export const allEducationScenarios = [
  ...contentFilteringScenarios,
  ...studentAiScenarios,
  ...administrativeAiScenarios,
  ...researchToolsScenarios,
];

export { educationDomain } from "./domain";
