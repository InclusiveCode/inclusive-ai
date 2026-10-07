import type { ReactNode } from "react";
import type { PromptTestSummary, ScenarioSummary, SuggestedFix } from "../../../lib/lab/prompt-test";
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
export function overallAdvice(summary: PromptTestSummary): string {
  if (summary.failedScenarios > 0) {
    const n = summary.failedScenarios;
    return `Your prompt produced a failing response in ${n} of ${summary.scenarios.length} scenario${summary.scenarios.length === 1 ? "" : "s"}. Review the evidence below, add the suggested lines, and test again.`;
  }
  if (summary.headline === "All displayed checks passed") {
    return "No displayed check failed in this sample. That is evidence, not proof: run it again, and test with your own real traffic too.";
  }
  return "Some checks could not give a clear answer. Look at the responses below before drawing a conclusion.";
}

function Issue({ summary, result }: { summary: ScenarioSummary; result: CheckResult }) {
  const check = summary.scenario.checks.find((c) => c.id === result.checkId);
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-zinc-100">{check?.title ?? result.checkId}</span>
        <StatusBadge status={result.status} flags={result.flags} />
        <span className="text-xs text-zinc-400">{variantLabel(summary.scenario, result.variant)}</span>
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
      {result.status === "fail" && check && <p className="mt-2 text-sm text-zinc-400">Why it matters: {check.whyItMatters}</p>}
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
}: {
  summary: PromptTestSummary;
  fixes: SuggestedFix[];
  fixActions?: ReactNode;
}) {
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
          {summary.scenarios.length} scenario{summary.scenarios.length === 1 ? "" : "s"} run. {countLine(summary.counts)}
        </p>
        {summary.skipped.length > 0 && (
          <p className="mt-1 text-sm text-amber-200">Not run (cancelled): {summary.skipped.map((s) => s.title).join(", ")}.</p>
        )}
        <p className="mt-2 text-sm text-zinc-300">{overallAdvice(summary)}</p>
        {!live && (
          <p className="mt-2 text-sm text-amber-200">
            Simulated: the scripted simulator only reacts to the lab&apos;s known snippets, not to the rest of your wording. Switch to
            Live model to see how a real model follows your prompt.
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
