/**
 * L5 (spec v0.2 §7): each request-check failure (405/413/415/409/400) and each result-mapping row
 * has a distinct non-pass state with a fixed message. Spec §3 tables.
 *
 * Request checks run against the real route handler with fake SDK clients and must happen before
 * any client is constructed. Result mapping is checked twice: with real SDK error objects thrown by
 * a fake client, and with the real SDK clients reading scripted HTTP replies from a stubbed fetch.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { afterEach, describe, expect, it } from "vitest";
import { scenarioVerdict } from "../../lib/lab/evaluate";
import { API_KEY_PATTERN, KEY_PROBLEM_MESSAGE } from "../../lib/lab/live-key";
import { ALLOWED_LIVE_MESSAGES, CLIENT_MESSAGES, HTTP_MESSAGES, PROVIDER_MESSAGES, ROUTE_MESSAGES } from "../../lib/lab/live-messages";
import { renderInputs } from "../../lib/lab/render";
import { liveConfig, makeLiveResponder } from "../../lib/lab/run";
import { getScenario, scenarios } from "../../lib/lab/scenarios";
import { createHandler } from "../../lib/lab/server/handler";
import { realClients } from "../../lib/lab/server/providers";
import type { ResponseStatus } from "../../lib/lab/types";
import { liveAlertText, RESPONSE_STATUS_TEXT } from "../../app/lab/components/status";
import { ALL_PASS_HEADLINE } from "./helpers";
import {
  ANTHROPIC_KEY,
  anthropicReply,
  callRoute,
  captureOutput,
  FAKE_KEY,
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
  type Script,
} from "./live-helpers";

// ---------------------------------------------------------------------------
// Request checks
// ---------------------------------------------------------------------------

/** D39: the body cap is 32 KiB, sized so 4000 characters that JSON escapes as \uXXXX (6 bytes each) still fit. */
const CAP = 32 * 1024;
const BIG = "x".repeat(CAP + 1);
const longKey = "k".repeat(257);

interface CheckCase {
  name: string;
  req: () => Request;
}
type Category = { code: number; message: string; cases: CheckCase[] };

const s1 = getScenario("spouse-parity");
const s2 = getScenario("stated-identity");

const CATEGORIES: Record<string, Category> = {
  method: {
    code: 405,
    message: "Method not allowed",
    cases: ["GET", "PUT", "DELETE", "PATCH"].map((method) => ({ name: method, req: () => routeRequest(validBody(), { method }) })),
  },
  contentType: {
    code: 415,
    message: "Content type must be application/json",
    cases: [
      { name: "text/plain", req: () => routeRequest(validBody(), { headers: { "content-type": "text/plain" } }) },
      { name: "missing", req: () => routeRequest(validBody(), { headers: { "content-type": null }, raw: new Blob([JSON.stringify(validBody())]).stream() }) },
      { name: "form", req: () => routeRequest(validBody(), { headers: { "content-type": "application/x-www-form-urlencoded" } }) },
      { name: "json-ish", req: () => routeRequest(validBody(), { headers: { "content-type": "application/jsonx" } }) },
    ],
  },
  size: {
    code: 413,
    message: "Request body too large",
    cases: [
      { name: "declared content-length over 32 768", req: () => routeRequest(validBody(), { headers: { "content-length": String(CAP + 1) } }) },
      { name: "measured body over 32 768 (streamed, no length)", req: () => routeRequest(null, { raw: new Blob([JSON.stringify(validBody({ pad: BIG }))]).stream() }) },
      { name: "measured body over 32 768 (declared length lies)", req: () => routeRequest(null, { headers: { "content-length": "100" }, raw: new Blob([JSON.stringify(validBody({ pad: BIG }))]).stream() }) },
      { name: "measured body over 32 768 (string body, no declared length)", req: () => routeRequest(null, { headers: { "content-length": null }, raw: JSON.stringify(validBody({ pad: BIG })) }) },
    ],
  },
  json: {
    code: 400,
    message: "Request body is not valid JSON",
    cases: ["{", "", "null", "[]", '"text"', "{'a':1}"].map((raw) => ({ name: JSON.stringify(raw), req: () => routeRequest(null, { raw }) })),
  },
  scenario: {
    code: 400,
    message: "Unknown scenario",
    cases: [
      { name: "unknown id", req: () => routeRequest(validBody({ scenarioId: "nope" })) },
      { name: "missing id", req: () => routeRequest(validBody({ scenarioId: undefined })) },
      { name: "id as object", req: () => routeRequest(validBody({ scenarioId: { id: "spouse-parity" } })) },
    ],
  },
  version: {
    code: 409,
    message: "Scenario version mismatch — reload the page",
    cases: [
      { name: "pre-D29 version of stated-identity", req: () => routeRequest(validBody({ scenarioId: s2.id, scenarioVersion: "1" })) },
      { name: "future version", req: () => routeRequest(validBody({ scenarioVersion: "99" })) },
      { name: "number instead of string", req: () => routeRequest(validBody({ scenarioVersion: Number(s1.version) })) },
      { name: "missing", req: () => routeRequest(validBody({ scenarioVersion: undefined })) },
    ],
  },
  variant: {
    code: 400,
    message: "Variant must be a or b",
    cases: ["c", "A", "pair", null, undefined].map((variant) => ({ name: String(variant), req: () => routeRequest(validBody({ variant })) })),
  },
  instruction: {
    code: 400,
    message: "Instruction must be text of at most 4000 characters",
    cases: [
      { name: "4001 characters", req: () => routeRequest(validBody({ instruction: "i".repeat(4001) })) },
      // 4001 escaped control characters (24 006 bytes of JSON) pass the size check and fail the schema check.
      { name: "4001 × U+0001", req: () => routeRequest(validBody({ instruction: "\u0001".repeat(4001) })) },
      { name: "number", req: () => routeRequest(validBody({ instruction: 7 })) },
      { name: "missing", req: () => routeRequest(validBody({ instruction: undefined })) },
      { name: "array", req: () => routeRequest(validBody({ instruction: ["x"] })) },
    ],
  },
  model: {
    code: 400,
    message: "Unknown provider or model",
    cases: [
      { name: "deferred Opus 5.5", req: () => routeRequest(validBody({ model: "claude-opus-5-5" })) },
      { name: "deferred gpt-5-mini", req: () => routeRequest(validBody({ provider: "openai", model: "gpt-5-mini" })) },
      { name: "provider/model mismatch", req: () => routeRequest(validBody({ provider: "anthropic", model: GPT4O_MINI })) },
      { name: "unknown provider", req: () => routeRequest(validBody({ provider: "other" })) },
      { name: "missing model", req: () => routeRequest(validBody({ model: undefined })) },
      { name: "dated model id", req: () => routeRequest(validBody({ model: "claude-haiku-4-5-20251001" })) },
    ],
  },
  key: {
    code: 400,
    message: ROUTE_MESSAGES.key,
    cases: [
      { name: "no header", req: () => routeRequest(validBody(), { headers: { authorization: null } }) },
      { name: "19 characters", req: () => routeRequest(validBody(), { headers: { authorization: `Bearer ${"a".repeat(19)}` } }) },
      { name: "257 characters", req: () => routeRequest(validBody(), { headers: { authorization: `Bearer ${longKey}` } }) },
      { name: "inner space", req: () => routeRequest(validBody(), { headers: { authorization: `Bearer ${FAKE_KEY.slice(0, 20)} ${FAKE_KEY.slice(20)}` } }) },
      { name: "non-ASCII letter", req: () => routeRequest(validBody(), { headers: { authorization: `Bearer ${FAKE_KEY}é`.normalize() } }) },
      { name: "base64 punctuation", req: () => routeRequest(validBody(), { headers: { authorization: `Bearer ${FAKE_KEY}+/=` } }) },
      { name: "Basic scheme", req: () => routeRequest(validBody(), { headers: { authorization: `Basic ${FAKE_KEY}` } }) },
      { name: "no scheme", req: () => routeRequest(validBody(), { headers: { authorization: FAKE_KEY } }) },
      { name: "x-api-key header instead", req: () => routeRequest(validBody(), { headers: { authorization: null, "x-api-key": FAKE_KEY } }) },
    ],
  },
  keyProvider: {
    code: 400,
    message: KEY_PROBLEM_MESSAGE.provider,
    cases: [
      { name: "OpenAI-shaped key sent for Anthropic", req: () => routeRequest(validBody(), { headers: { authorization: `Bearer ${OPENAI_KEY}` } }) },
      { name: "Anthropic key sent for OpenAI", req: () => routeRequest(validBody({ provider: "openai", model: GPT4O_MINI }), { headers: { authorization: `Bearer ${ANTHROPIC_KEY}` } }) },
    ],
  },
  keyInInstruction: {
    code: 400,
    message: CLIENT_MESSAGES.keyInInstruction,
    cases: [{ name: "instruction contains the key", req: () => routeRequest(validBody({ instruction: `Use ${FAKE_KEY} please` })) }],
  },
};

describe("L5: every request-check failure returns its fixed status and message before any provider call", () => {
  for (const [cat, def] of Object.entries(CATEGORIES)) {
    for (const c of def.cases) {
      it(`${cat} → ${def.code}: ${c.name}`, async () => {
        const fake = fakeClients();
        const r = await callRoute(c.req(), fake.clients);
        expect(r.status).toBe(def.code);
        expect(r.json).toEqual({ status: "model_error", message: def.message });
        expect(r.headers.get("cache-control")).toBe("no-store");
        expect(r.headers.get("content-type")).toMatch(/^application\/json/);
        expect(r.headers.get("access-control-allow-origin")).toBeNull();
        expect(fake.constructedWith).toEqual([]);
        expect(fake.seen).toEqual([]);
        expect(leaksKey(r.text)).toBe(false);
      });
    }
  }

  it("key errors carry a correction hint (WCAG 3.3.3), and no message quotes a key", () => {
    // The hint must state the rule the server enforces: the length bounds and the allowed characters.
    const [, min, max] = /\{(\d+),(\d+)\}/.exec(API_KEY_PATTERN.source) ?? [];
    expect([min, max]).toEqual(["20", "256"]);
    const length = new RegExp(`${min}\\s*[–-]\\s*${max} characters`);
    for (const [msg, lead] of [
      [ROUTE_MESSAGES.key, "Missing or malformed API key — "],
      [KEY_PROBLEM_MESSAGE.format, "The API key format is not valid — "],
    ] as const) {
      expect(msg.startsWith(lead), msg).toBe(true);
      expect(msg).toMatch(length);
      expect(msg).toMatch(/letters, numbers, hyphens and underscores/);
      expect(msg).toMatch(/no spaces/);
    }
    // Both messages carry the same hint.
    expect(ROUTE_MESSAGES.key.slice("Missing or malformed API key — ".length)).toBe(KEY_PROBLEM_MESSAGE.format.slice("The API key format is not valid — ".length));
    expect(KEY_PROBLEM_MESSAGE.provider).toMatch(/^This key does not match the selected provider — .*provider/);
    for (const msg of [ROUTE_MESSAGES.key, KEY_PROBLEM_MESSAGE.format, KEY_PROBLEM_MESSAGE.provider]) {
      expect(ALLOWED_LIVE_MESSAGES.has(msg)).toBe(true);
      expect(msg).not.toMatch(/sk-/);
    }
  });

  it("each check category has its own (status, message) pair, and only the five allowed status codes occur", () => {
    const pairs = Object.values(CATEGORIES).map((d) => `${d.code}|${d.message}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(new Set(Object.values(CATEGORIES).map((d) => d.code))).toEqual(new Set([405, 415, 413, 400, 409]));
  });

  it("405 replies list the supported methods (Allow: POST, OPTIONS)", async () => {
    for (const c of CATEGORIES.method.cases) {
      const r = await callRoute(c.req(), fakeClients().clients);
      expect(r.headers.get("allow"), c.name).toBe("POST, OPTIONS");
    }
  });

  it("the route module: OPTIONS → 204, Allow: POST, OPTIONS, no-store, no Access-Control-* headers; other methods → the fixed 405", async () => {
    const route = await import("../../app/api/lab/run/route");
    const opt = await (route.OPTIONS as unknown as (r: Request) => Promise<Response>)(
      new Request("http://lab.test/api/lab/run", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "authorization" },
      }),
    );
    expect(opt.status).toBe(204);
    expect(opt.headers.get("allow")).toBe("POST, OPTIONS");
    expect(opt.headers.get("cache-control")).toBe("no-store");
    const acHeaders: string[] = [];
    opt.headers.forEach((_v, k) => {
      if (k.startsWith("access-control-")) acHeaders.push(k);
    });
    expect(acHeaders).toEqual([]);
    expect(await opt.text()).toBe("");
    for (const m of ["GET", "HEAD", "PUT", "PATCH", "DELETE"] as const) {
      const handler = route[m] as unknown as (r: Request) => Promise<Response>;
      const res = await handler(new Request("http://lab.test/api/lab/run", { method: m, headers: { authorization: `Bearer ${FAKE_KEY}` } }));
      expect(res.status, m).toBe(405);
      expect(res.headers.get("allow"), m).toBe("POST, OPTIONS");
      expect(res.headers.get("cache-control"), m).toBe("no-store");
      expect(JSON.parse(await res.text()), m).toEqual({ status: "model_error", message: CATEGORIES.method.message });
    }
  });

  it("a JSON content type with a charset parameter is accepted (control)", async () => {
    const fake = fakeClients();
    const r = await callRoute(routeRequest(validBody(), { headers: { "content-type": "application/json; charset=utf-8" } }), fake.clients);
    expect(r.status).toBe(200);
    expect(fake.seen).toHaveLength(1);
  });

  it("a body of exactly 32 768 bytes passes the size check (control)", async () => {
    const base = JSON.stringify(validBody({ pad: "" }));
    const raw = JSON.stringify(validBody({ pad: "p".repeat(CAP - base.length) }));
    expect(new TextEncoder().encode(raw).length).toBe(CAP);
    for (const req of [routeRequest(null, { raw }), routeRequest(null, { raw: new Blob([raw]).stream() })]) {
      const fake = fakeClients();
      const r = await callRoute(req, fake.clients);
      expect(r.status).toBe(200);
    }
  });

  it("D39: the worst-case valid instruction (4000 × U+0001, escaped to 6 bytes each) passes and reaches the provider unchanged", async () => {
    const instruction = "\u0001".repeat(4000);
    const raw = JSON.stringify(validBody({ instruction }));
    expect(new TextEncoder().encode(raw).length).toBeGreaterThan(24_000);
    const fake = fakeClients();
    const r = await callRoute(routeRequest(null, { raw }), fake.clients);
    expect(r.status).toBe(200);
    expect(fake.seen).toHaveLength(1);
    expect(fake.seen[0].body.system).toBe(instruction);
  });

  it("D39: the same through the client responder (the page's own request) for every scenario and variant", async () => {
    for (const sc of scenarios) {
      const fake = fakeClients();
      const { run, responses } = await liveRun(sc, "\u0001".repeat(4000), HAIKU, fake.clients);
      expect(responses.map((x) => x.status), sc.id).toEqual([200, 200]);
      expect(run.responses.a.status).toBe("ok");
      expect(run.responses.b.status).toBe("ok");
    }
  });

  it("keys of 20 and 256 allowed characters pass the key check (control)", async () => {
    const cases: Array<[string, string]> = [
      ["anthropic", "sk-ant-" + "A".repeat(13)],
      ["anthropic", "sk-ant-" + "z_-9".repeat(62) + "z"],
      ["openai", "A".repeat(20)],
      ["openai", "z_-9".repeat(64)],
    ];
    for (const [provider, key] of cases) {
      expect(key.length === 20 || key.length === 256).toBe(true);
      const fake = fakeClients();
      const body = provider === "openai" ? validBody({ provider, model: GPT4O_MINI }) : validBody();
      const r = await callRoute(routeRequest(body, { headers: { authorization: `Bearer ${key}` } }), fake.clients);
      expect(r.status, `${provider} ${key.length}`).toBe(200);
      expect(fake.constructedWith).toEqual([key]);
    }
  });

  it("every scenario's current version is accepted; any other is 409", async () => {
    for (const s of scenarios) {
      const ok = await callRoute(routeRequest(validBody({ scenarioId: s.id, scenarioVersion: s.version })), fakeClients().clients);
      expect(ok.status, s.id).toBe(200);
      const skew = await callRoute(routeRequest(validBody({ scenarioId: s.id, scenarioVersion: `${s.version}.0` })), fakeClients().clients);
      expect(skew.status, s.id).toBe(409);
    }
  });
});

// ---------------------------------------------------------------------------
// Result mapping
// ---------------------------------------------------------------------------

const H = () => new Headers({ "content-type": "application/json" });
const KEYED = `request failed for key ${FAKE_KEY}`;

interface Row {
  row: string;
  status: ResponseStatus;
  error?: string;
}
const EXPECTED_ROWS: Row[] = [
  { row: "normal completion", status: "ok" },
  { row: "token limit", status: "model_error", error: PROVIDER_MESSAGES.tokenLimit },
  { row: "refusal", status: "provider_refused", error: PROVIDER_MESSAGES.refused },
  // D40: 401, 403, 404, 402, and 400 each have their own fixed message, the same for both providers.
  { row: "authentication (401)", status: "credentials_unavailable", error: PROVIDER_MESSAGES.badKey },
  { row: "permission (403)", status: "credentials_unavailable", error: PROVIDER_MESSAGES.keyDenied },
  { row: "model not found (404)", status: "model_error", error: PROVIDER_MESSAGES.modelUnavailable },
  { row: "billing (402)", status: "model_error", error: PROVIDER_MESSAGES.billing },
  { row: "bad request (400)", status: "model_error", error: PROVIDER_MESSAGES.rejected },
  { row: "rate limit", status: "model_error", error: PROVIDER_MESSAGES.rateLimited },
  { row: "insufficient quota", status: "model_error", error: PROVIDER_MESSAGES.noQuota },
  { row: "timeout or abort", status: "timeout" },
  { row: "anything else", status: "model_error", error: PROVIDER_MESSAGES.unavailable },
];
const expectedFor = (row: string) => EXPECTED_ROWS.find((r) => r.row === row)!;

/** Cases driven by a fake client: provider, row, and what the fake SDK does. */
const THROWN: Array<{ provider: "anthropic" | "openai"; row: string; name: string; script: Script }> = [
  { provider: "anthropic", row: "normal completion", name: "end_turn", script: () => anthropicReply("Hello") },
  { provider: "anthropic", row: "normal completion", name: "stop_sequence", script: () => anthropicReply("Hello", { stop_reason: "stop_sequence" }) },
  { provider: "anthropic", row: "token limit", name: "stop_reason max_tokens", script: () => anthropicReply("cut", { stop_reason: "max_tokens" }) },
  { provider: "anthropic", row: "refusal", name: "stop_reason refusal", script: () => anthropicReply("", { stop_reason: "refusal" }) },
  { provider: "anthropic", row: "authentication (401)", name: "401", script: () => { throw Anthropic.APIError.generate(401, { type: "error", error: { type: "authentication_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "permission (403)", name: "403", script: () => { throw Anthropic.APIError.generate(403, { type: "error", error: { type: "permission_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "rate limit", name: "429", script: () => { throw Anthropic.APIError.generate(429, { type: "error", error: { type: "rate_limit_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "bad request (400)", name: "400", script: () => { throw Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "model not found (404)", name: "404", script: () => { throw Anthropic.APIError.generate(404, { type: "error", error: { type: "not_found_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "billing (402)", name: "402 billing_error", script: () => { throw Anthropic.APIError.generate(402, { type: "error", error: { type: "billing_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "anything else", name: "409", script: () => { throw Anthropic.APIError.generate(409, { type: "error", error: { type: "conflict", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "anything else", name: "422", script: () => { throw Anthropic.APIError.generate(422, { type: "error", error: { type: "invalid_request_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "timeout or abort", name: "connection timeout", script: () => { throw new Anthropic.APIConnectionTimeoutError({ message: KEYED }); } },
  { provider: "anthropic", row: "timeout or abort", name: "user abort", script: () => { throw new Anthropic.APIUserAbortError({ message: KEYED }); } },
  { provider: "anthropic", row: "anything else", name: "500", script: () => { throw Anthropic.APIError.generate(500, { type: "error", error: { type: "api_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "anything else", name: "529 overloaded", script: () => { throw Anthropic.APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: KEYED } }, KEYED, H()); } },
  { provider: "anthropic", row: "anything else", name: "connection error", script: () => { throw new Anthropic.APIConnectionError({ message: KEYED }); } },
  { provider: "anthropic", row: "anything else", name: "plain Error", script: () => { throw new Error(KEYED); } },
  { provider: "anthropic", row: "anything else", name: "thrown string", script: () => { throw KEYED; } },
  { provider: "anthropic", row: "anything else", name: "malformed reply", script: () => ({ model: "x", stop_reason: "end_turn" }) },
  { provider: "openai", row: "normal completion", name: "stop", script: () => openaiReply("Hello") },
  { provider: "openai", row: "normal completion", name: "null content", script: () => openaiReply(null) },
  { provider: "openai", row: "token limit", name: "finish_reason length", script: () => openaiReply("cut", { finish_reason: "length" }) },
  { provider: "openai", row: "refusal", name: "message.refusal", script: () => openaiReply(null, { refusal: "I can't help with that." }) },
  { provider: "openai", row: "authentication (401)", name: "401", script: () => { throw OpenAI.APIError.generate(401, { error: { code: "invalid_api_key", type: "invalid_request_error", message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "permission (403)", name: "403", script: () => { throw OpenAI.APIError.generate(403, { error: { code: null, type: "invalid_request_error", message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "rate limit", name: "429 rate_limit_exceeded", script: () => { throw OpenAI.APIError.generate(429, { error: { code: "rate_limit_exceeded", type: "requests", message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "insufficient quota", name: "429 insufficient_quota", script: () => { throw OpenAI.APIError.generate(429, { error: { code: "insufficient_quota", type: "insufficient_quota", message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "bad request (400)", name: "400", script: () => { throw OpenAI.APIError.generate(400, { error: { code: null, type: "invalid_request_error", message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "billing (402)", name: "402", script: () => { throw OpenAI.APIError.generate(402, { error: { code: "billing_hard_limit_reached", type: "billing", message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "anything else", name: "409", script: () => { throw OpenAI.APIError.generate(409, { error: { message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "anything else", name: "422", script: () => { throw OpenAI.APIError.generate(422, { error: { message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "model not found (404)", name: "404 model_not_found", script: () => { throw OpenAI.APIError.generate(404, { error: { code: "model_not_found", type: "invalid_request_error", message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "timeout or abort", name: "connection timeout", script: () => { throw new OpenAI.APIConnectionTimeoutError({ message: KEYED }); } },
  { provider: "openai", row: "timeout or abort", name: "user abort", script: () => { throw new OpenAI.APIUserAbortError({ message: KEYED }); } },
  { provider: "openai", row: "anything else", name: "500", script: () => { throw OpenAI.APIError.generate(500, { error: { message: KEYED } }, KEYED, H()); } },
  { provider: "openai", row: "anything else", name: "connection error", script: () => { throw new OpenAI.APIConnectionError({ message: KEYED }); } },
  { provider: "openai", row: "anything else", name: "plain Error", script: () => { throw new Error(KEYED); } },
  { provider: "openai", row: "anything else", name: "no choices", script: () => ({ model: "gpt-4o-mini", choices: [] }) },
];

describe("L5: provider result mapping through the route (fake clients throwing real SDK error objects)", () => {
  for (const c of THROWN) {
    it(`${c.provider} ${c.name} → ${c.row}`, async () => {
      const fake = fakeClients(c.script);
      const body = c.provider === "anthropic" ? validBody() : validBody({ provider: "openai", model: GPT4O_MINI });
      const r = await callRoute(routeRequest(body), fake.clients);
      const exp = expectedFor(c.row);
      expect(r.status).toBe(200);
      expect(r.json?.status).toBe(exp.status);
      expect(r.json?.error).toBe(exp.error);
      if (exp.status !== "ok") expect(r.json?.text).toBeUndefined();
      expect(Object.keys(r.json ?? {}).every((k) => ["status", "text", "error", "returnedModel", "stopReason", "durationMs"].includes(k))).toBe(true);
      expect(leaksKey(r.text)).toBe(false);
      expect(r.headers.get("cache-control")).toBe("no-store");
    });
  }

  it("every mapping row (12 after D40) is a pairwise distinct (status, message) pair", () => {
    expect(EXPECTED_ROWS).toHaveLength(12);
    const keys = EXPECTED_ROWS.map((r) => `${r.status}|${r.error ?? ""}`);
    expect(new Set(keys).size).toBe(EXPECTED_ROWS.length);
  });

  it("every non-ok row yields a not-evaluated run whose headline is not a pass, with its own alert text", async () => {
    const s = getScenario("spouse-parity");
    const alerts = new Map<string, string>();
    for (const row of EXPECTED_ROWS) {
      const c = THROWN.find((t) => t.row === row.row && t.provider === (row.row === "insufficient quota" ? "openai" : "anthropic"))!;
      expect(c, row.row).toBeTruthy();
      const fake = fakeClients(c.script);
      const { run } = await liveRun(s, s.baselineInstruction, c.provider === "anthropic" ? HAIKU : GPT4O_MINI, fake.clients);
      expect(run.responses.a.status).toBe(row.status);
      expect(run.responses.b.status).toBe(row.status);
      expect(run.responses.a.error ?? undefined).toBe(row.error);
      if (row.status === "ok") continue;
      expect(run.results.every((r) => r.status === "not_evaluated"), row.row).toBe(true);
      expect(scenarioVerdict(run.results).headline).not.toBe(ALL_PASS_HEADLINE);
      const alert = liveAlertText(run);
      expect(alert, row.row).toBeTruthy();
      expect(alert).not.toMatch(/pass/i);
      expect(leaksKey(JSON.stringify(run))).toBe(false);
      alerts.set(row.row, alert!);
    }
    expect(new Set(alerts.values()).size).toBe(alerts.size);
    expect(alerts.size).toBe(EXPECTED_ROWS.length - 1);
  });
});

describe("L5: provider result mapping with the real SDK clients and scripted HTTP replies (no network)", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const HTTP: Array<{ provider: "anthropic" | "openai"; row: string; name: string; reply: () => Response }> = [
    { provider: "anthropic", row: "normal completion", name: "200 end_turn", reply: () => json(200, anthropicReply("Hi")) },
    { provider: "anthropic", row: "token limit", name: "200 max_tokens", reply: () => json(200, anthropicReply("Hi", { stop_reason: "max_tokens" })) },
    { provider: "anthropic", row: "refusal", name: "200 refusal", reply: () => json(200, anthropicReply("", { stop_reason: "refusal" })) },
    { provider: "anthropic", row: "authentication (401)", name: "401", reply: () => json(401, { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${FAKE_KEY}` } }) },
    { provider: "anthropic", row: "permission (403)", name: "403", reply: () => json(403, { type: "error", error: { type: "permission_error", message: KEYED } }) },
    { provider: "anthropic", row: "rate limit", name: "429", reply: () => json(429, { type: "error", error: { type: "rate_limit_error", message: KEYED } }) },
    { provider: "anthropic", row: "bad request (400)", name: "400", reply: () => json(400, { type: "error", error: { type: "invalid_request_error", message: KEYED } }) },
    { provider: "anthropic", row: "model not found (404)", name: "404", reply: () => json(404, { type: "error", error: { type: "not_found_error", message: "model: claude-haiku-4-5" } }) },
    { provider: "anthropic", row: "billing (402)", name: "402 billing_error", reply: () => json(402, { type: "error", error: { type: "billing_error", message: KEYED } }) },
    { provider: "anthropic", row: "anything else", name: "409", reply: () => json(409, { type: "error", error: { type: "conflict", message: KEYED } }) },
    { provider: "anthropic", row: "anything else", name: "422", reply: () => json(422, { type: "error", error: { type: "invalid_request_error", message: KEYED } }) },
    { provider: "anthropic", row: "anything else", name: "500", reply: () => json(500, { type: "error", error: { type: "api_error", message: KEYED } }) },
    { provider: "anthropic", row: "anything else", name: "529", reply: () => json(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }) },
    { provider: "anthropic", row: "anything else", name: "200 non-JSON", reply: () => new Response(`<html>${FAKE_KEY}</html>`, { status: 200, headers: { "content-type": "text/html" } }) },
    { provider: "openai", row: "normal completion", name: "200 stop", reply: () => json(200, openaiReply("Hi")) },
    { provider: "openai", row: "token limit", name: "200 length", reply: () => json(200, openaiReply("Hi", { finish_reason: "length" })) },
    { provider: "openai", row: "refusal", name: "200 refusal", reply: () => json(200, openaiReply(null, { refusal: "I can't help with that." })) },
    { provider: "openai", row: "authentication (401)", name: "401", reply: () => json(401, { error: { code: "invalid_api_key", type: "invalid_request_error", message: `Incorrect API key provided: ${FAKE_KEY}` } }) },
    { provider: "openai", row: "rate limit", name: "429", reply: () => json(429, { error: { code: "rate_limit_exceeded", type: "requests", message: KEYED } }) },
    { provider: "openai", row: "insufficient quota", name: "429 insufficient_quota", reply: () => json(429, { error: { code: "insufficient_quota", type: "insufficient_quota", message: KEYED } }) },
    { provider: "openai", row: "permission (403)", name: "403", reply: () => json(403, { error: { code: "unsupported_country_region_territory", type: "request_forbidden", message: KEYED } }) },
    { provider: "openai", row: "bad request (400)", name: "400", reply: () => json(400, { error: { code: null, type: "invalid_request_error", message: KEYED } }) },
    { provider: "openai", row: "model not found (404)", name: "404", reply: () => json(404, { error: { code: "model_not_found", type: "invalid_request_error", message: KEYED } }) },
    { provider: "openai", row: "billing (402)", name: "402", reply: () => json(402, { error: { code: "billing_hard_limit_reached", type: "billing", message: KEYED } }) },
    { provider: "openai", row: "anything else", name: "409", reply: () => json(409, { error: { message: KEYED } }) },
    { provider: "openai", row: "anything else", name: "422", reply: () => json(422, { error: { message: KEYED } }) },
    { provider: "openai", row: "anything else", name: "503", reply: () => json(503, { error: { message: KEYED } }) },
  ];

  for (const c of HTTP) {
    it(`${c.provider} ${c.name} → ${c.row} (exactly one HTTP call: no retries)`, async () => {
      const stub = stubProviderFetch(() => c.reply());
      restore = stub.restore;
      const body = c.provider === "anthropic" ? validBody() : validBody({ provider: "openai", model: GPT4O_MINI });
      const r = await callRoute(routeRequest(body), realClients);
      const exp = expectedFor(c.row);
      expect(r.json?.status).toBe(exp.status);
      expect(r.json?.error).toBe(exp.error);
      expect(stub.calls).toHaveLength(1);
      expect(leaksKey(r.text)).toBe(false);
    });
  }

  it("a network failure inside the SDK → anything else (Provider unavailable), one attempt", async () => {
    const stub = stubProviderFetch(() => {
      throw new TypeError(`fetch failed for ${FAKE_KEY}`);
    });
    restore = stub.restore;
    const r = await callRoute(routeRequest(validBody()), realClients);
    expect(r.json).toMatchObject({ status: "model_error", error: PROVIDER_MESSAGES.unavailable });
    expect(stub.calls).toHaveLength(1);
    expect(leaksKey(r.text)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D40: provider rejections 400, 402, 403, 404 — distinct, fixed, never provider text
// ---------------------------------------------------------------------------

describe("D40: 400, 402, 403, and 404 provider rejections are distinct not-evaluated states with fixed messages (both providers)", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });
  const CANARY = "PROVIDER-TEXT-CANARY";
  const providerText = (code: number) => `${CANARY} ${code}: details mention ${ANTHROPIC_KEY} and ${OPENAI_KEY}`;
  const bodyFor = (provider: "anthropic" | "openai", code: number) =>
    provider === "anthropic"
      ? { type: "error", error: { type: { 400: "invalid_request_error", 402: "billing_error", 403: "permission_error", 404: "not_found_error" }[code], message: providerText(code) } }
      : { error: { code: { 400: null, 402: "billing_hard_limit_reached", 403: "unsupported_country_region_territory", 404: "model_not_found" }[code], type: "invalid_request_error", message: providerText(code) } };
  const EXPECT: Record<number, { status: ResponseStatus; error: string }> = {
    400: { status: "model_error", error: PROVIDER_MESSAGES.rejected },
    402: { status: "model_error", error: PROVIDER_MESSAGES.billing },
    403: { status: "credentials_unavailable", error: PROVIDER_MESSAGES.keyDenied },
    404: { status: "model_error", error: PROVIDER_MESSAGES.modelUnavailable },
  };

  it("the four messages are fixed, allowlisted, pairwise distinct, and distinct from the 401 key message and 'Provider unavailable'", () => {
    const msgs = Object.values(EXPECT).map((e) => e.error);
    expect(new Set([...msgs, PROVIDER_MESSAGES.badKey, PROVIDER_MESSAGES.unavailable]).size).toBe(6);
    for (const m of msgs) expect(ALLOWED_LIVE_MESSAGES.has(m)).toBe(true);
  });

  for (const provider of ["anthropic", "openai"] as const) {
    it(`${provider}: client → route → real SDK (scripted HTTP replies): each code gets its own state, message, and alert; no provider text or key anywhere`, async () => {
      const s = getScenario("spouse-parity");
      const seenAlerts = new Map<number, string>();
      for (const code of [400, 402, 403, 404]) {
        const stub = stubProviderFetch(() => new Response(JSON.stringify(bodyFor(provider, code)), { status: code, headers: { "content-type": "application/json" } }));
        restore = stub.restore;
        const { value, output } = await captureOutput(() => liveRun(s, s.baselineInstruction, provider === "anthropic" ? HAIKU : GPT4O_MINI, realClients));
        const { run, responses } = value;
        stub.restore();
        restore = null;
        expect(stub.calls, `${provider} ${code}`).toHaveLength(2); // one call per version, no retries
        for (const v of ["a", "b"] as const) {
          expect(run.responses[v].status, `${provider} ${code}`).toBe(EXPECT[code].status);
          expect(run.responses[v].error, `${provider} ${code}`).toBe(EXPECT[code].error);
        }
        expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
        expect(scenarioVerdict(run.results).headline).not.toBe(ALL_PASS_HEADLINE);
        const alert = liveAlertText(run) ?? "";
        expect(alert).toContain(EXPECT[code].error);
        const everything = [JSON.stringify(run), ...responses.map((r) => r.text), alert, output].join("\n");
        expect(everything).not.toContain(CANARY);
        expect(leaksKey(everything)).toBe(false);
        expect(output).toBe("");
        seenAlerts.set(code, alert);
      }
      expect(new Set(seenAlerts.values()).size).toBe(4);
    });
  }

  it("402 has no SDK error class in either SDK, and is still mapped by status through the real SDK", async () => {
    for (const [provider, SDK] of [
      ["anthropic", Anthropic],
      ["openai", OpenAI],
    ] as const) {
      const err = SDK.APIError.generate(402, bodyFor(provider, 402), "x", H());
      // A plain APIError (not one of the named subclasses).
      expect(err.constructor.name, provider).toBe("APIError");
      const stub = stubProviderFetch(() => new Response(JSON.stringify(bodyFor(provider, 402)), { status: 402, headers: { "content-type": "application/json" } }));
      restore = stub.restore;
      const r = await callRoute(routeRequest(provider === "anthropic" ? validBody() : validBody({ provider: "openai", model: GPT4O_MINI })), realClients);
      stub.restore();
      restore = null;
      expect(r.json).toMatchObject({ status: "model_error", error: PROVIDER_MESSAGES.billing });
      expect(r.text).not.toContain(CANARY);
      expect(leaksKey(r.text)).toBe(false);
    }
  });

  it("the message depends only on the status: different provider wording for the same code gives the same message", async () => {
    for (const code of [400, 402, 403, 404]) {
      const msgs = new Set<string>();
      for (const wording of ["short", "A much longer explanation with a URL https://example.invalid/docs", ""]) {
        const fake = fakeClients(() => {
          throw Anthropic.APIError.generate(code, { type: "error", error: { type: "whatever_error", message: wording } }, wording, H());
        });
        const r = await callRoute(routeRequest(validBody()), fake.clients);
        msgs.add(String(r.json?.error));
      }
      expect([...msgs], String(code)).toEqual([EXPECT[code].error]);
    }
  });
});

// ---------------------------------------------------------------------------
// Client side: every server reply becomes a non-pass state with a fixed message
// ---------------------------------------------------------------------------

describe("L5: the client turns every non-200 reply into a non-pass state with a fixed message", () => {
  const s = getScenario("spouse-parity");
  const m = model(HAIKU);
  async function viaStatus(status: number, body: string): Promise<{ status: ResponseStatus; error?: string }> {
    const f = (async () => new Response(body, { status, headers: { "content-type": "application/json" } })) as typeof fetch;
    const rec = await makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => FAKE_KEY }, fetchImpl: f })({
      instruction: "x",
      input: renderInputs(s).a,
      config: liveConfig(m),
    });
    return rec;
  }

  const CODES = [400, 405, 409, 413, 415, 429, 500, 502, 503, 504];
  for (const code of CODES) {
    it(`${code} with a hostile body → model_error with an allowlisted fixed message, never the body`, async () => {
      const rec = await viaStatus(code, JSON.stringify({ status: "ok", text: "All good", message: `server says ${FAKE_KEY}`, error: KEYED }));
      expect(rec.status).toBe("model_error");
      expect(ALLOWED_LIVE_MESSAGES.has(rec.error ?? "")).toBe(true);
      expect(leaksKey(JSON.stringify(rec))).toBe(false);
      expect(JSON.stringify(rec)).not.toContain("All good");
    });
  }

  it("every request-check failure shows the route's own fixed message on the page, distinct per check", async () => {
    // For each check category, take the real handler's actual reply and hand it to the client responder.
    const shown = new Map<string, string>();
    for (const [cat, def] of Object.entries(CATEGORIES)) {
      for (const c of def.cases) {
        const routeReply = await createHandler({ clients: fakeClients().clients })(c.req());
        expect(routeReply.status, `${cat} ${c.name}`).toBe(def.code);
        const rec = await makeLiveResponder({
          scenario: s,
          provider: "anthropic",
          model: m,
          key: { get: () => FAKE_KEY },
          fetchImpl: (async () => routeReply) as typeof fetch,
        })({ instruction: "x", input: renderInputs(s).a, config: liveConfig(m) });
        expect(rec.status, `${cat} ${c.name}`).toBe("model_error");
        expect(rec.error, `${cat} ${c.name}`).toBe(def.message);
        expect(leaksKey(JSON.stringify(rec))).toBe(false);
        shown.set(cat, rec.error!);
      }
    }
    // One message per check category, and none of them is a pass or a provider result.
    expect(new Set(shown.values()).size).toBe(Object.keys(CATEGORIES).length);
    for (const v of shown.values()) expect(ALLOWED_LIVE_MESSAGES.has(v)).toBe(true);
  });

  it("without a usable route message, each status code has its own fixed fallback", async () => {
    const bodies = ["{}", "not json", "", JSON.stringify({ status: "model_error", message: `raw text ${FAKE_KEY}` })];
    const fallback: Record<number, string> = {};
    for (const code of [400, 405, 409, 413, 415, 429, 500, 502, 503]) {
      const seenForCode = new Set<string>();
      for (const body of bodies) {
        const rec = await viaStatus(code, body);
        expect(rec.status).toBe("model_error");
        expect(ALLOWED_LIVE_MESSAGES.has(rec.error ?? ""), `${code} ${body}`).toBe(true);
        expect(leaksKey(JSON.stringify(rec))).toBe(false);
        seenForCode.add(rec.error!);
      }
      // The fallback depends on the status code only, never on the body.
      expect(seenForCode.size, String(code)).toBe(1);
      fallback[code] = [...seenForCode][0];
    }
    expect(fallback[400]).toBe(HTTP_MESSAGES[400]);
    expect(fallback[405]).toBe(HTTP_MESSAGES[405]);
    expect(fallback[409]).toBe(HTTP_MESSAGES[409]);
    expect(fallback[413]).toBe(HTTP_MESSAGES[413]);
    expect(fallback[415]).toBe(HTTP_MESSAGES[415]);
    expect(fallback[429]).toBe(HTTP_MESSAGES[429]);
    expect(fallback[500]).toBe(CLIENT_MESSAGES.serverFailed);
    expect(fallback[502]).toBe(CLIENT_MESSAGES.serverFailed);
    // 400, 405, 409, 413, 415, 429, and 5xx are pairwise distinct.
    const distinct = [400, 405, 409, 413, 415, 429, 500].map((c) => fallback[c]);
    expect(new Set(distinct).size).toBe(distinct.length);
    // A route message is shown only for a 4xx; a 5xx carrying one still gets the server-failure fallback.
    const fivexx = await viaStatus(503, JSON.stringify({ status: "model_error", message: "Method not allowed" }));
    expect(fivexx.error).toBe(CLIENT_MESSAGES.serverFailed);
  });

  it("a 200 reply that is not a valid result is never ok", async () => {
    for (const body of ["not json", "{}", JSON.stringify({ status: "pass" }), JSON.stringify({ status: "OK", text: "hi" }), "null", "[]"]) {
      const rec = await viaStatus(200, body);
      expect(rec.status, body).not.toBe("ok");
      expect(rec.error).toBe(CLIENT_MESSAGES.serverFailed);
    }
  });

  it("a 200 result carrying a message outside the allowlist shows a fixed message instead", async () => {
    for (const status of ["model_error", "credentials_unavailable", "provider_refused"] as const) {
      const rec = await viaStatus(200, JSON.stringify({ status, error: `raw provider text ${FAKE_KEY}`, durationMs: 5 }));
      expect(rec.status).toBe(status);
      expect(ALLOWED_LIVE_MESSAGES.has(rec.error ?? "")).toBe(true);
      expect(leaksKey(JSON.stringify(rec))).toBe(false);
    }
    const ok = await viaStatus(200, JSON.stringify({ status: "ok", text: "Hello", error: "raw", rulesMatched: ["FIX-VERIFY"], failureModesApplied: ["SF-1"] }));
    expect(ok.status).toBe("ok");
    expect(ok.error).toBeUndefined();
    expect((ok as Record<string, unknown>).rulesMatched).toBeUndefined();
    expect((ok as Record<string, unknown>).failureModesApplied).toBeUndefined();
  });

  it("route rejections reached through the real handler end as not-evaluated runs with the matching fixed message", async () => {
    // 409: the page holds an out-of-date scenario version.
    const stale = { ...s, version: "0" };
    const fake = fakeClients();
    const out409 = await liveRun(stale, s.baselineInstruction, HAIKU, fake.clients);
    // 400: a request the route rejects that the page cannot catch first (here: a scenario the server does not know).
    const out400 = await liveRun({ ...s, id: "retired-scenario" }, s.baselineInstruction, HAIKU, fake.clients);
    // 413: an instruction far beyond the page's own limit, over the 32 KiB body cap.
    const out413 = await liveRun(s, "q".repeat(CAP + 100), HAIKU, fake.clients);
    for (const [code, out, message] of [
      [409, out409, CATEGORIES.version.message],
      [400, out400, CATEGORIES.scenario.message],
      [413, out413, CATEGORIES.size.message],
    ] as const) {
      expect(out.responses.map((x) => x.status)).toEqual([code, code]);
      for (const v of ["a", "b"] as const) {
        expect(out.run.responses[v].status).toBe("model_error");
        expect(out.run.responses[v].error).toBe(message);
      }
      expect(out.run.results.every((r) => r.status === "not_evaluated")).toBe(true);
      expect(scenarioVerdict(out.run.results).headline).not.toBe(ALL_PASS_HEADLINE);
    }
    expect(fake.seen).toEqual([]);
  });

  it("each response status has its own label, and only ok is shown as OK", () => {
    const labels = Object.entries(RESPONSE_STATUS_TEXT);
    expect(new Set(labels.map(([, t]) => t)).size).toBe(labels.length);
    for (const [st, t] of labels) if (st !== "ok" && st !== "not_run") expect(t, st).toMatch(/not evaluated/);
  });
});
