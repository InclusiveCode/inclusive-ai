import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptTestClient } from "../../../app/lab/prompt-test/prompt-test-client";
import { overallAdvice, PromptTestReport } from "../../../app/lab/prompt-test/report";
import { runPromptTest, suggestedFixes, summarizePromptTest } from "../prompt-test";
import type { Responder } from "../run";
import { renderInputs as renderInputsTop } from "../render";
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
    expect(overallAdvice(summary)).toMatch(/^Nothing was evaluated\. 3 of 3 scenarios got no response from the model/);
    expect(t).toContain("Check your API key, the model you picked, and your provider account");
    expect(t).toContain("Neither version returned a usable response (see above), so this scenario's checks didn't run.");
    expect(t).not.toContain("Not evaluated: model error");
    expect(t).toContain("Anthropic · requested model m");
  });

  describe("every version without a usable response is named by its cause", () => {
    const inputs = scenarios.map((s) => renderInputsTop(s));
    const idx = (input: string) => inputs.findIndex((x) => x.a === input || x.b === input);
    const OK = { status: "ok" as const, text: "Rowan Thistlecombe and their partner. Jordan, an authorized user. Mia, a dependent.", durationMs: 0 };
    const R = { status: "provider_refused" as const, durationMs: 0 };
    const T = { status: "timeout" as const, durationMs: 0 };
    const E = { status: "model_error" as const, error: "The provider rejected the API key", durationMs: 0 };
    const C = { status: "not_run" as const, error: "Cancelled", durationMs: 0 };
    type R = typeof OK | typeof R | typeof T | typeof E | typeof C;
    type Plan = R | { a: R; b: R };
    const per = (plan: Plan[]): Responder => async ({ input }) => {
      const i = idx(input);
      const p = plan[i];
      return "a" in p ? (inputs[i].a === input ? p.a : p.b) : p;
    };

    const cases: Array<[string, Plan[], RegExp[], RegExp[]]> = [
      ["all refused", [R, R, R], [/^The provider's safety system declined every request/], [/API key/, /cancel/i]],
      ["all cancelled", [C, C, C], [/^Nothing was evaluated\. The test was cancelled before 3 of 3 scenarios finished\. Run it again/], [/API key/, /no response/]],
      ["refused then cancelled", [R, C, C], [/declined both versions in 1 of 3 scenarios/, /cancelled before 2 of 3 scenarios finished/], [/API key/, /no response/]],
      ["refused, rest timed out", [R, T, T], [/declined both versions in 1 of 3 scenarios/, /2 of 3 scenarios got no response/, /Run the test again\./], [/API key/]],
      ["refused, rest key error", [R, E, E], [/declined both versions in 1 of 3 scenarios/, /Check your API key/], []],
      ["one refused, rest answered", [OK, OK, R], [/declined both versions in 1 of 3 scenarios/], [/no response/, /cancel/i]],
      ["cancelled mid-request in the middle", [OK, C, C], [/cancelled before 2 of 3 scenarios finished/], [/no response/, /API key/]],
      ["cancelled mid-request in the last scenario", [OK, OK, C], [/cancelled before 1 of 3 scenarios finished/], [/no response/, /API key/]],
      ["cancelled after Version A of the last scenario answered", [OK, OK, { a: OK, b: C }], [/cancelled before 1 of 3 scenarios finished/], [/no response/, /Some checks could not/]],
      [
        "safety system declined only Version B (the trans version) in one scenario",
        [OK, OK, { a: OK, b: R }],
        [/declined only Version B — because they are trans and answered the other version\. That asymmetry may itself be the harm under test/],
        [/no response/, /Some checks could not/],
      ],
      ["one version refused while the other was cancelled", [OK, OK, { a: C, b: R }], [/declined Version B — because they are trans\./, /cancelled before 1 of 3 scenarios finished/], [/both versions/]],
      [
        "one version refused while the other hit a key error",
        [{ a: R, b: E }, OK, OK],
        [/declined Version A — different-sex spouse\./, /1 of 3 scenarios got no response from the model for at least one version/, /Check your API key/],
        [/both versions/],
      ],
      [
        "a timeout in one scenario and a key error in another name both reasons",
        [T, E, OK],
        [/2 of 3 scenarios got no response from the model for at least one version \(Live request timed out — not evaluated; Live request failed — not evaluated \(The provider rejected the API key\)\)/, /Check your API key/],
        [],
      ],
      ["a cancel and a timeout in the same scenario", [{ a: C, b: T }, OK, OK], [/got no response from the model for at least one version \(Live request timed out — not evaluated\)/, /cancelled before 1 of 3/], []],
      ["one version timed out", [{ a: T, b: OK }, OK, OK], [/1 of 3 scenarios got no response from the model for at least one version/, /Run the test again\./], [/API key/]],
    ];
    for (const [name, plan, must, mustNot] of cases) {
      it(name, async () => {
        const advice = overallAdvice((await test("Prompt", per(plan), "live")).summary);
        for (const re of must) expect(advice, `${name}: ${advice}`).toMatch(re);
        for (const re of mustNot) expect(advice, `${name}: ${advice}`).not.toMatch(re);
        expect(advice.match(/incomplete/g)?.length ?? 0, advice).toBeLessThanOrEqual(1);
        // A refusal is named once, and never as the reason for a failed call; a cancel never appears in the failed-call sentence.
        expect(advice.match(/declined/g)?.length ?? 0, advice).toBeLessThanOrEqual(1);
        expect(advice, advice).not.toMatch(/no response from the model[^.]*\((?:[^)]*(?:Provider declined|cancelled))/);
      });
    }

    it("the scenario card also flags a one-sided safety refusal", async () => {
      const { summary, fixes } = await test("Prompt", per([OK, OK, { a: OK, b: R }]), "live");
      const t = text(renderToStaticMarkup(<PromptTestReport summary={summary} fixes={fixes} />));
      expect(t).toContain("Only Version B was declined by the provider's safety system (one sample). This asymmetry may itself be the harm under test.");
    });

    it("a real abort while a request is in flight (and skipped scenarios after it) counts as cancelled", async () => {
      const { runPromptTest: run } = await import("../prompt-test");
      for (const abortAtCall of [3, 5]) {
        const controller = new AbortController();
        let calls = 0;
        const out = await run({
          instruction: "P",
          responderFor: () => async () => {
            calls += 1;
            if (calls >= abortAtCall) {
              controller.abort(); // the user presses Cancel while this request is in flight
              return C;
            }
            return OK;
          },
          config: { provider: "anthropic", model: "m", temperature: 0, maxTokens: 1024 },
          mode: "live",
          responderVersion: "v",
          testId: "t",
          createdAt: "2026-10-07T00:00:00.000Z",
          signal: controller.signal,
        });
        const advice = overallAdvice(summarizePromptTest(out));
        const expected = abortAtCall === 3 ? 2 : 1;
        expect(advice, advice).toContain(`The test was cancelled before ${expected} of 3 scenarios finished.`);
        expect(advice).not.toMatch(/no response/);
      }
    });
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
