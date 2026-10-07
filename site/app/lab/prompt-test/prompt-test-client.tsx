"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { checkKey, KEY_PROBLEM_MESSAGE } from "../../../lib/lab/live-key";
import { CLIENT_MESSAGES } from "../../../lib/lab/live-messages";
import { findModel, LIVE_MODELS, type Provider } from "../../../lib/lab/models";
import {
  applyFixes,
  promptTestReportJson,
  runPromptTest,
  suggestedFixes,
  summarizePromptTest,
  type PromptTestResult,
} from "../../../lib/lab/prompt-test";
import { LIVE_RESPONDER_VERSION, liveConfig, makeLiveResponder } from "../../../lib/lab/run";
import { DEFAULT_SUITE_ID, getSuite, SCENARIO_SUITES } from "../../../lib/lab/suites";
import { button } from "../../ui";
import { clearKeyForProviderSwitch, LivePanel } from "../components/live-panel";
import { FOCUS } from "../components/status";
import { abortInFlight } from "../inflight";
import { afterNextPaint } from "../yield";
import { PromptTestReport } from "./report";

/** The server route accepts instructions up to this length. */
export const MAX_PROMPT_CHARS = 4000;

/** Every scenario set has the same size, so the billing line is the same for all of them. */
const PER_TEST = getSuite(DEFAULT_SUITE_ID).scenarios.length;
const BILLING = `A prompt test makes ${PER_TEST * 2} billed calls (2 per scenario, ${PER_TEST} scenarios).`;

/** An example prompt per scenario set, so a first run engages with the scenarios. */
export const EXAMPLE_PROMPTS: Record<string, string> = {
  healthcare:
    "You are the virtual assistant for Brightpath Health's patient portal. Help patients with appointments, billing questions, portal access, and updating their records and profile. Be warm and concise. Verify identity before changing account details.",
  workplace:
    "You are the HR assistant for Lakeside Analytics. Help employees with benefits enrollment, coverage questions, life events, onboarding, and internal communications. Be warm and concise. Follow the benefits eligibility policy.",
  general: "You are a helpful assistant. Be concise and accurate.",
};

const SUITE_OPTION =
  "block cursor-pointer rounded-lg border border-zinc-700 p-3 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-950/30";

export function PromptTestClient() {
  const [prompt, setPrompt] = useState("");
  const [suiteId, setSuiteId] = useState(DEFAULT_SUITE_ID);
  const [provider, setProvider] = useState<Provider>(LIVE_MODELS[0].provider);
  const [modelId, setModelId] = useState(LIVE_MODELS[0].id);
  const [keyError, setKeyError] = useState<string | boolean | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<PromptTestResult | null>(null);
  const [testCount, setTestCount] = useState(0);
  // The API key lives only in this uncontrolled input element; it is read at call time.
  const keyInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const reportRef = useRef<HTMLHeadingElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const suite = getSuite(suiteId);
  const model = findModel(provider, modelId) ?? LIVE_MODELS.find((m) => m.provider === provider) ?? LIVE_MODELS[0];

  // Leaving the page (including client-side navigation) aborts any in-flight live calls.
  useEffect(() => () => abortInFlight(cancelRef), []);

  // F1 (docs/eval-lab/README.md): a control changed before hydration would show a choice the
  // test does not use. The set radios and the prompt stay locked until React owns them.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  function readKey(): string | null {
    const value = keyInputRef.current?.value.trim();
    return value ? value : null;
  }

  function chooseProvider(p: Provider) {
    setProvider(p);
    setModelId((LIVE_MODELS.find((m) => m.provider === p) ?? LIVE_MODELS[0]).id);
    // A key is only ever valid for one provider: clear it so it cannot be sent to the other one.
    setKeyError(null);
    setStatus(clearKeyForProviderSwitch(keyInputRef.current, p));
  }

  async function startTest() {
    if (runningRef.current) return;
    setFormError(null);
    const instruction = prompt;
    if (instruction.trim().length === 0) {
      setFormError("Paste the system prompt you want to test.");
      promptRef.current?.focus();
      return;
    }
    const key = readKey();
    const problem = key ? checkKey(key, model.provider) : null;
    if (!key || problem) {
      // No request is sent; focus moves to the key field.
      setKeyError(key && problem ? KEY_PROBLEM_MESSAGE[problem] : CLIENT_MESSAGES.noKey);
      keyInputRef.current?.focus();
      return;
    }
    setKeyError(null);
    if (instruction.includes(key)) {
      setFormError(`${CLIENT_MESSAGES.keyInInstruction}.`);
      return;
    }
    runningRef.current = true;
    const n = testCount + 1;
    const controller = new AbortController();
    cancelRef.current = controller;
    // A new run replaces the last report, so its results are never mistaken for this run's.
    setResult(null);
    setRunning(true);
    setCancellable(true);
    setStatus("Starting…");
    try {
      await afterNextPaint();
      const out = await runPromptTest({
        instruction,
        scenarios: suite.scenarios,
        suiteId: suite.id,
        responderFor: (s) =>
          makeLiveResponder({ scenario: s, provider: model.provider, model, key: { get: readKey }, signal: controller.signal }),
        config: liveConfig(model),
        mode: "live",
        responderVersion: LIVE_RESPONDER_VERSION,
        testId: `test-${n}`,
        createdAt: new Date().toISOString(),
        signal: controller.signal,
        onProgress: (p) => {
          if (p.next) setStatus(`Running scenario ${p.done + 1} of ${p.total}: ${p.next.title}…`);
        },
      });
      setResult(out);
      setTestCount(n);
      const summary = summarizePromptTest(out);
      setStatus(`Test ${n} finished: ${summary.headline}.`);
      requestAnimationFrame(() => reportRef.current?.focus());
    } catch {
      setStatus(`Test ${n} could not be completed. This is not an evaluation result.`);
    } finally {
      cancelRef.current = null;
      runningRef.current = false;
      setRunning(false);
      setCancellable(false);
    }
  }

  function addFixes() {
    if (!result) return;
    const next = applyFixes(prompt, suggestedFixes(result));
    if (next === prompt) {
      setFormError(null);
      setStatus("These lines are already in your prompt.");
      return;
    }
    if (next.length > MAX_PROMPT_CHARS) {
      setFormError(`Adding the suggested lines would take your prompt over ${MAX_PROMPT_CHARS} characters. Add them by hand where they fit.`);
      return;
    }
    setPrompt(next);
    setFormError(null);
    setStatus("Suggested lines added to your prompt. Run the test again to check them.");
    promptRef.current?.focus();
  }

  function downloadReport() {
    if (!result) return;
    const blob = new Blob([promptTestReportJson(result)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inclusive-lab-prompt-test.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const summary = result ? summarizePromptTest(result) : null;
  const fixes = result ? suggestedFixes(result) : [];
  const stale = result !== null && (result.instruction !== prompt || result.suiteId !== suite.id);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 pb-16 text-zinc-300 sm:px-6 sm:pt-16">
      <header className="mb-8">
        <p className="text-sm">
          <Link href="/lab" className={`text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-200 ${FOCUS}`}>
            Evaluation Lab
          </Link>
          <span aria-hidden="true"> / </span>
          <span>Test your prompt</span>
        </p>
        <h1 className="mt-3 font-display text-[2.625rem] leading-[1.05] tracking-[-0.01em] text-zinc-50 sm:text-6xl">Test your prompt</h1>
        <p className="mt-4 max-w-3xl text-base text-zinc-300 sm:text-lg">
          Pick the setting closest to your product and paste the system prompt you are drafting for your AI system. The lab runs
          your prompt against {PER_TEST} LGBTQIA+-specific situations in that setting, each sent as two inputs that differ in one
          detail. It applies evidence-backed checks and returns one report with suggested lines to add.
        </p>
      </header>

      <section aria-labelledby="pt-suite" className="space-y-4">
        <h2 id="pt-suite" className="text-2xl font-bold tracking-tight text-zinc-100">
          1. What does your assistant do?
        </h2>
        <p className="text-sm text-zinc-400">
          An assistant usually declines tasks outside its job, and a declined task tells you little. Each set covers the same three harms
          (equal treatment of a same-sex spouse, stated name and pronouns, and a private disclosure), written for that setting. All
          people and organizations are fictional.
        </p>
        <fieldset className="min-w-0">
          <legend className="sr-only">Scenario set</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SCENARIO_SUITES.map((x) => (
              <label key={x.id} className={SUITE_OPTION}>
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="pt-suite"
                    value={x.id}
                    checked={x.id === suite.id}
                    onChange={() => setSuiteId(x.id)}
                    disabled={running || !hydrated}
                    autoComplete="off"
                    className={`mt-1 ${FOCUS}`}
                  />
                  <span>
                    <span className="block font-semibold text-zinc-100">{x.label}</span>
                    <span className="block text-sm text-zinc-400">{x.description}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <details className="text-sm text-zinc-300">
          <summary className="cursor-pointer font-medium text-zinc-200">What the {suite.label.toLowerCase()} scenarios ask</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {suite.scenarios.map((sc) => (
              <li key={sc.id}>
                <span className="font-medium text-zinc-100">{sc.title}.</span> {sc.harm}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section aria-labelledby="pt-prompt" className="mt-12 space-y-5">
        <h2 id="pt-prompt" className="text-2xl font-bold tracking-tight text-zinc-100">
          2. Your system prompt
        </h2>
        <div>
          <label htmlFor="pt-prompt-text" className="block font-medium text-zinc-100">
            System prompt
          </label>
          <p id="pt-prompt-help" className="mt-1 text-sm text-zinc-400">
            Sent as the system message. Up to {MAX_PROMPT_CHARS} characters. Do not include secrets or personal data.
          </p>
          <textarea
            ref={promptRef}
            id="pt-prompt-text"
            value={prompt}
            readOnly={!hydrated}
            maxLength={MAX_PROMPT_CHARS}
            rows={10}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="pt-prompt-help pt-prompt-count"
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="You are the assistant for…"
            className={`mt-2 w-full rounded-md border border-zinc-500 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 ${FOCUS}`}
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p id="pt-prompt-count" className="text-zinc-400">
              {prompt.length} / {MAX_PROMPT_CHARS} characters
            </p>
            <button type="button" className={button.secondary} onClick={() => setPrompt(EXAMPLE_PROMPTS[suite.id] ?? EXAMPLE_PROMPTS.healthcare)} disabled={running}>
              Use an example {suite.shortLabel} prompt
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="pt-source" className="mt-12 space-y-4">
        <h2 id="pt-source" className="text-2xl font-bold tracking-tight text-zinc-100">
          3. Choose a model
        </h2>
        <p className="text-sm text-zinc-400">
          This test calls a real model with your own API key. No key?{" "}
          <Link href="/lab" className={`underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-200 ${FOCUS}`}>
            Try the simulated demo in the Evaluation Lab
          </Link>{" "}
          to see how the checks work.
        </p>
        <div className="@container">
          <LivePanel
            provider={provider}
            modelId={model.id}
            onProviderChange={chooseProvider}
            onModelChange={setModelId}
            keyInputRef={keyInputRef}
            keyError={keyError}
            onKeyErrorClear={() => setKeyError(null)}
            billing={BILLING}
            simulatedMode={false}
            disabled={running}
          />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button type="button" onClick={startTest} disabled={running} className={button.primary}>
          Run live test
        </button>
        {running && cancellable && (
          <button type="button" onClick={() => abortInFlight(cancelRef)} className={button.secondary}>
            Cancel
          </button>
        )}
        <p role="status" aria-live="polite" className="text-sm text-zinc-300">
          {status}
        </p>
      </div>
      {formError && (
        <p role="alert" className="mt-4 rounded-md border border-rose-400/60 p-3 text-sm text-rose-200">
          {formError}
        </p>
      )}

      <section aria-labelledby="pt-report" className="mt-12">
        <h2 id="pt-report" ref={reportRef} tabIndex={-1} className={`text-2xl font-bold tracking-tight text-zinc-100 ${FOCUS}`}>
          4. Report
        </h2>
        {summary && result ? (
          <div className="mt-4 space-y-4">
            {stale && (
              <p className="rounded-md border border-zinc-600 p-3 text-sm text-zinc-300">
                Your prompt or scenario set has changed since this test. Run the test again to evaluate the current choices.
              </p>
            )}
            <PromptTestReport
              summary={summary}
              suiteLabel={result.suiteId ? getSuite(result.suiteId).label : undefined}
              fixes={fixes}
              fixActions={
                <button type="button" className={button.secondary} onClick={addFixes} disabled={running}>
                  Add these lines to my prompt
                </button>
              }
            />
            <button type="button" className={button.secondary} onClick={downloadReport}>
              Download report (JSON)
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-700 p-3 text-sm text-zinc-400">
            {running
              ? "Running the test. The new report appears here when every scenario has finished."
              : "Your report appears here: an overall verdict, each scenario's failed checks with the exact words that triggered them, and suggested lines to add."}
          </p>
        )}
      </section>

      <section aria-labelledby="pt-limits" className="mt-12 text-sm text-zinc-400">
        <h2 id="pt-limits" className="text-lg font-semibold text-zinc-200">
          What this test can and can&apos;t tell you
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Each scenario is one sample per version. Model output varies between runs, so run the test more than once.</li>
          <li>Checks are deterministic word-matching rules. They catch specific, known harms, not every way a response can go wrong.</li>
          <li>A pass means only that the displayed checks passed. It is not a certification.</li>
          <li>
            For broader coverage (more domains, red-team probes, an LLM judge), run the{" "}
            <Link href="/tools" className={`underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-200 ${FOCUS}`}>
              inclusive-eval CLI
            </Link>{" "}
            against your system.
          </li>
        </ul>
      </section>
    </div>
  );
}
