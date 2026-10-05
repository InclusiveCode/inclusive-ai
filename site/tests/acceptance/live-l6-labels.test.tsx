/**
 * L6 (spec v0.2 §7, §1 step 5): the banner, badges, and alerts follow the displayed run, and show the
 * returned model and the single-sample disclaimer. Server markup only; the in-browser behavior
 * (switching the displayed run, switching the response-source radio) is in tests/e2e/lab-live-smoke.mjs.
 * Also §1 step 2 (the notice) and §5 (the Limitations line).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunBanner } from "../../app/lab/components/banner";
import { LivePanel } from "../../app/lab/components/live-panel";
import { Limitations } from "../../app/lab/components/reference";
import { RunDetails } from "../../app/lab/components/run-details";
import { liveAlertText, providerRefusalAsymmetryNote } from "../../app/lab/components/status";
import Anthropic from "@anthropic-ai/sdk";
import { compareRuns } from "../../lib/lab/compare";
import { scenarioVerdict } from "../../lib/lab/evaluate";
import { createOverride, reviewLogJson } from "../../lib/lab/overrides";
import { renderInputs } from "../../lib/lab/render";
import { LabClient } from "../../app/lab/lab-client";
import { runScenario } from "../../lib/lab/run";
import { getScenario, scenarios } from "../../lib/lab/scenarios";
import { SIMULATED_CONFIG, simulatedResponder } from "../../lib/lab/simulator";
import { opts, simRun } from "./helpers";
import { anthropicReply, fakeClients, GPT4O_MINI, HAIKU, liveRun, openaiReply, perVariant, SONNET } from "./live-helpers";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const s = getScenario("spouse-parity");
const DISCLAIMER = "One sample per run; differences between runs can be nondeterministic. A pass means only that the displayed checks passed.";

async function liveOf(modelId: string, returned: { a: string; b: string }) {
  const fake = fakeClients(perVariant(s, { a: "Happy to help, Jordan Lee.", b: "Happy to help, Jordan Lee." }, returned));
  return (await liveRun(s, s.baselineInstruction, modelId, fake.clients)).run;
}

describe("L6: the banner follows the run's mode and shows the returned model and the single-sample disclaimer", () => {
  it("Anthropic live run: exact banner text with the returned model id", async () => {
    const run = await liveOf(HAIKU, { a: "claude-haiku-4-5-20251001", b: "claude-haiku-4-5-20251001" });
    const t = text(renderToStaticMarkup(createElement(RunBanner, { run })));
    expect(t).toBe(`Live run: responses from Anthropic claude-haiku-4-5-20251001. ${DISCLAIMER}`);
  });

  it("OpenAI live run: exact banner text with the returned model id (not the requested alias)", async () => {
    const run = await liveOf(GPT4O_MINI, { a: "gpt-4o-mini-2024-07-18", b: "gpt-4o-mini-2024-07-18" });
    const t = text(renderToStaticMarkup(createElement(RunBanner, { run })));
    expect(t).toBe(`Live run: responses from OpenAI gpt-4o-mini-2024-07-18. ${DISCLAIMER}`);
  });

  it("when A and B report different models, the banner names both", async () => {
    const run = await liveOf(HAIKU, { a: "claude-haiku-4-5-20251001", b: "claude-haiku-4-5-20260101" });
    const t = text(renderToStaticMarkup(createElement(RunBanner, { run })));
    expect(t).toContain("claude-haiku-4-5-20251001");
    expect(t).toContain("claude-haiku-4-5-20260101");
    expect(t).toContain(DISCLAIMER);
  });

  it("a simulated run keeps the simulated banner, with no live wording", async () => {
    const run = await simRun(s.id);
    const t = text(renderToStaticMarkup(createElement(RunBanner, { run })));
    expect(t).toMatch(/^Simulated demo — no AI model is called\./);
    expect(t).not.toMatch(/Live run/);
  });
});

describe("L6: badges and run metadata follow the run", () => {
  it("live run details: Live badge, provider, requested and returned model, settings, timestamp, duration; responses not called simulated", async () => {
    const fake = fakeClients(() => anthropicReply("Happy to help, Jordan Lee.", { model: "claude-sonnet-5-5-20260901" }));
    const { run } = await liveRun(s, s.baselineInstruction, SONNET, fake.clients);
    const t = text(renderToStaticMarkup(createElement(RunDetails, { scenario: s, run })));
    expect(t).toMatch(/Mode Live Run ID/);
    expect(t).not.toMatch(/Simulated/);
    expect(t).toContain("Provider Anthropic");
    expect(t).toContain("Requested model claude-sonnet-5-5");
    expect(t).toContain("Returned model claude-sonnet-5-5-20260901");
    expect(t).toContain("Temperature n/a"); // temperature omitted for Sonnet 5.5 — never implies determinism
    expect(t).toContain("Max tokens 1024");
    expect(t).toContain(`Created at ${run.createdAt}`);
    expect(t).toMatch(/Duration A: \d+ ms; B: \d+ ms/);
    expect((t.match(/\bResponse\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("simulated run details keep the Simulated badge and 'Simulated response'", async () => {
    const run = await simRun(s.id);
    const t = text(renderToStaticMarkup(createElement(RunDetails, { scenario: s, run })));
    expect(t).toMatch(/Mode Simulated Run ID/);
    expect((t.match(/Simulated response/g) ?? []).length).toBe(2);
    expect(t).not.toMatch(/Returned model/);
  });

  it("a live OpenAI run shows temperature 0 and the OpenAI provider label", async () => {
    const fake = fakeClients(() => openaiReply("Happy to help.", { model: "gpt-4o-mini-2024-07-18" }));
    const { run } = await liveRun(s, s.baselineInstruction, GPT4O_MINI, fake.clients);
    const t = text(renderToStaticMarkup(createElement(RunDetails, { scenario: s, run })));
    expect(t).toContain("Provider OpenAI");
    expect(t).toContain("Temperature 0");
  });
});

describe("L6: alerts come from the run's own statuses", () => {
  it("an all-ok live run has no alert; failure statuses do, and none reads as a pass", async () => {
    const ok = await liveOf(HAIKU, { a: "claude-haiku-4-5-20251001", b: "claude-haiku-4-5-20251001" });
    expect(liveAlertText(ok)).toBeNull();
    const fail = (await liveRun(s, s.baselineInstruction, HAIKU, fakeClients(() => anthropicReply("", { stop_reason: "refusal" })).clients)).run;
    expect(liveAlertText(fail)).toBe("Provider declined (safety system) — not evaluated");
  });

  it("the old stub copy is gone from the lab source", () => {
    const root = join(__dirname, "..", "..", "app", "lab");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.tsx?$/.test(n) ? [join(d, n)] : []));
    for (const f of walk(root)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/Live \(unavailable\)/);
      expect(src, f).not.toMatch(/unavailable on this deployment/);
    }
  });
});

describe("L6: page-level labels", () => {
  it("initial page: simulated banner and labels, no live labels before any live run", async () => {
    const baselineRuns = await Promise.all(
      scenarios.map((sc) => runScenario(sc, sc.baselineInstruction, simulatedResponder, SIMULATED_CONFIG, opts({ id: `${sc.id}-baseline` }))),
    );
    const t = text(renderToStaticMarkup(createElement(LabClient, { baselineRuns })));
    expect(t).toMatch(/Simulated demo — no AI model is called/);
    expect(t).not.toMatch(/Live run:/);
    expect(t).toContain("Simulated (scripted demo)");
    expect(t).toContain("Live model (your API key)");
    expect(t).not.toMatch(/Live \(unavailable\)/);
  });

  it("Limitations carries the spec §5 real-output line verbatim", () => {
    const t = text(renderToStaticMarkup(createElement(Limitations)));
    expect(t).toContain(
      "The checks were designed against scripted text. Real model output may phrase refusals and relationship terms in ways the word lists miss, so expect more 'inconclusive' results and occasional false findings.",
    );
    expect(t).not.toMatch(/not configured/i);
    // R7: the live-mode line says what the site does with the key, without "never stored".
    expect(t).toContain("this site doesn't store or log the key");
    expect(t).not.toMatch(/key is never stored/);
  });

  it("the page header says every failure shows its evidence: the words that triggered it, or what was missing", async () => {
    const baselineRuns = await Promise.all(
      scenarios.map((sc) => runScenario(sc, sc.baselineInstruction, simulatedResponder, SIMULATED_CONFIG, opts({ id: `${sc.id}-baseline` }))),
    );
    const t = text(renderToStaticMarkup(createElement(LabClient, { baselineRuns })));
    expect(t).toContain("every failure shows its evidence: the exact words that triggered it, or what was missing.");
  });

  it("the live notice covers each point of the spec §1 notice for both providers", () => {
    for (const [provider, label] of [
      ["anthropic", "Anthropic"],
      ["openai", "OpenAI"],
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(LivePanel, {
          provider,
          modelId: provider === "anthropic" ? HAIKU : GPT4O_MINI,
          onProviderChange: () => {},
          onModelChange: () => {},
          keyInputRef: createRef<HTMLInputElement>(),
          keyError: null,
          onKeyErrorClear: () => {},
        }),
      );
      const t = text(html);
      expect(t).toContain(`Your ${label} API key`);
      // Where the key goes, and that it is not stored or logged.
      // Spec §1 / D33: the hosting intermediary is named.
      expect(t).toContain(`this site's server (hosted on Vercel) and on to ${label}`);
      expect(t).toMatch(/doesn't store or log your key/);
      // Cost: two billed calls per run.
      expect(t).toMatch(/Each run makes 2 billed calls/);
      // What is sent to the provider, and by which route (R7).
      expect(t).toContain(`Your instruction and the fictional scenario text also go through this site's server to ${label}`);
      expect(t).toContain(`${label}'s own data-retention policies apply to them`);
      // When the key is cleared, including on a provider switch (D35).
      expect(t).toMatch(/Your key stays in this field until you clear it, switch provider, switch to simulated mode, reload, or leave the page\./);
      // Low-limit revocable key; no personal data.
      expect(t).toMatch(/Use a low-limit key you can revoke/);
      expect(t).toMatch(/Do not enter personal data/);
      // The provider's name appears only for the selected provider.
      expect(t).not.toContain(label === "Anthropic" ? "OpenAI's own" : "Anthropic's own");
    }
  });
});

describe("D34: a one-sided provider refusal gets an unscored note naming the declined version", () => {
  const NOTE = (v: "A" | "B") =>
    `Only Version ${v} was declined by the provider's safety system (one sample). This asymmetry may itself be the harm under test.`;
  type Outcome = "ok" | "refused" | "timeout" | "error";
  async function outcomes(a: Outcome, b: Outcome) {
    const inputs = renderInputs(s);
    const fake = fakeClients((call) => {
      const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
      const o = u === inputs.a ? a : b;
      if (o === "refused") return anthropicReply("", { stop_reason: "refusal" });
      if (o === "timeout") throw new Anthropic.APIConnectionTimeoutError();
      if (o === "error") throw new Error("upstream failure");
      return anthropicReply("Happy to help, Jordan Lee.");
    });
    return (await liveRun(s, s.baselineInstruction, HAIKU, fake.clients)).run;
  }
  const refusing = (which: Array<"a" | "b">) => outcomes(which.includes("a") ? "refused" : "ok", which.includes("b") ? "refused" : "ok");

  // The note needs exactly one side refused AND the other side ok.
  const CASES: Array<[Outcome, Outcome, string | null]> = [
    ["ok", "refused", NOTE("B")],
    ["refused", "ok", NOTE("A")],
    ["refused", "refused", null],
    ["ok", "ok", null],
    ["refused", "timeout", null],
    ["timeout", "refused", null],
    ["refused", "error", null],
    ["error", "refused", null],
  ];
  for (const [a, b, note] of CASES) {
    it(`A ${a}, B ${b} → ${note ? "note" : "no note"}`, async () => {
      const run = await outcomes(a, b);
      expect(providerRefusalAsymmetryNote(run)).toBe(note);
      const which = (["a", "b"] as const).filter((v) => (v === "a" ? a : b) !== "ok");
      if (which.length > 0) {
        // The refused version's checks and the pair checks stay not evaluated; the headline is never a pass.
        expect(run.results.filter((r) => r.variant === "pair" || which.includes(r.variant as "a" | "b")).every((r) => r.status === "not_evaluated")).toBe(true);
        expect(scenarioVerdict(run.results).headline).toBe("Incomplete — not a pass");
      }
    });
  }

  it("never on a simulated run, even with the same statuses", async () => {
    const sim = await simRun(s.id);
    const forged = { ...sim, responses: { a: sim.responses.a, b: { ...sim.responses.b, status: "provider_refused" as const } } };
    expect(providerRefusalAsymmetryNote(forged)).toBeNull();
  });

  it("is not scored and is not part of the review-log export", async () => {
    const run = await refusing(["b"]);
    const target = run.results.find((r) => r.variant === "a" && (r.status === "pass" || r.status === "fail"));
    expect(target).toBeTruthy();
    const o = createOverride(run, target!, "inconclusive", "Reviewed.", "2026-10-05T12:00:00.000Z");
    if (!o.ok) throw new Error(o.error);
    expect(reviewLogJson([o.override])).not.toMatch(/declined by the provider's safety system|asymmetry/);
    expect(JSON.stringify(run.results)).not.toMatch(/asymmetry/);
  });
});

describe("D34: comparison wording when one version was declined", () => {
  async function run(a: "ok" | "refused" | "timeout", b: "ok" | "refused" | "timeout", instruction = s.baselineInstruction) {
    const inputs = renderInputs(s);
    const fake = fakeClients((call) => {
      const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
      const o = u === inputs.a ? a : b;
      if (o === "refused") return anthropicReply("", { stop_reason: "refusal" });
      if (o === "timeout") throw new Anthropic.APIConnectionTimeoutError();
      return anthropicReply("Happy to help, Jordan Lee.");
    });
    return (await liveRun(s, instruction, HAIKU, fake.clients)).run;
  }
  const edited = s.baselineInstruction + "\nBe brief.";

  it("A refused + B ok → 'Version A was declined … — not comparable (see the note …)', with no rerun hint", async () => {
    const baseline = await run("ok", "ok");
    const latest = await run("refused", "ok", edited);
    const c = compareRuns(baseline, latest);
    expect(c.compatible).toBe(false);
    if (c.compatible) return;
    expect(c.reason).toBe("Version A was declined by the provider's safety system — not comparable (see the note under “3. Review findings”)");
    expect(c.reason).not.toMatch(/rerun/i);
  });

  it("B refused + A ok → names Version B, no rerun hint", async () => {
    const c = compareRuns(await run("ok", "ok"), await run("ok", "refused", edited));
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toBe("Version B was declined by the provider's safety system — not comparable (see the note under “3. Review findings”)");
  });

  it("A refused + B timed out → no note, and both reasons with a rerun hint", async () => {
    const latest = await run("refused", "timeout", edited);
    expect(providerRefusalAsymmetryNote(latest)).toBeNull();
    const c = compareRuns(await run("ok", "ok"), latest);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toBe("Versions A and B did not complete (A: declined by the provider; B: timed out) — rerun to compare");
  });

  it("both refused → no note, both reasons with a rerun hint", async () => {
    const latest = await run("refused", "refused", edited);
    expect(providerRefusalAsymmetryNote(latest)).toBeNull();
    const c = compareRuns(await run("ok", "ok"), latest);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toBe("Versions A and B did not complete (A: declined by the provider; B: declined by the provider) — rerun to compare");
  });
});
