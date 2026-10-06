import { describe, expect, it } from "vitest";
import { findModel, LIVE_MODELS, LIVE_RESPONDER_VERSION, PROVIDER_LABEL } from "../models";

describe("live model allowlist", () => {
  it("ships exactly the four approved models with their per-model parameters", () => {
    expect(LIVE_MODELS).toEqual([
      { id: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", sampling: true, maxTokens: 1024 },
      {
        id: "claude-sonnet-5-5",
        provider: "anthropic",
        label: "Claude Sonnet 5.5",
        sampling: false,
        maxTokens: 1024,
        anthropicThinking: { type: "between_tools" },
      },
      { id: "gpt-4o-mini", provider: "openai", label: "GPT-4o mini", sampling: true, maxTokens: 1024 },
      { id: "gpt-4.1-mini", provider: "openai", label: "GPT-4.1 mini", sampling: true, maxTokens: 1024 },
    ]);
  });

  it("only Anthropic models carry an Anthropic thinking setting", () => {
    for (const m of LIVE_MODELS) {
      if (m.anthropicThinking) expect(m.provider).toBe("anthropic");
    }
  });

  it("labels both providers", () => {
    expect(PROVIDER_LABEL).toEqual({ anthropic: "Anthropic", openai: "OpenAI" });
  });

  it("findModel accepts only allowlisted provider and model pairs", () => {
    expect(findModel("anthropic", "claude-haiku-4-5")?.id).toBe("claude-haiku-4-5");
    expect(findModel("openai", "gpt-4.1-mini")?.id).toBe("gpt-4.1-mini");
    expect(findModel("openai", "claude-haiku-4-5")).toBeUndefined();
    expect(findModel("anthropic", "gpt-4o-mini")).toBeUndefined();
    expect(findModel("anthropic", "claude-opus-5-5")).toBeUndefined();
    expect(findModel("openai", "gpt-5-mini")).toBeUndefined();
    expect(findModel("", "")).toBeUndefined();
    expect(findModel("__proto__", "constructor")).toBeUndefined();
    expect(findModel("Anthropic", "claude-haiku-4-5")).toBeUndefined();
  });

  it("names the live responder version", () => {
    expect(LIVE_RESPONDER_VERSION).toBe("live-adapter-v1");
  });
});
