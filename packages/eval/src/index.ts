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
} from "@inclusive-ai/eval-core";

import type { EvalRunner, EvalSummary } from "@inclusive-ai/eval-core";

// Re-export all identity domain scenarios
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
} from "@inclusive-ai/domain-identity";

// V1 compat: "scenarios" is the full identity domain set
import { allIdentityScenarios } from "@inclusive-ai/domain-identity";
export const scenarios = allIdentityScenarios;

/**
 * V1-compatible runEval shim.
 * - runEval(runner) — runs all identity domain scenarios
 * - runEval(runner, scenarioIds) — filters by ID (v1 signature)
 * - runEval(runner, scenarios, options) — new v2 signature (pass-through)
 */
export async function runEval(
  runner: EvalRunner,
  scenariosOrIds?: string[] | typeof allIdentityScenarios,
  options?: import("@inclusive-ai/eval-core").RunEvalOptions,
): Promise<EvalSummary> {
  // V2 signature: second arg is a scenario array
  if (Array.isArray(scenariosOrIds) && scenariosOrIds.length > 0 && typeof scenariosOrIds[0] === "object") {
    return coreRunEval(runner, scenariosOrIds as typeof allIdentityScenarios, options);
  }

  // V1 signature: second arg is string[] of scenario IDs (or undefined)
  const ids = scenariosOrIds as string[] | undefined;
  return coreRunEval(runner, allIdentityScenarios, {
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
