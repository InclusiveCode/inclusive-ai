/**
 * L8 (spec v0.2 §7, §3 "Client"): the client timeout (45 s) is longer than the server's provider
 * timeout (30 s), and Cancel aborts both calls. Also §3 "pass the incoming request's abort signal through".
 *
 * Timers are faked (setTimeout/clearTimeout only); the real SDK clients run against a stubbed fetch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { scenarioVerdict } from "../../lib/lab/evaluate";
import { CLIENT_MESSAGES } from "../../lib/lab/live-messages";
import { renderInputs } from "../../lib/lab/render";
import { LIVE_CLIENT_TIMEOUT_MS, LIVE_RESPONDER_VERSION, liveConfig, makeLiveResponder, runScenario } from "../../lib/lab/run";
import { getScenario } from "../../lib/lab/scenarios";
import { makeAnthropicClient, makeOpenAIClient, realClients, SERVER_TIMEOUT_MS } from "../../lib/lab/server/providers";
import { ALL_PASS_HEADLINE } from "./helpers";
import { ANTHROPIC_KEY as FAKE_KEY, callRoute, fakeClients, OPENAI_KEY, GPT4O_MINI, HAIKU, liveRun, model, routeRequest, stubProviderFetch, validBody } from "./live-helpers";

const s = getScenario("spouse-parity");
const m = model(HAIKU);
const tick = () => new Promise<void>((r) => setImmediate(r));

/** A fetch that never answers until its signal aborts; records each call's signal. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  const f = ((_u: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      const sig = init?.signal;
      if (sig) signals.push(sig);
      sig?.addEventListener("abort", () => rej(new DOMException("The operation was aborted.", "AbortError")), { once: true });
    })) as typeof fetch;
  return { f, signals };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("L8: client timeout is longer than the server timeout", () => {
  it("45 s on the client, 30 s on the server", () => {
    expect(LIVE_CLIENT_TIMEOUT_MS).toBe(45_000);
    expect(SERVER_TIMEOUT_MS).toBe(30_000);
    expect(LIVE_CLIENT_TIMEOUT_MS).toBeGreaterThan(SERVER_TIMEOUT_MS);
  });

  it("the real SDK clients are built with a 30 s timeout and no retries", () => {
    const a = makeAnthropicClient(FAKE_KEY);
    const o = makeOpenAIClient(OPENAI_KEY);
    expect(a.timeout).toBe(30_000);
    expect(o.timeout).toBe(30_000);
    expect(a.maxRetries).toBe(0);
    expect(o.maxRetries).toBe(0);
    expect(a.baseURL).toBe("https://api.anthropic.com");
    expect(o.baseURL).toBe("https://api.openai.com/v1");
  });

  it("by default the client waits 45 s, not less, before giving up", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { f, signals } = hangingFetch();
    const responder = makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => FAKE_KEY }, fetchImpl: f });
    let done: { status: string; error?: string } | null = null;
    void responder({ instruction: "x", input: renderInputs(s).a, config: liveConfig(m) }).then((r) => (done = r));
    while (signals.length === 0) await tick();
    await vi.advanceTimersByTimeAsync(44_999);
    expect(done).toBeNull();
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await tick();
    expect(signals[0].aborted).toBe(true);
    expect(done).toEqual(expect.objectContaining({ status: "timeout", error: CLIENT_MESSAGES.timedOut }));
  });

  it("a slow provider times out on the server at 30 s, so the client (still waiting) gets the server's timeout result", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const stub = stubProviderFetch(
      ({ signal }) =>
        new Promise<Response>((_res, rej) => {
          signal?.addEventListener("abort", () => rej(new DOMException("The operation was aborted.", "AbortError")), { once: true });
        }),
    );
    let route: { status: number; json: Record<string, unknown> | null } | null = null;
    void callRoute(routeRequest(validBody()), realClients).then((r) => (route = r));
    while (stub.calls.length === 0) await tick();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(route).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    for (let i = 0; i < 20 && route === null; i++) await tick();
    expect(route).not.toBeNull();
    expect(route!.status).toBe(200);
    expect(route!.json?.status).toBe("timeout");
    expect(stub.calls).toHaveLength(1); // no retry after the timeout
  });

  it("the same holds for OpenAI", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const stub = stubProviderFetch(
      ({ signal }) =>
        new Promise<Response>((_res, rej) => {
          signal?.addEventListener("abort", () => rej(new DOMException("The operation was aborted.", "AbortError")), { once: true });
        }),
    );
    let route: { json: Record<string, unknown> | null } | null = null;
    void callRoute(routeRequest(validBody({ provider: "openai", model: GPT4O_MINI })), realClients).then((r) => (route = r));
    while (stub.calls.length === 0) await tick();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(route).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    for (let i = 0; i < 20 && route === null; i++) await tick();
    expect(route!.json?.status).toBe("timeout");
    expect(stub.calls).toHaveLength(1);
  });
});

describe("L8: Cancel aborts both calls", () => {
  it("aborting the run's signal aborts both in-flight requests; both versions end 'Cancelled' and nothing passes", async () => {
    const { f, signals } = hangingFetch();
    const controller = new AbortController();
    const responder = makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => FAKE_KEY }, fetchImpl: f, signal: controller.signal });
    const pending = runScenario(s, s.baselineInstruction, responder, liveConfig(m), {
      id: "cancel-1",
      createdAt: "2026-10-05T12:00:00.000Z",
      mode: "live",
      responderVersion: LIVE_RESPONDER_VERSION,
    });
    while (signals.length < 2) await tick();
    // Both calls are in flight at the same time (A and B run concurrently).
    expect(signals.map((x) => x.aborted)).toEqual([false, false]);
    controller.abort();
    const run = await pending;
    expect(signals.map((x) => x.aborted)).toEqual([true, true]);
    for (const v of ["a", "b"] as const) {
      expect(run.responses[v].status).toBe("not_run");
      expect(run.responses[v].error).toBe(CLIENT_MESSAGES.cancelled);
    }
    expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
    expect(scenarioVerdict(run.results).headline).not.toBe(ALL_PASS_HEADLINE);
  });

  it("a run started after Cancel sends nothing", async () => {
    const fake = fakeClients();
    const controller = new AbortController();
    controller.abort();
    const { run, sent } = await liveRun(s, s.baselineInstruction, HAIKU, fake.clients, { signal: controller.signal });
    expect(sent).toEqual([]);
    expect(run.responses.a.status).toBe("not_run");
  });

  it("the route passes the browser request's abort signal to the provider call (server side of Cancel)", async () => {
    const seenSignals: AbortSignal[] = [];
    const fake = fakeClients(
      (call) =>
        new Promise((_res, rej) => {
          seenSignals.push(call.signal);
          call.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), { once: true });
        }),
    );
    const browser = new AbortController();
    const pending = callRoute(routeRequest(validBody(), { signal: browser.signal }), fake.clients);
    while (seenSignals.length === 0) await tick();
    expect(seenSignals[0].aborted).toBe(false);
    browser.abort();
    const r = await pending;
    expect(seenSignals[0].aborted).toBe(true);
    expect(r.json?.status).toBe("timeout");
  });

  it("with the real SDK, aborting the browser request aborts the outbound provider request", async () => {
    const stub = stubProviderFetch(
      ({ signal }) =>
        new Promise<Response>((_res, rej) => {
          signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), { once: true });
        }),
    );
    const browser = new AbortController();
    const pending = callRoute(routeRequest(validBody(), { signal: browser.signal }), realClients);
    while (stub.calls.length === 0) await tick();
    expect(stub.calls[0].signal?.aborted).toBe(false);
    browser.abort();
    const r = await pending;
    expect(stub.calls[0].signal?.aborted).toBe(true);
    expect(r.json?.status).toBe("timeout");
    expect(stub.calls).toHaveLength(1);
  });
});

describe("L8 / fix round: an abort while the response body is still arriving is a cancel or a timeout", () => {
  /** A 200 whose JSON body starts but never finishes until the request is aborted. */
  function slowBody() {
    const signals: AbortSignal[] = [];
    const f = ((_u: RequestInfo | URL, init?: RequestInit) => {
      const sig = init?.signal ?? undefined;
      if (sig) signals.push(sig);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"status":"ok","text":"Happy'));
          sig?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
        },
      });
      return Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "application/json" } }));
    }) as typeof fetch;
    return { f, signals };
  }

  it("Cancel during the body read → 'Cancelled', not 'Could not reach the lab server'", async () => {
    const { f, signals } = slowBody();
    const controller = new AbortController();
    const p = makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => FAKE_KEY }, fetchImpl: f, signal: controller.signal })({
      instruction: "x",
      input: renderInputs(s).a,
      config: liveConfig(m),
    });
    while (signals.length === 0) await tick();
    await tick();
    controller.abort();
    expect(await p).toMatchObject({ status: "not_run", error: CLIENT_MESSAGES.cancelled });
  });

  it("client timeout during the body read → 'timeout'", async () => {
    const { f } = slowBody();
    const rec = await makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => FAKE_KEY }, fetchImpl: f, timeoutMs: 30 })({
      instruction: "x",
      input: renderInputs(s).b,
      config: liveConfig(m),
    });
    expect(rec).toMatchObject({ status: "timeout", error: CLIENT_MESSAGES.timedOut });
  });
});

