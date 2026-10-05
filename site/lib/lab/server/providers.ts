import "server-only";

/**
 * Server-only provider adapters for live runs (spec §2–§3, decisions D21, D22, D26).
 *
 * Key handling: the user's key arrives as `apiKey`, goes straight into the SDK
 * constructor, and is never logged, returned, or included in any message.
 * Errors are mapped by SDK error class and status/code, never by message text.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { LiveModel, Provider } from "../models";
import type { ResponseStatus } from "../types";

export interface ProviderCall {
  provider: Provider;
  model: LiveModel;
  apiKey: string;
  system: string;
  user: string;
  signal: AbortSignal;
}

export interface ProviderResult {
  status: ResponseStatus;
  text?: string;
  error?: string;
  returnedModel?: string;
  stopReason?: string;
  durationMs: number;
}

type AnthropicResponse = Pick<Anthropic.Message, "content" | "model" | "stop_reason">;
type OpenAIResponse = Pick<OpenAI.ChatCompletion, "model" | "choices">;

/** Minimal structural interfaces so tests can inject fake clients. */
export interface AnthropicLike {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming, options: { signal: AbortSignal }): Promise<AnthropicResponse>;
  };
}
export interface OpenAILike {
  chat: {
    completions: {
      create(body: OpenAI.ChatCompletionCreateParamsNonStreaming, options: { signal: AbortSignal }): Promise<OpenAIResponse>;
    };
  };
}
export interface ProviderClients {
  anthropic(apiKey: string): AnthropicLike;
  openai(apiKey: string): OpenAILike;
}

const SERVER_TIMEOUT_MS = 30_000;

/**
 * Every option is explicit so nothing comes from the server environment:
 * no env base URL, auth token, organization, project, admin key, or log level.
 */
export function makeAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: "https://api.anthropic.com",
    maxRetries: 0,
    timeout: SERVER_TIMEOUT_MS,
    logLevel: "off",
  });
}

export function makeOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    adminAPIKey: null,
    organization: null,
    project: null,
    webhookSecret: null,
    baseURL: "https://api.openai.com/v1",
    maxRetries: 0,
    timeout: SERVER_TIMEOUT_MS,
    logLevel: "off",
  });
}

export const realClients: ProviderClients = {
  anthropic(apiKey) {
    const client = makeAnthropicClient(apiKey);
    return { messages: { create: (body, options) => client.messages.create(body, options) } };
  },
  openai(apiKey) {
    const client = makeOpenAIClient(apiKey);
    return { chat: { completions: { create: (body, options) => client.chat.completions.create(body, options) } } };
  },
};

const MSG = {
  tokenLimit: "Response cut off at the token limit — not evaluated",
  refused: "The provider declined to answer (safety system) — not evaluated",
  badKey: "The provider rejected the API key",
  rateLimited: "Rate limited by the provider",
  noQuota: "The provider account has no remaining quota",
  rejected: "The provider rejected the model or request",
  unavailable: "Provider unavailable",
} as const;

/** Returned model ids and stop reasons are short identifiers; anything else is dropped. */
function identifier(x: unknown): string | undefined {
  return typeof x === "string" && /^[A-Za-z0-9._:/@-]{1,100}$/.test(x) ? x : undefined;
}

interface SdkErrors {
  APIUserAbortError: abstract new (...args: never[]) => unknown;
  APIConnectionTimeoutError: abstract new (...args: never[]) => unknown;
  AuthenticationError: abstract new (...args: never[]) => unknown;
  PermissionDeniedError: abstract new (...args: never[]) => unknown;
  RateLimitError: abstract new (...args: never[]) => unknown;
  BadRequestError: abstract new (...args: never[]) => unknown;
  NotFoundError: abstract new (...args: never[]) => unknown;
}

function mapError(err: unknown, sdk: SdkErrors, signal: AbortSignal, durationMs: number): ProviderResult {
  if (signal.aborted || err instanceof sdk.APIUserAbortError || err instanceof sdk.APIConnectionTimeoutError) {
    return { status: "timeout", durationMs };
  }
  if (err instanceof sdk.AuthenticationError || err instanceof sdk.PermissionDeniedError) {
    return { status: "credentials_unavailable", error: MSG.badKey, durationMs };
  }
  if (err instanceof sdk.RateLimitError) {
    const e = err as { code?: unknown; type?: unknown };
    const quota = e.code === "insufficient_quota" || e.type === "insufficient_quota";
    return { status: "model_error", error: quota ? MSG.noQuota : MSG.rateLimited, durationMs };
  }
  if (err instanceof sdk.BadRequestError || err instanceof sdk.NotFoundError) {
    return { status: "model_error", error: MSG.rejected, durationMs };
  }
  return { status: "model_error", error: MSG.unavailable, durationMs };
}

async function callAnthropic(call: ProviderCall, client: AnthropicLike, started: number): Promise<ProviderResult> {
  const { model } = call;
  const body: Anthropic.MessageCreateParamsNonStreaming = {
    model: model.id,
    max_tokens: model.maxTokens,
    system: call.system,
    messages: [{ role: "user", content: call.user }],
  };
  if (model.sampling) body.temperature = 0;
  if (model.anthropicThinking) body.thinking = { ...model.anthropicThinking };
  const res = await client.messages.create(body, { signal: call.signal });
  const durationMs = Math.round(performance.now() - started);
  if (!res || !Array.isArray(res.content)) return { status: "model_error", error: MSG.unavailable, durationMs };
  const meta = { returnedModel: identifier(res.model), stopReason: identifier(res.stop_reason), durationMs };
  if (res.stop_reason === "max_tokens") return { status: "model_error", error: MSG.tokenLimit, ...meta };
  if (res.stop_reason === "refusal") return { status: "provider_refused", error: MSG.refused, ...meta };
  const text = res.content.map((b) => (b && b.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
  return { status: "ok", text, ...meta };
}

async function callOpenAI(call: ProviderCall, client: OpenAILike, started: number): Promise<ProviderResult> {
  const { model } = call;
  const body: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: model.id,
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: call.user },
    ],
    max_tokens: model.maxTokens,
  };
  if (model.sampling) body.temperature = 0;
  const res = await client.chat.completions.create(body, { signal: call.signal });
  const durationMs = Math.round(performance.now() - started);
  const choice = res && Array.isArray(res.choices) ? res.choices[0] : undefined;
  if (!choice || !choice.message) return { status: "model_error", error: MSG.unavailable, durationMs };
  const meta = { returnedModel: identifier(res.model), stopReason: identifier(choice.finish_reason), durationMs };
  const refusal = choice.message.refusal;
  if ((typeof refusal === "string" && refusal.length > 0) || choice.finish_reason === "content_filter") {
    return { status: "provider_refused", error: MSG.refused, ...meta };
  }
  if (choice.finish_reason === "length") return { status: "model_error", error: MSG.tokenLimit, ...meta };
  const content = choice.message.content;
  return { status: "ok", text: typeof content === "string" ? content : "", ...meta };
}

/** Calls the provider for one variant. Never throws; every failure maps to a fixed result. */
export async function callProvider(call: ProviderCall, clients: ProviderClients): Promise<ProviderResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  if (call.provider === "anthropic") {
    try {
      return await callAnthropic(call, clients.anthropic(call.apiKey), started);
    } catch (err) {
      return mapError(err, Anthropic, call.signal, elapsed());
    }
  }
  try {
    return await callOpenAI(call, clients.openai(call.apiKey), started);
  } catch (err) {
    return mapError(err, OpenAI, call.signal, elapsed());
  }
}
