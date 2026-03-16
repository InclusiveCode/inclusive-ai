import type { BypassScore } from "./types";

/**
 * Reporter for adversarial red-team results.
 * Produces CLI (human-readable) and JSON output formats.
 */
export class AdversarialReporter {
  /**
   * Generate CLI-formatted output matching the spec format:
   *
   * === @inclusive-ai/eval — Adversarial Red Team Results ===
   * Attacks: N (X scenarios × Y templates)
   * Bypasses: N
   * Bypass Rate: N.N%
   * Verdict: RESILIENT | PARTIAL | VULNERABLE
   * By template: ...
   * Top vulnerable scenarios: ...
   */
  reportCli(score: BypassScore): string {
    const lines: string[] = [];

    lines.push("=== @inclusive-ai/eval — Adversarial Red Team Results ===");
    lines.push("");

    // Compute scenario × template counts
    const scenarioCount = Object.keys(score.byScenario).length;
    const templateCount = Object.keys(score.byTemplate).length;
    lines.push(
      `Attacks: ${score.totalAttacks} (${scenarioCount} scenarios × ${templateCount} templates)`,
    );
    lines.push(`Bypasses: ${score.totalBypasses}`);
    lines.push("");
    lines.push(
      `Bypass Rate: ${(score.bypassRate * 100).toFixed(1)}%`,
    );
    lines.push(`Verdict: ${score.verdict}`);

    // By template breakdown
    const templateEntries = Object.entries(score.byTemplate).sort(
      ([, a], [, b]) => b.rate - a.rate,
    );
    if (templateEntries.length > 0) {
      lines.push("");
      lines.push("By template:");
      for (const [templateId, data] of templateEntries) {
        const pct = (data.rate * 100).toFixed(1);
        lines.push(
          `  ${templateId}: ${data.bypasses}/${data.attacks} bypassed (${pct}%)`,
        );
      }
    }

    // Top vulnerable scenarios (those with any bypasses, sorted by bypass count)
    const vulnerableScenarios = Object.entries(score.byScenario)
      .filter(([, data]) => data.bypasses > 0)
      .sort(([, a], [, b]) => b.bypasses - a.bypasses);

    if (vulnerableScenarios.length > 0) {
      lines.push("");
      lines.push("Top vulnerable scenarios:");
      for (let i = 0; i < Math.min(vulnerableScenarios.length, 10); i++) {
        const [scenarioId, data] = vulnerableScenarios[i];
        lines.push(
          `  ${i + 1}. ${scenarioId} — bypassed by ${data.bypasses} template${data.bypasses === 1 ? "" : "s"}`,
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate JSON-formatted output with the full BypassScore.
   */
  reportJson(score: BypassScore): string {
    return JSON.stringify(score, null, 2);
  }
}
