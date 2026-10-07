import type { ReactNode } from "react";
import { countsAsFail, type PromptTestSummary, type ScenarioSummary, type SuggestedFix } from "../../../lib/lab/prompt-test";
import type { CheckResult } from "../../../lib/lab/types";
import { providerLabel, returnedModelText } from "../components/banner";
import { countLine } from "../components/result-card";
import { RunDetails } from "../components/run-details";
import { liveAlertText, ModeBadge, StatusBadge, variantLabel } from "../components/status";

const TONE: Array<[RegExp, string]> = [
  [/^Checks failed/, "border-rose-400/60"],
  [/^All displayed checks passed/, "border-emerald-400/60"],
];

function tone(headline: string): string {
  return TONE.find(([re]) => re.test(headline))?.[1] ?? "border-amber-300/60";
}

/** One sentence that says what the overall headline means for the engineer's prompt. */
/** Said when the assistant declined scenarios as outside its job; null when none were. */
export function outOfScopeAdvice(summary: PromptTestSummary): string | null {
  const n = summary.outOfScopeScenarios;
  if (n === 0) return null;
  const total = summary.scenarios.length;
  return `Your assistant declined ${n} of ${total} scenario${total === 1 ? "" : "s"} as outside its job, so the checks had little to judge there. That is usually a sign the scenarios don't match what your assistant does, not a problem with your prompt. Choose the scenario set closest to your product and test again.`;
}

export function overallAdvice(summary: PromptTestSummary): string {
  if (summary.failedScenarios > 0) {
    const n = summary.failedScenarios;
    return `Your prompt produced a failing response in ${n} of ${summary.scenarios.length} scenario${summary.scenarios.length === 1 ? "" : "s"}. Review the evidence below, add the suggested lines, and test again.`;
  }
  if (summary.headline === "All displayed checks passed") {
    return "No displayed check failed in this sample. That is evidence, not proof: run it again, and test with your own real traffic too.";
  }
  if (summary.outOfScopeScenarios > 0 && summary.outOfScopeScenarios === summary.scenarios.length) {
    return "This test could not evaluate your prompt.";
  }
  const n = summary.counts.inconclusive;
  if (summary.counts.fail === 0 && n > 0 && summary.counts.error === 0 && summary.counts.not_evaluated === 0) {
    return `No check failed. ${n === 1 ? "One result" : `${n} results`} couldn't be judged by word matching: the response didn't use the exact words the check looks for, so read ${n === 1 ? "it" : "them"} yourself below (open “Show the inputs and responses”). Inconclusive is not a pass, but it is not a failure either.`;
  }
  return "Some checks could not give a clear answer. Look at the responses below before drawing a conclusion.";
}

function Issue({ summary, result }: { summary: ScenarioSummary; result: CheckResult }) {
  const check = summary.scenario.checks.find((c) => c.id === result.checkId);
  const uncounted = result.status === "fail" && !countsAsFail(summary.scenario, summary.run, result, summary.outOfScope !== null);
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-zinc-100">{check?.title ?? result.checkId}</span>
        <StatusBadge status={result.status} flags={result.flags} />
        <span className="text-xs text-zinc-400">{variantLabel(summary.scenario, result.variant)}</span>
        {uncounted && <span className="text-xs text-amber-200">Declined reply — not counted</span>}
      </p>
      <p className="mt-1 text-sm text-zinc-300">{result.rationale}</p>
      {result.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {result.evidence.map((e, i) => (
            <li key={`${e.variant}-${e.start}-${i}`} className="text-zinc-300">
              <span className="text-xs text-zinc-400">Version {e.variant.toUpperCase()}: </span>
              <mark className="rounded bg-rose-500/20 px-1 text-rose-100">{e.excerpt}</mark>
            </li>
          ))}
        </ul>
      )}
      {result.status === "fail" && !uncounted && check && <p className="mt-2 text-sm text-zinc-400">Why it matters: {check.whyItMatters}</p>}
    </li>
  );
}

function ScenarioCard({ summary }: { summary: ScenarioSummary }) {
  const { scenario, run } = summary;
  const alert = liveAlertText(run);
  const headingId = `pt-${scenario.id}`;
  return (
    <section aria-labelledby={headingId} className={`rounded-xl border-2 ${tone(summary.headline)} bg-zinc-900/60 p-4`}>
      <h3 id={headingId} className="text-lg font-semibold text-zinc-50">
        {scenario.title}
      </h3>
      <p className="text-sm text-zinc-400">{scenario.harm}</p>
      <p className="mt-2 font-semibold text-zinc-50">{summary.headline}</p>
      <p className="text-sm text-zinc-300">{countLine(summary.counts)}</p>
      {run.mode === "live" && alert && <p className="mt-2 text-sm text-amber-200">{alert}.</p>}
      {summary.outOfScope && (
        <p className="mt-2 text-sm text-amber-200">
          Both versions declined this task as outside the assistant&apos;s job (“{summary.outOfScope.a.excerpt}”), so the checks below had
          little to judge.
        </p>
      )}
      {summary.issues.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {summary.issues.map((r) => (
            <Issue key={`${r.checkId}-${r.variant}`} summary={summary} result={r} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-emerald-200">Every check for this scenario passed in this sample.</p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-200">Show the inputs and responses</summary>
        <div className="mt-3">
          <RunDetails scenario={scenario} run={run} />
        </div>
      </details>
    </section>
  );
}

/** The combined report for one prompt test. `fixActions` renders next to the suggested lines (client buttons). */
export function PromptTestReport({
  summary,
  fixes,
  fixActions,
  suiteLabel,
}: {
  summary: PromptTestSummary;
  fixes: SuggestedFix[];
  fixActions?: ReactNode;
  /** The scenario set that was run. */
  suiteLabel?: string;
}) {
  const scopeAdvice = outOfScopeAdvice(summary);
  const first = summary.scenarios[0]?.run;
  const live = first?.mode === "live";
  const models = live ? Array.from(new Set(summary.scenarios.map((s) => returnedModelText(s.run)))) : [];
  return (
    <div className="space-y-6">
      <div className={`rounded-xl border-2 ${tone(summary.headline)} bg-zinc-900/60 p-4`}>
        <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {first && <ModeBadge mode={first.mode} />}
          {live && first ? (
            <span className="wrap-anywhere">
              {providerLabel(first.config.provider)} · returned model {models.join(", ")}
            </span>
          ) : (
            <span>Scripted simulator. No AI model was called.</span>
          )}
          {first && <span className="font-mono">prompt fingerprint {first.instructionFingerprint}</span>}
        </p>
        <p className="mt-2 text-xl font-semibold text-zinc-50">{summary.headline}</p>
        <p className="text-sm text-zinc-300">
          {summary.scenarios.length} scenario{summary.scenarios.length === 1 ? "" : "s"} run{suiteLabel ? ` (${suiteLabel})` : ""}.{" "}
          {countLine(summary.counts)}
          {summary.uncountedFails > 0 &&
            ` ${summary.uncountedFails === 1 ? "One fail only records" : `${summary.uncountedFails} fails only record`} words missing from declined replies and ${summary.uncountedFails === 1 ? "doesn't" : "don't"} count against your prompt.`}
        </p>
        {summary.skipped.length > 0 && (
          <p className="mt-1 text-sm text-amber-200">Not run (cancelled): {summary.skipped.map((s) => s.title).join(", ")}.</p>
        )}
        <p className="mt-2 text-sm text-zinc-300">{overallAdvice(summary)}</p>
        {scopeAdvice && <p className="mt-2 rounded-md border border-amber-300/60 bg-amber-950/30 p-3 text-sm text-amber-100">{scopeAdvice}</p>}
        {!live && (
          <p className="mt-2 text-sm text-amber-200">
            Simulated: the scripted simulator only reacts to the lab&apos;s known snippets, not to the rest of your wording.
          </p>
        )}
      </div>

      {fixes.length > 0 && (
        <section aria-labelledby="pt-fixes" className="rounded-xl border border-sky-400/40 bg-sky-950/20 p-4">
          <h3 id="pt-fixes" className="text-lg font-semibold text-zinc-50">
            Suggested lines to add to your prompt
          </h3>
          <p className="mt-1 text-sm text-zinc-300">
            Starting points, not guarantees. Add them where they fit your prompt, then test again.
          </p>
          <ul className="mt-3 space-y-2">
            {fixes.map((f) => (
              <li key={f.rule.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <p className="font-mono text-sm text-zinc-100">{f.rule.snippet}</p>
                <p className="mt-1 text-xs text-zinc-400">Addresses: {f.addresses.join(", ")}</p>
              </li>
            ))}
          </ul>
          {fixActions && <div className="mt-3 flex flex-wrap gap-2">{fixActions}</div>}
        </section>
      )}

      <div className="space-y-4">
        {summary.scenarios.map((s) => (
          <ScenarioCard key={s.scenario.id} summary={s} />
        ))}
      </div>
    </div>
  );
}
