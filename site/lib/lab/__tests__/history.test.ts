import { describe, expect, it } from "vitest";
import { compareRuns, LIVE_CONFIG_DIFFERS, modelIdentityProblem, returnedModels, sameSetup } from "../compare";
import { emptyCompareState, planLiveComparison, selectBaseline } from "../history";
import { findModel, LIVE_RESPONDER_VERSION } from "../models";
import { renderInputs } from "../render";
import { liveConfig, runScenario, type Responder } from "../run";
import { getScenario } from "../scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder } from "../simulator";
import type { ResponseRecord, Run } from "../types";

const S1 = getScenario("spouse-parity");
const BASE = S1.baselineInstruction;
const EDITED = BASE + "\nRefer to people using the exact relationship terms the user uses.";
const HAIKU = findModel("anthropic", "claude-haiku-4-5")!;
const MINI = findModel("openai", "gpt-4o-mini")!;
const SONNET = findModel("anthropic", "claude-sonnet-5-5")!;
const SONNET_V = "claude-sonnet-5-5-20260901";
const HAIKU_V = "claude-haiku-4-5-20251001";

type Side = Partial<ResponseRecord>;
const ok = (returnedModel = HAIKU_V, text = "Happy to help! Add your husband, Jordan Lee, as an authorized user."): Side => ({
  status: "ok",
  text,
  returnedModel,
});
const failed = (status: ResponseRecord["status"] = "timeout"): Side => ({ status });

let seq = 0;
async function liveRun(instruction: string, a: Side, b: Side, model = HAIKU): Promise<Run> {
  seq += 1;
  const inputs = renderInputs(S1);
  const responder: Responder = async ({ input }) => ({ durationMs: 0, status: "ok", ...(input === inputs.a ? a : b) }) as ResponseRecord;
  return runScenario(S1, instruction, responder, liveConfig(model), {
    id: `live-${seq}`,
    createdAt: `2026-10-05T00:00:${String(seq).padStart(2, "0")}.000Z`,
    mode: "live",
    responderVersion: LIVE_RESPONDER_VERSION,
  });
}

describe("returnedModels", () => {
  it("is consistent only when both responses are ok with the same returned model", async () => {
    expect(returnedModels(await liveRun(BASE, ok(), ok()))).toEqual({ a: HAIKU_V, b: HAIKU_V, consistent: true });
    expect(returnedModels(await liveRun(BASE, ok(), ok("claude-haiku-4-5-xxxx")))).toEqual({
      a: HAIKU_V,
      b: "claude-haiku-4-5-xxxx",
      consistent: false,
    });
    expect(returnedModels(await liveRun(BASE, ok(), failed())).consistent).toBe(false);
  });
});

describe("compareRuns: live runs", () => {
  it("refuses a run whose versions were answered by different model versions", async () => {
    const before = await liveRun(BASE, ok(), ok());
    const after = await liveRun(EDITED, ok(), ok("claude-haiku-4-5-xxxx"));
    const c = compareRuns(before, after);
    expect(c).toEqual({ compatible: false, reason: "Versions A and B were answered by different model versions" });
    expect(compareRuns(after, before)).toEqual({ compatible: false, reason: "Versions A and B were answered by different model versions" });
  });

  it("refuses runs answered by different model versions", async () => {
    const before = await liveRun(BASE, ok(), ok());
    const after = await liveRun(EDITED, ok("claude-haiku-4-5-20260101"), ok("claude-haiku-4-5-20260101"));
    expect(compareRuns(before, after)).toEqual({ compatible: false, reason: "Different model versions answered the two runs" });
  });

  it("names a version that did not complete, before the model-id check", async () => {
    const before = await liveRun(BASE, ok(), ok());
    const cases: Array<[Side, string]> = [
      [failed("timeout"), "Version B did not complete (timed out) — rerun to compare"],
      [failed("model_error"), "Version B did not complete (model error) — rerun to compare"],
      [{ status: "not_run", error: "Cancelled" }, "Version B did not complete (cancelled) — rerun to compare"],

      [failed("credentials_unavailable"), "Version B did not complete (credentials unavailable) — rerun to compare"],
    ];
    for (const [b, reason] of cases) {
      const after = await liveRun(EDITED, ok(), b);
      expect(compareRuns(before, after)).toEqual({ compatible: false, reason });
      expect(compareRuns(after, before)).toEqual({ compatible: false, reason });
    }
    const both = await liveRun(EDITED, failed("timeout"), { status: "not_run", error: "Cancelled" });
    expect(compareRuns(before, both)).toEqual({
      compatible: false,
      reason: "Versions A and B did not complete (A: timed out; B: cancelled) — rerun to compare",
    });
  });

  it("a one-sided provider refusal is not comparable and points at the Findings note instead of inviting a rerun", async () => {
    const before = await liveRun(BASE, ok(), ok());
    const refused: Side = { status: "provider_refused", returnedModel: HAIKU_V };
    const NOTE_B = "Version B was declined by the provider's safety system — not comparable (see the note under “3. Review findings”)";
    const NOTE_A = "Version A was declined by the provider's safety system — not comparable (see the note under “3. Review findings”)";
    expect(compareRuns(before, await liveRun(EDITED, ok(), refused))).toEqual({ compatible: false, reason: NOTE_B });
    expect(compareRuns(before, await liveRun(EDITED, refused, ok()))).toEqual({ compatible: false, reason: NOTE_A });
    for (const r of [NOTE_A, NOTE_B]) expect(r).not.toMatch(/rerun/i);
    // When the other version also failed for another reason, the asymmetry is not established:
    // both are named and rerunning is legitimate.
    expect(compareRuns(before, await liveRun(EDITED, refused, failed("timeout")))).toEqual({
      compatible: false,
      reason: "Versions A and B did not complete (A: declined by the provider; B: timed out) — rerun to compare",
    });
    expect(compareRuns(before, await liveRun(EDITED, failed("model_error"), refused))).toEqual({
      compatible: false,
      reason: "Versions A and B did not complete (A: model error; B: declined by the provider) — rerun to compare",
    });
    // Timeouts and errors keep the rerun hint.
    const timedOut = compareRuns(before, await liveRun(EDITED, ok(), failed("timeout")));
    expect(timedOut.compatible === false && timedOut.reason).toBe("Version B did not complete (timed out) — rerun to compare");
  });

  it("refuses an ok version that reported no model id", async () => {
    const before = await liveRun(BASE, ok(), ok());
    const after = await liveRun(EDITED, ok(), { status: "ok", text: "Happy to help, Jordan." });
    const c = compareRuns(before, after);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toMatch(/Version B did not return a model id/);
  });

  it("refuses across providers or requested models (config)", async () => {
    const before = await liveRun(BASE, ok(), ok());
    const after = await liveRun(EDITED, ok("gpt-4o-mini-2024-07-18"), ok("gpt-4o-mini-2024-07-18"), MINI);
    const c = compareRuns(before, after);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toBe(LIVE_CONFIG_DIFFERS);
    expect(LIVE_CONFIG_DIFFERS).toBe("config differs (provider, model, temperature, or max tokens) — click “Run baseline live” with this model first.");
  });

  it("simulated runs keep the plain config-differs reason (no live hint)", async () => {
    const opts = (id: string) => ({ id, createdAt: "2026-10-05T00:00:00.000Z", mode: "simulated" as const, responderVersion: SIMULATOR_VERSION });
    const a = await runScenario(S1, BASE, simulatedResponder, SIMULATED_CONFIG, opts("s1"));
    const b = await runScenario(S1, BASE, simulatedResponder, { ...SIMULATED_CONFIG, maxTokens: 1 }, opts("s2"));
    expect(compareRuns(a, b)).toEqual({ compatible: false, reason: "config differs (provider, model, temperature, or max tokens)." });
  });

  it("compares consistent runs and marks same-instruction rows as run-to-run variation", async () => {
    const before = await liveRun(BASE, ok(), ok());
    const same = await liveRun(BASE, ok(), ok(HAIKU_V, "I'm sorry, but I can't add Jordan."));
    const c = compareRuns(before, same);
    if (!c.compatible) throw new Error(c.reason);
    expect(c.instructionUnchanged).toBe(true);
    expect(c.rows.every((r) => r.variation === true)).toBe(true);
    const edited = await liveRun(EDITED, ok(), ok());
    const c2 = compareRuns(before, edited);
    if (!c2.compatible) throw new Error(c2.reason);
    expect(c2.rows.every((r) => r.variation === undefined)).toBe(true);
  });

  it("live and simulated runs never compare", async () => {
    const live = await liveRun(BASE, ok(), ok());
    const sim = await runScenario(S1, BASE, simulatedResponder, SIMULATED_CONFIG, {
      id: "sim",
      createdAt: "2026-10-05T00:00:00.000Z",
      mode: "simulated",
      responderVersion: SIMULATOR_VERSION,
    });
    expect(compareRuns(sim, live).compatible).toBe(false);
    expect(compareRuns(live, sim).compatible).toBe(false);
  });

  it("simulated runs keep their existing behavior (no returned-model rule, no variation flag)", async () => {
    const opts = (id: string) => ({ id, createdAt: "2026-10-05T00:00:00.000Z", mode: "simulated" as const, responderVersion: SIMULATOR_VERSION });
    const a = await runScenario(S1, BASE, simulatedResponder, SIMULATED_CONFIG, opts("s1"));
    const b = await runScenario(S1, BASE, simulatedResponder, SIMULATED_CONFIG, { ...opts("s2"), fault: "timeout" });
    const c = compareRuns(a, b);
    if (!c.compatible) throw new Error(c.reason);
    expect(c.rows.every((r) => !("variation" in r))).toBe(true);
  });
});

describe("selectBaseline", () => {
  it("picks the most recent fully-ok, compatible run of the unedited baseline instruction", async () => {
    const b1 = await liveRun(BASE, ok(), ok());
    const b2 = await liveRun(BASE, ok(), ok());
    const latest = await liveRun(EDITED, ok(), ok());
    expect(selectBaseline([b1, b2, latest], latest, BASE)?.id).toBe(b2.id);
  });

  it("skips baseline runs with errors, edited-instruction runs, and incompatible runs", async () => {
    const good = await liveRun(BASE, ok(), ok());
    const withErrors = await liveRun(BASE, ok(), failed("model_error"));
    const edited = await liveRun(EDITED, ok(), ok());
    const otherModel = await liveRun(BASE, ok("gpt-4o-mini-2024-07-18"), ok("gpt-4o-mini-2024-07-18"), MINI);
    const latest = await liveRun(EDITED, ok(), ok());
    expect(selectBaseline([good, withErrors, edited, otherModel, latest], latest, BASE)?.id).toBe(good.id);
    expect(selectBaseline([withErrors, edited, otherModel, latest], latest, BASE)).toBeNull();
  });

  it("never selects the latest run itself", async () => {
    const only = await liveRun(BASE, ok(), ok());
    expect(selectBaseline([only], only, BASE)).toBeNull();
  });

  it("a second baseline run compares with the first (same instruction)", async () => {
    const first = await liveRun(BASE, ok(), ok());
    const second = await liveRun(BASE, ok(), ok());
    expect(selectBaseline([first, second], second, BASE)?.id).toBe(first.id);
  });
});

describe("emptyCompareState", () => {
  it("no live run yet", () => {
    expect(emptyCompareState([], null, BASE)).toBe("no_live_run");
  });

  it("live baseline only — edit and rerun", async () => {
    const only = await liveRun(BASE, ok(), ok());
    expect(emptyCompareState([only], only, BASE)).toBe("baseline_only");
  });

  it("live baseline had errors — run it again", async () => {
    const broken = await liveRun(BASE, ok(), failed("timeout"));
    expect(emptyCompareState([broken], broken, BASE)).toBe("baseline_errors");
    const edited = await liveRun(EDITED, ok(), ok());
    expect(emptyCompareState([broken, edited], edited, BASE)).toBe("baseline_errors");
  });

  it("no live baseline yet when only edited runs exist", async () => {
    const edited = await liveRun(EDITED, ok(), ok());
    expect(emptyCompareState([edited], edited, BASE)).toBe("no_live_run");
  });

  it("null when a comparable baseline exists", async () => {
    const base = await liveRun(BASE, ok(), ok());
    const latest = await liveRun(EDITED, ok(), ok());
    expect(emptyCompareState([base, latest], latest, BASE)).toBeNull();
  });

  it("null (so the refusal reason can be shown) when the only ok baseline is incompatible", async () => {
    const base = await liveRun(BASE, ok(), ok());
    const latest = await liveRun(EDITED, ok("claude-haiku-4-5-20260101"), ok("claude-haiku-4-5-20260101"));
    expect(emptyCompareState([base, latest], latest, BASE)).toBeNull();
    expect(planLiveComparison([base, latest], latest, BASE)).toEqual({ baseline: base });
  });
});

describe("B1: a live baseline run is never compared with a baseline of another model", () => {
  const sonnetOk = (v = SONNET_V) => ok(v);

  it("the PO repro: Haiku baseline → switch to Sonnet → Sonnet baseline is 'baseline only'; then an edited Sonnet run compares Sonnet with Sonnet", async () => {
    const haikuBase = await liveRun(BASE, ok(), ok());
    const sonnetBase = await liveRun(BASE, sonnetOk(), sonnetOk(), SONNET);
    let runs = [haikuBase, sonnetBase];
    expect(planLiveComparison(runs, sonnetBase, BASE)).toEqual({ empty: "baseline_only" });
    expect(emptyCompareState(runs, sonnetBase, BASE)).toBe("baseline_only");

    const sonnetEdited = await liveRun(EDITED, sonnetOk(), sonnetOk(), SONNET);
    runs = [...runs, sonnetEdited];
    expect(planLiveComparison(runs, sonnetEdited, BASE)).toEqual({ baseline: sonnetBase });
    const c = compareRuns(sonnetBase, sonnetEdited);
    if (!c.compatible) throw new Error(c.reason);
    expect(c.instructionUnchanged).toBe(false);
    expect(c.rows.every((r) => !("variation" in r))).toBe(true);
  });

  it("the same instruction twice on the new model is run-to-run variation against that model's baseline", async () => {
    const haikuBase = await liveRun(BASE, ok(), ok());
    const sonnetBase = await liveRun(BASE, sonnetOk(), sonnetOk(), SONNET);
    const sonnetAgain = await liveRun(BASE, sonnetOk(), sonnetOk(), SONNET);
    const runs = [haikuBase, sonnetBase, sonnetAgain];
    expect(planLiveComparison(runs, sonnetAgain, BASE)).toEqual({ baseline: sonnetBase });
    const c = compareRuns(sonnetBase, sonnetAgain);
    if (!c.compatible) throw new Error(c.reason);
    expect(c.rows.every((r) => r.variation === true)).toBe(true);
  });

  it("switching back to Haiku and editing compares with the Haiku baseline, not the newer Sonnet one", async () => {
    const haikuBase = await liveRun(BASE, ok(), ok());
    const sonnetBase = await liveRun(BASE, sonnetOk(), sonnetOk(), SONNET);
    const haikuEdited = await liveRun(EDITED, ok(), ok());
    expect(planLiveComparison([haikuBase, sonnetBase, haikuEdited], haikuEdited, BASE)).toEqual({ baseline: haikuBase });
  });

  it("an edited run with no baseline for its model keeps the not-comparable reason, with the actionable hint", async () => {
    const haikuBase = await liveRun(BASE, ok(), ok());
    const sonnetEdited = await liveRun(EDITED, sonnetOk(), sonnetOk(), SONNET);
    const plan = planLiveComparison([haikuBase, sonnetEdited], sonnetEdited, BASE);
    expect(plan).toEqual({ baseline: haikuBase });
    expect(compareRuns(haikuBase, sonnetEdited)).toEqual({ compatible: false, reason: LIVE_CONFIG_DIFFERS });
  });

  it("an edited run prefers a same-model baseline's reason over a newer other-model baseline", async () => {
    const sonnetOld = await liveRun(BASE, sonnetOk("claude-sonnet-5-5-20260101"), sonnetOk("claude-sonnet-5-5-20260101"), SONNET);
    const haikuBase = await liveRun(BASE, ok(), ok());
    const sonnetEdited = await liveRun(EDITED, sonnetOk(), sonnetOk(), SONNET);
    expect(planLiveComparison([sonnetOld, haikuBase, sonnetEdited], sonnetEdited, BASE)).toEqual({ baseline: sonnetOld });
    expect(compareRuns(sonnetOld, sonnetEdited)).toEqual({ compatible: false, reason: "Different model versions answered the two runs" });
  });

  it("a new-model baseline with errors says 'baseline had errors', never 'config differs'", async () => {
    const haikuBase = await liveRun(BASE, ok(), ok());
    const sonnetBroken = await liveRun(BASE, sonnetOk(), failed("timeout"), SONNET);
    expect(planLiveComparison([haikuBase, sonnetBroken], sonnetBroken, BASE)).toEqual({ empty: "baseline_errors" });
  });

  it("a baseline rerun with errors still says which version did not complete when the same model has an ok baseline", async () => {
    const sonnetBase = await liveRun(BASE, sonnetOk(), sonnetOk(), SONNET);
    const haikuBase = await liveRun(BASE, ok(), ok());
    const sonnetBroken = await liveRun(BASE, sonnetOk(), failed("timeout"), SONNET);
    expect(planLiveComparison([sonnetBase, haikuBase, sonnetBroken], sonnetBroken, BASE)).toEqual({ baseline: sonnetBase });
    expect(compareRuns(sonnetBase, sonnetBroken)).toEqual({ compatible: false, reason: "Version B did not complete (timed out) — rerun to compare" });
  });

  it("a fully ok baseline answered by a new model version is the new baseline ('baseline only')", async () => {
    const oldSnapshot = await liveRun(BASE, ok("claude-haiku-4-5-20250101"), ok("claude-haiku-4-5-20250101"));
    const newSnapshot = await liveRun(BASE, ok(), ok());
    expect(planLiveComparison([oldSnapshot, newSnapshot], newSnapshot, BASE)).toEqual({ empty: "baseline_only" });
  });

  it("over every history of up to three runs (two models × edited or not × ok, timed out, split model ids, or a missing id), the plan holds the rules", async () => {
    type Outcome = "ok" | "timeout" | "split" | "missing";
    type Kind = { model: typeof HAIKU; instruction: string; outcome: Outcome };
    const kinds: Kind[] = [];
    for (const model of [HAIKU, SONNET])
      for (const instruction of [BASE, EDITED])
        for (const outcome of ["ok", "timeout", "split", "missing"] as const) kinds.push({ model, instruction, outcome });
    const make = (k: Kind) => {
      const v = k.model === HAIKU ? HAIKU_V : SONNET_V;
      const b: Side = { ok: ok(v), timeout: failed("timeout"), split: ok(`${v}-other`), missing: { status: "ok", text: ok(v).text } as Side }[k.outcome];
      return liveRun(k.instruction, ok(v), b, k.model);
    };
    // One run per kind and position, so ids are distinct within every history.
    const pool = await Promise.all([0, 1, 2].map(() => Promise.all(kinds.map(make))));
    const kindOf = new Map<Run, Kind>();
    pool.forEach((row) => row.forEach((r, i) => kindOf.set(r, kinds[i])));
    const histories: Run[][] = [];
    for (let x = 0; x < kinds.length; x++) {
      histories.push([pool[0][x]]);
      for (let y = 0; y < kinds.length; y++) {
        histories.push([pool[0][x], pool[1][y]]);
        for (let z = 0; z < kinds.length; z++) histories.push([pool[0][x], pool[1][y], pool[2][z]]);
      }
    }
    const usable = (r: Run) => returnedModels(r).consistent;
    const fullyOkRun = (r: Run) => r.responses.a.status === "ok" && r.responses.b.status === "ok";
    for (const runs of histories) {
      const latest = runs[runs.length - 1];
      const plan = planLiveComparison(runs, latest, BASE);
      const label = runs.map((r) => `${kindOf.get(r)!.model.id}/${r.instruction === BASE ? "base" : "edited"}/${kindOf.get(r)!.outcome}`).join(" → ");
      const compatible = selectBaseline(runs, latest, BASE);
      // A run whose A and B model ids differ or are missing is never selected as a baseline.
      if (compatible) expect(usable(compatible), label).toBe(true);
      // "Baseline only" means the latest run is a usable run of the unedited instruction.
      if ("empty" in plan && plan.empty === "baseline_only") expect(latest.instruction === BASE && usable(latest), label).toBe(true);
      // "Not comparable" on its own: an unedited, fully-ok latest run with an A/B model-id problem and no same-setup ok baseline.
      if ("notComparable" in plan) {
        expect(latest.instruction === BASE && fullyOkRun(latest) && !usable(latest), label).toBe(true);
        expect(plan.notComparable, label).toBe(modelIdentityProblem(latest));
      }
      if (compatible) {
        expect(plan, label).toEqual({ baseline: compatible });
      } else if (latest.instruction === BASE) {
        if (usable(latest)) expect(plan, label).toEqual({ empty: "baseline_only" });
        if ("baseline" in plan) {
          // Never compared with another model's baseline, nor with an unusable one: the reason is the latest run's own.
          expect(sameSetup(plan.baseline, latest), label).toBe(true);
          expect(usable(plan.baseline), label).toBe(true);
          expect(compareRuns(plan.baseline, latest), label).toEqual({ compatible: false, reason: modelIdentityProblem(latest) });
        }
        if (fullyOkRun(latest) && !usable(latest)) expect("notComparable" in plan || "baseline" in plan, label).toBe(true);
        if ("notComparable" in plan) {
          const usableSameModel = runs.some((r) => r !== latest && r.instruction === BASE && usable(r) && sameSetup(r, latest));
          expect(usableSameModel, label).toBe(false);
        }
      } else if ("baseline" in plan) {
        // An edited run's refusal names a config difference only when no same-model ok baseline exists.
        const c = compareRuns(plan.baseline, latest);
        expect(c.compatible, label).toBe(false);
        const sameModelOk = runs.some((r) => r !== latest && r.instruction === BASE && fullyOkRun(r) && sameSetup(r, latest));
        if (!c.compatible) expect(c.reason === LIVE_CONFIG_DIFFERS, label).toBe(!sameModelOk);
      }
    }
    expect(histories).toHaveLength(16 + 16 ** 2 + 16 ** 3);
  });

  describe("a baseline run whose A and B model ids differ, or miss one, is not comparable (spec §4)", () => {
    const SPLIT_REASON = "Versions A and B were answered by different model versions";
    const MISSING_B = "Version B did not return a model id, so the model version is unknown";
    const missingId: Side = { status: "ok", text: ok().text };

    it("alone: shows the A/B reason, never 'baseline only'", async () => {
      const split = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      expect(planLiveComparison([split], split, BASE)).toEqual({ notComparable: SPLIT_REASON });
      expect(emptyCompareState([split], split, BASE)).toBeNull();
      const missing = await liveRun(BASE, ok(), missingId);
      expect(missing.responses.b.returnedModel).toBeUndefined();
      expect(planLiveComparison([missing], missing, BASE)).toEqual({ notComparable: MISSING_B });
    });

    it("after another model's baseline: still the A/B reason, never 'config differs' and never 'baseline only'", async () => {
      const sonnetBase = await liveRun(BASE, ok(SONNET_V), ok(SONNET_V), SONNET);
      const split = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      expect(planLiveComparison([sonnetBase, split], split, BASE)).toEqual({ notComparable: SPLIT_REASON });
    });

    it("with an ok baseline of the same model: compared with it, so the reason shows", async () => {
      const good = await liveRun(BASE, ok(), ok());
      const split = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      expect(planLiveComparison([good, split], split, BASE)).toEqual({ baseline: good });
      expect(compareRuns(good, split)).toEqual({ compatible: false, reason: SPLIT_REASON });
      const missing = await liveRun(BASE, ok(), missingId);
      expect(planLiveComparison([good, missing], missing, BASE)).toEqual({ baseline: good });
      expect(compareRuns(good, missing)).toEqual({ compatible: false, reason: MISSING_B });
    });

    it("is never selected as the baseline for a later run, which uses the older usable baseline instead", async () => {
      const good = await liveRun(BASE, ok(), ok());
      const split = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      const missing = await liveRun(BASE, ok(), missingId);
      const edited = await liveRun(EDITED, ok(), ok());
      expect(selectBaseline([good, split, missing, edited], edited, BASE)).toBe(good);
      expect(planLiveComparison([good, split, missing, edited], edited, BASE)).toEqual({ baseline: good });
      expect(selectBaseline([split, missing, edited], edited, BASE)).toBeNull();
      const again = await liveRun(BASE, ok(), ok());
      expect(selectBaseline([good, split, again], again, BASE)).toBe(good);
    });

    it("after an unusable same-model baseline: shows its own reason, not the earlier run's", async () => {
      const split = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      const missing = await liveRun(BASE, ok(), missingId);
      expect(planLiveComparison([split, missing], missing, BASE)).toEqual({ notComparable: MISSING_B });
      const missingThenSplit = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      expect(planLiveComparison([missing, missingThenSplit], missingThenSplit, BASE)).toEqual({ notComparable: SPLIT_REASON });
      // A baseline rerun with errors is not compared with an unusable baseline either.
      const broken = await liveRun(BASE, ok(), failed("timeout"));
      expect(planLiveComparison([split, broken], broken, BASE)).toEqual({ empty: "baseline_errors" });
    });

    it("an edited run with only unusable same-model baselines is refused with their reason, not compared silently", async () => {
      const split = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      const edited = await liveRun(EDITED, ok(), ok());
      expect(planLiveComparison([split, edited], edited, BASE)).toEqual({ baseline: split });
      expect(compareRuns(split, edited)).toEqual({ compatible: false, reason: SPLIT_REASON });
    });

    it("a usable same-model baseline is preferred over a more recent unusable one", async () => {
      const v1 = await liveRun(BASE, ok("claude-haiku-4-5-20250101"), ok("claude-haiku-4-5-20250101"));
      const split = await liveRun(BASE, ok(), ok("claude-haiku-4-5-20260101"));
      const edited = await liveRun(EDITED, ok(), ok());
      expect(planLiveComparison([v1, split, edited], edited, BASE)).toEqual({ baseline: v1 });
      expect(compareRuns(v1, edited)).toEqual({ compatible: false, reason: "Different model versions answered the two runs" });
    });
  });

  describe("the most recent same-model ok baseline is used when none is compatible", () => {
    it("for an edited run answered by a newer model version", async () => {
      const v1 = await liveRun(BASE, ok("claude-haiku-4-5-20250101"), ok("claude-haiku-4-5-20250101"));
      const v2 = await liveRun(BASE, ok("claude-haiku-4-5-20250601"), ok("claude-haiku-4-5-20250601"));
      const edited = await liveRun(EDITED, ok(), ok());
      expect(selectBaseline([v1, v2, edited], edited, BASE)).toBeNull();
      expect(planLiveComparison([v1, v2, edited], edited, BASE)).toEqual({ baseline: v2 });
    });

    it("for a baseline rerun with errors", async () => {
      const v1 = await liveRun(BASE, ok("claude-haiku-4-5-20250101"), ok("claude-haiku-4-5-20250101"));
      const v2 = await liveRun(BASE, ok("claude-haiku-4-5-20250601"), ok("claude-haiku-4-5-20250601"));
      const broken = await liveRun(BASE, ok(), failed("timeout"));
      expect(planLiveComparison([v1, v2, broken], broken, BASE)).toEqual({ baseline: v2 });
    });

    it("for an edited run when only another model has baselines", async () => {
      const s1 = await liveRun(BASE, ok(SONNET_V), ok(SONNET_V), SONNET);
      const s2 = await liveRun(BASE, ok(SONNET_V), ok(SONNET_V), SONNET);
      const edited = await liveRun(EDITED, ok(), ok());
      expect(planLiveComparison([s1, s2, edited], edited, BASE)).toEqual({ baseline: s2 });
    });
  });
});
