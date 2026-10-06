import { compareRuns } from "../../../lib/lab/compare";
import { scenarioVerdict } from "../../../lib/lab/evaluate";
import { planLiveComparison } from "../../../lib/lab/history";
import type { Scenario } from "../../../lib/lab/scenarios";
import type { CheckStatus, Run } from "../../../lib/lab/types";
import { FOCUS, runLabel } from "./status";

const COUNT_WORDS: Array<[CheckStatus, string]> = [
  ["fail", "failed"],
  ["pass", "passed"],
  ["inconclusive", "inconclusive"],
  ["not_evaluated", "not evaluated"],
  ["error", "evaluator error"],
];

/**
 * How the latest run compares with its baseline, in a few words. The wording deliberately differs
 * from "5. Compare runs" (which has the full table and the exact empty-state text), so the two are
 * never confused for each other.
 */
export function comparisonLine(scenario: Scenario, baseline: Run | undefined, history: Run[], latest: Run): string {
  let base: Run | undefined = baseline;
  if (latest.mode === "live") {
    const plan = planLiveComparison(
      history.filter((r) => r.mode === "live"),
      latest,
      scenario.baselineInstruction,
    );
    if ("empty" in plan) {
      if (plan.empty === "baseline_only") return "This is the live baseline. Edit the instruction and rerun to compare.";
      if (plan.empty === "baseline_errors") return "The live baseline had errors; run it again to compare.";
      return "No live baseline to compare with yet. Use Run baseline live first.";
    }
    if ("notComparable" in plan) return "Can't be compared with a live baseline; see Compare runs.";
    base = plan.baseline;
  }
  if (!base) return "No baseline to compare with.";
  const c = compareRuns(base, latest);
  if (!c.compatible) return "Can't be compared with the baseline; see Compare runs.";
  const s = c.summary;
  return `Against the baseline: ${s.improved} improved, ${s.regressed} regressed, ${s.unchanged} unchanged${s.inconclusive ? `, ${s.inconclusive} inconclusive` : ""}.`;
}

/** "2 failed, 1 passed": only the statuses that occur, fails first. */
export function countLine(counts: Record<CheckStatus, number>): string {
  const parts = COUNT_WORDS.filter(([k]) => counts[k] > 0).map(([k, w]) => `${counts[k]} ${w}`);
  return parts.length > 0 ? `${parts.join(", ")}.` : "No checks ran.";
}

const TONE: Array<[RegExp, string]> = [
  [/^Checks failed/, "border-rose-400/60"],
  [/^All displayed checks passed/, "border-emerald-400/60"],
];

/**
 * D49: the result of the run you just started, next to the button that started it. It summarises
 * what "3. Review findings" and "5. Compare runs" show in full and links to both. Not a live
 * region: the one polite status line announces the run.
 */
export function ResultCard({
  scenario,
  baseline,
  history,
  latest,
}: {
  scenario: Scenario;
  baseline: Run | undefined;
  history: Run[];
  latest: Run | undefined;
}) {
  if (!latest) {
    return (
      <p id="lab-result" className="rounded-lg border border-dashed border-zinc-700 p-3 text-sm text-zinc-400">
        Your run&apos;s result appears here, with what changed against the baseline.
      </p>
    );
  }
  const verdict = scenarioVerdict(latest.results);
  const tone = TONE.find(([re]) => re.test(verdict.headline))?.[1] ?? "border-amber-300/60";
  return (
    <div id="lab-result" key={latest.id} className={`rounded-lg border-2 ${tone} bg-zinc-900/60 p-3 motion-safe:animate-lab-flash`}>
      <p className="text-xs text-zinc-400">
        Your last run: {runLabel(latest)}, {latest.mode === "live" ? "live" : "simulated"}
      </p>
      <p className="mt-1 font-semibold text-zinc-50">{verdict.headline}</p>
      <p className="text-sm text-zinc-300">{countLine(verdict.counts)}</p>
      <p className="mt-1 text-sm text-zinc-300">{comparisonLine(scenario, baseline, history, latest)}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
        <a href="#findings" className={`inline-flex min-h-11 items-center font-medium text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-zinc-200 lg:min-h-9 ${FOCUS}`}>
          See findings
        </a>
        <a href="#compare" className={`inline-flex min-h-11 items-center font-medium text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-zinc-200 lg:min-h-9 ${FOCUS}`}>
          See the comparison
        </a>
      </p>
    </div>
  );
}
