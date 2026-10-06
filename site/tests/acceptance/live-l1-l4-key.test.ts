/**
 * L1 (spec v0.2 §7): no key → inline error, focus to the key field, no network call.
 *   The responder-level guarantee (no request without a key) is checked here; the inline error and the
 *   focus move are checked in the browser by tests/e2e/lab-live-smoke.mjs.
 * L4: the key never appears in the DOM after submission, storage or cookies, exports, the console,
 *   server output, or responses; it is cleared on pagehide.
 *   Here: run objects, the review-log export, request bodies and URLs, every route response,
 *   console/stdout/stderr during route handling (including the real SDK clients), and the key-field
 *   markup and clearing hooks. Browser storage, cookies, live DOM, and `next start` output are in the e2e.
 */
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { installKeyClearing, LivePanel } from "../../app/lab/components/live-panel";
import { KEY_PROBLEM_MESSAGE } from "../../lib/lab/live-key";
import { CLIENT_MESSAGES } from "../../lib/lab/live-messages";
import { createOverride, reviewLogJson } from "../../lib/lab/overrides";
import { renderInputs } from "../../lib/lab/render";
import { liveConfig, makeLiveResponder } from "../../lib/lab/run";
import { getScenario, scenarios } from "../../lib/lab/scenarios";
import { createHandler } from "../../lib/lab/server/handler";
import { realClients } from "../../lib/lab/server/providers";
import {
  anthropicReply,
  callRoute,
  captureOutput,
  ANTHROPIC_KEY,
  FAKE_KEY,
  keyFor,
  OPENAI_KEY,
  fakeClients,
  GPT4O_MINI,
  HAIKU,
  leaksKey,
  liveRun,
  model,
  openaiReply,
  routeRequest,
  stubProviderFetch,
  validBody,
} from "./live-helpers";

const s = getScenario("spouse-parity");
const KEYED = `upstream echoed ${ANTHROPIC_KEY} ${OPENAI_KEY}`;

describe("L1: without a key the client sends nothing", () => {
  for (const key of [null, ""]) {
    it(`key ${JSON.stringify(key)}: both versions are 'credentials unavailable', no request, nothing evaluated`, async () => {
      const fake = fakeClients();
      const { run, sent } = await liveRun(s, s.baselineInstruction, HAIKU, fake.clients, { key });
      expect(sent).toEqual([]);
      expect(fake.seen).toEqual([]);
      for (const v of ["a", "b"] as const) {
        expect(run.responses[v].status).toBe("credentials_unavailable");
        expect(run.responses[v].error).toBe(CLIENT_MESSAGES.noKey);
      }
      expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
    });
  }

  // Fix round (D35 and the client-side format check): a malformed key, or one that does not match the
  // selected provider, takes the same path as a missing key: a fixed message and no request.
  const BAD_KEYS: Array<[string, string, "format" | "provider"]> = [
    ["internal space", "sk-ant-test-Verifier FakeKeyNotRealAbcdefghij", "format"],
    ["zero-width space (U+200B)", "sk-ant-test-Verifier\u200bFakeKeyNotRealAbcdefghij", "format"],
    ["non-Latin letter", "sk-ant-test-VerifierFakeKeyNotRealAbcdefghi\u0436", "format"],
    ["19 characters", "sk-ant-" + "a".repeat(12), "format"],
    ["257 characters", "sk-ant-" + "a".repeat(250), "format"],
    ["base64 punctuation", "sk-ant-test-VerifierFakeKey+NotReal/Abcdefgh=", "format"],
    ["OpenAI-shaped key for Anthropic", OPENAI_KEY, "provider"],
  ];
  for (const [name, key, problem] of BAD_KEYS) {
    it(`a malformed or mismatched key (${name}) is refused before any request`, async () => {
      const fake = fakeClients();
      const { run, sent } = await liveRun(s, s.baselineInstruction, HAIKU, fake.clients, { key });
      expect(sent).toEqual([]);
      expect(fake.seen).toEqual([]);
      expect(run.responses.a.status).toBe("credentials_unavailable");
      expect(run.responses.a.error).toBe(KEY_PROBLEM_MESSAGE[problem]);
      expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
      expect(JSON.stringify(run)).not.toContain(key);
    });
  }

  it("an Anthropic-shaped key is refused for OpenAI before any request", async () => {
    const fake = fakeClients();
    const { run, sent } = await liveRun(s, s.baselineInstruction, GPT4O_MINI, fake.clients, { key: ANTHROPIC_KEY });
    expect(sent).toEqual([]);
    expect(run.responses.b).toMatchObject({ status: "credentials_unavailable", error: KEY_PROBLEM_MESSAGE.provider });
  });

  it("surrounding whitespace is trimmed; the trimmed key is what is sent", async () => {
    const fake = fakeClients();
    const { sent } = await liveRun(s, s.baselineInstruction, HAIKU, fake.clients, { key: `  ${ANTHROPIC_KEY}\n` });
    expect(sent.map((r) => r.headers.authorization)).toEqual([`Bearer ${ANTHROPIC_KEY}`, `Bearer ${ANTHROPIC_KEY}`]);
    expect(fake.constructedWith).toEqual([ANTHROPIC_KEY, ANTHROPIC_KEY]);
  });

  it("the key is read when the call starts, so a key entered after the responder was created is used", async () => {
    let current: string | null = null;
    const m = model(HAIKU);
    let calls = 0;
    const f = (async () => {
      calls += 1;
      return Response.json({ status: "ok", text: "hi", durationMs: 1 });
    }) as typeof fetch;
    const responder = makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => current }, fetchImpl: f });
    const req = { instruction: "x", input: renderInputs(s).a, config: liveConfig(m) };
    expect((await responder(req)).status).toBe("credentials_unavailable");
    expect(calls).toBe(0);
    current = FAKE_KEY;
    expect((await responder(req)).status).toBe("ok");
    expect(calls).toBe(1);
  });
});

describe("L4: the key travels only in the Authorization header", () => {
  it("every request carries it in the header only: never in the body or URL", async () => {
    const fake = fakeClients();
    const { sent } = await liveRun(s, s.baselineInstruction, HAIKU, fake.clients);
    expect(sent).toHaveLength(2);
    for (const r of sent) {
      expect(r.headers.authorization).toBe(`Bearer ${keyFor("anthropic")}`);
      expect(leaksKey(r.body)).toBe(false);
      expect(leaksKey(r.url)).toBe(false);
      const others = Object.entries(r.headers).filter(([k]) => k !== "authorization");
      expect(leaksKey(JSON.stringify(others))).toBe(false);
    }
  });

  it("a run is blocked, without any request, when the instruction contains the key", async () => {
    const fake = fakeClients();
    const { run, sent } = await liveRun(s, `Please use ${FAKE_KEY} for auth`, HAIKU, fake.clients);
    expect(sent).toEqual([]);
    expect(run.responses.a.status).toBe("model_error");
    expect(run.responses.a.error).toBe(CLIENT_MESSAGES.keyInInstruction);
    // The run object still records the instruction the user typed (it is the user's text), so the UI blocks
    // this case before a run is created; the responder-level block is the second line of defense.
    expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
  });
});

describe("L4: the key is absent from run objects and the review-log export", () => {
  const rows: Array<[string, Parameters<typeof fakeClients>[0]]> = [
    ["ok", undefined],
    ["provider error quoting the key", () => {
      throw new Error(KEYED);
    }],
    ["refusal", () => anthropicReply("", { stop_reason: "refusal" })],
    ["token limit", () => anthropicReply("x", { stop_reason: "max_tokens" })],
  ];
  for (const [name, script] of rows) {
    it(`${name}: run JSON and an exported review log contain no part of the key`, async () => {
      const fake = fakeClients(script);
      const { run, responses } = await liveRun(s, s.baselineInstruction, HAIKU, fake.clients);
      expect(leaksKey(JSON.stringify(run))).toBe(false);
      for (const r of responses) {
        expect(leaksKey(r.text)).toBe(false);
        const hs: string[] = [];
        r.headers.forEach((v, k) => hs.push(`${k}: ${v}`));
        expect(leaksKey(hs.join("\n"))).toBe(false);
      }
      const target = run.results.find((r) => r.status === "pass" || r.status === "fail");
      if (target) {
        const o = createOverride(run, target, "inconclusive", "Reviewed by a person.", "2026-10-05T12:00:00.000Z");
        if (!o.ok) throw new Error(o.error);
        const log = reviewLogJson([o.override]);
        expect(log).toContain(run.id);
        expect(leaksKey(log)).toBe(false);
      }
    });
  }

  it("a network error whose message quotes the key is recorded with a fixed message only", async () => {
    const m = model(HAIKU);
    const f = (async () => {
      throw new TypeError(KEYED);
    }) as typeof fetch;
    const rec = await makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => FAKE_KEY }, fetchImpl: f })({
      instruction: "x",
      input: renderInputs(s).b,
      config: liveConfig(m),
    });
    expect(rec).toMatchObject({ status: "model_error", error: CLIENT_MESSAGES.unreachable });
    expect(leaksKey(JSON.stringify(rec))).toBe(false);
  });
});

describe("L4: route responses and server output never contain the key", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("the handler writes nothing at all to the console, stdout, or stderr — on rejections, provider errors, and success", async () => {
    const scripts: Array<Parameters<typeof fakeClients>[0]> = [
      undefined,
      () => {
        throw new Error(KEYED);
      },
      () => {
        throw KEYED;
      },
      () => openaiReply(null, { refusal: KEYED }),
    ];
    const { output } = await captureOutput(async () => {
      for (const script of scripts) {
        for (const body of [validBody(), validBody({ provider: "openai", model: GPT4O_MINI })]) {
          const r = await callRoute(routeRequest(body), fakeClients(script).clients);
          expect(leaksKey(r.text)).toBe(false);
        }
      }
      // A spread of request-check failures, each carrying the key in the header.
      for (const req of [
        routeRequest(validBody(), { method: "GET" }),
        routeRequest(validBody(), { headers: { "content-type": "text/plain" } }),
        routeRequest(null, { raw: "{" }),
        routeRequest(validBody({ scenarioVersion: "0" })),
        routeRequest(validBody({ model: "nope" })),
        routeRequest(validBody({ instruction: FAKE_KEY })),
        routeRequest(validBody(), { headers: { authorization: `Bearer ${FAKE_KEY} trailing` } }),
      ]) {
        const r = await callRoute(req, fakeClients().clients);
        expect(leaksKey(r.text)).toBe(false);
      }
    });
    expect(output).toBe("");
  });

  it("an unexpected failure inside the handler returns only the fixed 500 body", async () => {
    // A request object whose header read throws with the key in the message.
    const hostile = {
      method: "POST",
      signal: new AbortController().signal,
      body: null,
      headers: {
        get(name: string) {
          if (name === "content-type") return "application/json";
          throw new Error(KEYED);
        },
      },
    } as unknown as Request;
    const { value: res, output } = await captureOutput(() => createHandler({ clients: fakeClients().clients })(hostile));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ status: "model_error", message: "Internal error" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(leaksKey(text)).toBe(false);
    expect(output).toBe("");
  });

  it("the real SDK clients log nothing and leak nothing on auth errors, server errors, and network errors", async () => {
    const replies = [
      () => Response.json({ type: "error", error: { type: "authentication_error", message: `invalid x-api-key: ${FAKE_KEY}` } }, { status: 401 }),
      () => Response.json({ error: { message: `Incorrect API key provided: ${OPENAI_KEY}`, code: "invalid_api_key" } }, { status: 401 }),
      () => Response.json({ type: "error", error: { type: "api_error", message: KEYED } }, { status: 500 }),
      () => {
        throw new TypeError(KEYED);
      },
    ];
    for (const reply of replies) {
      const stub = stubProviderFetch(reply);
      restore = stub.restore;
      const { value, output } = await captureOutput(async () => [
        await callRoute(routeRequest(validBody()), realClients),
        await callRoute(routeRequest(validBody({ provider: "openai", model: GPT4O_MINI })), realClients),
      ]);
      for (const r of value) {
        expect(r.status).toBe(200);
        expect(r.json?.status).not.toBe("ok");
        expect(leaksKey(r.text)).toBe(false);
      }
      expect(output).toBe("");
      stub.restore();
      restore = null;
    }
  });
});

describe("L4 / fix round: the server fails closed when provider custom-header env vars are set", () => {
  let restore: (() => void) | null = null;
  const saved = { ...process.env };
  afterEach(() => {
    restore?.();
    restore = null;
    process.env = { ...saved };
  });

  for (const name of ["ANTHROPIC_CUSTOM_HEADERS", "OPENAI_CUSTOM_HEADERS"]) {
    it(`${name} set → no provider request for either provider, fixed 'Provider unavailable'`, async () => {
      process.env[name] = "X-Forwarded-Key: captured";
      const stub = stubProviderFetch(() => Response.json(anthropicReply("should never be read")));
      restore = stub.restore;
      const { value, output } = await captureOutput(async () => [
        await callRoute(routeRequest(validBody()), realClients),
        await callRoute(routeRequest(validBody({ provider: "openai", model: GPT4O_MINI })), realClients),
      ]);
      for (const r of value) {
        expect(r.status).toBe(200);
        expect(r.json).toMatchObject({ status: "model_error", error: "Provider unavailable" });
        expect(leaksKey(r.text)).toBe(false);
        expect(r.text).not.toContain("captured");
      }
      expect(stub.calls).toEqual([]);
      expect(output).toBe("");
    });
  }

  it("control: an empty or whitespace-only value does not block, and the request goes out once", async () => {
    process.env.ANTHROPIC_CUSTOM_HEADERS = "   ";
    const stub = stubProviderFetch(() => Response.json(anthropicReply("ok")));
    restore = stub.restore;
    const r = await callRoute(routeRequest(validBody()), realClients);
    expect(r.json?.status).toBe("ok");
    expect(stub.calls).toHaveLength(1);
  });
});

describe("L4: the key field and its clearing hooks", () => {
  function panel(keyError: string | null = null) {
    return renderToStaticMarkup(
      createElement(LivePanel, {
        provider: "anthropic",
        modelId: HAIKU,
        onProviderChange: () => {},
        onModelChange: () => {},
        keyInputRef: createRef<HTMLInputElement>(),
        keyError,
        onKeyErrorClear: () => {},
      }),
    );
  }

  it("is an uncontrolled password field with autocomplete off, outside any form, with no value in the markup", () => {
    const html = panel();
    const input = /<input[^>]*id="lab-live-key"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toMatch(/type="password"/);
    expect(input).toMatch(/autoComplete="off"|autocomplete="off"/i);
    expect(input).not.toMatch(/\bvalue=/);
    expect(html).not.toMatch(/<form\b/);
    expect(html).toMatch(/<label[^>]*for="lab-live-key"[^>]*>Your Anthropic API key<\/label>/);
    expect(html).toContain("Clear key");
    expect(html).toMatch(/Show key/);
  });

  it("the missing-key error is an alert tied to the field", () => {
    const html = panel(CLIENT_MESSAGES.noKey);
    expect(html).toMatch(/<p[^>]*id="lab-live-key-error"[^>]*role="alert"[^>]*>Enter your API key to run live\.<\/p>/);
    const input = /<input[^>]*id="lab-live-key"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toMatch(/aria-invalid="true"/);
    expect(input).toMatch(/aria-describedby="[^"]*lab-live-key-error/);
  });

  it("pagehide clears the field, and so does the cleanup that runs on unmount", () => {
    const target = new EventTarget();
    const input = { value: FAKE_KEY };
    const cleanup = installKeyClearing(target, input);
    target.dispatchEvent(new Event("pagehide"));
    expect(input.value).toBe("");
    input.value = FAKE_KEY;
    cleanup();
    expect(input.value).toBe("");
    // After cleanup the listener is gone (no stale reference keeps clearing a reused element).
    input.value = FAKE_KEY;
    target.dispatchEvent(new Event("pagehide"));
    expect(input.value).toBe(FAKE_KEY);
  });
});

describe("L4: every scenario's live request shape is free of the key (all scenarios)", () => {
  for (const sc of scenarios) {
    it(sc.id, async () => {
      const fake = fakeClients();
      const { sent, run } = await liveRun(sc, sc.baselineInstruction, HAIKU, fake.clients);
      expect(sent.every((r) => !leaksKey(r.body) && !leaksKey(r.url))).toBe(true);
      expect(leaksKey(JSON.stringify(run))).toBe(false);
    });
  }
});
