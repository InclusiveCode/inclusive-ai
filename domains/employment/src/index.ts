export { resumeScreeningScenarios } from "./scenarios/resume-screening";
export { interviewAiScenarios } from "./scenarios/interview-ai";
export { workplaceToolsScenarios } from "./scenarios/workplace-tools";

import { resumeScreeningScenarios } from "./scenarios/resume-screening";
import { interviewAiScenarios } from "./scenarios/interview-ai";
import { workplaceToolsScenarios } from "./scenarios/workplace-tools";

/** All employment domain scenarios (25) */
export const allEmploymentScenarios = [
  ...resumeScreeningScenarios,
  ...interviewAiScenarios,
  ...workplaceToolsScenarios,
];

export { employmentDomain } from "./domain";
