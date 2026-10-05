import { describe, expect, it } from "vitest";
import { compareRuns, returnedModels } from "../compare";
import { emptyCompareState, latestOkBaseline, selectBaseline } from "../history";
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
    if (!c.compatible) expect(c.reason).toMatch(/config/);
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
    expect(latestOkBaseline([base, latest], latest, BASE)?.id).toBe(base.id);
  });
});
