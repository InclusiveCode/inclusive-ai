import { describe, expect, it } from "vitest";
import { CLIENT_MESSAGES } from "../live-messages";
import { KEY_PROBLEM_MESSAGE } from "../live-key";
import { LIVE_MODELS } from "../models";
import { promptTestReportJson, promptTestStartProblem, runPromptTest } from "../prompt-test";
import { LIVE_RESPONDER_VERSION, liveConfig, makeLiveResponder } from "../run";
import { getSuite } from "../suites";

const ANTHROPIC_KEY = "sk-ant-test-PLACEHOLDER-NotRealAbcdefghij";
const OPENAI_KEY = "sk-test-PLACEHOLDER-NotRealKlmnopqrst";

describe("promptTestStartProblem: nothing is sent unless every start check passes", () => {
  it("asks for a prompt first", () => {
    expect(promptTestStartProblem("   ", ANTHROPIC_KEY, "anthropic")).toEqual({ field: "prompt", message: "Paste the system prompt you want to test." });
  });

  it("asks for a key, then a well-formed key for the selected provider", () => {
    expect(promptTestStartProblem("P", null, "anthropic")).toEqual({ field: "key", message: CLIENT_MESSAGES.noKey });
    expect(promptTestStartProblem("P", "", "anthropic")).toEqual({ field: "key", message: CLIENT_MESSAGES.noKey });
    expect(promptTestStartProblem("P", "short", "anthropic")).toEqual({ field: "key", message: KEY_PROBLEM_MESSAGE.format });
    expect(promptTestStartProblem("P", OPENAI_KEY, "anthropic")).toEqual({ field: "key", message: KEY_PROBLEM_MESSAGE.provider });
  });

  it("refuses a prompt that contains the key, so the key never reaches the result or the report", () => {
    expect(promptTestStartProblem(`You are helpful. ${ANTHROPIC_KEY}`, ANTHROPIC_KEY, "anthropic")).toEqual({
      field: "prompt",
      message: `${CLIENT_MESSAGES.keyInInstruction}.`,
    });
  });

  it("lets a valid test start", () => {
    expect(promptTestStartProblem("You are helpful.", ANTHROPIC_KEY, "anthropic")).toBeNull();
  });
});

describe("the downloaded report never contains the key", () => {
  it("a live test sends the key only in the Authorization header, and the JSON report omits it", async () => {
    const model = LIVE_MODELS.find((m) => m.provider === "anthropic")!;
    const suite = getSuite("healthcare");
    const auth: string[] = [];
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      auth.push(new Headers(init.headers).get("authorization") ?? "");
      bodies.push(String(init.body));
      return Response.json({ status: "ok", text: "Thanks! I can help with that.", durationMs: 1, returnedModel: model.id });
    }) as unknown as typeof fetch;
    const out = await runPromptTest({
      instruction: "You are a helpful patient-portal assistant.",
      scenarios: suite.scenarios,
      suiteId: suite.id,
      responderFor: (s) => makeLiveResponder({ scenario: s, provider: "anthropic", model, key: { get: () => ANTHROPIC_KEY }, fetchImpl }),
      config: liveConfig(model),
      mode: "live",
      responderVersion: LIVE_RESPONDER_VERSION,
      testId: "t",
      createdAt: "2026-10-07T00:00:00.000Z",
    });
    expect(auth).toHaveLength(suite.scenarios.length * 2);
    expect(auth.every((a) => a === `Bearer ${ANTHROPIC_KEY}`)).toBe(true);
    expect(bodies.some((b) => b.includes(ANTHROPIC_KEY))).toBe(false);
    const json = promptTestReportJson(out);
    expect(json).not.toContain(ANTHROPIC_KEY);
    expect(json).not.toContain("PLACEHOLDER");
  });
});
