// Re-export core types and utilities
export {
  assertSafe,
  KNOWN_CATEGORIES,
  CliReporter,
  JsonReporter,
  SarifReporter,
  TextAdapter,
} from "@inclusive-ai/eval-core";

// Re-export the core runEval as runEvalV2 for direct use
import { runEval as coreRunEval } from "@inclusive-ai/eval-core";
export { coreRunEval as runEvalV2 };

export type {
  EvalScenario,
  TextEvalScenario,
  AnyEvalScenario,
  EvalRunner,
  EvalResult,
  EvalSummary,
  ScenarioCategory,
  Severity,
  RunEvalOptions,
  DomainDefinition,
} from "@inclusive-ai/eval-core";

import type { EvalRunner, EvalSummary, DomainDefinition, TextEvalScenario } from "@inclusive-ai/eval-core";

// Re-export all identity domain scenarios and definition
export {
  identityScenarios,
  mentalHealthScenarios,
  moderationScenarios,
  systemPromptScenarios,
  outputSafetyScenarios,
  privacyScenarios,
  intersectionalityScenarios,
  culturalContextScenarios,
  temporalIdentityScenarios,
  allIdentityScenarios,
  identityDomain,
} from "@inclusive-ai/domain-identity";

// Re-export all healthcare domain scenarios and definition
export {
  transitionCareScenarios,
  mentalHealthIntakeScenarios,
  reproductiveHealthScenarios,
  providerMatchingScenarios,
  medicalRecordsScenarios,
  allHealthcareScenarios,
  healthcareDomain,
} from "@inclusive-ai/domain-healthcare";

// Re-export all employment domain scenarios and definition
export {
  resumeScreeningScenarios,
  interviewAiScenarios,
  workplaceToolsScenarios,
  allEmploymentScenarios,
  employmentDomain,
} from "@inclusive-ai/domain-employment";

import { identityDomain } from "@inclusive-ai/domain-identity";
import { healthcareDomain } from "@inclusive-ai/domain-healthcare";
import { employmentDomain } from "@inclusive-ai/domain-employment";

/** All registered domains */
export const domains: DomainDefinition[] = [
  identityDomain,
  healthcareDomain,
  employmentDomain,
];

// Validate category uniqueness across domains at module load time
(function validateCategoryUniqueness() {
  const seen = new Map<string, string>();
  for (const domain of domains) {
    for (const cat of domain.categories) {
      if (seen.has(cat)) {
        throw new Error(
          `Duplicate category "${cat}" found in domain "${domain.id}" (already registered in "${seen.get(cat)}")`,
        );
      }
      seen.set(cat, domain.id);
    }
  }
})();

/** All scenarios flattened from all domains (115 total) */
export const allScenarios = domains.flatMap((d) => d.scenarios) as TextEvalScenario[];

/** V3 breaking change: scenarios now includes all domains (was identity-only in v2) */
export const scenarios = allScenarios;

/**
 * Get scenarios for a specific domain by domain ID.
 */
export function getScenariosByDomain(domainId: string): TextEvalScenario[] {
  const domain = domains.find((d) => d.id === domainId);
  if (!domain) {
    throw new Error(
      `Unknown domain "${domainId}". Available domains: ${domains.map((d) => d.id).join(", ")}`,
    );
  }
  return domain.scenarios as TextEvalScenario[];
}

/**
 * V1/V2-compatible runEval shim.
 * - runEval(runner) — runs all scenarios across all domains (breaking: was identity-only in v2)
 * - runEval(runner, scenarioIds) — filters by ID (v1 signature)
 * - runEval(runner, scenarios, options) — new v2 signature (pass-through)
 */
export async function runEval(
  runner: EvalRunner,
  scenariosOrIds?: string[] | TextEvalScenario[],
  options?: import("@inclusive-ai/eval-core").RunEvalOptions,
): Promise<EvalSummary> {
  // V2 signature: second arg is a scenario array
  if (Array.isArray(scenariosOrIds) && scenariosOrIds.length > 0 && typeof scenariosOrIds[0] === "object") {
    return coreRunEval(runner, scenariosOrIds as TextEvalScenario[], options);
  }

  // V1 signature: second arg is string[] of scenario IDs (or undefined)
  const ids = scenariosOrIds as string[] | undefined;
  return coreRunEval(runner, allScenarios, {
    ...options,
    scenarioIds: ids,
  });
}

// V1 compat: printSummary as a function (wraps CliReporter)
import { CliReporter } from "@inclusive-ai/eval-core";

export function printSummary(summary: EvalSummary): void {
  const reporter = new CliReporter();
  const output = reporter.report(summary.results, summary);
  console.log(output);
}
