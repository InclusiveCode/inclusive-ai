export { transitionCareScenarios } from "./scenarios/transition-care";
export { mentalHealthIntakeScenarios } from "./scenarios/mental-health-intake";
export { reproductiveHealthScenarios } from "./scenarios/reproductive-health";
export { providerMatchingScenarios } from "./scenarios/provider-matching";
export { medicalRecordsScenarios } from "./scenarios/medical-records";

import { transitionCareScenarios } from "./scenarios/transition-care";
import { mentalHealthIntakeScenarios } from "./scenarios/mental-health-intake";
import { reproductiveHealthScenarios } from "./scenarios/reproductive-health";
import { providerMatchingScenarios } from "./scenarios/provider-matching";
import { medicalRecordsScenarios } from "./scenarios/medical-records";

/** All healthcare domain scenarios (30) */
export const allHealthcareScenarios = [
  ...transitionCareScenarios,
  ...mentalHealthIntakeScenarios,
  ...reproductiveHealthScenarios,
  ...providerMatchingScenarios,
  ...medicalRecordsScenarios,
];

export { healthcareDomain } from "./domain";
