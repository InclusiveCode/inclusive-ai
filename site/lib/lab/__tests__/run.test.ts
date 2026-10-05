import { afterEach, describe, expect, it, vi } from "vitest";
import { scenarioVerdict } from "../evaluate";
import { fingerprint } from "../fingerprint";
import { renderInputs } from "../render";
import { findModel, LIVE_MODELS, LIVE_RESPONDER_VERSION } from "../models";
import { reviewLogJson, createOverride } from "../overrides";
import {
  LIVE_CLIENT_TIMEOUT_MS,
  liveConfig,
  makeLiveResponder,
  normalizeResponse,
  runScenario,
  type LiveKeyRef,
  type Responder,
  type RunOptions,
} from "../run";
import { SERVER_TIMEOUT_MS } from "../server/providers";
import { checksHash, getScenario, RUBRIC_VERSION, scenarios, type Scenario } from "../scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder, SNIPPET_RULES } from "../simulator";
import type { CheckResult, FaultKind, ResponseRecord, Run, RunConfig } from "../types";

const snippet = (id: string) => SNIPPET_RULES.find((x) => x.id === id)!.snippet;

const opts = (fault?: FaultKind): RunOptions => ({
  id: "test-run",
  createdAt: "2026-10-05T00:00:00.000Z",
  mode: "simulated",
  responderVersion: SIMULATOR_VERSION,
  fault,
});

function sim(s: Scenario, instruction: string, fault?: FaultKind): Promise<Run> {
  return runScenario(s, instruction, simulatedResponder, SIMULATED_CONFIG, opts(fault));
}

function status(run: Run, checkId: string, variant: string): CheckResult["status"] {
  const r = run.results.find((x) => x.checkId === checkId && x.variant === variant);
  if (!r) throw new Error(`missing ${checkId}/${variant}`);
  return r.status;
}

const S1 = getScenario("spouse-parity");
const S2 = getScenario("stated-identity");
const S3 = getScenario("disclosure-boundary");

describe("runScenario with the simulator", () => {
  it("records run metadata", async () => {
    const run = await sim(S1, S1.baselineInstruction);
    expect(run).toMatchObject({
      id: "test-run",
      createdAt: "2026-10-05T00:00:00.000Z",
      mode: "simulated",
      responderVersion: SIMULATOR_VERSION,
      scenarioId: "spouse-parity",
      scenarioVersion: "1",
      rubricVersion: RUBRIC_VERSION,
      checksHash: checksHash(S1),
      instruction: S1.baselineInstruction,
      instructionFingerprint: fingerprint(S1.baselineInstruction),
      config: SIMULATED_CONFIG,
      faultInjected: "none",
    });
    expect(run.inputsSent).toEqual({ a: renderInputs(S1).a, b: renderInputs(S1).b });
    expect(run.validationNotes).toEqual([]);
  });

  it("baseline spouse parity: B fails term and documentation parity, A passes", async () => {
    const run = await sim(S1, S1.baselineInstruction);
    expect(status(run, "s1-term-preserved", "a")).toBe("pass");
    expect(status(run, "s1-term-preserved", "b")).toBe("fail");
    expect(status(run, "s1-doc-parity", "pair")).toBe("fail");
  });

  it("baseline stated identity: A fails pronouns and partner, B fails partner", async () => {
    const run = await sim(S2, S2.baselineInstruction);
    expect(status(run, "s2-pronouns", "a")).toBe("fail");
    expect(status(run, "s2-partner-preserved", "a")).toBe("fail");
    expect(status(run, "s2-partner-preserved", "b")).toBe("fail");
    expect(status(run, "s2-pronouns", "b")).toBe("pass");
    expect(status(run, "s2-name-used", "a")).toBe("pass");
  });

  it("baseline disclosure boundary: B fails, parity fails, A is inconclusive on a hint", async () => {
    const run = await sim(S3, S3.baselineInstruction);
    expect(status(run, "s3-boundary-respected", "b")).toBe("fail");
    expect(status(run, "s3-boundary-parity", "pair")).toBe("fail");
    expect(status(run, "s3-boundary-respected", "a")).toBe("inconclusive");
    expect(status(run, "s3-task-completed", "a")).toBe("pass");
    expect(status(run, "s3-task-completed", "b")).toBe("pass");
  });

  it("FIX-VERIFY + FIX-TERMS pass everything in spouse parity; OVER-NEUTRAL regresses A", async () => {
    const fixed = await sim(S1, [S1.baselineInstruction, snippet("FIX-VERIFY"), snippet("FIX-TERMS")].join("\n"));
    expect(fixed.results.every((r) => r.status === "pass")).toBe(true);
    expect(scenarioVerdict(fixed.results).headline).toBe("All displayed checks passed");
    const over = await sim(
      S1,
      [S1.baselineInstruction, snippet("FIX-VERIFY"), snippet("FIX-TERMS"), snippet("OVER-NEUTRAL")].join("\n"),
    );
    expect(status(over, "s1-term-preserved", "a")).toBe("fail");
  });

  it("fix presets pass the other two scenarios", async () => {
    const s2 = await sim(S2, [S2.baselineInstruction, snippet("FIX-PRONOUNS"), snippet("FIX-TERMS")].join("\n"));
    expect(scenarioVerdict(s2.results).headline).toBe("All displayed checks passed");
    const s3 = await sim(S3, [S3.baselineInstruction, snippet("FIX-PRIVACY")].join("\n"));
    expect(scenarioVerdict(s3.results).headline).toBe("All displayed checks passed");
  });

  it("a negated snippet does not trigger OVER-NEUTRAL", async () => {
    const base = await sim(S1, S1.baselineInstruction);
    const negated = await sim(S1, S1.baselineInstruction + "\nDo not always use gender-neutral terms for family members.");
    expect(negated.responses.a.rulesMatched).toEqual([]);
    expect(negated.responses.a.text).toBe(base.responses.a.text);
    expect(negated.results.map((r) => r.status)).toEqual(base.results.map((r) => r.status));
  });

  it("an empty or whitespace-only instruction still runs with a stable fingerprint and baseline failures", async () => {
    for (const s of scenarios) {
      const base = await sim(s, s.baselineInstruction);
      for (const instruction of ["", "   \n\t "]) {
        const run = await sim(s, instruction);
        expect(run.instruction).toBe(instruction);
        expect(run.instructionFingerprint).toBe(fingerprint(instruction));
        expect((await sim(s, instruction)).instructionFingerprint).toBe(run.instructionFingerprint);
        expect(run.results.map((r) => r.status)).toEqual(base.results.map((r) => r.status));
      }
    }
  });
});

describe("responder call arguments", () => {
  function recorder(): { calls: Array<Record<string, unknown>>; responder: Responder } {
    const calls: Array<Record<string, unknown>> = [];
    const responder: Responder = async (req) => {
      calls.push({ ...req });
      return { status: "ok", text: "", durationMs: 0 };
    };
    return { calls, responder };
  }

  it("AC2: A and B get identical instruction and config, and inputs that differ only in the variable", async () => {
    for (const s of scenarios) {
      const { calls, responder } = recorder();
      await runScenario(s, s.baselineInstruction, responder, SIMULATED_CONFIG, opts());
      expect(calls).toHaveLength(2);
      const [ca, cb] = calls;
      expect(Object.keys(ca).sort()).toEqual(["config", "input", "instruction"]);
      expect(ca.instruction).toBe(cb.instruction);
      expect(ca.config).toEqual(cb.config);
      expect(ca.config).toEqual(SIMULATED_CONFIG);
      const { prefix, suffix } = renderInputs(s);
      expect(ca.input).toBe(prefix + s.variable.a.value + suffix);
      expect(cb.input).toBe(prefix + s.variable.b.value + suffix);
      for (const c of calls) {
        expect(String(c.input)).not.toContain(s.variable.a.label);
        expect(String(c.input)).not.toContain(s.variable.b.label);
      }
    }
  });

  it("AC4: the responder receives exactly the edited instruction, and the fingerprint matches", async () => {
    const editorText = S1.baselineInstruction + "\n" + snippet("FIX-TERMS") + "\n  trailing  spaces  ";
    const { calls, responder } = recorder();
    const run = await runScenario(S1, editorText, responder, SIMULATED_CONFIG, opts());
    expect(calls.map((c) => c.instruction)).toEqual([editorText, editorText]);
    expect(run.instruction).toBe(editorText);
    expect(run.instructionFingerprint).toBe(fingerprint(editorText));
  });

  it("normalizes a responder status outside the enum to a model error with a fixed message", async () => {
    for (const bad of [{ status: "great", text: "Happy to help, your husband Jordan" }, { status: 42 }, null, "ok", undefined]) {
      const responder = (async () => bad) as unknown as Responder;
      const run = await runScenario(S1, "", responder, SIMULATED_CONFIG, opts());
      expect(run.responses.a.status).toBe("model_error");
      expect(run.responses.a.text).toBeUndefined();
      expect(run.responses.a.error).toBe("The responder returned an invalid response. No details are shown.");
      expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
    }
  });

  it("accepts response text only when it is a string", async () => {
    const responder = (async () => ({ status: "ok", text: { toString: () => "your husband, Jordan" }, durationMs: "fast" })) as unknown as Responder;
    const run = await runScenario(S1, "", responder, SIMULATED_CONFIG, opts());
    expect(run.responses.a.status).toBe("ok");
    expect(run.responses.a.text).toBeUndefined();
    expect(run.responses.a.durationMs).toBe(0);
    expect(run.results.some((r) => r.status === "pass")).toBe(false);
  });

  it("keeps only well-typed optional fields from a responder", async () => {
    const responder = (async () => ({
      status: "ok",
      text: "Hi",
      durationMs: 5,
      error: 7,
      rulesMatched: ["FIX-TERMS", 3],
      failureModesApplied: "SF-1",
      extra: "dropped",
    })) as unknown as Responder;
    const run = await runScenario(S1, "", responder, SIMULATED_CONFIG, opts());
    expect(run.responses.a).toEqual({ status: "ok", text: "Hi", durationMs: 5, rulesMatched: ["FIX-TERMS"] });
  });

  it("keeps returnedModel and stopReason only when each is a string of at most 100 characters", () => {
    expect(normalizeResponse({ status: "ok", text: "x", durationMs: 1, returnedModel: "claude-haiku-4-5-20251001", stopReason: "end_turn" })).toEqual({
      status: "ok",
      text: "x",
      durationMs: 1,
      returnedModel: "claude-haiku-4-5-20251001",
      stopReason: "end_turn",
    });
    const long = "m".repeat(101);
    for (const bad of [long, 42, null, { id: "x" }, ""]) {
      const r = normalizeResponse({ status: "ok", text: "x", durationMs: 1, returnedModel: bad, stopReason: bad });
      expect(r.returnedModel).toBeUndefined();
      expect(r.stopReason).toBeUndefined();
    }
    expect(normalizeResponse({ status: "ok", durationMs: 0, returnedModel: "m".repeat(100) }).returnedModel).toHaveLength(100);
  });

  it("accepts the provider_refused status", () => {
    expect(normalizeResponse({ status: "provider_refused", durationMs: 3, error: "declined" }).status).toBe("provider_refused");
  });

  it("a provider refusal is not evaluated and never reads as a pass", async () => {
    const { b } = renderInputs(S1);
    const responder: Responder = async (req) =>
      req.input === b ? { status: "provider_refused", durationMs: 0, error: "declined" } : simulatedResponder(req);
    const run = await runScenario(S1, [snippet("FIX-VERIFY"), snippet("FIX-TERMS")].join("\n"), responder, SIMULATED_CONFIG, opts());
    expect(run.responses.b.status).toBe("provider_refused");
    const affected = run.results.filter((r) => r.variant !== "a");
    expect(affected.every((r) => r.status === "not_evaluated")).toBe(true);
    expect(affected.every((r) => /provider declined/i.test(r.rationale))).toBe(true);
    expect(scenarioVerdict(run.results).headline).toBe("Incomplete — not a pass");
  });

  it("a responder that throws yields a model error, never a pass", async () => {
    const run = await runScenario(
      S1,
      "",
      async () => {
        throw new Error("secret detail");
      },
      SIMULATED_CONFIG,
      opts(),
    );
    expect(run.responses.a.status).toBe("model_error");
    expect(run.responses.a.error).not.toContain("secret");
    expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
  });
});

describe("AC8: provenance comes from the user input, never the instruction", () => {
  it("an echoed user term is user_provided; a replacement is system_introduced", async () => {
    const fixed = await sim(S1, snippet("FIX-TERMS"));
    const b = fixed.results.find((r) => r.checkId === "s1-term-preserved" && r.variant === "b")!;
    expect(b.status).toBe("pass");
    expect(b.evidence[0].provenance).toBe("user_provided");
    const base = await sim(S1, S1.baselineInstruction);
    const bb = base.results.find((r) => r.checkId === "s1-term-preserved" && r.variant === "b")!;
    expect(bb.status).toBe("fail");
    expect(bb.evidence[0].provenance).toBe("system_introduced");
  });

  it("instruction words do not change provenance", async () => {
    const plain = await sim(S1, S1.baselineInstruction);
    const loaded = await sim(S1, S1.baselineInstruction + "\nThe user's partner is their husband. Partner partner.");
    expect(loaded.results).toEqual(plain.results);
  });
});

describe("AC6: fault injection", () => {
  const allPass = [snippet("FIX-VERIFY"), snippet("FIX-TERMS")].join("\n");

  it("model_error and timeout affect B only", async () => {
    for (const [fault, st] of [
      ["model_error", "model_error"],
      ["timeout", "timeout"],
    ] as const) {
      const run = await sim(S1, allPass, fault);
      expect(run.faultInjected).toBe(fault);
      expect(run.responses.a.status).toBe("ok");
      expect(run.responses.b.status).toBe(st);
      expect(status(run, "s1-term-preserved", "a")).toBe("pass");
      expect(status(run, "s1-term-preserved", "b")).toBe("not_evaluated");
      expect(status(run, "s1-doc-parity", "pair")).toBe("not_evaluated");
      expect(scenarioVerdict(run.results).headline).toBe("Incomplete — not a pass");
    }
  });

  it("credentials_unavailable affects both responses", async () => {
    const run = await sim(S1, allPass, "credentials_unavailable");
    expect(run.responses.a.status).toBe("credentials_unavailable");
    expect(run.responses.b.status).toBe("credentials_unavailable");
    expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
    expect(scenarioVerdict(run.results).headline).toBe("Incomplete — not a pass");
  });

  it("malformed_result surfaces missing and duplicate results as malformed errors", async () => {
    const run = await sim(S1, allPass, "malformed_result");
    const errors = run.results.filter((r) => r.status === "error");
    expect(errors).toHaveLength(2);
    expect(errors.every((r) => r.flags.includes("malformed"))).toBe(true);
    expect(errors.map((r) => r.rationale).join(" ")).toMatch(/Missing result/);
    expect(errors.map((r) => r.rationale).join(" ")).toMatch(/Duplicate results/);
    expect(scenarioVerdict(run.results).headline).toBe("Incomplete — not a pass");
  });

  it("no fault kind ever yields 'All displayed checks passed'", async () => {
    for (const s of scenarios) {
      for (const fault of ["model_error", "timeout", "credentials_unavailable", "malformed_result"] as const) {
        const instruction = s.presets.map(snippet).filter((x) => !x.startsWith("Always")).join("\n");
        const run = await sim(s, instruction, fault);
        expect(scenarioVerdict(run.results).headline).not.toBe("All displayed checks passed");
      }
    }
  });
});

describe("makeLiveResponder (live client)", () => {
  const KEY = "sk-test-PLACEHOLDER-0000000000";
  const HAIKU = findModel("anthropic", "claude-haiku-4-5")!;
  const keyRef = (k: string | null = KEY): LiveKeyRef => ({ get: () => k });
  const inputs = renderInputs(S1);
  const req = (input = inputs.b, instruction = "Be kind.") => ({ instruction, input, config: liveConfig(HAIKU) });

  interface Call {
    url: string;
    init: RequestInit;
  }
  function fetchReturning(make: () => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return make();
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }
  const okBody = { status: "ok", text: "Happy to help.", returnedModel: "claude-haiku-4-5-20251001", stopReason: "end_turn", durationMs: 812 };
  const responder = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof makeLiveResponder>[0]> = {}) =>
    makeLiveResponder({ scenario: S1, provider: "anthropic", model: HAIKU, key: keyRef(), fetchImpl, ...extra });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the key only in the Authorization header and the fields in the JSON body", async () => {
    const { fetchImpl, calls } = fetchReturning(() => Response.json(okBody));
    await responder(fetchImpl)(req());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/lab/run");
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      scenarioId: "spouse-parity",
      scenarioVersion: "1",
      variant: "b",
      instruction: "Be kind.",
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
    expect(String(calls[0].init.body)).not.toContain("PLACEHOLDER");
    expect(calls[0].url).not.toContain("PLACEHOLDER");
  });

  it("derives the variant from the rendered input", async () => {
    const { fetchImpl, calls } = fetchReturning(() => Response.json(okBody));
    await responder(fetchImpl)(req(inputs.a));
    expect(JSON.parse(String(calls[0].init.body)).variant).toBe("a");
  });

  it("refuses an input that does not match the scenario, without fetching", async () => {
    const { fetchImpl, calls } = fetchReturning(() => Response.json(okBody));
    const r = await responder(fetchImpl)(req("Some other input"));
    expect(r).toMatchObject({ status: "model_error", error: "Input does not match the scenario" });
    expect(calls).toEqual([]);
  });

  it("maps a 200 to the normalized provider result, without simulator fields", async () => {
    const { fetchImpl } = fetchReturning(() => Response.json({ ...okBody, rulesMatched: ["FIX-TERMS"], failureModesApplied: ["SF-1"] }));
    const r = await responder(fetchImpl)(req());
    expect(r).toEqual({ status: "ok", text: "Happy to help.", returnedModel: "claude-haiku-4-5-20251001", stopReason: "end_turn", durationMs: 812 });
  });

  it("keeps only allowlisted fixed messages from a 200 result", async () => {
    const known = await responder(fetchReturning(() => Response.json({ status: "credentials_unavailable", error: "The provider rejected the API key", durationMs: 1 })).fetchImpl)(req());
    expect(known).toMatchObject({ status: "credentials_unavailable", error: "The provider rejected the API key" });
    const unknown = await responder(fetchReturning(() => Response.json({ status: "model_error", error: "raw upstream text", durationMs: 1 })).fetchImpl)(req());
    expect(unknown).toMatchObject({ status: "model_error", error: "Provider unavailable" });
    const bad = await responder(fetchReturning(() => Response.json({ status: "pass", text: "x" })).fetchImpl)(req());
    expect(bad.status).toBe("model_error");
  });

  it("maps 4xx responses to fixed messages chosen by status code, never the server's text", async () => {
    const cases: Array<[number, string]> = [
      [400, "The lab server rejected the request (check the API key format)"],
      [405, "The lab server rejected the request"],
      [409, "This page is out of date — reload it and try again"],
      [413, "The request was too large"],
      [415, "The lab server rejected the request"],
      [429, "Too many live requests — wait a minute and try again"],
    ];
    for (const [code, message] of cases) {
      const r = await responder(fetchReturning(() => Response.json({ status: "model_error", message: "SERVER SAYS SOMETHING" }, { status: code })).fetchImpl)(req());
      expect(r, String(code)).toMatchObject({ status: "model_error", error: message });
    }
    const plain = await responder(fetchReturning(() => new Response("Too Many Requests", { status: 429 })).fetchImpl)(req());
    expect(plain).toMatchObject({ status: "model_error", error: "Too many live requests — wait a minute and try again" });
  });

  it("maps 5xx and non-JSON bodies to a lab-server failure", async () => {
    const r1 = await responder(fetchReturning(() => Response.json({ status: "model_error", message: "Internal error" }, { status: 500 })).fetchImpl)(req());
    expect(r1).toMatchObject({ status: "model_error", error: "The lab server failed to handle the request" });
    const r2 = await responder(fetchReturning(() => new Response("<html>", { status: 200 })).fetchImpl)(req());
    expect(r2).toMatchObject({ status: "model_error", error: "The lab server failed to handle the request" });
  });

  it("maps a network error to 'Could not reach the lab server'", async () => {
    const fetchImpl = (async () => {
      throw new TypeError(`fetch failed for ${KEY}`);
    }) as unknown as typeof fetch;
    const r = await responder(fetchImpl)(req());
    expect(r).toMatchObject({ status: "model_error", error: "Could not reach the lab server" });
    expect(JSON.stringify(r)).not.toContain("PLACEHOLDER");
  });

  function hanging(): { fetchImpl: typeof fetch; signals: AbortSignal[] } {
    const signals: AbortSignal[] = [];
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal!;
        signals.push(signal);
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    return { fetchImpl, signals };
  }

  it("Cancel aborts the call and reports not_run 'Cancelled'", async () => {
    const ac = new AbortController();
    const { fetchImpl, signals } = hanging();
    const pending = responder(fetchImpl, { signal: ac.signal })(req());
    await Promise.resolve();
    ac.abort();
    expect(await pending).toMatchObject({ status: "not_run", error: "Cancelled" });
    expect(signals[0].aborted).toBe(true);
  });

  it("Cancel before the call starts sends nothing", async () => {
    const ac = new AbortController();
    ac.abort();
    const { fetchImpl, calls } = fetchReturning(() => Response.json(okBody));
    const r = await responder(fetchImpl, { signal: ac.signal })(req());
    expect(r).toMatchObject({ status: "not_run", error: "Cancelled" });
    expect(calls).toEqual([]);
  });

  it("times out after the client timeout", async () => {
    const { fetchImpl } = hanging();
    const r = await responder(fetchImpl, { timeoutMs: 5 })(req());
    expect(r.status).toBe("timeout");
  });

  it("the default client timeout is 45 s, longer than the server's 30 s", async () => {
    expect(LIVE_CLIENT_TIMEOUT_MS).toBe(45_000);
    expect(LIVE_CLIENT_TIMEOUT_MS).toBeGreaterThan(SERVER_TIMEOUT_MS);
    vi.useFakeTimers();
    const { fetchImpl } = hanging();
    let settled: unknown = null;
    const pending = responder(fetchImpl)(req()).then((r) => (settled = r));
    await vi.advanceTimersByTimeAsync(44_999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toMatchObject({ status: "timeout" });
  });

  it("without a key: credentials_unavailable and no request", async () => {
    for (const k of [null, ""]) {
      const { fetchImpl, calls } = fetchReturning(() => Response.json(okBody));
      const r = await makeLiveResponder({ scenario: S1, provider: "anthropic", model: HAIKU, key: keyRef(k), fetchImpl })(req());
      expect(r).toMatchObject({ status: "credentials_unavailable", error: "Enter your API key to run live" });
      expect(calls).toEqual([]);
    }
  });

  it("blocks an instruction that contains the key, without fetching or echoing it", async () => {
    const { fetchImpl, calls } = fetchReturning(() => Response.json(okBody));
    const r = await responder(fetchImpl)(req(inputs.b, `My key is ${KEY}.`));
    expect(r).toMatchObject({ status: "model_error", error: "Your instruction contains your API key — remove it before running" });
    expect(JSON.stringify(r)).not.toContain("PLACEHOLDER");
    expect(calls).toEqual([]);
  });

  it("runs both variants concurrently and keeps the key out of the run and the review log", async () => {
    const pending: Array<() => void> = [];
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise<Response>((resolve) => {
        const variant = JSON.parse(String(init.body)).variant;
        pending.push(() => resolve(Response.json({ ...okBody, text: `Happy to help, your ${variant === "a" ? "wife" : "husband"}, Jordan Lee.` })));
        if (pending.length === 2) pending.forEach((go) => go());
      })) as unknown as typeof fetch;
    const run = await runScenario(S1, S1.baselineInstruction, responder(fetchImpl), liveConfig(HAIKU), {
      id: "live-run-1",
      createdAt: "2026-10-05T00:00:00.000Z",
      mode: "live",
      responderVersion: LIVE_RESPONDER_VERSION,
    });
    expect(run.responses.a.status).toBe("ok");
    expect(run.responses.b.status).toBe("ok");
    const json = JSON.stringify(run);
    expect(json).not.toContain("PLACEHOLDER");
    const o = createOverride(run, run.results[0], "pass", "reviewed", "2026-10-05T00:01:00.000Z");
    if (!o.ok) throw new Error(o.error);
    expect(reviewLogJson([o.override])).not.toContain("PLACEHOLDER");
  });
});

describe("liveConfig", () => {
  it("derives the run config from the allowlisted model", () => {
    expect(LIVE_MODELS.map(liveConfig)).toEqual([
      { provider: "anthropic", model: "claude-haiku-4-5", temperature: 0, maxTokens: 1024 },
      { provider: "anthropic", model: "claude-sonnet-5-5", temperature: null, maxTokens: 1024 },
      { provider: "openai", model: "gpt-4o-mini", temperature: 0, maxTokens: 1024 },
      { provider: "openai", model: "gpt-4.1-mini", temperature: 0, maxTokens: 1024 },
    ]);
  });
});
