import { describe, expect, it } from "vitest";
import {
  applyFixes,
  CHECK_FIXES,
  PROMPT_TEST_REPORT_SCHEMA,
  promptTestReportJson,
  runPromptTest,
  suggestedFixes,
  summarizePromptTest,
  type PromptTestProgress,
} from "../prompt-test";
import { renderInputs } from "../render";
import type { Responder } from "../run";
import { scenarios } from "../scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder, SNIPPET_RULES } from "../simulator";

const CREATED = "2026-10-07T00:00:00.000Z";
const snippet = (id: string) => SNIPPET_RULES.find((r) => r.id === id)!.snippet;

function simulated(instruction: string, extra: Partial<Parameters<typeof runPromptTest>[0]> = {}) {
  return runPromptTest({
    instruction,
    responderFor: () => simulatedResponder,
    config: SIMULATED_CONFIG,
    mode: "simulated",
    responderVersion: SIMULATOR_VERSION,
    testId: "test-1",
    createdAt: CREATED,
    ...extra,
  });
}

describe("runPromptTest", () => {
  it("runs the same instruction against every scenario, in order, with ids per test", async () => {
    const out = await simulated("You are a helpful assistant.");
    expect(out.runs.map((r) => r.scenarioId)).toEqual(scenarios.map((s) => s.id));
    expect(out.runs.every((r) => r.instruction === "You are a helpful assistant.")).toBe(true);
    expect(out.runs.map((r) => r.id)).toEqual(scenarios.map((s) => `test-1-${s.id}`));
    expect(out.skipped).toEqual([]);
    expect(out.runs[0].instructionFingerprint).toBe(out.instructionFingerprint);
  });

  it("sends each scenario's own rendered inputs to that scenario's responder", async () => {
    const seen: Array<[string, string]> = [];
    await simulated("Prompt", {
      responderFor: (s) => async (req) => {
        seen.push([s.id, req.input]);
        return { status: "ok", text: "ok", durationMs: 0 };
      },
    });
    for (const s of scenarios) {
      const { a, b } = renderInputs(s);
      expect(seen).toContainEqual([s.id, a]);
      expect(seen).toContainEqual([s.id, b]);
    }
    expect(seen).toHaveLength(scenarios.length * 2);
  });

  it("runs scenarios one after another and reports progress", async () => {
    let active = 0;
    let maxActive = 0;
    const progress: PromptTestProgress[] = [];
    const slow: Responder = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { status: "ok", text: "fine", durationMs: 1 };
    };
    await simulated("Prompt", { responderFor: () => slow, onProgress: (p) => progress.push(p) });
    expect(maxActive).toBe(2); // Version A and B together, never two scenarios at once
    expect(progress.map((p) => [p.done, p.next?.id ?? null])).toEqual([...scenarios.map((s, i) => [i, s.id]), [scenarios.length, null]]);
  });

  it("skips the scenarios that have not started when cancelled", async () => {
    const controller = new AbortController();
    const out = await simulated("Prompt", {
      signal: controller.signal,
      responderFor: () => async () => {
        controller.abort();
        return { status: "ok", text: "fine", durationMs: 0 };
      },
    });
    expect(out.runs.map((r) => r.scenarioId)).toEqual([scenarios[0].id]);
    expect(out.skipped).toEqual(scenarios.slice(1).map((s) => s.id));
  });
});

describe("summarizePromptTest", () => {
  it("fails overall when any scenario fails, and counts failing scenarios", async () => {
    const out = await simulated("You are a helpful assistant.");
    const summary = summarizePromptTest(out);
    expect(summary.headline).toMatch(/^Checks failed/);
    expect(summary.failedScenarios).toBe(scenarios.length);
    for (const s of summary.scenarios) {
      expect(s.issues.length).toBeGreaterThan(0);
      expect(s.issues[0].status).toBe("fail");
    }
  });

  it("passes overall only when every scenario passes", async () => {
    const all = SNIPPET_RULES.filter((r) => r.kind === "fix").map((r) => r.snippet);
    const summary = summarizePromptTest(await simulated(all.join("\n")));
    expect(summary.headline).toBe("All displayed checks passed");
    expect(summary.failedScenarios).toBe(0);
    expect(summary.scenarios.every((s) => s.issues.length === 0)).toBe(true);
  });

  it("is never a pass when a scenario was skipped", async () => {
    const all = SNIPPET_RULES.filter((r) => r.kind === "fix").map((r) => r.snippet);
    const out = await simulated(all.join("\n"));
    const partial = { ...out, runs: out.runs.slice(0, 1), skipped: scenarios.slice(1).map((s) => s.id) };
    const summary = summarizePromptTest(partial);
    expect(summary.headline).toBe("Incomplete — not a pass");
    expect(summary.skipped.map((s) => s.id)).toEqual(partial.skipped);

    const failing = await simulated("Prompt");
    const partialFail = { ...failing, runs: failing.runs.slice(0, 1), skipped: scenarios.slice(1).map((s) => s.id) };
    expect(summarizePromptTest(partialFail).headline).toBe("Checks failed (incomplete)");
  });

  it("is incomplete, not a pass, when the provider errors", async () => {
    const out = await simulated("Prompt", { responderFor: () => async () => ({ status: "model_error", error: "x", durationMs: 0 }) });
    const summary = summarizePromptTest(out);
    expect(summary.headline).toBe("Incomplete — not a pass");
    expect(summary.counts.not_evaluated).toBeGreaterThan(0);
  });
});

describe("suggestedFixes / applyFixes", () => {
  it("maps every check to a known fix snippet (or none)", () => {
    const ruleIds = new Set(SNIPPET_RULES.filter((r) => r.kind === "fix").map((r) => r.id));
    const checkIds = new Set(scenarios.flatMap((s) => s.checks.map((c) => c.id)));
    for (const [checkId, ruleId] of Object.entries(CHECK_FIXES)) {
      expect(checkIds.has(checkId), checkId).toBe(true);
      expect(ruleIds.has(ruleId), ruleId).toBe(true);
    }
  });

  it("suggests fixes for the failed checks, and none already in the prompt", async () => {
    const out = await simulated("You are a helpful assistant.");
    const ids = suggestedFixes(out).map((f) => f.rule.id);
    expect(ids).toEqual(["FIX-VERIFY", "FIX-TERMS", "FIX-PRONOUNS", "FIX-PRIVACY"]);
    expect(suggestedFixes(out).find((f) => f.rule.id === "FIX-PRIVACY")!.addresses).toContain("Disclosure boundary respected");

    const withPrivacy = await simulated(`You are a helpful assistant.\n${snippet("FIX-PRIVACY")}`);
    expect(suggestedFixes(withPrivacy).map((f) => f.rule.id)).not.toContain("FIX-PRIVACY");
  });

  it("never suggests the over-correction snippet", async () => {
    const out = await simulated("Prompt");
    expect(suggestedFixes(out).some((f) => f.rule.kind !== "fix")).toBe(false);
  });

  it("applying the suggested fixes makes the simulated test pass", async () => {
    const first = await simulated("You are a helpful assistant.  \n");
    const next = applyFixes(first.instruction, suggestedFixes(first));
    expect(next.startsWith("You are a helpful assistant.\n")).toBe(true);
    expect(applyFixes(next, suggestedFixes(first))).toBe(next);
    expect(summarizePromptTest(await simulated(next)).headline).toBe("All displayed checks passed");
  });
});

describe("promptTestReportJson", () => {
  it("records the schema, instruction, every scenario run, and the suggestions", async () => {
    const out = await simulated("You are a helpful assistant.");
    const json = JSON.parse(promptTestReportJson(out));
    expect(json.schema).toBe(PROMPT_TEST_REPORT_SCHEMA);
    expect(json.instruction).toBe("You are a helpful assistant.");
    expect(json.mode).toBe("simulated");
    expect(json.scenarios.map((s: { scenarioId: string }) => s.scenarioId)).toEqual(scenarios.map((s) => s.id));
    expect(json.suggestedFixes.length).toBeGreaterThan(0);
    expect(json.headline).toMatch(/^Checks failed/);
  });
});
