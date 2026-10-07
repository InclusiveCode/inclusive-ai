import type { ReactNode } from "react";
import { renderInputs } from "../../../lib/lab/render";
import type { Scenario } from "../../../lib/lab/scenarios";
import type { Run, Variant } from "../../../lib/lab/types";
import { HighlightedText } from "../highlight";
import { providerLabel, returnedModelText } from "./banner";
import { ModeBadge, RESPONSE_STATUS_TEXT } from "./status";

function na(v: number | null): string {
  return v === null ? "n/a" : String(v);
}

function list(items: string[] | undefined): string {
  return items && items.length > 0 ? items.join(", ") : "none";
}

/** One label/value pair; the wrapper keeps each dt directly followed by its dd. */
function Field({ label, children, mono = false, breakAll = false }: { label: string; children: ReactNode; mono?: boolean; breakAll?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className={`min-w-0 ${breakAll ? "break-all" : "break-words"} ${mono ? "font-mono" : ""} text-zinc-300`}>{children}</dd>
    </div>
  );
}

/**
 * Compact run metadata: mode, provider/model, config, fingerprint, timestamp (spec §7: every run
 * card and comparison column shows them). D49: the pairs flow into columns instead of one long list.
 */
export function RunMeta({ run, title }: { run: Run; title?: string }) {
  const rules = Array.from(new Set([...(run.responses.a.rulesMatched ?? []), ...(run.responses.b.rulesMatched ?? [])]));
  const live = run.mode === "live";
  return (
    <div className="@container rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      {title && <p className="mb-2 text-sm font-semibold text-zinc-100">{title}</p>}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 @3xl:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-zinc-400">Mode</dt>
          <dd className="min-w-0 break-words">
            <ModeBadge mode={run.mode} />
          </dd>
        </div>
        <Field label="Run ID" mono breakAll>
          {run.id}
        </Field>
        <Field label="Provider">{live ? providerLabel(run.config.provider) : run.config.provider}</Field>
        {/* Spec §7: the word "model" is never used for simulated output. */}
        <Field label={live ? "Requested model" : "Simulator"} mono breakAll>
          {run.config.model}
        </Field>
        {live && (
          <Field label="Returned model" mono breakAll>
            {returnedModelText(run)}
          </Field>
        )}
        <Field label="Temperature">{na(run.config.temperature)}</Field>
        <Field label="Max tokens">{na(run.config.maxTokens)}</Field>
        <Field label="Rubric version" mono breakAll>
          {run.rubricVersion}
        </Field>
        <Field label="Instruction fingerprint" mono breakAll>
          {run.instructionFingerprint}
        </Field>
        <Field label="Created at" mono breakAll>
          {run.createdAt}
        </Field>
        {live && (
          <Field label="Duration">
            A: {run.responses.a.durationMs} ms; B: {run.responses.b.durationMs} ms
          </Field>
        )}
        {!live && (
          <>
            <Field label="Simulator rules matched">{list(rules)}</Field>
            <Field label="Failure modes applied">
              A: {list(run.responses.a.failureModesApplied)}; B: {list(run.responses.b.failureModesApplied)}
            </Field>
            <Field label="Fault injected">{run.faultInjected ?? "none"}</Field>
          </>
        )}
      </dl>
    </div>
  );
}

function VariantCard({ scenario, run, v }: { scenario: Scenario; run: Run; v: Variant }) {
  const input = run.inputsSent[v];
  const value = scenario.variable[v].value;
  const prefixLen = renderInputs(scenario).prefix.length;
  const response = run.responses[v];
  const spans = run.results.flatMap((r) => r.evidence.filter((e) => e.variant === v));
  const okText = run.mode === "simulated" ? "Simulated response" : "Response";
  return (
    <div className="rounded-lg border border-zinc-800 p-4">
      <h3 className="scroll-mt-24 text-base font-semibold text-zinc-100">{scenario.variable[v].label}</h3>
      <p className="mt-3 text-xs font-mono uppercase tracking-wider text-zinc-400">User input</p>
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere rounded-md bg-zinc-900 p-3 text-sm text-zinc-300">
        <HighlightedText
          text={input}
          spans={[{ start: prefixLen, end: prefixLen + value.length }]}
          markClassName="rounded-sm bg-sky-400/20 px-0.5 text-sky-200 underline decoration-sky-300 decoration-2 underline-offset-2"
        />
      </p>
      <p className="mt-3 text-xs font-mono uppercase tracking-wider text-zinc-400">{okText}</p>
      {response.status === "ok" ? (
        <p className="mt-1 whitespace-pre-wrap wrap-anywhere rounded-md bg-zinc-900 p-3 text-sm text-zinc-300">
          <HighlightedText text={response.text ?? ""} spans={spans} />
        </p>
      ) : (
        <p className="mt-1 rounded-md border border-zinc-700 p-3 text-sm text-zinc-300">
          <span aria-hidden="true">— </span>
          {RESPONSE_STATUS_TEXT[response.status]}
          {response.error ? <span className="block text-zinc-400">{response.error}</span> : null}
        </p>
      )}
      <p className="mt-2 text-sm text-zinc-400">
        Response status: {response.status === "ok" ? "OK" : RESPONSE_STATUS_TEXT[response.status]}
      </p>
    </div>
  );
}

export function RunDetails({ scenario, run }: { scenario: Scenario; run: Run }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800 p-4">
        <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Instruction used</p>
        <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-zinc-300">{run.instruction.length > 0 ? run.instruction : "(empty instruction)"}</p>
        <p className="mt-2 text-sm text-zinc-400">
          Fingerprint: <span className="font-mono text-zinc-300">{run.instructionFingerprint}</span>
        </p>
      </div>
      <p className="text-sm text-zinc-400">
        The two inputs are identical except for the highlighted {scenario.variable.name}. Both versions get the same instruction and
        config in independent calls.
      </p>
      {/* D49: side by side when the column is wide enough (the results column is narrower beside the editor). */}
      <div className="@container">
        <div className="grid gap-4 @2xl:grid-cols-2">
          <VariantCard scenario={scenario} run={run} v="a" />
          <VariantCard scenario={scenario} run={run} v="b" />
        </div>
      </div>
      {scenario.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
          {scenario.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <RunMeta run={run} title="Run metadata" />
    </div>
  );
}
