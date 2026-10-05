/**
 * Server-owned allowlist of live models (spec §2, decision D26).
 * Per-model parameters are fixed here; bump LIVE_RESPONDER_VERSION whenever they change.
 */

export type Provider = "anthropic" | "openai";

export interface LiveModel {
  id: string;
  provider: Provider;
  label: string;
  /** true → send temperature 0; false → omit temperature (the model rejects non-default values). */
  sampling: boolean;
  maxTokens: number;
  /** Anthropic only: thinking setting sent with every request. */
  anthropicThinking?: { type: "between_tools" };
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

export const LIVE_MODELS: LiveModel[] = [
  { id: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", sampling: true, maxTokens: 1024 },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    sampling: false,
    maxTokens: 1024,
    // Turns thinking off on this model; valid at the default effort.
    anthropicThinking: { type: "between_tools" },
  },
  { id: "gpt-4o-mini", provider: "openai", label: "GPT-4o mini", sampling: true, maxTokens: 1024 },
  { id: "gpt-4.1-mini", provider: "openai", label: "GPT-4.1 mini", sampling: true, maxTokens: 1024 },
];

/** Anthropic keys start with this prefix; OpenAI keys never do. */
const ANTHROPIC_KEY_PREFIX = "sk-ant-";

/** Whether a key has the shape of the given provider's keys (a guard, not a validity check). */
export function keyMatchesProvider(key: string, provider: Provider): boolean {
  const anthropicShaped = key.startsWith(ANTHROPIC_KEY_PREFIX);
  return provider === "anthropic" ? anthropicShaped : !anthropicShaped;
}

/** The allowlisted model for this exact provider and id, or undefined. */
export function findModel(provider: string, id: string): LiveModel | undefined {
  return LIVE_MODELS.find((m) => m.provider === provider && m.id === id);
}

export const LIVE_RESPONDER_VERSION = "live-adapter-v1";
