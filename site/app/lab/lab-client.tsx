"use client";

import { useEffect, useRef, useState } from "react";
import { scenarioVerdict } from "../../lib/lab/evaluate";
import { planLiveComparison } from "../../lib/lab/history";
import { checkKey, KEY_PROBLEM_MESSAGE } from "../../lib/lab/live-key";
import { CLIENT_MESSAGES } from "../../lib/lab/live-messages";
import { findModel, LIVE_MODELS, type Provider } from "../../lib/lab/models";
import { createOverride, reviewLogJson } from "../../lib/lab/overrides";
import { LIVE_RESPONDER_VERSION, liveConfig, makeLiveResponder, runScenario } from "../../lib/lab/run";
import { scenarios } from "../../lib/lab/scenarios";
import { matchSnippets, SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder, SNIPPET_RULES } from "../../lib/lab/simulator";
import type { CheckResult, FaultKind, Override, Run } from "../../lib/lab/types";
import { LiveSelectedNote, RunBanner } from "./components/banner";
import { CompareView, LatestNotComparable } from "./components/compare-view";
import { Findings } from "./components/findings";
import { BASELINE_LIVE_HELP_ID, BaselineLiveHelp, clearKeyForProviderSwitch, LivePanel } from "./components/live-panel";
import { pickFocusAfterRun } from "./focus";
import { forceLabControls, readPreHydrationChoices, type LabControlState } from "./form-sync";
import { completionAnnouncement } from "./announce";
import { abortInFlight } from "./inflight";
import { Limitations, SimulatorRules } from "./components/reference";
import { RunDetails } from "./components/run-details";
import { BUTTON, FOCUS, liveAlertText, providerRefusalAsymmetryNote, statusLabel } from "./components/status";

const MAX_INSTRUCTION = 4000;
const NO_MATCH =
  "No simulator rule matched your edit; simulated output is unchanged. A real model would respond to arbitrary wording.";

const FAULTS: Array<[FaultKind, string]> = [
  ["none", "None"],
  ["model_error", "Model error (Version B)"],
  ["timeout", "Timeout (Version B)"],
  ["credentials_unavailable", "Credentials unavailable (both versions)"],
  ["malformed_result", "Malformed result (evaluator output)"],
];

const SECTIONS: Array<[string, string]> = [
  ["choose", "1. Choose a scenario"],
  ["inspect", "2. Inspect paired inputs and responses"],
  ["findings", "3. Review findings"],
  ["edit", "4. Edit the instruction and rerun"],
  ["compare", "5. Compare runs"],
  ["review-log", "6. Human review log"],
];

const H2 = "scroll-mt-24 text-2xl font-bold tracking-tight text-zinc-100";

const EMPTY_LIVE_COMPARE = {
  no_live_run: "No live run yet",
  no_live_baseline: "No live baseline run yet — select “Run baseline live”.",
  baseline_only: "Live baseline only — edit and rerun",
  baseline_errors: "Live baseline had errors — run it again",
} as const;

export function LabClient({ baselineRuns }: { baselineRuns: Run[] }) {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [instructions, setInstructions] = useState<Record<string, string>>(() =>
    Object.fromEntries(scenarios.map((s) => [s.id, s.baselineInstruction])),
  );
  // Run history per scenario, oldest first (simulated and live runs).
  const [runs, setRuns] = useState<Record<string, Run[]>>({});
  const [runCount, setRunCount] = useState<Record<string, number>>({});
  // "latest", "baseline" (the precomputed simulated run), or a run id from the history.
  const [view, setView] = useState<string>("latest");
  const [source, setSource] = useState<"simulated" | "live">("simulated");
  const [fault, setFault] = useState<FaultKind>("none");
  const [liveProvider, setLiveProvider] = useState<Provider>(LIVE_MODELS[0].provider);
  const [liveModelId, setLiveModelId] = useState(LIVE_MODELS[0].id);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [runError, setRunError] = useState<{ key: string; text: string } | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const [running, setRunning] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const runningRef = useRef(false);
  const rerunRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const statusAlertRef = useRef<HTMLParagraphElement>(null);
  const runErrorRef = useRef<HTMLParagraphElement>(null);
  const errorSeq = useRef(0);
  // The API key lives only in this uncontrolled input element; it is read at call time.
  const keyInputRef = useRef<HTMLInputElement>(null);
  // F1: the visible controls must equal the state the lab acts on (see form-sync.ts).
  const rootRef = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);

  // The scenario on screen right now, read when a run finishes (the run may belong to another one).
  const displayedScenarioRef = useRef(scenarioId);
  useEffect(() => {
    displayedScenarioRef.current = scenarioId;
  }, [scenarioId]);

  // Leaving /lab (including client-side navigation) aborts any in-flight live calls.
  useEffect(() => () => abortInFlight(cancelRef), []);

  // While a live run is in flight the run buttons are disabled, so focus moves to Cancel.
  useEffect(() => {
    if (running && cancellable) cancelButtonRef.current?.focus();
  }, [running, cancellable]);

  // When a run ends, focus that was dropped (Cancel or a disabled button disappearing) returns to the
  // control that started the run, or to the run's alert if that control is gone.
  useEffect(() => {
    if (running || !restoreFocusRef.current) return;
    const trigger = restoreFocusRef.current;
    restoreFocusRef.current = null;
    pickFocusAfterRun({
      active: document.activeElement,
      body: document.body,
      trigger,
      fallbacks: [statusAlertRef.current, runErrorRef.current, statusRef.current],
    })?.focus();
  }, [running]);

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const baseline = baselineRuns.find((r) => r.scenarioId === scenario.id);
  const history = runs[scenario.id] ?? [];
  const latestRun = history.length > 0 ? history[history.length - 1] : undefined;
  const shown =
    view === "baseline"
      ? baseline
      : view === "latest"
        ? (latestRun ?? baseline)
        : (history.find((r) => r.id === view) ?? latestRun ?? baseline);
  const instruction = instructions[scenario.id] ?? "";
  // The "Show run" radio that is checked: an older run, the precomputed baseline, or the latest run.
  const viewRun = view === "baseline" ? "baseline" : history.slice(0, -1).some((r) => r.id === view) ? view : "latest";
  const liveModel = findModel(liveProvider, liveModelId) ?? LIVE_MODELS.find((m) => m.provider === liveProvider) ?? LIVE_MODELS[0];
  const statusAlert = !running && shown?.mode === "live" ? liveAlertText(shown) : null;
  const asymmetryNote = !running && shown ? providerRefusalAsymmetryNote(shown) : null;

  const controlState: LabControlState = {
    scenarioId: scenario.id,
    source,
    fault,
    instruction,
    viewRun: latestRun ? viewRun : null,
    provider: liveProvider,
    modelId: liveModel.id,
  };
  const controlStateRef = useRef(controlState);
  useEffect(() => {
    controlStateRef.current = controlState;
  });

  // Right after hydration: adopt a scenario, source, or fault the user picked before the page was
  // interactive (restoration is off, so a difference here is this visit's own click). The
  // instruction text is never adopted; the textarea is read-only until now.
  useEffect(() => {
    const root = rootRef.current;
    if (root) {
      const picked = readPreHydrationChoices(root, controlStateRef.current, {
        scenarioIds: scenarios.map((s) => s.id),
        faults: FAULTS.map(([v]) => v),
      });
      if (picked.scenarioId) chooseScenario(picked.scenarioId);
      if (picked.source) setSource(picked.source);
      if (picked.fault) setFault(picked.fault as FaultKind);
    }
    setHydrated(true);
    // Runs once, after hydration; the helpers it calls only use state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State wins: once hydrated, and whenever the page is shown again (including from the
  // back/forward cache), every control is forced to show the state.
  useEffect(() => {
    if (!hydrated) return;
    const sync = () => {
      if (rootRef.current) forceLabControls(rootRef.current, controlStateRef.current);
    };
    sync();
    window.addEventListener("pageshow", sync);
    return () => window.removeEventListener("pageshow", sync);
  }, [hydrated]);

  function readKey(): string | null {
    const value = keyInputRef.current?.value.trim();
    return value ? value : null;
  }

  function chooseScenario(id: string) {
    setScenarioId(id);
    setView("latest");
    setNoMatch(false);
    setRunError(null);
  }

  function chooseProvider(p: Provider) {
    setLiveProvider(p);
    setLiveModelId((LIVE_MODELS.find((m) => m.provider === p) ?? LIVE_MODELS[0]).id);
    // A key is only ever valid for one provider: clear it so it cannot be sent to the other one.
    setKeyError(null);
    setAnnouncement(clearKeyForProviderSwitch(keyInputRef.current, p));
  }

  function setInstruction(text: string) {
    setInstructions((prev) => ({ ...prev, [scenario.id]: text.slice(0, MAX_INSTRUCTION) }));
  }

  function addPreset(snippet: string) {
    setInstruction(instruction + "\n" + snippet);
  }

  async function startRun(kind: "edited" | "baseline", trigger: HTMLButtonElement | null) {
    if (runningRef.current) return;
    const s = scenario;
    const live = source === "live";
    const runInstruction = kind === "baseline" ? s.baselineInstruction : instruction;
    setRunError(null);
    if (live) {
      const key = readKey();
      const problem = key ? checkKey(key, liveModel.provider) : null;
      if (!key || problem) {
        // No request is sent; the button stays enabled and focus moves to the key field.
        setKeyError(key && problem ? KEY_PROBLEM_MESSAGE[problem] : CLIENT_MESSAGES.noKey);
        keyInputRef.current?.focus();
        return;
      }
      setKeyError(null);
      if (runInstruction.includes(key)) {
        errorSeq.current += 1;
        setRunError({ key: `blocked-${errorSeq.current}`, text: `${CLIENT_MESSAGES.keyInInstruction}.` });
        return;
      }
    }
    runningRef.current = true;
    restoreFocusRef.current = trigger;
    const n = (runCount[s.id] ?? 0) + 1;
    const controller = live ? new AbortController() : null;
    cancelRef.current = controller;
    setRunning(true);
    setCancellable(live);
    setAnnouncement("Running…");
    try {
      const responder =
        live && controller
          ? makeLiveResponder({ scenario: s, provider: liveModel.provider, model: liveModel, key: { get: readKey }, signal: controller.signal })
          : simulatedResponder;
      const run = await runScenario(s, runInstruction, responder, live ? liveConfig(liveModel) : SIMULATED_CONFIG, {
        id: `${s.id}-run-${n}`,
        createdAt: new Date().toISOString(),
        mode: live ? "live" : "simulated",
        responderVersion: live ? LIVE_RESPONDER_VERSION : SIMULATOR_VERSION,
        fault: live ? "none" : fault,
      });
      setRuns((prev) => ({ ...prev, [s.id]: [...(prev[s.id] ?? []), run] }));
      setRunCount((prev) => ({ ...prev, [s.id]: n }));
      setView("latest");
      setAnnouncement(
        completionAnnouncement({
          n,
          headline: scenarioVerdict(run.results).headline,
          scenarioTitle: s.title,
          displayed: displayedScenarioRef.current === s.id,
        }),
      );
      setNoMatch(!live && runInstruction !== s.baselineInstruction && matchSnippets(runInstruction).length === 0);
    } catch {
      setAnnouncement(displayedScenarioRef.current === s.id ? `Run ${n} could not be completed.` : `Run ${n} for ${s.title} could not be completed.`);
      setRunError({ key: `${s.id}-run-${n}-failed`, text: "The run could not be completed. This is not an evaluation result." });
    } finally {
      cancelRef.current = null;
      runningRef.current = false;
      setRunning(false);
      setCancellable(false);
    }
  }

  function compareContent() {
    if (!baseline) return <p>Not run</p>;
    if (!latestRun) {
      return source === "live" ? <p className="text-zinc-300">{EMPTY_LIVE_COMPARE.no_live_run}</p> : <CompareView scenario={scenario} baseline={baseline} latest={undefined} overrides={overrides} />;
    }
    if (latestRun.mode === "simulated") {
      return <CompareView scenario={scenario} baseline={baseline} latest={latestRun} overrides={overrides} />;
    }
    const plan = planLiveComparison(
      history.filter((r) => r.mode === "live"),
      latestRun,
      scenario.baselineInstruction,
    );
    if ("empty" in plan) {
      return <p className="text-zinc-300">{EMPTY_LIVE_COMPARE[plan.empty === "no_live_run" ? "no_live_baseline" : plan.empty]}</p>;
    }
    if ("notComparable" in plan) return <LatestNotComparable latest={latestRun} reason={plan.notComparable} />;
    return <CompareView scenario={scenario} baseline={plan.baseline} latest={latestRun} overrides={overrides} />;
  }

  function saveOverride(run: Run, result: CheckResult, humanStatus: string, reason: string): string | null {
    const out = createOverride(run, result, humanStatus, reason, new Date().toISOString());
    if (!out.ok) return out.error;
    setOverrides((prev) => [...prev, out.override]);
    return null;
  }

  function downloadLog() {
    const blob = new Blob([reviewLogJson(overrides)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inclusive-lab-review-log.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div ref={rootRef} className="mx-auto max-w-6xl px-6 py-16 text-zinc-300">
      <header className="mb-8">
        <h1 className="scroll-mt-24 text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">Evaluation Lab</h1>
        <p className="mt-4 max-w-3xl text-lg text-zinc-300">
          Inspect how an assistant handles LGBTQIA+-specific situations, change its system instruction, rerun, and compare. Each scenario
          sends two inputs that differ in exactly one detail. Checks are deterministic word-matching rules; every failure shows its evidence: the exact words that triggered it,
          or what was missing.
        </p>
      </header>

      {shown && <RunBanner run={shown} />}
      <LiveSelectedNote source={source} run={shown} />

      <nav aria-label="Lab steps" className="mb-12">
        <ol className="flex flex-wrap gap-2 text-sm">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className={`inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 ${FOCUS}`}>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-16">
        <section aria-labelledby="choose">
          <h2 id="choose" className={H2}>
            1. Choose a scenario
          </h2>
          <fieldset className="mt-4">
            <legend className="text-sm text-zinc-400">
              Scenario <span className="ml-2 rounded-full border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300">Fictional data</span>
            </legend>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {scenarios.map((s) => (
                <label
                  key={s.id}
                  className={`block cursor-pointer rounded-lg border p-4 ${s.id === scenario.id ? "border-sky-400 bg-sky-950/30" : "border-zinc-800"}`}
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="scenario"
                      value={s.id}
                      checked={s.id === scenario.id}
                      onChange={() => chooseScenario(s.id)}
                      autoComplete="off"
                      className={`mt-1 ${FOCUS}`}
                    />
                    <span>
                      <span className="block font-semibold text-zinc-100">{s.title}</span>
                      <span className="block text-sm text-zinc-400">{s.context}</span>
                      <span className="mt-2 block text-sm text-zinc-300">{s.harm}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="inspect">
          <h2 id="inspect" className={H2}>
            2. Inspect paired inputs and responses
          </h2>
          {latestRun && (
            <fieldset className="mt-4">
              <legend className="text-sm text-zinc-400">Show run</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {[
                  { value: "baseline", label: "Baseline run" },
                  { value: "latest", label: `Latest run (${latestRun.id}, ${latestRun.mode})` },
                  ...history
                    .slice(0, -1)
                    .reverse()
                    .map((r) => ({ value: r.id, label: `${r.id} (${r.mode})` })),
                ].map((o) => (
                  <label key={o.value} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="view-run"
                      value={o.value}
                      checked={o.value === viewRun}
                      onChange={() => setView(o.value)}
                      autoComplete="off"
                      className={FOCUS}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-4">{shown ? <RunDetails scenario={scenario} run={shown} /> : <p>Not run</p>}</div>
        </section>

        <section aria-labelledby="findings">
          <h2 id="findings" className={H2}>
            3. Review findings
          </h2>
          {asymmetryNote && shown && (
            <p
              key={`${shown.id}-asymmetry`}
              role="alert"
              className="mt-4 rounded-md border-2 border-amber-300/70 bg-amber-950/40 p-3 text-amber-100"
            >
              {asymmetryNote}
            </p>
          )}
          <div className="mt-4">
            {shown ? <Findings scenario={scenario} run={shown} overrides={overrides} onSave={saveOverride} /> : <p>Not run</p>}
          </div>
        </section>

        <section aria-labelledby="edit" aria-busy={running || undefined}>
          <h2 id="edit" className={H2}>
            4. Edit the instruction and rerun
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="lab-instruction" className="block font-medium text-zinc-100">
                System instruction for “{scenario.title}”
              </label>
              <textarea
                id="lab-instruction"
                rows={7}
                maxLength={MAX_INSTRUCTION}
                value={instruction}
                readOnly={!hydrated}
                autoComplete="off"
                onChange={(e) => setInstruction(e.target.value)}
                aria-describedby="lab-instruction-count"
                className={`mt-2 w-full rounded-md border border-zinc-500 bg-zinc-900 p-3 font-mono text-sm text-zinc-100 ${FOCUS}`}
              />
              <p id="lab-instruction-count" className="text-sm text-zinc-400">
                {instruction.length} / {MAX_INSTRUCTION} characters
              </p>
            </div>
            <div role="group" aria-labelledby="lab-presets" className="space-y-2">
              <p id="lab-presets" className="text-sm text-zinc-400">
                Presets append a documented simulator snippet to the instruction:
              </p>
              <div className="flex flex-col gap-2">
                {scenario.presets.map((id) => {
                  const rule = SNIPPET_RULES.find((r) => r.id === id);
                  if (!rule) return null;
                  return (
                    <button key={id} type="button" className={`${BUTTON} text-left`} onClick={() => addPreset(rule.snippet)}>
                      <span className="mr-2 font-mono text-xs text-zinc-400">
                        {rule.id} ({rule.kind})
                      </span>
                      {rule.snippet}
                    </button>
                  );
                })}
                <button type="button" className={`${BUTTON} self-start`} onClick={() => setInstruction(scenario.baselineInstruction)}>
                  Reset to the baseline instruction
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <fieldset className="min-w-0">
                <legend className="font-medium text-zinc-100">Response source</legend>
                <div className="mt-2 space-y-1 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="response-source"
                      value="simulated"
                      checked={source === "simulated"}
                      onChange={() => setSource("simulated")}
                      autoComplete="off"
                      className={FOCUS}
                    />
                    Simulated (scripted demo)
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="response-source"
                      value="live"
                      checked={source === "live"}
                      onChange={() => setSource("live")}
                      autoComplete="off"
                      className={FOCUS}
                    />
                    Live model (your API key)
                  </label>
                </div>
              </fieldset>
              <div className="min-w-0">
                <label htmlFor="lab-fault" className="block font-medium text-zinc-100">
                  Fault injection (simulated only)
                </label>
                <select
                  id="lab-fault"
                  value={fault}
                  disabled={source === "live"}
                  autoComplete="off"
                  onChange={(e) => setFault(e.target.value as FaultKind)}
                  className={`mt-2 w-full max-w-sm rounded-md border border-zinc-500 bg-zinc-900 p-2 text-sm text-zinc-100 disabled:opacity-60 ${FOCUS}`}
                >
                  {FAULTS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {source === "live" && (
              <LivePanel
                provider={liveProvider}
                modelId={liveModel.id}
                onProviderChange={chooseProvider}
                onModelChange={setLiveModelId}
                keyInputRef={keyInputRef}
                keyError={keyError}
                onKeyErrorClear={() => setKeyError(null)}
              />
            )}
            <div className="flex flex-wrap items-center gap-4">
              <button
                ref={rerunRef}
                type="button"
                onClick={(e) => startRun("edited", e.currentTarget)}
                disabled={running}
                className={`${BUTTON} px-5 py-2 font-semibold`}
              >
                Rerun
              </button>
              {source === "live" && (
                <button
                  type="button"
                  onClick={(e) => startRun("baseline", e.currentTarget)}
                  disabled={running}
                  aria-describedby={BASELINE_LIVE_HELP_ID}
                  className={`${BUTTON} px-5 py-2`}
                >
                  Run baseline live
                </button>
              )}
              {running && cancellable && (
                <button ref={cancelButtonRef} type="button" onClick={() => abortInFlight(cancelRef)} className={`${BUTTON} px-5 py-2`}>
                  Cancel
                </button>
              )}
              <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className={`text-sm text-zinc-300 ${FOCUS}`}>
                {announcement}
              </p>
            </div>
            {source === "live" && <BaselineLiveHelp />}
            {statusAlert && shown && (
              <p key={shown.id} ref={statusAlertRef} tabIndex={-1} role="alert" className={`rounded-md border border-rose-400/60 p-3 text-sm text-rose-200 ${FOCUS}`}>
                {statusAlert}
              </p>
            )}
            {runError && (
              <p key={runError.key} ref={runErrorRef} tabIndex={-1} role="alert" className={`rounded-md border border-rose-400/60 p-3 text-sm text-rose-200 ${FOCUS}`}>
                {runError.text}
              </p>
            )}
            {noMatch && <p className="rounded-md border border-zinc-600 p-3 text-sm text-zinc-300">{NO_MATCH}</p>}
          </div>
        </section>

        <section aria-labelledby="compare">
          <h2 id="compare" className={H2}>
            5. Compare runs
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Baseline vs latest run for the selected scenario. For live runs, the baseline is the most recent fully successful run of the
            unedited baseline instruction with the same provider, model, and returned model version.
          </p>
          <div className="mt-4">{compareContent()}</div>
        </section>

        <section aria-labelledby="review-log">
          <h2 id="review-log" className={H2}>
            6. Human review log
          </h2>
          <p className="mt-2 text-sm text-zinc-400">Stored only in this browser tab; do not enter real personal data.</p>
          {overrides.length === 0 ? (
            <p className="mt-4 text-zinc-300">No human reviews yet. Use “Disagree with this result” on a finding.</p>
          ) : (
            <ol className="mt-4 list-decimal space-y-2 pl-6 text-sm text-zinc-300">
              {overrides.map((o, i) => (
                <li key={i}>
                  <span className="font-mono text-zinc-400">{o.runId}</span> · {o.checkId} · {o.variant}: human {statusLabel(o.humanStatus)},
                  automated {statusLabel(o.automatedStatus)}. Reason: {o.reason}
                </li>
              ))}
            </ol>
          )}
          <button type="button" className={`${BUTTON} mt-4`} onClick={downloadLog}>
            Download review log (JSON)
          </button>
        </section>

        <section aria-labelledby="simulator-rules">
          <h2 id="simulator-rules" className={H2}>
            Simulator rules
          </h2>
          <div className="mt-4">
            <SimulatorRules />
          </div>
        </section>

        <section aria-labelledby="limitations">
          <h2 id="limitations" className={H2}>
            Limitations
          </h2>
          <div className="mt-4">
            <Limitations />
          </div>
        </section>
      </div>
    </div>
  );
}
