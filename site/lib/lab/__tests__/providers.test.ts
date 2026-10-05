import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { afterEach, describe, expect, it } from "vitest";
import { findModel, type LiveModel } from "../models";
import { customHeadersConfigured } from "../server/env-guard";
import {
  callProvider,
  guardedClients,
  makeAnthropicClient,
  makeOpenAIClient,
  type AnthropicLike,
  type OpenAILike,
  type ProviderCall,
  type ProviderClients,
} from "../server/providers";

const KEY = "sk-test-PLACEHOLDER-0000000000";
const HAIKU = findModel("anthropic", "claude-haiku-4-5")!;
const SONNET = findModel("anthropic", "claude-sonnet-5-5")!;
const MINI = findModel("openai", "gpt-4o-mini")!;
const MINI41 = findModel("openai", "gpt-4.1-mini")!;

interface Recorded {
  provider: "anthropic" | "openai";
  key: string;
  body: unknown;
  signal?: AbortSignal;
}

type AnthropicCreate = (body: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
type OpenAICreate = AnthropicCreate;

function fakes(opts: { anthropic?: AnthropicCreate; openai?: OpenAICreate } = {}): { clients: ProviderClients; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const anthropicCreate: AnthropicCreate =
    opts.anthropic ??
    (async () => ({ content: [{ type: "text", text: "Hello " }, { type: "text", text: "there." }], model: "claude-haiku-4-5-20251001", stop_reason: "end_turn" }));
  const openaiCreate: OpenAICreate =
    opts.openai ??
    (async () => ({ model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content: "Hi there.", refusal: null }, finish_reason: "stop" }] }));
  const clients: ProviderClients = {
    anthropic(key) {
      return {
        messages: {
          create: async (body, options) => {
            calls.push({ provider: "anthropic", key, body, signal: options.signal });
            return (await anthropicCreate(body, options)) as never;
          },
        },
      } satisfies AnthropicLike;
    },
    openai(key) {
      return {
        chat: {
          completions: {
            create: async (body, options) => {
              calls.push({ provider: "openai", key, body, signal: options.signal });
              return (await openaiCreate(body, options)) as never;
            },
          },
        },
      } satisfies OpenAILike;
    },
  };
  return { clients, calls };
}

function call(model: LiveModel, signal = new AbortController().signal): ProviderCall {
  return { provider: model.provider, model, apiKey: KEY, system: "SYSTEM INSTRUCTION", user: "USER INPUT", signal };
}

const headers = () => new Headers();

describe("callProvider: request bodies", () => {
  it("Haiku 4.5: system/user split, temperature 0, max_tokens 1024, no thinking", async () => {
    const { clients, calls } = fakes();
    await callProvider(call(HAIKU), clients);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(KEY);
    expect(calls[0].body).toEqual({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: "SYSTEM INSTRUCTION",
      messages: [{ role: "user", content: "USER INPUT" }],
      temperature: 0,
    });
  });

  it("Sonnet 5.5: no temperature, thinking between_tools", async () => {
    const { clients, calls } = fakes();
    await callProvider(call(SONNET), clients);
    const body = calls[0].body as Record<string, unknown>;
    expect(body).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      system: "SYSTEM INSTRUCTION",
      messages: [{ role: "user", content: "USER INPUT" }],
      thinking: { type: "between_tools" },
    });
    expect("temperature" in body).toBe(false);
  });

  it("OpenAI models: system and user messages, temperature 0, max_tokens 1024", async () => {
    for (const m of [MINI, MINI41]) {
      const { clients, calls } = fakes();
      await callProvider(call(m), clients);
      expect(calls[0].provider).toBe("openai");
      expect(calls[0].body).toEqual({
        model: m.id,
        messages: [
          { role: "system", content: "SYSTEM INSTRUCTION" },
          { role: "user", content: "USER INPUT" },
        ],
        max_tokens: 1024,
        temperature: 0,
      });
    }
  });

  it("passes the request's abort signal through", async () => {
    const ac = new AbortController();
    const { clients, calls } = fakes();
    await callProvider(call(HAIKU, ac.signal), clients);
    await callProvider(call(MINI, ac.signal), clients);
    expect(calls.map((c) => c.signal)).toEqual([ac.signal, ac.signal]);
  });
});

describe("callProvider: successful responses", () => {
  it("Anthropic: concatenates text blocks and reports the returned model", async () => {
    const { clients } = fakes({
      anthropic: async () => ({
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "Hello " },
          { type: "text", text: "there." },
        ],
        model: "claude-haiku-4-5-20251001",
        stop_reason: "end_turn",
      }),
    });
    const r = await callProvider(call(HAIKU), clients);
    expect(r).toMatchObject({ status: "ok", text: "Hello there.", returnedModel: "claude-haiku-4-5-20251001", stopReason: "end_turn" });
    expect(typeof r.durationMs).toBe("number");
  });

  it("OpenAI: reads choices[0].message.content (null → empty text)", async () => {
    const ok = await callProvider(call(MINI), fakes().clients);
    expect(ok).toMatchObject({ status: "ok", text: "Hi there.", returnedModel: "gpt-4o-mini-2024-07-18", stopReason: "stop" });
    const nullContent = await callProvider(
      call(MINI),
      fakes({ openai: async () => ({ model: "gpt-4o-mini", choices: [{ message: { content: null }, finish_reason: "stop" }] }) }).clients,
    );
    expect(nullContent).toMatchObject({ status: "ok", text: "" });
  });
});

describe("callProvider: result mapping", () => {
  const TOKEN_LIMIT = "Response cut off at the token limit — not evaluated";
  const REFUSED = "The provider declined to answer (safety system) — not evaluated";

  it("Anthropic max_tokens → token-limit model_error; refusal → provider_refused", async () => {
    const cut = await callProvider(
      call(HAIKU),
      fakes({ anthropic: async () => ({ content: [{ type: "text", text: "partial" }], model: "m", stop_reason: "max_tokens" }) }).clients,
    );
    expect(cut).toMatchObject({ status: "model_error", error: TOKEN_LIMIT });
    expect(cut.text).toBeUndefined();
    const refused = await callProvider(
      call(SONNET),
      fakes({ anthropic: async () => ({ content: [], model: "m", stop_reason: "refusal" }) }).clients,
    );
    expect(refused).toMatchObject({ status: "provider_refused", error: REFUSED, stopReason: "refusal" });
  });

  it("OpenAI length → token-limit model_error; refusal field → provider_refused", async () => {
    const cut = await callProvider(
      call(MINI),
      fakes({ openai: async () => ({ model: "m", choices: [{ message: { content: "partial" }, finish_reason: "length" }] }) }).clients,
    );
    expect(cut).toMatchObject({ status: "model_error", error: TOKEN_LIMIT });
    const refused = await callProvider(
      call(MINI),
      fakes({ openai: async () => ({ model: "m", choices: [{ message: { content: null, refusal: "I can't help with that." }, finish_reason: "stop" }] }) }).clients,
    );
    expect(refused).toMatchObject({ status: "provider_refused", error: REFUSED });
    expect(refused.text).toBeUndefined();
  });

  it("OpenAI finish_reason content_filter → provider_refused", async () => {
    const r = await callProvider(
      call(MINI),
      fakes({ openai: async () => ({ model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content: "partial", refusal: null }, finish_reason: "content_filter" }] }) }).clients,
    );
    expect(r).toMatchObject({ status: "provider_refused", error: REFUSED, stopReason: "content_filter" });
    expect(r.text).toBeUndefined();
  });

  const anthropicErrors: Array<[string, () => unknown, string, string | undefined]> = [
    ["401", () => new Anthropic.AuthenticationError(401, {}, "bad", headers()), "credentials_unavailable", "The provider rejected the API key"],
    ["403", () => new Anthropic.PermissionDeniedError(403, {}, "no", headers()), "credentials_unavailable", "The provider rejected the API key"],
    ["429", () => new Anthropic.RateLimitError(429, {}, "slow", headers()), "model_error", "Rate limited by the provider"],
    ["400", () => new Anthropic.BadRequestError(400, {}, "bad", headers()), "model_error", "The provider rejected the model or request"],
    ["404", () => new Anthropic.NotFoundError(404, {}, "none", headers()), "model_error", "The provider rejected the model or request"],
    ["500", () => new Anthropic.InternalServerError(500, {}, "boom", headers()), "model_error", "Provider unavailable"],
    ["529", () => Anthropic.APIError.generate(529, {}, "overloaded", headers()), "model_error", "Provider unavailable"],
    ["connection", () => new Anthropic.APIConnectionError({ message: "refused" }), "model_error", "Provider unavailable"],
    ["timeout", () => new Anthropic.APIConnectionTimeoutError(), "timeout", undefined],
    ["user abort", () => new Anthropic.APIUserAbortError(), "timeout", undefined],
    ["plain Error", () => new Error("weird"), "model_error", "Provider unavailable"],
    ["non-Error throw", () => "a string", "model_error", "Provider unavailable"],
  ];
  for (const [name, make, status, error] of anthropicErrors) {
    it(`Anthropic ${name} → ${status}`, async () => {
      const r = await callProvider(
        call(HAIKU),
        fakes({
          anthropic: async () => {
            throw make();
          },
        }).clients,
      );
      expect(r.status).toBe(status);
      expect(r.error).toBe(error);
      expect(r.text).toBeUndefined();
    });
  }

  const openaiErrors: Array<[string, () => unknown, string, string | undefined]> = [
    ["401", () => new OpenAI.AuthenticationError(401, {}, "bad", headers()), "credentials_unavailable", "The provider rejected the API key"],
    ["403", () => new OpenAI.PermissionDeniedError(403, {}, "no", headers()), "credentials_unavailable", "The provider rejected the API key"],
    [
      "429 insufficient_quota",
      () => new OpenAI.RateLimitError(429, { code: "insufficient_quota", type: "insufficient_quota" }, "quota", headers()),
      "model_error",
      "The provider account has no remaining quota",
    ],
    ["429", () => new OpenAI.RateLimitError(429, { code: "rate_limit_exceeded" }, "slow", headers()), "model_error", "Rate limited by the provider"],
    ["400", () => new OpenAI.BadRequestError(400, {}, "bad", headers()), "model_error", "The provider rejected the model or request"],
    ["404", () => new OpenAI.NotFoundError(404, {}, "none", headers()), "model_error", "The provider rejected the model or request"],
    ["500", () => new OpenAI.InternalServerError(500, {}, "boom", headers()), "model_error", "Provider unavailable"],
    ["timeout", () => new OpenAI.APIConnectionTimeoutError(), "timeout", undefined],
    ["user abort", () => new OpenAI.APIUserAbortError(), "timeout", undefined],
  ];
  for (const [name, make, status, error] of openaiErrors) {
    it(`OpenAI ${name} → ${status}`, async () => {
      const r = await callProvider(
        call(MINI),
        fakes({
          openai: async () => {
            throw make();
          },
        }).clients,
      );
      expect(r.status).toBe(status);
      expect(r.error).toBe(error);
    });
  }

  it("an error whose message and body contain the key never leaks any part of it", async () => {
    const leaky = [
      () => new Anthropic.AuthenticationError(401, { error: { message: `invalid x-api-key ${KEY}` } }, `invalid x-api-key ${KEY}`, headers()),
      () => new Anthropic.BadRequestError(400, { error: { message: KEY } }, KEY, headers()),
      () => new Error(`network failure for ${KEY}`),
      () => KEY,
    ];
    for (const make of leaky) {
      for (const [m, kind] of [
        [HAIKU, "anthropic"],
        [MINI, "openai"],
      ] as const) {
        const thrower = async () => {
          throw make();
        };
        const r = await callProvider(call(m), fakes({ [kind]: thrower }).clients);
        const json = JSON.stringify(r);
        expect(json).not.toContain("PLACEHOLDER");
        expect(json).not.toContain("sk-test");
      }
    }
  });

  it("an aborted request maps to timeout even when the client throws a generic error", async () => {
    const ac = new AbortController();
    const waiting = (_body: unknown, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const pending = callProvider(call(HAIKU, ac.signal), fakes({ anthropic: waiting }).clients);
    ac.abort();
    expect((await pending).status).toBe("timeout");
  });

  it("a malformed provider response maps to model_error without throwing", async () => {
    const r1 = await callProvider(call(HAIKU), fakes({ anthropic: async () => null }).clients);
    expect(r1).toMatchObject({ status: "model_error", error: "Provider unavailable" });
    const r2 = await callProvider(call(MINI), fakes({ openai: async () => ({ model: "m", choices: [] }) }).clients);
    expect(r2).toMatchObject({ status: "model_error", error: "Provider unavailable" });
  });

  it("drops an implausible returned model id", async () => {
    const r = await callProvider(
      call(HAIKU),
      fakes({ anthropic: async () => ({ content: [{ type: "text", text: "x" }], model: "m".repeat(200), stop_reason: "end_turn" }) }).clients,
    );
    expect(r.status).toBe("ok");
    expect(r.returnedModel).toBeUndefined();
  });
});

describe("real SDK clients ignore server environment configuration", () => {
  const ENV = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_LOG",
    "OPENAI_BASE_URL",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
    "OPENAI_ADMIN_KEY",
    "OPENAI_LOG",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV) saved[k] = process.env[k];
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("Anthropic: fixed base URL, no env auth token, no retries, 30 s timeout, logging off", () => {
    process.env.ANTHROPIC_BASE_URL = "https://evil.example";
    process.env.ANTHROPIC_AUTH_TOKEN = "server-token";
    process.env.ANTHROPIC_API_KEY = "server-key";
    process.env.ANTHROPIC_LOG = "debug";
    const c = makeAnthropicClient(KEY);
    expect(c.baseURL).toBe("https://api.anthropic.com");
    expect(c.apiKey).toBe(KEY);
    expect(c.authToken).toBeNull();
    expect(c.maxRetries).toBe(0);
    expect(c.timeout).toBe(30_000);
    expect(c.logLevel).toBe("off");
  });

  it("OpenAI: fixed base URL, no env organization/project/admin key, no retries, 30 s timeout, logging off", () => {
    process.env.OPENAI_BASE_URL = "https://evil.example/v1";
    process.env.OPENAI_ORG_ID = "org-server";
    process.env.OPENAI_PROJECT_ID = "proj-server";
    process.env.OPENAI_ADMIN_KEY = "admin-server";
    process.env.OPENAI_LOG = "debug";
    const c = makeOpenAIClient(KEY);
    expect(c.baseURL).toBe("https://api.openai.com/v1");
    expect(c.apiKey).toBe(KEY);
    expect(c.adminAPIKey).toBeNull();
    expect(c.organization).toBeNull();
    expect(c.project).toBeNull();
    expect(c.maxRetries).toBe(0);
    expect(c.timeout).toBe(30_000);
    expect(c.logLevel).toBe("off");
  });
});

describe("custom-header env vars fail closed", () => {
  const VARS = ["ANTHROPIC_CUSTOM_HEADERS", "OPENAI_CUSTOM_HEADERS"] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of VARS) saved[k] = process.env[k];
  afterEach(() => {
    for (const k of VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("customHeadersConfigured is true only for a non-empty value", () => {
    for (const k of VARS) delete process.env[k];
    expect(customHeadersConfigured()).toBe(false);
    process.env.ANTHROPIC_CUSTOM_HEADERS = "   ";
    expect(customHeadersConfigured()).toBe(false);
    process.env.OPENAI_CUSTOM_HEADERS = "X-Debug: 1";
    expect(customHeadersConfigured()).toBe(true);
  });

  for (const v of VARS) {
    it(`with ${v} set, no client is built or called for either provider`, async () => {
      for (const k of VARS) delete process.env[k];
      process.env[v] = "X-Forwarded-Key: leak";
      for (const m of [HAIKU, MINI]) {
        let built = 0;
        const { clients, calls } = fakes();
        const counting: ProviderClients = {
          anthropic: (k) => (built++, clients.anthropic(k)),
          openai: (k) => (built++, clients.openai(k)),
        };
        const r = await callProvider(call(m), guardedClients(counting));
        expect(r).toMatchObject({ status: "model_error", error: "Provider unavailable" });
        expect(built).toBe(0);
        expect(calls).toEqual([]);
      }
    });
  }

  it("with neither set, guarded clients pass through", async () => {
    for (const k of VARS) delete process.env[k];
    const { clients, calls } = fakes();
    expect((await callProvider(call(HAIKU), guardedClients(clients))).status).toBe("ok");
    expect(calls).toHaveLength(1);
  });
});
