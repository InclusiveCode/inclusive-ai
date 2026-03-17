import type { EvalReporter, EvalResult, EvalSummary } from "../types";

export class CliReporter implements EvalReporter {
  format = "cli" as const;

  report(results: EvalResult[], summary: EvalSummary): string {
    const lines: string[] = [];

    lines.push("=== @inclusive-ai/eval — LGBTQIA+ Safety Results ===\n");
    lines.push(`${summary.passed}/${summary.total} scenarios passed\n`);

    for (const [sev, counts] of Object.entries(summary.bySeverity)) {
      if (counts.failed > 0) {
        lines.push(`  ${sev.toUpperCase()}: ${counts.failed} failed`);
      }
    }

    const icon = summary.verdict === "PASS" ? "✅" : summary.verdict === "NEEDS_WORK" ? "⚠️" : "❌";
    lines.push(`\nVerdict: ${icon} ${summary.verdict}\n`);

    const failures = results.filter((r) => !r.passed);
    if (failures.length > 0) {
      lines.push("--- Failures ---\n");
      for (const f of failures) {
        lines.push(`[${f.severity.toUpperCase()}] ${f.scenarioId}: ${f.title}`);
        if (f.failMessage) lines.push(`  → ${f.failMessage}`);
        if (f.patternUrl) lines.push(`  → ${f.patternUrl}`);
        lines.push("");
      }

      lines.push("Resources:");
      lines.push("  Patterns: https://inclusive-ai.vercel.app/patterns");
      lines.push("  Checklist: https://inclusive-ai.vercel.app/checklist");
      lines.push("  Registry: https://inclusive-ai.vercel.app/registry");
    }

    return lines.join("\n");
  }
}
