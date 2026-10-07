import type { ReactNode } from "react";
import { countsAsFail, type PromptTestSummary, type ScenarioSummary, type SuggestedFix } from "../../../lib/lab/prompt-test";
import { detectRefusal } from "../../../lib/lab/evaluate";
import type { CheckResult } from "../../../lib/lab/types";
import { providerLabel, returnedModelText } from "../components/banner";
import { countLine } from "../components/result-card";
import { RunDetails } from "../components/run-details";
import { liveAlertText, ModeBadge, providerRefusalAsymmetryNote, StatusBadge, variantLabel } from "../components/status";

const TONE: Array<[RegExp, string]> = [
  [/^Checks failed/, "border-rose-400/60"],
  [/^All displayed checks passed/, "border-emerald-400/60"],
];

function tone(headline: string): string {
  return TONE.find(([re]) => re.test(headline))?.[1] ?? "border-amber-300/60";
}

/** Neither version got a response (a rejected key, a provider error, a timeout), so no check ran. */
export function noResponses(summary: ScenarioSummary): boolean {
  return summary.run.responses.a.status !== "ok" && summary.run.responses.b.status !== "ok";
}

/** Said when the assistant declined scenarios as outside its job; null when none were. */
export function outOfScopeAdvice(summary: PromptTestSummary): string | null {
  const n = summary.outOfScopeScenarios;
  if (n === 0) return null;
  const total = summary.scenarios.length;
  return `Your assistant declined ${n} of ${total} scenario${total === 1 ? "" : "s"} as outside its job, so the checks had little to judge there. That is usually a sign the scenarios don't match what your assistant does, not a problem with your prompt. Choose the scenario set closest to your product and test again.`;
}

const ORDINARY_REQUESTS = "These are ordinary requests from LGBTQIA+ users.";
const REFUSAL_MATTERS = `That is worth knowing in itself: ${ORDINARY_REQUESTS.charAt(0).toLowerCase()}${ORDINARY_REQUESTS.slice(1)}`;

type Status = ScenarioSummary["run"]["responses"]["a"]["status"];
const FAILED: ReadonlySet<Status> = new Set(["model_error", "timeout", "credentials_unavailable"]);

/**
 * What the overall headline means for the engineer's prompt. Causes are counted per version, so a
 * scenario whose two versions failed differently contributes to each matching note: a cancel
 * (never started, or stopped mid-request), a safety refusal (of both versions, or of one version,
 * which is named with that version's label), and a failed call. A refusal and a cancel are always
 * named, a cancel is never blamed on the model, and key or account advice appears only when a call
 * failed in a way a key or account could explain. Suggested lines are promised only when there are
 * some to add, and results left inconclusive by the assistant's own refusals are called refusals.
 */
export function overallAdvice(summary: PromptTestSummary, fixes: readonly SuggestedFix[]): string {
  // Scenarios that never started because the test was cancelled are in `skipped`, not in `scenarios`.
  const ran = summary.scenarios.length;
  const total = ran + summary.skipped.length;
  const scen = (n: number) => `${n} scenario${n === 1 ? "" : "s"}`;
  const silent = summary.scenarios.filter(noResponses);
  const pair = (s: ScenarioSummary) => [s.run.responses.a, s.run.responses.b];
  const cancelled = summary.skipped.length + summary.scenarios.filter((s) => pair(s).some((r) => r.status === "not_run")).length;
  const refusedBoth = summary.scenarios.filter((s) => pair(s).every((r) => r.status === "provider_refused")).length;
  const refusedOne = summary.scenarios.filter((s) => pair(s).filter((r) => r.status === "provider_refused").length === 1);
  const failed = summary.scenarios.filter((s) => pair(s).some((r) => FAILED.has(r.status)));

  const notes: string[] = [];
  if (refusedBoth > 0) {
    notes.push(
      `The provider's safety system declined both versions in ${refusedBoth} of ${scen(total)}. ${REFUSAL_MATTERS}`,
    );
  }
  for (const s of refusedOne) {
    const v = s.run.responses.a.status === "provider_refused" ? "a" : "b";
    const other = s.run.responses[v === "a" ? "b" : "a"];
    notes.push(
      other.status === "ok"
        ? `In “${s.scenario.title}”, the provider's safety system declined only ${variantLabel(s.scenario, v)} and answered the other version. That asymmetry may itself be the harm under test (one sample).`
        : `In “${s.scenario.title}”, the provider's safety system declined ${variantLabel(s.scenario, v)}.`,
    );
  }
  if (failed.length > 0) {
    const statuses = failed.flatMap(pair).filter((r) => FAILED.has(r.status));
    // The reason names only the failed calls, never a refusal or a cancel from the same scenario.
    const ok = { status: "ok" as const };
    const reason = Array.from(new Set(statuses.map((r) => liveAlertText({ responses: { a: r, b: ok } })).filter(Boolean))).join("; ");
    const keyProblem = statuses.some((r) => r.status === "model_error" || r.status === "credentials_unavailable");
    notes.push(
      `${failed.length} of ${scen(total)} got no response from the model for at least one version${reason ? ` (${reason})` : ""}. ` +
        (keyProblem ? "Check your API key, the model you picked, and your provider account, then run the test again." : "Run the test again."),
    );
  }
  if (cancelled > 0) notes.push(`The test was cancelled before ${cancelled} of ${scen(total)} finished.`);

  if (silent.length === ran) {
    // Nothing usable came back from any scenario that ran (or none ran).
    if (refusedBoth === total) {
      return `The provider's safety system declined every request, so nothing was evaluated. ${REFUSAL_MATTERS} Try another model, or check how your provider handles this content.`;
    }
    return [`Nothing was evaluated.`, ...notes, cancelled > 0 ? "Run it again when you're ready." : ""].filter(Boolean).join(" ");
  }

  const tail = notes.length > 0 ? ` ${notes.join(" ")}` : "";
  if (summary.failedScenarios > 0) {
    const n = summary.failedScenarios;
    const next =
      fixes.length > 0
        ? "Review the evidence below, add the suggested lines, and test again."
        : "The lab's suggested lines for these checks are already in your prompt, or none apply, so review the evidence below, adjust your own wording, and test again.";
    return `Your prompt produced a failing response in ${n} of ${scen(total)}. ${next}${tail}`;
  }
  if (summary.headline === "All displayed checks passed") {
    return "No displayed check failed in this sample. That is evidence, not proof: run it again, and test with your own real traffic too.";
  }
  if (summary.outOfScopeScenarios > 0 && summary.outOfScopeScenarios === ran) {
    return `This test could not evaluate your prompt.${tail}`;
  }
  if (notes.length > 0) {
    return `This result is incomplete.${tail}`;
  }
  const n = summary.counts.inconclusive;
  if (summary.counts.fail === 0 && n > 0 && summary.counts.error === 0 && summary.counts.not_evaluated === 0) {
    // A refusal by the assistant itself (not the provider's safety system) leaves checks too empty to judge.
    const declined = summary.scenarios.filter(
      (s) => s.outOfScope === null && s.counts.inconclusive > 0 && pair(s).some((r) => r.status === "ok" && detectRefusal(r.text ?? "") !== null),
    ).length;
    if (declined > 0) {
      return `No check failed, but your assistant declined the request in ${declined} of ${scen(total)}, so ${n === 1 ? "one result" : `${n} results`} could not be judged. A refusal never passes. ${ORDINARY_REQUESTS} Read the responses below (open “Show the inputs and responses”) and check whether your prompt should let your assistant help.`;
    }
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
          {(["a", "b"] as const)
            .map((v) => [v, result.evidence.filter((e) => e.variant === v)] as const)
            .filter(([, items]) => items.length > 0)
            .map(([v, items]) => (
              <li key={v} className="flex flex-wrap items-baseline gap-1.5 text-zinc-300">
                <span className="text-xs text-zinc-400">Version {v.toUpperCase()}:</span>
                {items.map((e, i) => (
                  <span key={`${e.start}-${i}`}>
                    {i > 0 && " "}
                    <mark className="rounded bg-rose-500/20 px-1 text-rose-100">{e.excerpt}</mark>
                  </span>
                ))}
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
      {providerRefusalAsymmetryNote(run) && <p className="mt-2 text-sm text-amber-200">{providerRefusalAsymmetryNote(run)}</p>}
      {summary.outOfScope && (
        <p className="mt-2 text-sm text-amber-200">
          Both versions declined this task as outside the assistant&apos;s job (“{summary.outOfScope.a.excerpt}”), so the checks below had
          little to judge.
        </p>
      )}
      {noResponses(summary) ? (
        <p className="mt-3 text-sm text-zinc-300">Neither version returned a usable response (see above), so this scenario&apos;s checks didn&apos;t run.</p>
      ) : summary.issues.length > 0 ? (
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
  const reported = summary.scenarios.filter((s) => s.run.responses.a.returnedModel || s.run.responses.b.returnedModel);
  const models = live ? Array.from(new Set(reported.map((s) => returnedModelText(s.run)))) : [];
  return (
    <div className="space-y-6">
      <div className={`rounded-xl border-2 ${tone(summary.headline)} bg-zinc-900/60 p-4`}>
        <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {first && <ModeBadge mode={first.mode} />}
          {live && first ? (
            <span className="wrap-anywhere">
              {providerLabel(first.config.provider)} ·{" "}
              {models.length > 0 ? `returned model ${models.join(", ")}` : `requested model ${first.config.model}`}
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
        <p className="mt-2 text-sm text-zinc-300">{overallAdvice(summary, fixes)}</p>
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
