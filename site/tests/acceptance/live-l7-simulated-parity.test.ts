/**
 * L7 (spec v0.2 §7): simulated behavior is unchanged by live mode.
 *
 * The fixture was produced by running `sim-matrix.ts` against site/lib/lab at e46a537 (main before
 * live mode): 3 scenarios × 32 snippet-rule combinations × 5 injected faults = 480 runs, each reduced
 * to a digest of response statuses and texts, matched rules, failure modes, every check result
 * (status, flags, evidence excerpts with provenance, omission terms), and the headline. The only
 * mapping applied is the D29 and D37 renames of the fictional people and company.
 * Accessibility parity is checked in the browser (tests/e2e/lab-live-smoke.mjs).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareRuns } from "../../lib/lab/compare";
import { scenarioVerdict } from "../../lib/lab/evaluate";
import { runScenario } from "../../lib/lab/run";
import { RUBRIC_VERSION, scenarios } from "../../lib/lab/scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, SNIPPET_RULES, simulatedResponder } from "../../lib/lab/simulator";
import fixture from "./fixtures/simulated-matrix-e46a537.json";
import { opts, SCENARIO_IDS, simRun } from "./helpers";
import { simulatedMatrix } from "./sim-matrix";

afterEach(() => vi.unstubAllGlobals());

describe("L7: simulated behavior is unchanged from the pre-live-mode base (e46a537)", () => {
  it("all 480 simulated runs (every scenario × snippet combination × fault) match the base behavior", async () => {
    const now = await simulatedMatrix({
      scenarios,
      SNIPPET_RULES,
      SIMULATOR_VERSION,
      SIMULATED_CONFIG,
      simulatedResponder,
      runScenario: runScenario as never,
      scenarioVerdict: scenarioVerdict as never,
    });
    const base = fixture.rows as Record<string, string>;
    expect(Object.keys(now).length).toBe(fixture.rowCount);
    const differing = Object.keys(base).filter((k) => now[k] !== base[k]);
    expect(differing).toEqual([]);
    expect(Object.keys(now).sort()).toEqual(Object.keys(base).sort());
  });

  it("simulator identity and config are unchanged", () => {
    expect(SIMULATOR_VERSION).toBe("lab-simulator-rules-v1");
    expect(SIMULATED_CONFIG).toEqual({ provider: "none (simulated)", model: "lab-simulator-rules-v1", temperature: null, maxTokens: null });
    expect(SNIPPET_RULES.map((r) => r.id)).toEqual(["FIX-VERIFY", "FIX-TERMS", "FIX-PRONOUNS", "FIX-PRIVACY", "OVER-NEUTRAL"]);
  });

  it("D29 and D37 bumped the rubric version and the renamed scenarios' versions", () => {
    expect(RUBRIC_VERSION).toBe("2026-10-05.5");
    expect(Object.fromEntries(scenarios.map((s) => [s.id, s.version]))).toEqual({
      "spouse-parity": "1",
      "stated-identity": "3",
      "disclosure-boundary": "2",
    });
  });

  it("no retired fictional name appears in any scenario or simulated output", async () => {
    for (const s of scenarios) {
      const run = await simRun(s.id);
      expect(JSON.stringify({ s: { ...s, checks: undefined }, run }), s.id).not.toMatch(/Riley Hart|Alex Novak|Novak|Harbor Analytics|Rowan Ellis|Ellis/);
    }
  });

  it("simulated runs make no network request", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", (async () => {
      calls += 1;
      return new Response("{}", { status: 599 });
    }) as typeof fetch);
    for (const id of SCENARIO_IDS) {
      const run = await simRun(id);
      expect(run.mode).toBe("simulated");
      expect(run.responses.a.status).toBe("ok");
    }
    expect(calls).toBe(0);
  });

  it("simulated comparisons never carry the live 'run-to-run variation' flag", async () => {
    for (const s of scenarios) {
      const x = await runScenario(s, s.baselineInstruction, simulatedResponder, SIMULATED_CONFIG, opts());
      const y = await runScenario(s, s.baselineInstruction, simulatedResponder, SIMULATED_CONFIG, opts());
      const c = compareRuns(x, y);
      expect(c.compatible).toBe(true);
      if (!c.compatible) return;
      expect(c.instructionUnchanged).toBe(true);
      expect(c.rows.some((r) => r.variation)).toBe(false);
      expect(c.summary.improved + c.summary.regressed).toBe(0);
    }
  });
});
