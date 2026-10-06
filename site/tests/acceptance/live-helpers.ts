/**
 * Shared fixtures for the independent live-mode acceptance tests (spec v0.2, L1–L8).
 * Built only from the public API of site/lib/lab and the route handler factory
 * (`createHandler(deps)`, spec §3); no implementer test code is used.
 *
 * Every provider is a fake. No test in this suite reaches a real provider: the route is
 * driven through `createHandler` with injected fake SDK clients, and tests that exercise
 * the real SDK clients replace the global `fetch` first (see `stubProviderFetch`).
 */
import { vi } from "vitest";
import { LIVE_MODELS, type LiveModel, type Provider } from "../../lib/lab/models";
import { renderInputs } from "../../lib/lab/render";
import { LIVE_RESPONDER_VERSION, liveConfig, makeLiveResponder, runScenario } from "../../lib/lab/run";
import type { Scenario } from "../../lib/lab/scenarios";
import { createHandler } from "../../lib/lab/server/handler";
import type { AnthropicLike, OpenAILike, ProviderClients } from "../../lib/lab/server/providers";

/**
 * Obviously fake keys: a provider prefix plus 32 letters. Never real credentials.
 * Anthropic keys must start `sk-ant-`; OpenAI keys must not (fix round: key/provider prefix rule).
 */
export const ANTHROPIC_KEY = "sk-ant-test-VerifierFakeKeyNotRealAbcdefghij";
export const OPENAI_KEY = "sk-test-VerifierFakeKeyNotRealKlmnopqrst";
/** The default fake key (the default request provider is Anthropic). */
export const FAKE_KEY = ANTHROPIC_KEY;
export const keyFor = (provider: string): string => (provider === "openai" ? OPENAI_KEY : ANTHROPIC_KEY);
const KEY_BODIES = [ANTHROPIC_KEY.slice("sk-ant-test-".length), OPENAI_KEY.slice("sk-test-".length)];

/** True when `text` contains either fake key, its 32-letter body, or any 10-character run of that body. */
export function leaksKey(text: string): boolean {
  for (const k of [ANTHROPIC_KEY, OPENAI_KEY]) if (text.includes(k)) return true;
  for (const body of KEY_BODIES) {
    for (let i = 0; i + 10 <= body.length; i++) if (text.includes(body.slice(i, i + 10))) return true;
  }
  return false;
}

export const model = (id: string): LiveModel => {
  const m = LIVE_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`not in allowlist: ${id}`);
  return m;
};

export const HAIKU = "claude-haiku-4-5";
export const SONNET = "claude-sonnet-5-5";
export const GPT4O_MINI = "gpt-4o-mini";
export const GPT41_MINI = "gpt-4.1-mini";

/** What a fake SDK client saw for one call. */
export interface ProviderSeen {
  provider: Provider;
  apiKey: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}

/** Reply produced by a scripted fake provider for one call. Throwing simulates an SDK error. */
export type Script = (call: ProviderSeen) => Promise<unknown> | unknown;

export function anthropicReply(text: string, over: Record<string, unknown> = {}) {
  return { content: [{ type: "text", text }], model: "claude-haiku-4-5-20251001", stop_reason: "end_turn", ...over };
}

export function openaiReply(content: string | null, over: { model?: string; finish_reason?: string; refusal?: string | null } = {}) {
  return {
    model: over.model ?? "gpt-4o-mini-2024-07-18",
    choices: [{ index: 0, message: { role: "assistant", content, refusal: over.refusal ?? null }, finish_reason: over.finish_reason ?? "stop" }],
  };
}

/** The user-role text a provider received (the rendered scenario input). */
export function userText(seen: ProviderSeen): string {
  const msgs = seen.body.messages as Array<{ role: string; content: string }>;
  const u = msgs.filter((m) => m.role === "user");
  return u.length === 1 ? u[0].content : "<not exactly one user message>";
}

/** The system prompt a provider received (Anthropic `system`, or the OpenAI system message). */
export function systemText(seen: ProviderSeen): string | undefined {
  if (seen.provider === "anthropic") return seen.body.system as string | undefined;
  const msgs = seen.body.messages as Array<{ role: string; content: string }>;
  const s = msgs.filter((m) => m.role === "system");
  return s.length === 1 ? s[0].content : undefined;
}

/** Fake SDK clients that record every call and answer from `script` (default: an ok reply). */
export function fakeClients(script?: Script): { clients: ProviderClients; seen: ProviderSeen[]; constructedWith: string[] } {
  const seen: ProviderSeen[] = [];
  const constructedWith: string[] = [];
  const answer = async (call: ProviderSeen) => {
    seen.push(call);
    if (script) return script(call);
    return call.provider === "anthropic" ? anthropicReply("Happy to help.") : openaiReply("Happy to help.");
  };
  const clients: ProviderClients = {
    anthropic(apiKey) {
      constructedWith.push(apiKey);
      const c: AnthropicLike = {
        messages: {
          create: async (body, opts) =>
            (await answer({ provider: "anthropic", apiKey, body: JSON.parse(JSON.stringify(body)), signal: opts.signal })) as never,
        },
      };
      return c;
    },
    openai(apiKey) {
      constructedWith.push(apiKey);
      const c: OpenAILike = {
        chat: {
          completions: {
            create: async (body, opts) =>
              (await answer({ provider: "openai", apiKey, body: JSON.parse(JSON.stringify(body)), signal: opts.signal })) as never,
          },
        },
      };
      return c;
    },
  };
  return { clients, seen, constructedWith };
}

/** A request to the live route, as the browser would send it (overridable). */
export function routeRequest(
  body: unknown,
  opts: { method?: string; headers?: Record<string, string | null>; raw?: string | ReadableStream<Uint8Array>; signal?: AbortSignal } = {},
): Request {
  const provider = typeof body === "object" && body !== null ? (body as Record<string, unknown>).provider : undefined;
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${keyFor(String(provider))}` };
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    if (v === null) delete headers[k];
    else headers[k] = v;
  }
  const method = opts.method ?? "POST";
  const hasBody = method !== "GET" && method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    body: hasBody ? (opts.raw ?? JSON.stringify(body)) : undefined,
    signal: opts.signal,
  };
  if (opts.raw instanceof ReadableStream) init.duplex = "half";
  return new Request("http://lab.test/api/lab/run", init);
}

export function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scenarioId: "spouse-parity",
    scenarioVersion: "1",
    variant: "a",
    instruction: "You are a helpful support assistant.",
    provider: "anthropic",
    model: HAIKU,
    ...over,
  };
}

/** Sends one request through the real handler with the given fake clients and reads the reply. */
export async function callRoute(req: Request, clients: ProviderClients) {
  const res = await createHandler({ clients })(req);
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { res, status: res.status, text, json, headers: res.headers };
}

/**
 * A `fetch` for the client responder that hands the request to the real route handler
 * (fake SDK clients behind it), recording what the browser would have sent.
 */
export function viaRoute(clients: ProviderClients): {
  fetchImpl: typeof fetch;
  sent: Array<{ url: string; method: string; headers: Record<string, string>; body: string; signal: AbortSignal | null }>;
  responses: Array<{ status: number; text: string; headers: Headers }>;
} {
  const handle = createHandler({ clients });
  const sent: Array<{ url: string; method: string; headers: Record<string, string>; body: string; signal: AbortSignal | null }> = [];
  const responses: Array<{ status: number; text: string; headers: Headers }> = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    sent.push({ url: String(url), method: init?.method ?? "GET", headers, body: String(init?.body ?? ""), signal: init?.signal ?? null });
    const req = new Request(new URL(String(url), "http://lab.test"), init);
    const res = await handle(req);
    const text = await res.clone().text();
    responses.push({ status: res.status, text, headers: res.headers });
    return res;
  }) as typeof fetch;
  return { fetchImpl, sent, responses };
}

/** Records all console output and stdout/stderr writes while `fn` runs. */
export async function captureOutput<T>(fn: () => Promise<T>): Promise<{ value: T; output: string }> {
  const chunks: string[] = [];
  const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      chunks.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    }),
  );
  const out = vi.spyOn(process.stdout, "write").mockImplementation(((c: unknown) => {
    chunks.push(String(c));
    return true;
  }) as never);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(((c: unknown) => {
    chunks.push(String(c));
    return true;
  }) as never);
  try {
    const value = await fn();
    return { value, output: chunks.join("\n") };
  } finally {
    for (const s of spies) s.mockRestore();
    out.mockRestore();
    err.mockRestore();
  }
}

/**
 * Replaces the global `fetch` so that the real SDK clients (`realClients`) talk to a
 * scripted fake instead of the network. Records each outbound HTTP request.
 * Call `restore()` afterwards. Any request to a host other than the two fixed provider
 * hosts is answered 599 and recorded, so a test can assert it never happened.
 */
export function stubProviderFetch(reply: (req: { url: string; headers: Headers; body: unknown; signal: AbortSignal | null }) => Response | Promise<Response>) {
  const calls: Array<{ url: string; method: string; headers: Headers; body: unknown; signal: AbortSignal | null }> = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers ?? req.headers);
    const rawBody = init?.body !== undefined ? String(init.body) : await req.text();
    let body: unknown = rawBody;
    try {
      body = JSON.parse(rawBody);
    } catch {
      /* keep raw */
    }
    const signal = init?.signal ?? null;
    calls.push({ url, method: init?.method ?? req.method, headers, body, signal });
    const host = new URL(url).host;
    if (host !== "api.anthropic.com" && host !== "api.openai.com") return new Response("unexpected host", { status: 599 });
    return reply({ url, headers, body, signal });
  }) as typeof fetch;
  vi.stubGlobal("fetch", fake);
  return { calls, restore: () => vi.unstubAllGlobals() };
}

/** One live run of `s` through the client responder, the real route handler, and the given fake SDK clients. */
export async function liveRun(
  s: Scenario,
  instruction: string,
  modelId: string,
  clients: ProviderClients,
  over: { id?: string; key?: string | null; signal?: AbortSignal; timeoutMs?: number } = {},
) {
  const m = model(modelId);
  const route = viaRoute(clients);
  const responder = makeLiveResponder({
    scenario: s,
    provider: m.provider,
    model: m,
    key: { get: () => (over.key === undefined ? keyFor(m.provider) : over.key) },
    fetchImpl: route.fetchImpl,
    signal: over.signal,
    timeoutMs: over.timeoutMs,
  });
  liveSeq += 1;
  const run = await runScenario(s, instruction, responder, liveConfig(m), {
    id: over.id ?? `live-acc-${liveSeq}`,
    createdAt: "2026-10-05T12:00:00.000Z",
    mode: "live",
    responderVersion: LIVE_RESPONDER_VERSION,
  });
  return { run, ...route };
}
let liveSeq = 0;

/**
 * Fake provider that answers per variant: `texts.a` for the Version A input, `texts.b` for Version B,
 * reporting `returned.a` / `returned.b` as the model id (default: one id for both).
 */
export function perVariant(
  s: Scenario,
  texts: { a: string; b: string },
  returned: { a?: string; b?: string } = {},
): Script {
  const inputs = renderInputs(s);
  return (call) => {
    const u = userText(call);
    const v = u === inputs.a ? "a" : u === inputs.b ? "b" : null;
    if (!v) throw new Error("fake provider: unexpected input");
    const id = returned[v] ?? (call.provider === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini-2024-07-18");
    return call.provider === "anthropic" ? anthropicReply(texts[v], { model: id }) : openaiReply(texts[v], { model: id });
  };
}
