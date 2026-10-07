/**
 * "Test your prompt": runs one draft system instruction against every lab scenario
 * and rolls the per-scenario results into a single report. Each scenario run is the
 * ordinary `runScenario` (same rubric, evaluator, and validation); this module only
 * sequences the runs, aggregates verdicts, and maps failed checks to suggested fixes.
 */
import { scenarioVerdict } from "./evaluate";
import { fingerprint } from "./fingerprint";
import { runScenario, type Responder } from "./run";
import { RUBRIC_VERSION, scenarios as ALL_SCENARIOS, type Scenario } from "./scenarios";
import { SNIPPET_RULES, type SnippetRule } from "./simulator";
import type { CheckResult, CheckStatus, Run, RunConfig, RunMode } from "./types";

export const PROMPT_TEST_REPORT_SCHEMA = "inclusive-lab-prompt-test/v1";

/**
 * The fix snippet (a SNIPPET_RULES id) that addresses each check when it fails.
 * Checks with no entry (for example "Task completed") have no canned fix.
 */
export const CHECK_FIXES: Record<string, string> = {
  "s1-term-preserved": "FIX-TERMS",
  "s1-doc-parity": "FIX-VERIFY",
  "s2-name-used": "FIX-PRONOUNS",
  "s2-pronouns": "FIX-PRONOUNS",
  "s2-partner-preserved": "FIX-TERMS",
  "s3-boundary-respected": "FIX-PRIVACY",
  "s3-boundary-parity": "FIX-PRIVACY",
};

export interface PromptTestProgress {
  done: number;
  total: number;
  /** The scenario about to run, or null when every scenario has finished. */
  next: Scenario | null;
}

export interface PromptTestResult {
  instruction: string;
  instructionFingerprint: string;
  mode: RunMode;
  config: RunConfig;
  runs: Run[];
  /** Scenarios that were not run because the test was cancelled. */
  skipped: string[];
}

/**
 * Runs `instruction` against each scenario in turn (two calls per scenario, Version A and B).
 * Scenarios run one after another so a low-limit key is not hit with every call at once.
 * When `signal` aborts, scenarios that have not started are listed in `skipped`.
 */
export async function runPromptTest(opts: {
  instruction: string;
  responderFor: (s: Scenario) => Responder;
  config: RunConfig;
  mode: RunMode;
  responderVersion: string;
  /** Identifies this test; each run id is `<testId>-<scenarioId>`. */
  testId: string;
  createdAt: string;
  scenarios?: Scenario[];
  signal?: AbortSignal;
  onProgress?: (p: PromptTestProgress) => void;
}): Promise<PromptTestResult> {
  const list = opts.scenarios ?? ALL_SCENARIOS;
  const runs: Run[] = [];
  const skipped: string[] = [];
  for (const [i, s] of list.entries()) {
    if (opts.signal?.aborted) {
      skipped.push(s.id);
      continue;
    }
    opts.onProgress?.({ done: i, total: list.length, next: s });
    runs.push(
      await runScenario(s, opts.instruction, opts.responderFor(s), opts.config, {
        id: `${opts.testId}-${s.id}`,
        createdAt: opts.createdAt,
        mode: opts.mode,
        responderVersion: opts.responderVersion,
      }),
    );
  }
  opts.onProgress?.({ done: list.length, total: list.length, next: null });
  return {
    instruction: opts.instruction,
    instructionFingerprint: fingerprint(opts.instruction),
    mode: opts.mode,
    config: { ...opts.config },
    runs,
    skipped,
  };
}

export interface ScenarioSummary {
  scenario: Scenario;
  run: Run;
  headline: string;
  counts: Record<CheckStatus, number>;
  /** Fail, inconclusive, error, and not-evaluated results: everything that is not a pass. */
  issues: CheckResult[];
}

export interface PromptTestSummary {
  headline: string;
  counts: Record<CheckStatus, number>;
  scenarios: ScenarioSummary[];
  skipped: Scenario[];
  /** Scenarios whose verdict is a failure. */
  failedScenarios: number;
}

const ISSUE_ORDER: CheckStatus[] = ["fail", "error", "not_evaluated", "inconclusive"];

export function summarizePromptTest(result: PromptTestResult, list: Scenario[] = ALL_SCENARIOS): PromptTestSummary {
  const scenarioSummaries: ScenarioSummary[] = [];
  for (const run of result.runs) {
    const scenario = list.find((s) => s.id === run.scenarioId);
    if (!scenario) continue;
    const v = scenarioVerdict(run.results);
    const issues = run.results
      .filter((r) => r.status !== "pass")
      .sort((x, y) => ISSUE_ORDER.indexOf(x.status) - ISSUE_ORDER.indexOf(y.status));
    scenarioSummaries.push({ scenario, run, headline: v.headline, counts: v.counts, issues });
  }
  const skipped = list.filter((s) => result.skipped.includes(s.id));
  const all = scenarioSummaries.flatMap((s) => s.run.results);
  const v = scenarioVerdict(all);
  // A test with a scenario left out is never a pass.
  let headline = v.headline;
  if (skipped.length > 0) headline = v.counts.fail > 0 ? "Checks failed (incomplete)" : "Incomplete — not a pass";
  return {
    headline,
    counts: v.counts,
    scenarios: scenarioSummaries,
    skipped,
    failedScenarios: scenarioSummaries.filter((s) => s.counts.fail > 0).length,
  };
}

export interface SuggestedFix {
  rule: SnippetRule;
  /** Titles of the failed checks this snippet addresses. */
  addresses: string[];
}

/**
 * Fix snippets for the checks that failed, in SNIPPET_RULES order, leaving out any snippet
 * the instruction already contains. These are starting points, not guarantees: a real model
 * may still fail with the snippet added, so the test should be rerun.
 */
export function suggestedFixes(result: PromptTestResult, list: Scenario[] = ALL_SCENARIOS): SuggestedFix[] {
  const byRule = new Map<string, string[]>();
  for (const run of result.runs) {
    const scenario = list.find((s) => s.id === run.scenarioId);
    for (const r of run.results) {
      if (r.status !== "fail") continue;
      const ruleId = CHECK_FIXES[r.checkId];
      if (!ruleId) continue;
      const title = scenario?.checks.find((c) => c.id === r.checkId)?.title ?? r.checkId;
      const titles = byRule.get(ruleId) ?? [];
      if (!titles.includes(title)) titles.push(title);
      byRule.set(ruleId, titles);
    }
  }
  return SNIPPET_RULES.filter((rule) => rule.kind === "fix" && byRule.has(rule.id) && !result.instruction.includes(rule.snippet)).map(
    (rule) => ({ rule, addresses: byRule.get(rule.id)! }),
  );
}

/** Appends each snippet on its own line, skipping any already present. */
export function applyFixes(instruction: string, fixes: SuggestedFix[]): string {
  const missing = fixes.map((f) => f.rule.snippet).filter((s) => !instruction.includes(s));
  if (missing.length === 0) return instruction;
  const base = instruction.replace(/\s+$/, "");
  return [base, ...missing].filter((x) => x.length > 0).join("\n");
}

/** A downloadable JSON record of the test: the instruction, every run, and the summary. */
export function promptTestReportJson(result: PromptTestResult, list: Scenario[] = ALL_SCENARIOS): string {
  const summary = summarizePromptTest(result, list);
  return JSON.stringify(
    {
      schema: PROMPT_TEST_REPORT_SCHEMA,
      rubricVersion: RUBRIC_VERSION,
      mode: result.mode,
      config: result.config,
      instruction: result.instruction,
      instructionFingerprint: result.instructionFingerprint,
      headline: summary.headline,
      counts: summary.counts,
      scenarios: summary.scenarios.map((s) => ({
        scenarioId: s.scenario.id,
        scenarioVersion: s.run.scenarioVersion,
        title: s.scenario.title,
        headline: s.headline,
        counts: s.counts,
        run: s.run,
      })),
      skipped: summary.skipped.map((s) => s.id),
      suggestedFixes: suggestedFixes(result, list).map((f) => ({ id: f.rule.id, snippet: f.rule.snippet, addresses: f.addresses })),
    },
    null,
    2,
  );
}
