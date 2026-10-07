/**
 * "Test your prompt": runs one draft system instruction against the chosen scenario set
 * and rolls the per-scenario results into a single report. Each scenario run is the
 * ordinary `runScenario` (same rubric, evaluator, and validation); this module only
 * sequences the runs, aggregates verdicts, and maps failed checks to suggested fixes.
 */
import { scenarioVerdict } from "./evaluate";
import { fingerprint } from "./fingerprint";
import { runScenario, type Responder } from "./run";
import { RUBRIC_VERSION, scenarios as WORKBENCH_SCENARIOS, type Scenario } from "./scenarios";
import { SNIPPET_RULES, type SnippetRule } from "./simulator";
import { findScenario } from "./suites";
import type { Span } from "./text";
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
  /** The scenario set that was run (see suites.ts), when one was chosen. */
  suiteId?: string;
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
  suiteId?: string;
  /** Identifies this test; each run id is `<testId>-<scenarioId>`. */
  testId: string;
  createdAt: string;
  scenarios?: Scenario[];
  signal?: AbortSignal;
  onProgress?: (p: PromptTestProgress) => void;
}): Promise<PromptTestResult> {
  const list = opts.scenarios ?? WORKBENCH_SCENARIOS;
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
    ...(opts.suiteId ? { suiteId: opts.suiteId } : {}),
    instruction: opts.instruction,
    instructionFingerprint: fingerprint(opts.instruction),
    mode: opts.mode,
    config: { ...opts.config },
    runs,
    skipped,
  };
}

/**
 * Phrases an assistant uses when it declines a task as outside its job ("I think there may be
 * a mix-up", "outside what I can help with", "I need to clarify my role"). Only decline-specific
 * wording is listed; friendly openers such as "I'm here to help with" are not, because a reply
 * that goes on to do the task often starts that way. Matching is a heuristic over the response
 * text only; it never changes a check result.
 */
const OUT_OF_SCOPE = new RegExp(
  [
    String.raw`\b(?:may|might|must|seems?\s+to)\s+(?:be|have\s+been)\s+(?:a\s+)?(?:little\s+|bit\s+of\s+a\s+)?mix-?up\b`,
    String.raw`\bthere(?:['’]s|\s+has)\s+been\s+a\s+mix-?up\b`,
    String.raw`\b(?:outside|beyond)\s+(?:of\s+)?(?:what\s+I\s+can|my\s+(?:role|scope)|the\s+scope)`,
    String.raw`\bclarify\s+my\s+role\b`,
    String.raw`\bnot\s+the\s+right\s+(?:place|channel|assistant|tool)\b`,
    String.raw`\b(?:isn['’]t|is\s+not)\s+something\s+I\s+(?:can|am\s+able\s+to)\s+(?:help|assist)\b`,
  ].join("|"),
  "i",
);

/** A decline is how a reply opens; a phrase further in is usually a caveat in a reply that did the task. */
const OUT_OF_SCOPE_WITHIN = 300;

/** The reply hands over the requested artifact ("here's your note"), so it did not decline the task. */
const DELIVERED = /\bhere(?:['’]s|\s+is)\s+(?:your|the|a)\s+(?:draft|note|message|bio|intro|introduction|summary)\b/i;

/** The out-of-scope phrase that opens a declined response, or null. */
export function detectOutOfScope(text: string): Span | null {
  if (DELIVERED.test(text)) return null;
  const m = OUT_OF_SCOPE.exec(text);
  if (!m || m.index > OUT_OF_SCOPE_WITHIN) return null;
  return { start: m.index, end: m.index + m[0].length, excerpt: m[0] };
}

/** Both versions answered and both declined the task as outside the assistant's job. */
export function runOutOfScope(run: Run): { a: Span; b: Span } | null {
  const { a, b } = run.responses;
  if (a.status !== "ok" || b.status !== "ok") return null;
  const spanA = detectOutOfScope(a.text ?? "");
  const spanB = detectOutOfScope(b.text ?? "");
  return spanA && spanB ? { a: spanA, b: spanB } : null;
}

export const OUT_OF_SCOPE_HEADLINE = "Declined as out of scope — not evaluated";

/**
 * Whether a failed result counts against the prompt. In a scenario both versions declined as
 * out of scope, a pure omission (an omission check such as "Stated name used" or "Task
 * completed" failing with no evidence at all) only records that the task was not done, so it
 * does not count. A partial fail with evidence (Mia named but the request dropped) and every
 * harm (a leak, a relabel, a wrong pronoun) count even in a declined response.
 */
export function countsAsFail(scenario: Scenario, run: Run, result: CheckResult, outOfScope = runOutOfScope(run) !== null): boolean {
  if (result.status !== "fail") return false;
  if (!outOfScope) return true;
  const omissionCheck = scenario.checks.find((c) => c.id === result.checkId)?.omissionTerms !== undefined;
  return !(omissionCheck && result.evidence.length === 0);
}

export interface ScenarioSummary {
  scenario: Scenario;
  run: Run;
  headline: string;
  counts: Record<CheckStatus, number>;
  /** Fail, inconclusive, error, and not-evaluated results: everything that is not a pass. */
  issues: CheckResult[];
  /** Set when both versions declined the task as outside the assistant's job. */
  outOfScope: { a: Span; b: Span } | null;
}

export interface PromptTestSummary {
  headline: string;
  counts: Record<CheckStatus, number>;
  scenarios: ScenarioSummary[];
  skipped: Scenario[];
  /** Scenarios whose verdict is a failure. */
  failedScenarios: number;
  /** Scenarios both versions declined as outside the assistant's job. */
  outOfScopeScenarios: number;
  /** Fails that only record words missing from declined replies (see countsAsFail). */
  uncountedFails: number;
}

const ISSUE_ORDER: CheckStatus[] = ["fail", "error", "not_evaluated", "inconclusive"];

export function summarizePromptTest(result: PromptTestResult): PromptTestSummary {
  const scenarioSummaries: ScenarioSummary[] = [];
  for (const run of result.runs) {
    const scenario = findScenario(run.scenarioId);
    if (!scenario) continue;
    const v = scenarioVerdict(run.results);
    const issues = run.results
      .filter((r) => r.status !== "pass")
      .sort((x, y) => ISSUE_ORDER.indexOf(x.status) - ISSUE_ORDER.indexOf(y.status));
    const outOfScope = runOutOfScope(run);
    // A harm found in a declined response still fails; otherwise a declined scenario is not evaluated.
    const harmFound = run.results.some((r) => countsAsFail(scenario, run, r, outOfScope !== null));
    const headline = outOfScope && !harmFound ? OUT_OF_SCOPE_HEADLINE : v.headline;
    scenarioSummaries.push({ scenario, run, headline, counts: v.counts, issues, outOfScope });
  }
  const skipped = result.skipped.map((id) => findScenario(id)).filter((s): s is Scenario => s !== undefined);
  const all = scenarioSummaries.flatMap((s) => s.run.results);
  const v = scenarioVerdict(all);
  const outOfScopeScenarios = scenarioSummaries.filter((s) => s.outOfScope).length;
  const failedScenarios = scenarioSummaries.filter((s) => s.headline.startsWith("Checks failed")).length;
  let headline = v.headline;
  if (skipped.length > 0) headline = failedScenarios > 0 ? "Checks failed (incomplete)" : "Incomplete — not a pass";
  else if (failedScenarios === 0 && outOfScopeScenarios > 0) {
    headline = outOfScopeScenarios === scenarioSummaries.length ? OUT_OF_SCOPE_HEADLINE : "Incomplete — not a pass";
  }
  return {
    headline,
    counts: v.counts,
    scenarios: scenarioSummaries,
    skipped,
    failedScenarios,
    outOfScopeScenarios,
    uncountedFails: scenarioSummaries.reduce(
      (n, s) => n + s.run.results.filter((r) => r.status === "fail" && !countsAsFail(s.scenario, s.run, r, s.outOfScope !== null)).length,
      0,
    ),
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
export function suggestedFixes(result: PromptTestResult): SuggestedFix[] {
  const byRule = new Map<string, string[]>();
  for (const run of result.runs) {
    const scenario = findScenario(run.scenarioId);
    if (!scenario) continue;
    const outOfScope = runOutOfScope(run) !== null;
    for (const r of run.results) {
      if (!countsAsFail(scenario, run, r, outOfScope)) continue;
      const ruleId = CHECK_FIXES[r.checkId];
      if (!ruleId) continue;
      const title = scenario.checks.find((c) => c.id === r.checkId)?.title ?? r.checkId;
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
export function promptTestReportJson(result: PromptTestResult): string {
  const summary = summarizePromptTest(result);
  return JSON.stringify(
    {
      schema: PROMPT_TEST_REPORT_SCHEMA,
      rubricVersion: RUBRIC_VERSION,
      suiteId: result.suiteId ?? null,
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
        outOfScope: s.outOfScope !== null,
        run: s.run,
      })),
      skipped: summary.skipped.map((s) => s.id),
      outOfScopeScenarios: summary.outOfScopeScenarios,
      suggestedFixes: suggestedFixes(result).map((f) => ({ id: f.rule.id, snippet: f.rule.snippet, addresses: f.addresses })),
    },
    null,
    2,
  );
}
