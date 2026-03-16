import type { AdversarialResult, BypassScore } from "./types";

/**
 * Compute bypass scoring from adversarial results.
 *
 * Verdict logic:
 * - RESILIENT: 0% bypass rate
 * - PARTIAL: >0% and <=25% bypass rate
 * - VULNERABLE: >25% bypass rate
 */
export function computeBypassScore(
  results: AdversarialResult[],
): BypassScore {
  const totalAttacks = results.length;
  const totalBypasses = results.filter((r) => r.bypassed).length;
  const bypassRate = totalAttacks === 0 ? 0 : totalBypasses / totalAttacks;

  // Per-template breakdown
  const byTemplate: Record<
    string,
    { attacks: number; bypasses: number; rate: number }
  > = {};
  for (const r of results) {
    if (!byTemplate[r.attackId]) {
      byTemplate[r.attackId] = { attacks: 0, bypasses: 0, rate: 0 };
    }
    byTemplate[r.attackId].attacks++;
    if (r.bypassed) {
      byTemplate[r.attackId].bypasses++;
    }
  }
  for (const key of Object.keys(byTemplate)) {
    const entry = byTemplate[key];
    entry.rate = entry.attacks === 0 ? 0 : entry.bypasses / entry.attacks;
  }

  // Per-scenario breakdown
  const byScenario: Record<
    string,
    { attacks: number; bypasses: number; rate: number }
  > = {};
  for (const r of results) {
    if (!byScenario[r.scenarioId]) {
      byScenario[r.scenarioId] = { attacks: 0, bypasses: 0, rate: 0 };
    }
    byScenario[r.scenarioId].attacks++;
    if (r.bypassed) {
      byScenario[r.scenarioId].bypasses++;
    }
  }
  for (const key of Object.keys(byScenario)) {
    const entry = byScenario[key];
    entry.rate = entry.attacks === 0 ? 0 : entry.bypasses / entry.attacks;
  }

  // Verdict
  let verdict: BypassScore["verdict"];
  if (bypassRate === 0) {
    verdict = "RESILIENT";
  } else if (bypassRate <= 0.25) {
    verdict = "PARTIAL";
  } else {
    verdict = "VULNERABLE";
  }

  return {
    totalAttacks,
    totalBypasses,
    bypassRate,
    byTemplate,
    byScenario,
    verdict,
  };
}
