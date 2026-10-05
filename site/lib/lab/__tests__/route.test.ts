import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderInputs } from "../render";
import { getScenario } from "../scenarios";
import { createHandler } from "../server/handler";
import type { AnthropicLike, OpenAILike, ProviderClients } from "../server/providers";

const SITE = resolve(__dirname, "../../..");
const ROUTE_FILE = join(SITE, "app/api/lab/run/route.ts");
// Placeholder keys only. Anthropic keys start with sk-ant-; the route checks the prefix against the provider.
const KEY = "sk-ant-test-PLACEHOLDER-0000000000";
const OPENAI_KEY = "sk-test-PLACEHOLDER-0000000000";

interface Seen {
  key: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}

function fakeClients(behavior?: (signal: AbortSignal) => Promise<unknown>): { clients: ProviderClients; seen: Seen[] } {
  const seen: Seen[] = [];
  const anthropicReply = { content: [{ type: "text", text: "Happy to help." }], model: "claude-haiku-4-5-20251001", stop_reason: "end_turn" };
  const openaiReply = { model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content: "Happy to help." }, finish_reason: "stop" }] };
  const clients: ProviderClients = {
    anthropic(key) {
      return {
        messages: {
          create: async (body, { signal }) => {
            seen.push({ key, body: body as unknown as Record<string, unknown>, signal });
            return (behavior ? await behavior(signal) : anthropicReply) as never;
          },
        },
      } satisfies AnthropicLike;
    },
    openai(key) {
      return {
        chat: {
          completions: {
            create: async (body, { signal }) => {
              seen.push({ key, body: body as unknown as Record<string, unknown>, signal });
              return (behavior ? await behavior(signal) : openaiReply) as never;
            },
          },
        },
      } satisfies OpenAILike;
    },
  };
  return { clients, seen };
}

const VALID = {
  scenarioId: "spouse-parity",
  scenarioVersion: "1",
  variant: "b",
  instruction: "You are a helpful support assistant.",
  provider: "anthropic",
  model: "claude-haiku-4-5",
};

function request(
  body: unknown,
  opts: { headers?: Record<string, string | null>; method?: string; raw?: string; signal?: AbortSignal } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${KEY}` };
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    if (v === null) delete headers[k];
    else headers[k] = v;
  }
  const method = opts.method ?? "POST";
  return new Request("http://localhost/api/lab/run", {
    method,
    headers,
    body: method === "GET" ? undefined : (opts.raw ?? JSON.stringify(body)),
    signal: opts.signal,
  });
}

async function send(req: Request, clients = fakeClients().clients) {
  const res = await createHandler({ clients })(req);
  const text = await res.text();
  return { res, text, json: JSON.parse(text) as Record<string, unknown> };
}

function expectRejected(r: { res: Response; text: string; json: Record<string, unknown> }, code: number) {
  expect(r.res.status).toBe(code);
  expect(r.res.headers.get("cache-control")).toBe("no-store");
  expect(Object.keys(r.json).sort()).toEqual(["message", "status"]);
  expect(typeof r.json.message).toBe("string");
  expect(r.text).not.toContain("PLACEHOLDER");
}

describe("live route: request checks (each before any provider call)", () => {
  it("405 for a method other than POST, with Allow: POST", async () => {
    const { clients, seen } = fakeClients();
    const r = await send(request(null, { method: "GET" }), clients);
    expectRejected(r, 405);
    expect(r.res.headers.get("allow")).toBe("POST");
    expect(seen).toEqual([]);
  });

  it("415 unless the content type is application/json", async () => {
    for (const ct of [null, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      const { clients, seen } = fakeClients();
      expectRejected(await send(request(VALID, { headers: { "content-type": ct } }), clients), 415);
      expect(seen).toEqual([]);
    }
    const ok = await send(request(VALID, { headers: { "content-type": "application/json; charset=utf-8" } }));
    expect(ok.res.status).toBe(200);
  });

  it("413 when content-length is over 16 384", async () => {
    const { clients, seen } = fakeClients();
    expectRejected(await send(request(VALID, { headers: { "content-length": "16385" } }), clients), 413);
    expect(seen).toEqual([]);
  });

  it("413 when the measured body is over 16 384 bytes", async () => {
    const { clients, seen } = fakeClients();
    const big = JSON.stringify({ ...VALID, padding: "x".repeat(17_000) });
    expectRejected(await send(request(null, { raw: big }), clients), 413);
    expect(seen).toEqual([]);
  });

  it("400 when the body is not JSON", async () => {
    for (const raw of ["{", "not json", "", "￿{"]) {
      expectRejected(await send(request(null, { raw })), 400);
    }
  });

  it("400 for schema violations", async () => {
    const bad: unknown[] = [
      null,
      [],
      "text",
      { ...VALID, scenarioId: "nope" },
      { ...VALID, scenarioId: undefined },
      { ...VALID, variant: "c" },
      { ...VALID, variant: undefined },
      { ...VALID, instruction: 42 },
      { ...VALID, instruction: "x".repeat(4001) },
      { ...VALID, provider: "openai" },
      { ...VALID, model: "claude-opus-5-5" },
      { ...VALID, provider: "other", model: "gpt-4o-mini" },
      { ...VALID, provider: undefined },
    ];
    for (const body of bad) {
      const { clients, seen } = fakeClients();
      expectRejected(await send(request(body), clients), 400);
      expect(seen).toEqual([]);
    }
  });

  it("accepts an empty instruction and one of exactly 4000 characters", async () => {
    expect((await send(request({ ...VALID, instruction: "" }))).res.status).toBe(200);
    expect((await send(request({ ...VALID, instruction: "x".repeat(4000) }))).res.status).toBe(200);
  });

  it("409 when the scenario version does not match the server's", async () => {
    for (const v of ["0", "2", 1, undefined]) {
      const { clients, seen } = fakeClients();
      expectRejected(await send(request({ ...VALID, scenarioVersion: v }), clients), 409);
      expect(seen).toEqual([]);
    }
  });

  it("409 follows each scenario's current version", async () => {
    const stale = await send(request({ ...VALID, scenarioId: "disclosure-boundary", scenarioVersion: "1" }));
    expectRejected(stale, 409);
    const current = await send(request({ ...VALID, scenarioId: "disclosure-boundary", scenarioVersion: "2" }));
    expect(current.res.status).toBe(200);
  });

  it("400 with the fixed malformed-key message (and a correction hint) for a missing or malformed key, never echoing it", async () => {
    const bad: Array<string | null> = [
      null,
      "",
      `Basic ${KEY}`,
      `bearer ${KEY}`,
      `Bearer  ${KEY}`,
      "Bearer short",
      `Bearer sk-ant-test\tPLACEHOLDER-0000000000`, // internal whitespace (trailing ASCII spaces are stripped by Headers itself)
      `Bearer sk-test PLACEHOLDER-0000000000`,
      `Bearer sk-ant-tést-PLACEHOLDER-000000000`,
      `Bearer ${"a".repeat(257)}`,
      `Bearer ${KEY} `,
    ];
    for (const auth of bad) {
      const { clients, seen } = fakeClients();
      let r: Awaited<ReturnType<typeof send>>;
      try {
        r = await send(request(VALID, { headers: { authorization: auth } }), clients);
      } catch {
        continue; // the Headers class itself rejects some values; nothing reaches the handler
      }
      expectRejected(r, 400);
      expect(r.json.message).toBe("Missing or malformed API key — keys contain only letters, numbers, hyphens and underscores, with no spaces");
      if (auth) expect(r.text).not.toContain(auth.slice(7, 20));
      expect(seen).toEqual([]);
    }
  });

  it("400 when the key does not match the selected provider, in both directions, without calling the provider", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [VALID, OPENAI_KEY], // Anthropic selected, OpenAI-style key
      [{ ...VALID, provider: "openai", model: "gpt-4o-mini" }, KEY], // OpenAI selected, Anthropic key
    ];
    for (const [body, key] of cases) {
      const { clients, seen } = fakeClients();
      const r = await send(request(body, { headers: { authorization: `Bearer ${key}` } }), clients);
      expectRejected(r, 400);
      expect(r.json.message).toBe("This key does not match the selected provider — check the provider or paste that provider's key");
      expect(r.text).not.toContain("PLACEHOLDER");
      expect(seen).toEqual([]);
    }
  });

  it("400 when the instruction contains the key, without calling the provider", async () => {
    const { clients, seen } = fakeClients();
    const r = await send(request({ ...VALID, instruction: `Use ${KEY} for auth.` }), clients);
    expectRejected(r, 400);
    expect(r.json.message).toBe("Your instruction contains your API key — remove it before running");
    expect(r.text).not.toContain("PLACEHOLDER");
    expect(seen).toEqual([]);
  });
});

describe("live route: forwarding", () => {
  it("renders the input on the server and ignores a client-sent input", async () => {
    const s = getScenario("spouse-parity");
    const { clients, seen } = fakeClients();
    const r = await send(request({ ...VALID, input: "INJECTED CLIENT INPUT", system: "INJECTED" }), clients);
    expect(r.res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].key).toBe(KEY);
    expect(seen[0].body.system).toBe(VALID.instruction);
    expect(seen[0].body.messages).toEqual([{ role: "user", content: renderInputs(s).b }]);
    expect(JSON.stringify(seen[0].body)).not.toContain("INJECTED");
  });

  it("returns the provider result as JSON with no-store and without the key", async () => {
    const r = await send(request({ ...VALID, variant: "a" }));
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get("cache-control")).toBe("no-store");
    expect(r.res.headers.get("content-type")).toContain("application/json");
    expect(r.res.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.json).toMatchObject({ status: "ok", text: "Happy to help.", returnedModel: "claude-haiku-4-5-20251001" });
    expect(typeof r.json.durationMs).toBe("number");
    expect(r.text).not.toContain("PLACEHOLDER");
    expect(r.text).not.toMatch(/API_KEY|process\.env/);
  });

  it("routes OpenAI requests to the OpenAI client", async () => {
    const { clients, seen } = fakeClients();
    const r = await send(
      request({ ...VALID, provider: "openai", model: "gpt-4.1-mini" }, { headers: { authorization: `Bearer ${OPENAI_KEY}` } }),
      clients,
    );
    expect(r.json.status).toBe("ok");
    expect(seen[0].body.model).toBe("gpt-4.1-mini");
  });

  it("a provider error that quotes the key returns only the fixed message", async () => {
    const { clients } = fakeClients(async () => {
      throw new Error(`401 invalid x-api-key ${KEY}`);
    });
    const r = await send(request(VALID), clients);
    expect(r.res.status).toBe(200);
    expect(r.json).toMatchObject({ status: "model_error", error: "Provider unavailable" });
    expect(r.text).not.toContain("PLACEHOLDER");
  });

  it("honors the request's abort signal", async () => {
    const ac = new AbortController();
    const { clients, seen } = fakeClients(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const pending = send(request(VALID, { signal: ac.signal }), clients);
    await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    const r = await pending;
    expect(seen[0].signal.aborted).toBe(true);
    expect(r.json.status).toBe("timeout");
  });

  it("an unexpected failure returns 500 'Internal error' and nothing else", async () => {
    const broken = {
      method: "POST",
      headers: {
        get() {
          throw new Error(`boom ${KEY}`);
        },
      },
    } as unknown as Request;
    const r = await send(broken);
    expect(r.res.status).toBe(500);
    expect(r.json).toEqual({ status: "model_error", message: "Internal error" });
    expect(r.res.headers.get("cache-control")).toBe("no-store");
    expect(r.text).not.toContain("PLACEHOLDER");
  });
});

describe("live route module", () => {
  it("exports POST, the Node runtime, and maxDuration 60", async () => {
    const mod = (await import("../../../app/api/lab/run/route")) as Record<string, unknown>;
    expect(typeof mod.POST).toBe("function");
    expect(mod.runtime).toBe("nodejs");
    expect(mod.maxDuration).toBe(60);
  });

  it("answers OPTIONS with 204, Allow: POST, OPTIONS, no-store, and no CORS headers", async () => {
    const mod = (await import("../../../app/api/lab/run/route")) as Record<string, unknown>;
    const options = mod.OPTIONS as ((req: Request) => Promise<Response>) | undefined;
    expect(typeof options).toBe("function");
    const res = await options!(
      new Request("http://localhost/api/lab/run", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect([...res.headers.keys()].filter((k) => k.toLowerCase().startsWith("access-control-"))).toEqual([]);
    expect(await res.text()).toBe("");
  });

  it("answers GET, HEAD, PUT, PATCH, and DELETE with the fixed 405 JSON, Allow: POST, and no-store", async () => {
    const mod = (await import("../../../app/api/lab/run/route")) as Record<string, unknown>;
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE"]) {
      const handler = mod[method] as ((req: Request) => Promise<Response>) | undefined;
      expect(typeof handler, method).toBe("function");
      const res = await handler!(new Request("http://localhost/api/lab/run", { method }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ status: "model_error", message: "Method not allowed" });
    }
  });

  it("reads no environment variables and never logs", () => {
    const src = readFileSync(ROUTE_FILE, "utf8");
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/console\./);
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("source hygiene for the lab library, server modules, and route", () => {
  const files = [...sourceFiles(join(SITE, "lib/lab")), ...sourceFiles(join(SITE, "app/api/lab"))];

  it("finds the files it scans, including the server modules", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("server/providers.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("server/handler.ts"))).toBe(true);
  });

  it("has no console calls, browser storage, raw HTML injection, or env reads", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/console\./);
      expect(src, f).not.toMatch(/localStorage|sessionStorage/);
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML/);
      // env-guard.ts is the one lab module allowed to read the environment (it only checks *_CUSTOM_HEADERS).
      if (!f.endsWith("/lib/lab/server/env-guard.ts")) expect(src, f).not.toMatch(/process\.env/);
    }
  });

  it("env-guard.ts reads only the two custom-header variables", () => {
    const src = readFileSync(join(SITE, "lib/lab/server/env-guard.ts"), "utf8");
    const reads = src.match(/process\.env(?:\.[A-Z_]+|\[[^\]]+\])?/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r).toBe("process.env");
    expect(src).toMatch(/ANTHROPIC_CUSTOM_HEADERS/);
    expect(src).toMatch(/OPENAI_CUSTOM_HEADERS/);
    expect(src.match(/[A-Z][A-Z0-9]*_[A-Z0-9_]+/g)?.filter((n) => !/_CUSTOM_HEADERS$/.test(n)) ?? []).toEqual([]);
  });

  it("server modules are marked server-only", () => {
    for (const f of files.filter((x) => x.includes("/lib/lab/server/"))) {
      expect(readFileSync(f, "utf8").startsWith('import "server-only";'), f).toBe(true);
    }
  });
});
