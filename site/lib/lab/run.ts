/**
 * Run orchestration: render the paired inputs, call the responder once per
 * variant with the same instruction and config, apply any injected fault,
 * evaluate, and validate.
 */
import { evaluate, validateResults } from "./evaluate";
import { fingerprint } from "./fingerprint";
import { ALLOWED_PROVIDER_MESSAGES, CLIENT_MESSAGES, HTTP_MESSAGES, PROVIDER_MESSAGES } from "./live-messages";
import type { LiveModel, Provider } from "./models";
import { renderInputs } from "./render";
import { checksHash, RUBRIC_VERSION, type Scenario } from "./scenarios";
import type { FaultKind, ResponseRecord, ResponseStatus, Run, RunConfig, RunMode } from "./types";

export type Responder = (req: { instruction: string; input: string; config: RunConfig }) => Promise<ResponseRecord>;

export interface RunOptions {
  id: string;
  createdAt: string;
  mode: RunMode;
  responderVersion: string;
  fault?: FaultKind;
}

export { LIVE_RESPONDER_VERSION } from "./models";

const RESPONDER_FAILED = "The responder failed. No details are shown.";
const RESPONDER_INVALID = "The responder returned an invalid response. No details are shown.";

const RESPONSE_STATUSES: readonly ResponseStatus[] = ["ok", "model_error", "timeout", "credentials_unavailable", "not_run", "provider_refused"];

/** A short, non-empty string (at most 100 characters), or undefined. */
function shortString(x: unknown): string | undefined {
  return typeof x === "string" && x.length > 0 && x.length <= 100 ? x : undefined;
}

function stringList(x: unknown): string[] | undefined {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : undefined;
}

/** Rebuilds a ResponseRecord from whatever a responder returned, keeping only well-typed fields. */
export function normalizeResponse(raw: unknown): ResponseRecord {
  if (typeof raw !== "object" || raw === null) return { status: "model_error", error: RESPONDER_INVALID, durationMs: 0 };
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string" || !(RESPONSE_STATUSES as readonly string[]).includes(r.status)) {
    return { status: "model_error", error: RESPONDER_INVALID, durationMs: 0 };
  }
  const out: ResponseRecord = {
    status: r.status as ResponseStatus,
    durationMs: typeof r.durationMs === "number" && Number.isFinite(r.durationMs) && r.durationMs >= 0 ? r.durationMs : 0,
  };
  if (typeof r.text === "string") out.text = r.text;
  if (typeof r.error === "string") out.error = r.error;
  const rules = stringList(r.rulesMatched);
  if (rules) out.rulesMatched = rules;
  const modes = stringList(r.failureModesApplied);
  if (modes) out.failureModesApplied = modes;
  const returnedModel = shortString(r.returnedModel);
  if (returnedModel) out.returnedModel = returnedModel;
  const stopReason = shortString(r.stopReason);
  if (stopReason) out.stopReason = stopReason;
  return out;
}

async function callSafely(responder: Responder, instruction: string, input: string, config: RunConfig): Promise<ResponseRecord> {
  let raw: unknown;
  try {
    raw = await responder({ instruction, input, config: { ...config } });
  } catch {
    return { status: "model_error", error: RESPONDER_FAILED, durationMs: 0 };
  }
  return normalizeResponse(raw);
}

function injected(status: ResponseRecord["status"], label: string): ResponseRecord {
  return { status, error: `Injected fault (simulated): ${label}.`, durationMs: 0 };
}

export async function runScenario(
  s: Scenario,
  instruction: string,
  responder: Responder,
  config: RunConfig,
  opts: RunOptions,
): Promise<Run> {
  const inputs = renderInputs(s);
  const fault: FaultKind = opts.fault ?? "none";

  // Two independent calls with the identical instruction and config.
  let [a, b] = await Promise.all([
    callSafely(responder, instruction, inputs.a, config),
    callSafely(responder, instruction, inputs.b, config),
  ]);

  if (fault === "model_error") b = injected("model_error", "model error");
  if (fault === "timeout") b = injected("timeout", "timed out");
  if (fault === "credentials_unavailable") {
    a = injected("credentials_unavailable", "credentials unavailable");
    b = injected("credentials_unavailable", "credentials unavailable");
  }

  const responses = { a, b };
  let raw: unknown[] = evaluate(s, responses);
  if (fault === "malformed_result" && raw.length >= 2) {
    // Drop the first result and duplicate the second.
    raw = [raw[1], raw[1], ...raw.slice(2)];
  }
  const { results, notes } = validateResults(s, responses, raw);

  return {
    id: opts.id,
    createdAt: opts.createdAt,
    mode: opts.mode,
    responderVersion: opts.responderVersion,
    scenarioId: s.id,
    scenarioVersion: s.version,
    rubricVersion: RUBRIC_VERSION,
    checksHash: checksHash(s),
    instruction,
    instructionFingerprint: fingerprint(instruction),
    config: { ...config },
    inputsSent: { a: inputs.a, b: inputs.b },
    responses,
    results,
    validationNotes: notes,
    faultInjected: fault,
  };
}

/** Client-side wait per live call: longer than the server's 30 s provider timeout. */
export const LIVE_CLIENT_TIMEOUT_MS = 45_000;

/** Read-only access to the key held outside React state (an input element or a ref). */
export interface LiveKeyRef {
  get(): string | null;
}

export function liveConfig(model: LiveModel): RunConfig {
  return { provider: model.provider, model: model.id, temperature: model.sampling ? 0 : null, maxTokens: model.maxTokens };
}

const LIVE_MSG = CLIENT_MESSAGES;
const HTTP_MSG = HTTP_MESSAGES;

/** The message shown for a result whose own message is not on the allowlist. */
const STATUS_FALLBACK: Partial<Record<ResponseStatus, string>> = {
  model_error: PROVIDER_MESSAGES.unavailable,
  credentials_unavailable: PROVIDER_MESSAGES.badKey,
  provider_refused: PROVIDER_MESSAGES.refused,
};

function fromServerResult(body: unknown): ResponseRecord {
  const status = typeof body === "object" && body !== null ? (body as Record<string, unknown>).status : undefined;
  if (typeof status !== "string" || !(RESPONSE_STATUSES as readonly string[]).includes(status)) {
    return { status: "model_error", error: LIVE_MSG.serverFailed, durationMs: 0 };
  }
  const rec = normalizeResponse(body);
  delete rec.rulesMatched;
  delete rec.failureModesApplied;
  if (rec.error !== undefined && !ALLOWED_PROVIDER_MESSAGES.has(rec.error)) {
    const fallback = STATUS_FALLBACK[rec.status];
    if (fallback) rec.error = fallback;
    else delete rec.error;
  }
  return rec;
}

/**
 * Client responder for live runs. The key is read from `key` at call time and sent
 * only in the Authorization header; it is never placed in the body, the record, or a message.
 */
export function makeLiveResponder(opts: {
  scenario: Scenario;
  provider: Provider;
  model: LiveModel;
  key: LiveKeyRef;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Responder {
  const { scenario, provider, model, key, signal } = opts;
  const timeoutMs = opts.timeoutMs ?? LIVE_CLIENT_TIMEOUT_MS;
  return async ({ instruction, input }) => {
    const rendered = renderInputs(scenario);
    const variant = input === rendered.a ? "a" : input === rendered.b ? "b" : null;
    if (!variant) return { status: "model_error", error: LIVE_MSG.inputMismatch, durationMs: 0 };
    if (signal?.aborted) return { status: "not_run", error: LIVE_MSG.cancelled, durationMs: 0 };
    const apiKey = key.get();
    if (!apiKey) return { status: "credentials_unavailable", error: LIVE_MSG.noKey, durationMs: 0 };
    if (instruction.includes(apiKey)) return { status: "model_error", error: LIVE_MSG.keyInInstruction, durationMs: 0 };

    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const controller = new AbortController();
    let reason: "timeout" | "cancel" | null = null;
    const timer = setTimeout(() => {
      reason = reason ?? "timeout";
      controller.abort();
    }, timeoutMs);
    const onCancel = () => {
      reason = reason ?? "cancel";
      controller.abort();
    };
    signal?.addEventListener("abort", onCancel, { once: true });
    try {
      const res = await (opts.fetchImpl ?? fetch)("/api/lab/run", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          variant,
          instruction,
          provider,
          model: model.id,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status !== 200) {
        const error = res.status >= 400 && res.status < 500 ? (HTTP_MSG[res.status] ?? LIVE_MSG.rejected) : LIVE_MSG.serverFailed;
        return { status: "model_error", error, durationMs: elapsed() };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { status: "model_error", error: LIVE_MSG.serverFailed, durationMs: elapsed() };
      }
      return fromServerResult(body);
    } catch {
      if (reason === "cancel") return { status: "not_run", error: LIVE_MSG.cancelled, durationMs: elapsed() };
      if (reason === "timeout") return { status: "timeout", error: LIVE_MSG.timedOut, durationMs: elapsed() };
      return { status: "model_error", error: LIVE_MSG.unreachable, durationMs: elapsed() };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCancel);
    }
  };
}
