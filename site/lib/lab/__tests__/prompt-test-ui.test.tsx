import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptTestClient } from "../../../app/lab/prompt-test/prompt-test-client";
import { overallAdvice, PromptTestReport } from "../../../app/lab/prompt-test/report";
import { runPromptTest, suggestedFixes, summarizePromptTest } from "../prompt-test";
import type { Responder } from "../run";
import { scenarios } from "../scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder, SNIPPET_RULES } from "../simulator";

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function test(instruction: string, responder: Responder = simulatedResponder, mode: "simulated" | "live" = "simulated") {
  const result = await runPromptTest({
    instruction,
    responderFor: () => responder,
    config: mode === "live" ? { provider: "anthropic", model: "m", temperature: 0, maxTokens: 1024 } : SIMULATED_CONFIG,
    mode,
    responderVersion: SIMULATOR_VERSION,
    testId: "test-1",
    createdAt: "2026-10-07T00:00:00.000Z",
  });
  return { result, summary: summarizePromptTest(result), fixes: suggestedFixes(result) };
}

describe("PromptTestReport", () => {
  it("shows the overall verdict, every scenario, the failed checks with evidence, and the suggested lines", async () => {
    const { summary, fixes } = await test("You are a helpful assistant.");
    const t = text(renderToStaticMarkup(<PromptTestReport summary={summary} fixes={fixes} />));
    expect(t).toContain("Checks failed");
    for (const s of scenarios) expect(t).toContain(s.title);
    expect(t).toContain("Suggested lines to add to your prompt");
    for (const f of fixes) expect(t).toContain(f.rule.snippet);
    expect(t).toContain("Why it matters:");
    expect(t).toContain("Simulated");
    expect(t).toContain(overallAdvice(summary));
  });

  it("has no suggestions section when everything passes", async () => {
    const all = SNIPPET_RULES.filter((r) => r.kind === "fix").map((r) => r.snippet);
    const { summary, fixes } = await test(all.join("\n"));
    const t = text(renderToStaticMarkup(<PromptTestReport summary={summary} fixes={fixes} />));
    expect(t).toContain("All displayed checks passed");
    expect(t).not.toContain("Suggested lines");
    expect(t).toContain("That is evidence, not proof");
  });

  it("labels a live test with the returned model and shows response alerts", async () => {
    const responder: Responder = async () => ({ status: "timeout", durationMs: 0, returnedModel: "model-x-2026" });
    const { summary, fixes } = await test("Prompt", responder, "live");
    const t = text(renderToStaticMarkup(<PromptTestReport summary={summary} fixes={fixes} />));
    expect(t).toContain("Live");
    expect(t).toContain("model-x-2026");
    expect(t).toContain("Incomplete — not a pass");
    expect(t).toContain("Live request timed out — not evaluated");
  });
});

describe("PromptTestClient (initial render)", () => {
  it("renders the prompt editor, live panel with the test's billing line, and an empty report", () => {
    const html = renderToStaticMarkup(<PromptTestClient />);
    const t = text(html);
    expect(t).toContain("Test your prompt");
    expect(t).toContain("System prompt");
    expect(t).toContain(`A prompt test makes ${scenarios.length * 2} billed calls`);
    expect(t).not.toContain("Each run makes 2 billed calls");
    expect(t).toContain("Run live test");
    expect(t).toContain("Your report appears here");
    expect(html).toContain('type="password"');
    expect(html).toContain('maxLength="4000"');
    // Live-only: the simulator ignores arbitrary wording, so it is not offered here; /lab has the demo.
    expect(html).not.toContain('value="simulated"');
    // The scenario-set picker: one radio per set, healthcare first and checked.
    expect(html.match(/name="pt-suite"/g)).toHaveLength(3);
    expect(t).toContain("What does your assistant do?");
    expect(t).toContain("Healthcare and patient portals");
    expect(t).toContain("Use an example healthcare prompt");
    expect(t).not.toContain("Run simulated test");
    expect(t).toContain("Try the simulated demo in the Evaluation Lab");
    expect(t).toContain("Your key stays in this field until you clear it, switch provider, reload, or leave the page.");
    expect(t).not.toContain("switch to simulated mode");
    // F1: before hydration the set radios and the prompt are locked, so nothing clicked or typed
    // before React owns the page can differ from what the test runs.
    for (const radio of html.match(/<input[^>]*name="pt-suite"[^>]*>/g) ?? []) expect(radio).toContain("disabled");
    expect(html).toMatch(/<textarea[^>]*readOnly/);
  });
});

describe("PromptTestReport: out of scope", () => {
  it("explains that declined scenarios can't evaluate the prompt and suggests another set", async () => {
    const decline: Responder = async () => ({
      status: "ok",
      text: "Hi! I think there may be a mix-up. I can only help with appointments and billing.",
      durationMs: 0,
    });
    const { summary, fixes } = await test("Prompt", decline, "live");
    const t = text(renderToStaticMarkup(<PromptTestReport summary={summary} fixes={fixes} suiteLabel="General-purpose assistant" />));
    expect(t).toContain("Declined as out of scope — not evaluated");
    expect(summary.headline).toBe("Declined as out of scope — not evaluated");
    expect(summary.failedScenarios).toBe(0);
    expect(fixes).toEqual([]);
    expect(t).not.toContain("Suggested lines");
    expect(t).toMatch(/\d+ fails only record words missing from declined replies and don't count against your prompt\./);
    expect(t).toContain("Declined reply — not counted");
    expect(t).toContain("Your assistant declined 3 of 3 scenarios as outside its job");
    expect(t).toContain("Choose the scenario set closest to your product");
    expect(t).toContain("(General-purpose assistant)");
    expect(t).toContain("Both versions declined this task as outside the assistant's job");
  });
});

describe("overallAdvice", () => {
  it("says plainly when nothing failed and some results could not be judged", async () => {
    const { summary } = await test("Prompt", async () => ({ status: "ok", text: "Thanks! Jordan Rowan Mia dependent.", durationMs: 0 }));
    const fixed = { ...summary, failedScenarios: 0, counts: { pass: 12, fail: 0, inconclusive: 2, not_evaluated: 0, error: 0 }, outOfScopeScenarios: 0 };
    expect(overallAdvice(fixed)).toBe(
      "No check failed. 2 results couldn't be judged by word matching: the response didn't use the exact words the check looks for, so read them yourself below (open “Show the inputs and responses”). Inconclusive is not a pass, but it is not a failure either.",
    );
  });
});

describe("UX pass (post-launch)", () => {
  it("when no response comes back, says why once and lists no per-check noise", async () => {
    const failing: Responder = async () => ({ status: "model_error", error: "The provider rejected the API key", durationMs: 0 });
    const { summary, fixes } = await test("Prompt", failing, "live");
    const t = text(renderToStaticMarkup(<PromptTestReport summary={summary} fixes={fixes} />));
    expect(overallAdvice(summary)).toMatch(/^No response came back from the model, so nothing was evaluated/);
    expect(t).toContain("Check your API key, the model you picked, and your provider account");
    expect(t).toContain("Neither version returned a usable response (see above), so this scenario's checks didn't run.");
    expect(t).not.toContain("Not evaluated: model error");
    expect(t).toContain("Anthropic · requested model m");
  });

  it("a cancelled test and a provider safety refusal get their own advice, not the key advice", async () => {
    const cancelled: Responder = async () => ({ status: "not_run", error: "Cancelled", durationMs: 0 });
    const c = await test("Prompt", cancelled, "live");
    expect(overallAdvice(c.summary)).toBe("The test was cancelled before any response came back, so nothing was evaluated. Run it again when you're ready.");
    const refused: Responder = async () => ({ status: "provider_refused", durationMs: 0 });
    const r = await test("Prompt", refused, "live");
    expect(overallAdvice(r.summary)).toMatch(/^The provider's safety system declined every request, so nothing was evaluated\./);
    let call = 0;
    const timeoutThenCancel: Responder = async () =>
      call++ < 2 ? { status: "timeout", durationMs: 0 } : { status: "not_run", error: "Cancelled", durationMs: 0 };
    const m = await test("Prompt", timeoutThenCancel, "live");
    expect(overallAdvice(m.summary)).toMatch(/^The test was cancelled/);
    for (const x of [c, r, m]) expect(overallAdvice(x.summary)).not.toContain("API key");
  });

  it("groups evidence per version: one “Version B:” label for several excerpts", async () => {
    const s = (await import("../suites")).findScenario("health-stated-identity")!;
    const { renderInputs } = await import("../render");
    const { a } = renderInputs(s);
    const responder: Responder = async ({ input }) => ({
      status: "ok",
      durationMs: 0,
      text: input === a ? "Rowan is a new patient. They and their partner hope to start a family." : "Rowan is a new patient. He and his partner hope to start a family.",
    });
    const { runPromptTest } = await import("../prompt-test");
    const out = await runPromptTest({
      instruction: "P",
      scenarios: [s],
      responderFor: () => responder,
      config: { provider: "anthropic", model: "m", temperature: 0, maxTokens: 1024 },
      mode: "live",
      responderVersion: "v",
      testId: "t",
      createdAt: "2026-10-07T00:00:00.000Z",
    });
    const html = renderToStaticMarkup(<PromptTestReport summary={summarizePromptTest(out)} fixes={suggestedFixes(out)} />);
    const start = html.indexOf("Stated pronouns respected");
    const block = html.slice(start, html.indexOf("Why it matters", start));
    expect(block.match(/Version B:/g)).toHaveLength(1);
    expect(block.match(/<mark/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("asks what the assistant does before asking for the prompt", () => {
    const t = text(renderToStaticMarkup(<PromptTestClient />));
    expect(t.indexOf("1. What does your assistant do?")).toBeGreaterThan(-1);
    expect(t.indexOf("1. What does your assistant do?")).toBeLessThan(t.indexOf("2. Your system prompt"));
    expect(t.indexOf("2. Your system prompt")).toBeLessThan(t.indexOf("3. Choose a model"));
  });
});
