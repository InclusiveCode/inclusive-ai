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
import { scenarios } from "../../../lib/lab/scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder } from "../../../lib/lab/simulator";
import { button } from "../../ui";
import { clearKeyForProviderSwitch, LivePanel } from "../components/live-panel";
import { FOCUS } from "../components/status";
import { abortInFlight } from "../inflight";
import { afterNextPaint } from "../yield";
import { PromptTestReport } from "./report";

/** The server route accepts instructions up to this length. */
export const MAX_PROMPT_CHARS = 4000;

const CALLS = scenarios.length * 2;
const BILLING = `A prompt test makes ${CALLS} billed calls (2 per scenario, ${scenarios.length} scenarios).`;

export const EXAMPLE_PROMPT =
  "You are the virtual assistant for Brightpath Health's patient portal. Help patients with appointments, billing questions, and updating their records. Be warm and concise. Verify identity before changing account details.";

const SOURCE_OPTION =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-950/30 lg:min-h-9";

export function PromptTestClient() {
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState<"simulated" | "live">("live");
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

  const model = findModel(provider, modelId) ?? LIVE_MODELS.find((m) => m.provider === provider) ?? LIVE_MODELS[0];

  // Leaving the page (including client-side navigation) aborts any in-flight live calls.
  useEffect(() => () => abortInFlight(cancelRef), []);

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
    const live = source === "live";
    if (live) {
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
    }
    runningRef.current = true;
    const n = testCount + 1;
    const controller = live ? new AbortController() : null;
    cancelRef.current = controller;
    setRunning(true);
    setCancellable(live);
    setStatus("Starting…");
    try {
      await afterNextPaint();
      const out = await runPromptTest({
        instruction,
        responderFor: (s) =>
          live && controller
            ? makeLiveResponder({ scenario: s, provider: model.provider, model, key: { get: readKey }, signal: controller.signal })
            : simulatedResponder,
        config: live ? liveConfig(model) : SIMULATED_CONFIG,
        mode: live ? "live" : "simulated",
        responderVersion: live ? LIVE_RESPONDER_VERSION : SIMULATOR_VERSION,
        testId: `test-${n}`,
        createdAt: new Date().toISOString(),
        signal: controller?.signal,
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
    if (next.length > MAX_PROMPT_CHARS) {
      setFormError(`Adding the suggested lines would take your prompt over ${MAX_PROMPT_CHARS} characters. Add them by hand where they fit.`);
      return;
    }
    setPrompt(next);
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
  const stale = result !== null && result.instruction !== prompt;

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
          Paste the system prompt you are drafting for your AI system. The lab runs it against every scenario ({scenarios.length}{" "}
          LGBTQIA+-specific situations, each sent as two inputs that differ in one detail), applies the same evidence-backed checks, and
          returns one report with suggested lines to add.
        </p>
      </header>

      <section aria-labelledby="pt-prompt" className="space-y-5">
        <h2 id="pt-prompt" className="text-2xl font-bold tracking-tight text-zinc-100">
          1. Your system prompt
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
            <button type="button" className={button.secondary} onClick={() => setPrompt(EXAMPLE_PROMPT)} disabled={running}>
              Use an example prompt
            </button>
          </div>
        </div>
        <p className="text-sm text-zinc-400">
          The scenarios are fictional (a credit union, a meetup, an HR case). If your assistant declines them as out of scope, the checks
          record that, and you learn how it treats users when it says no.
        </p>
      </section>

      <section aria-labelledby="pt-source" className="mt-12 space-y-4">
        <h2 id="pt-source" className="text-2xl font-bold tracking-tight text-zinc-100">
          2. Where the responses come from
        </h2>
        <fieldset className="min-w-0">
          <legend className="sr-only">Response source</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={SOURCE_OPTION}>
              <input
                type="radio"
                name="pt-source"
                value="live"
                checked={source === "live"}
                onChange={() => setSource("live")}
                autoComplete="off"
                className={FOCUS}
              />
              Live model (your API key)
            </label>
            <label className={SOURCE_OPTION}>
              <input
                type="radio"
                name="pt-source"
                value="simulated"
                checked={source === "simulated"}
                onChange={() => {
                  setSource("simulated");
                  setKeyError(null);
                }}
                autoComplete="off"
                className={FOCUS}
              />
              Simulated (scripted demo, no key)
            </label>
          </div>
        </fieldset>
        {source === "live" ? (
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
            />
          </div>
        ) : (
          <p className="rounded-lg border border-amber-300/60 bg-amber-950/30 p-3 text-sm text-amber-100">
            Simulated demo: no AI model is called. The scripted simulator only reacts to the lab&apos;s known fix snippets, so it shows the
            workflow, not how a real model follows your prompt.
          </p>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button type="button" onClick={startTest} disabled={running} className={button.primary}>
          {source === "live" ? "Run live test" : "Run simulated test"}
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
          3. Report
        </h2>
        {summary && result ? (
          <div className="mt-4 space-y-4">
            {stale && (
              <p className="rounded-md border border-zinc-600 p-3 text-sm text-zinc-300">
                Your prompt has changed since this test. Run the test again to evaluate the current text.
              </p>
            )}
            <PromptTestReport
              summary={summary}
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
            Your report appears here: an overall verdict, each scenario&apos;s failed checks with the exact words that triggered them, and
            suggested lines to add.
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
