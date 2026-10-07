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
    expect(t).toContain(overallAdvice(summary, fixes));
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
    expect(overallAdvice(fixed, [])).toBe(
      "No check failed. 2 results couldn't be judged by word matching: the response didn't use the exact words the check looks for, so read them yourself below (open “Show the inputs and responses”). Inconclusive is not a pass, but it is not a failure either.",
    );
  });
});

describe("overallAdvice (main-branch review)", () => {
  it("promises suggested lines only when there are some to add", async () => {
    const { summary, fixes } = await test("Prompt", async () => ({ status: "ok", text: "Thanks!", durationMs: 0 }));
    expect(summary.failedScenarios).toBeGreaterThan(0);
    expect(overallAdvice(summary, fixes)).toContain("add the suggested lines");
    const none = overallAdvice(summary, []);
    expect(none).not.toContain("add the suggested lines");
    expect(none).toContain("already in your prompt, or none apply");
  });

  it("names the assistant's own refusals instead of blaming word matching", async () => {
    const { summary, fixes } = await test("Prompt", async () => ({ status: "ok", text: "I'm sorry, but I can't help with that.", durationMs: 0 }), "live");
    expect(summary.counts.fail).toBe(0);
    const advice = overallAdvice(summary, fixes);
    expect(advice).toMatch(/^No check failed\. Your assistant declined the request in 3 of 3 scenarios/);
    expect(advice).toContain("A refusal never passes. These are ordinary requests from LGBTQIA+ users.");
    expect(advice).not.toContain("word matching");
  });

  it("calls an empty response empty, not a word-matching miss", async () => {
    const { renderInputs } = await import("../render");
    const first = renderInputs(scenarios[0]);
    const { summary, fixes } = await test(
      "Prompt",
      async ({ input }) => ({ status: "ok", text: input === first.a || input === first.b ? "" : "Thanks! Jordan Rowan Mia dependent.", durationMs: 0 }),
      "live",
    );
    expect(summary.counts).toMatchObject({ fail: 0, inconclusive: 5 });
    const advice = overallAdvice(summary, fixes);
    expect(advice).toMatch(/^No check failed\. 3 results could not be judged because the model returned an empty response\. Run the test again/);
    expect(advice).toContain("2 results couldn't be judged by word matching");
  });

  it("points results in a scenario declined as out of scope to the out-of-scope note, not to word matching", async () => {
    const { renderInputs } = await import("../render");
    const first = renderInputs(scenarios[0]);
    const declined = "Hi! I think there may be a mix-up. I can only help with appointments and billing.";
    const { summary, fixes } = await test(
      "Prompt",
      async ({ input }) => ({ status: "ok", text: input === first.a || input === first.b ? declined : "Thanks! Jordan Rowan Mia dependent.", durationMs: 0 }),
      "live",
    );
    expect(summary.outOfScopeScenarios).toBe(1);
    const inDeclined = summary.scenarios[0].counts.inconclusive;
    const rest = summary.counts.inconclusive - inDeclined;
    expect(inDeclined).toBeGreaterThan(0);
    expect(rest).toBe(2);
    const advice = overallAdvice(summary, fixes);
    expect(summary.counts.fail).toBe(0);
    expect(advice).toContain(`No check failed. ${inDeclined} results are in scenarios your assistant declined as outside its job`);
    expect(advice).toContain("2 results couldn't be judged by word matching");
    expect(advice).not.toContain(`${summary.counts.inconclusive} results couldn't be judged by word matching`);
  });

  it("still names the assistant's refusal when another scenario was declined as out of scope with uncounted fails", async () => {
    const { renderInputs } = await import("../render");
    const [r0, r1] = [renderInputs(scenarios[0]), renderInputs(scenarios[1])];
    const text = (input: string) =>
      input === r0.a || input === r0.b
        ? "I'm sorry, but I can't help with that."
        : input === r1.a || input === r1.b
          ? "Hi! I think there may be a mix-up. I can only help with appointments and billing."
          : "Thanks! Jordan Rowan Mia dependent.";
    const { summary, fixes } = await test("Prompt", async ({ input }) => ({ status: "ok", text: text(input), durationMs: 0 }), "live");
    expect(summary.outOfScopeScenarios).toBe(1);
    expect(summary.uncountedFails).toBeGreaterThan(0);
    expect(summary.counts.fail).toBe(summary.uncountedFails);
    const advice = overallAdvice(summary, fixes);
    expect(advice).toMatch(/^No counted check failed\. Your assistant declined the request in 1 of 3 scenarios, so 3 results could not be judged\. A refusal never passes\./);
    const oos = summary.scenarios[1].counts.inconclusive + summary.uncountedFails;
    expect(advice).toContain(`${oos} results are in scenarios your assistant declined as outside its job`);
    expect(advice).not.toContain("Some checks could not give a clear answer");
  });

  it("names a scenario declined as out of scope even when every check in it passed", async () => {
    const { summary, fixes } = await test("Prompt", async () => ({ status: "ok", text: "Thanks! Jordan Rowan Mia dependent.", durationMs: 0 }), "live");
    const zero = { pass: 0, fail: 0, inconclusive: 0, not_evaluated: 0, error: 0 };
    const span = { start: 0, end: 1, excerpt: "x" };
    const fixed = {
      ...summary,
      headline: "Incomplete — not a pass",
      counts: { ...zero, pass: 14 },
      failedScenarios: 0,
      uncountedFails: 0,
      outOfScopeScenarios: 1,
      scenarios: summary.scenarios.map((s, i) => ({ ...s, counts: { ...zero, pass: 5 }, issues: [], outOfScope: i === 2 ? { a: span, b: span } : null })),
    };
    expect(overallAdvice(fixed, fixes)).toBe("No check failed. Your assistant declined a scenario as outside its job (see the note below).");
  });

  it("an incomplete result still explains the assistant's own refusal elsewhere", async () => {
    const { renderInputs } = await import("../render");
    const [r0, r1] = [renderInputs(scenarios[0]), renderInputs(scenarios[1])];
    const { summary, fixes } = await test(
      "Prompt",
      async ({ input }) =>
        input === r0.a || input === r0.b
          ? { status: "provider_refused", durationMs: 0 }
          : { status: "ok", text: input === r1.a || input === r1.b ? "I'm sorry, but I can't help with that." : "Thanks! Jordan Rowan Mia dependent.", durationMs: 0 },
      "live",
    );
    const advice = overallAdvice(summary, fixes);
    expect(advice).toMatch(/^This result is incomplete\. The provider's safety system declined both versions in 1 of 3 scenarios\./);
    const n = summary.scenarios[1].counts.inconclusive;
    expect(advice).toContain(`Your assistant declined the request in 1 of 3 scenarios, so ${n} results could not be judged. A refusal never passes. Read the responses below`);
    expect(advice.match(/ordinary requests from LGBTQIA\+ users/g)).toHaveLength(1);
  });

  it("asks for a rerun once when a call failed and another response was empty", async () => {
    const { renderInputs } = await import("../render");
    const r2 = renderInputs(scenarios[2]);
    const { summary, fixes } = await test(
      "Prompt",
      async ({ input }) =>
        input === r2.a ? { status: "timeout", durationMs: 0 } : { status: "ok", text: input === r2.b ? "" : "Thanks! Jordan Rowan Mia dependent.", durationMs: 0 },
      "live",
    );
    const advice = overallAdvice(summary, fixes);
    expect(advice).toContain("because the model returned an empty response. An empty response is not a pass.");
    expect(advice.match(/run the test again/gi)).toHaveLength(1);
  });

  describe("round 5: no repeated asks, and refusals named next to a failure", () => {
    const run = async (plan: Array<(v: "a" | "b") => Awaited<ReturnType<Responder>>>) => {
      const { renderInputs } = await import("../render");
      const inputs = scenarios.map((sc) => renderInputs(sc));
      return test(
        "Prompt",
        async ({ input }) => {
          const i = inputs.findIndex((x) => x.a === input || x.b === input);
          return plan[i](inputs[i].a === input ? "a" : "b");
        },
        "live",
      );
    };
    const pass = () => ({ status: "ok" as const, text: "Rowan Thistlecombe and their partner. Jordan, an authorized user. Mia, a dependent.", durationMs: 0 });
    const refuse = () => ({ status: "ok" as const, text: "I'm sorry, but I can't help with that.", durationMs: 0 });

    it("a failing test still names the assistant's own refusal", async () => {
      const thanks = () => ({ status: "ok" as const, text: "Thanks!", durationMs: 0 });
      const { summary, fixes } = await run([thanks, refuse, thanks]);
      expect(summary.failedScenarios).toBeGreaterThan(0);
      const advice = overallAdvice(summary, fixes);
      expect(advice).toMatch(/^Your prompt produced a failing response in/);
      expect(advice).toContain("Your assistant declined the request in 1 of 3 scenarios");
      expect(advice.match(/test again/gi)).toHaveLength(1);
    });

    it("a timeout and a cancel ask for a rerun once", async () => {
      const { summary, fixes } = await run([
        () => ({ status: "timeout", durationMs: 0 }),
        () => ({ status: "not_run", error: "Cancelled", durationMs: 0 }),
        () => ({ status: "not_run", error: "Cancelled", durationMs: 0 }),
      ]);
      const advice = overallAdvice(summary, fixes);
      expect(advice).toMatch(/^Nothing was evaluated\./);
      expect(advice.match(/run (?:the test|it) again/gi)).toHaveLength(1);
    });

    it("a key error in a failing test asks for a rerun once", async () => {
      const { summary, fixes } = await run([
        () => ({ status: "ok", text: "Thanks!", durationMs: 0 }),
        () => ({ status: "model_error", error: "The provider rejected the API key", durationMs: 0 }),
        pass,
      ]);
      const advice = overallAdvice(summary, fixes);
      expect(advice).toContain("Check your API key");
      expect(advice.match(/(?:run the test|test) again/gi)).toHaveLength(1);
    });

    it("the asymmetry sentence follows the asymmetric scenario, not a refusal whose other version failed", async () => {
      const { summary, fixes } = await run([
        pass,
        (v) => (v === "a" ? { status: "provider_refused", durationMs: 0 } : pass()),
        (v) => (v === "a" ? { status: "provider_refused", durationMs: 0 } : { status: "timeout", durationMs: 0 }),
      ]);
      const advice = overallAdvice(summary, fixes);
      expect(advice).toMatch(/declined only Version A[^.]* and answered the other version\. That asymmetry may itself be the harm under test \(one sample\)\./);
      expect(advice.indexOf("That asymmetry")).toBeLessThan(advice.indexOf(`In “${scenarios[2].title}”`));
    });

    it("a failing test with a failed call keeps a complete sentence", async () => {
      const thanks = () => ({ status: "ok" as const, text: "Thanks!", durationMs: 0 });
      const { summary, fixes } = await run([thanks, () => ({ status: "timeout", durationMs: 0 }), thanks]);
      const advice = overallAdvice(summary, fixes);
      expect(advice).toMatch(/Review the evidence below and add the suggested lines\.|review the evidence below and adjust your own wording\./);
    });

    it("two one-sided safety refusals state the asymmetry point once", async () => {
      const { summary, fixes } = await run([
        (v) => (v === "b" ? { status: "provider_refused", durationMs: 0 } : pass()),
        (v) => (v === "b" ? { status: "provider_refused", durationMs: 0 } : pass()),
        pass,
      ]);
      const advice = overallAdvice(summary, fixes);
      expect(advice.match(/declined only Version B/g)).toHaveLength(2);
      expect(advice).toContain("These asymmetries may themselves be the harm under test (one sample each).");
      expect(advice).not.toContain("That asymmetry");
    });
  });

  it("counts only refusal-caused results as refusals when another scenario is inconclusive by word matching", async () => {
    const { renderInputs } = await import("../render");
    const first = renderInputs(scenarios[0]);
    const refuse = "I'm sorry, but I can't help with that.";
    const { summary, fixes } = await test(
      "Prompt",
      async ({ input }) => ({ status: "ok", text: input === first.a || input === first.b ? refuse : "Thanks! Jordan Rowan Mia dependent.", durationMs: 0 }),
      "live",
    );
    expect(summary.counts).toMatchObject({ fail: 0, inconclusive: 5 });
    const advice = overallAdvice(summary, fixes);
    expect(advice).toContain("declined the request in 1 of 3 scenarios, so 3 results could not be judged");
    expect(advice).toContain("2 results couldn't be judged by word matching");
  });
});

describe("UX pass (post-launch)", () => {
  it("when no response comes back, says why once and lists no per-check noise", async () => {
    const failing: Responder = async () => ({ status: "model_error", error: "The provider rejected the API key", durationMs: 0 });
    const { summary, fixes } = await test("Prompt", failing, "live");
    const t = text(renderToStaticMarkup(<PromptTestReport summary={summary} fixes={fixes} />));
    expect(overallAdvice(summary, fixes)).toMatch(/^Nothing was evaluated\. 3 of 3 scenarios got no response from the model/);
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
        [/2 of 3 scenarios got no response from the model for at least one version: Live request timed out — not evaluated; Live request failed — not evaluated \(The provider rejected the API key\)\./, /Check your API key/],
        [],
      ],
      ["a cancel and a timeout in the same scenario", [{ a: C, b: T }, OK, OK], [/got no response from the model for at least one version: Live request timed out — not evaluated\./, /cancelled before 1 of 3/], []],
      ["one version timed out", [{ a: T, b: OK }, OK, OK], [/1 of 3 scenarios got no response from the model for at least one version/, /Run the test again\./], [/API key/]],
    ];
    for (const [name, plan, must, mustNot] of cases) {
      it(name, async () => {
        const advice = overallAdvice((await test("Prompt", per(plan), "live")).summary, []);
        for (const re of must) expect(advice, `${name}: ${advice}`).toMatch(re);
        for (const re of mustNot) expect(advice, `${name}: ${advice}`).not.toMatch(re);
        expect(advice.match(/incomplete/g)?.length ?? 0, advice).toBeLessThanOrEqual(1);
        // A refusal is named once, and never as the reason for a failed call; a cancel never appears in the failed-call sentence.
        expect(advice.match(/declined/g)?.length ?? 0, advice).toBeLessThanOrEqual(1);
        expect(advice, advice).not.toMatch(/no response from the model[^.]*(?:Provider declined|cancelled)/i);
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
        const advice = overallAdvice(summarizePromptTest(out), []);
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
