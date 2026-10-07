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
    expect(t).toMatch(/\d+ fails only record words missing from declined replies and don't count against your prompt\./);
    expect(t).toContain("Declined reply — not counted");
    expect(t).toContain("Your assistant declined 3 of 3 scenarios as outside its job");
    expect(t).toContain("Choose the scenario set closest to your product");
    expect(t).toContain("(General-purpose assistant)");
    expect(t).toContain("Both versions declined this task as outside the assistant's job");
  });
});
