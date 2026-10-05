import { describe, expect, it } from "vitest";
import { API_KEY_PATTERN, checkKey, KEY_PROBLEM_MESSAGE } from "../live-key";

const ANTHROPIC_KEY = "sk-ant-test-PLACEHOLDER-0000000000";
const OPENAI_KEY = "sk-test-PLACEHOLDER-0000000000";

describe("checkKey (shared by the client and the server)", () => {
  it("accepts a well-formed key for the matching provider", () => {
    expect(checkKey(ANTHROPIC_KEY, "anthropic")).toBeNull();
    expect(checkKey(OPENAI_KEY, "openai")).toBeNull();
  });

  it("rejects a key whose prefix does not match the selected provider", () => {
    expect(checkKey(OPENAI_KEY, "anthropic")).toBe("provider");
    expect(checkKey(ANTHROPIC_KEY, "openai")).toBe("provider");
  });

  it("rejects malformed keys before looking at the provider", () => {
    for (const bad of [
      "",
      "short",
      "sk-ant-test PLACEHOLDER-0000000000",
      "sk-ant-test\tPLACEHOLDER-0000000000",
      "sk-ant-test-PLACEHOLDER-000000000​",
      "sk-ant-tést-PLACEHOLDER-0000000000",
      `sk-ant-${"a".repeat(260)}`,
      " sk-ant-test-PLACEHOLDER-0000000000",
    ]) {
      expect(checkKey(bad, "anthropic"), JSON.stringify(bad)).toBe("format");
      expect(checkKey(bad, "openai"), JSON.stringify(bad)).toBe("format");
    }
  });

  it("uses the server's pattern and fixed, key-free messages", () => {
    expect(API_KEY_PATTERN.source).toBe("^[A-Za-z0-9_-]{20,256}$");
    expect(KEY_PROBLEM_MESSAGE).toEqual({
      format: "The API key format is not valid — keys are 20–256 characters long and contain only letters, numbers, hyphens and underscores, with no spaces",
      provider: "This key does not match the selected provider — check the provider or paste that provider's key",
    });
  });
});
