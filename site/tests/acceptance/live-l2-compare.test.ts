/**
 * L2 (spec v0.2 §7, §1 step 4, §4): a live baseline plus a rerun produce a comparable pair;
 * live and simulated runs never compare; mismatched returned model ids are not comparable.
 *
 * Every live run here goes client responder → real route handler → fake SDK client, so the
 * returned model id each version reports is exactly what a provider would have said.
 */
import { describe, expect, it } from "vitest";
import { compareRuns, LIVE_CONFIG_DIFFERS, returnedModels } from "../../lib/lab/compare";
import { emptyCompareState, planLiveComparison, selectBaseline } from "../../lib/lab/history";
import { renderInputs } from "../../lib/lab/render";
import { getScenario } from "../../lib/lab/scenarios";
import type { Run } from "../../lib/lab/types";
import { simRun, SNIP, withSnippets } from "./helpers";
import { fakeClients, GPT41_MINI, GPT4O_MINI, HAIKU, liveRun, perVariant, SONNET } from "./live-helpers";

const s = getScenario("spouse-parity");
const BASE = s.baselineInstruction;
const EDITED = withSnippets(BASE, SNIP.verify, SNIP.terms);

// Scripted provider text: the baseline answer asks only the same-sex couple for documents; the edited one does not.
const BAD = {
  a: "Happy to help! To add your wife, Jordan Lee, as an authorized user, sign in and open Authorized users.",
  b: "To add your partner, Jordan Lee, as an authorized user, please send a marriage certificate and a government-issued photo ID.",
};
const GOOD = {
  a: BAD.a,
  b: "Happy to help! To add your husband, Jordan Lee, as an authorized user, sign in and open Authorized users.",
};
const HAIKU_V = "claude-haiku-4-5-20251001";

async function live(instruction: string, texts = instruction === BASE ? BAD : GOOD, returned: { a?: string; b?: string } = {}, modelId = HAIKU) {
  const fake = fakeClients(perVariant(s, texts, { a: returned.a ?? HAIKU_V, b: returned.b ?? returned.a ?? HAIKU_V }));
  return (await liveRun(s, instruction, modelId, fake.clients)).run;
}

async function failingLive(instruction: string): Promise<Run> {
  const fake = fakeClients(() => {
    throw new Error("upstream down");
  });
  return (await liveRun(s, instruction, HAIKU, fake.clients)).run;
}

describe("L2: live baseline, then rerun, produce a comparable pair", () => {
  it("no live run yet → 'no live run' empty state", () => {
    expect(emptyCompareState([], null, BASE)).toBe("no_live_run");
  });

  it("a live baseline alone → 'baseline only' (edit and rerun)", async () => {
    const baseline = await live(BASE);
    expect(baseline.responses.a.status).toBe("ok");
    expect(emptyCompareState([baseline], baseline, BASE)).toBe("baseline_only");
    expect(selectBaseline([baseline], baseline, BASE)).toBeNull();
  });

  it("baseline then edited rerun: compatible, the edit is attributed, and the fixed answer improves", async () => {
    const baseline = await live(BASE);
    const rerun = await live(EDITED);
    const runs = [baseline, rerun];
    expect(emptyCompareState(runs, rerun, BASE)).toBeNull();
    expect(selectBaseline(runs, rerun, BASE)?.id).toBe(baseline.id);
    const c = compareRuns(baseline, rerun);
    expect(c.compatible).toBe(true);
    if (!c.compatible) return;
    expect(c.instructionUnchanged).toBe(false);
    expect(c.summary.improved).toBeGreaterThan(0);
    expect(c.summary.regressed).toBe(0);
    expect(c.rows.some((r) => r.variation)).toBe(false);
    expect(returnedModels(baseline)).toEqual({ a: HAIKU_V, b: HAIKU_V, consistent: true });
  });

  it("the baseline is the most recent fully-ok run of the unedited instruction that is compatible", async () => {
    const older = await live(BASE);
    const errored = await failingLive(BASE);
    const newer = await live(BASE);
    const editedOk = await live(EDITED);
    const latest = await live(withSnippets(BASE, SNIP.verify));
    const runs = [older, newer, errored, editedOk, latest];
    expect(selectBaseline(runs, latest, BASE)?.id).toBe(newer.id);
    // An errored baseline and an edited run are never chosen.
    expect(selectBaseline([older, errored, editedOk, latest], latest, BASE)?.id).toBe(older.id);
    expect(selectBaseline([errored, editedOk, latest], latest, BASE)).toBeNull();
  });

  it("a live baseline that had errors → 'baseline had errors', even after an edited rerun", async () => {
    const errored = await failingLive(BASE);
    expect(errored.responses.a.status).toBe("model_error");
    expect(emptyCompareState([errored], errored, BASE)).toBe("baseline_errors");
    const rerun = await live(EDITED);
    expect(emptyCompareState([errored, rerun], rerun, BASE)).toBe("baseline_errors");
    expect(selectBaseline([errored, rerun], rerun, BASE)).toBeNull();
  });

  it("only one version failing also disqualifies a baseline (fully ok means both A and B)", async () => {
    const inputs = renderInputs(s);
    const fake = fakeClients((call) => {
      const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
      if (u === inputs.b) throw new Error("B failed");
      return { content: [{ type: "text", text: BAD.a }], model: HAIKU_V, stop_reason: "end_turn" };
    });
    const half = (await liveRun(s, BASE, HAIKU, fake.clients)).run;
    expect([half.responses.a.status, half.responses.b.status]).toEqual(["ok", "model_error"]);
    const rerun = await live(EDITED);
    expect(selectBaseline([half, rerun], rerun, BASE)).toBeNull();
    expect(emptyCompareState([half, rerun], rerun, BASE)).toBe("baseline_errors");
  });

  it("running the unedited instruction twice marks every row as run-to-run variation", async () => {
    const first = await live(BASE);
    const second = await live(BASE, GOOD); // same instruction, different (nondeterministic) answer
    const c = compareRuns(first, second);
    expect(c.compatible).toBe(true);
    if (!c.compatible) return;
    expect(c.instructionUnchanged).toBe(true);
    expect(c.rows.length).toBeGreaterThan(0);
    expect(c.rows.every((r) => r.variation === true)).toBe(true);
  });
});

describe("L2: live and simulated runs never compare", () => {
  it("simulated baseline vs live rerun, and live baseline vs simulated rerun, are both refused", async () => {
    const sim = await simRun(s.id);
    const simEdited = await simRun(s.id, EDITED);
    const liveBase = await live(BASE);
    const liveEdited = await live(EDITED);
    for (const [x, y] of [
      [sim, liveEdited],
      [liveBase, simEdited],
      [liveEdited, sim],
      [simEdited, liveBase],
    ] as const) {
      const c = compareRuns(x, y);
      expect(c.compatible).toBe(false);
      if (c.compatible) return;
      expect(c.reason).toMatch(/mode differs|responderVersion differs|config differs/);
    }
  });

  it("a simulated run of the baseline instruction is never selected as the live baseline", async () => {
    const sim = await simRun(s.id);
    const liveEdited = await live(EDITED);
    expect(selectBaseline([sim, liveEdited], liveEdited, BASE)).toBeNull();
  });
});

describe("L2: mismatched returned model ids are not comparable", () => {
  it("A and B answered by different model versions within one run → not comparable, with the reason", async () => {
    const baseline = await live(BASE);
    const split = await live(EDITED, GOOD, { a: HAIKU_V, b: "claude-haiku-4-5-20260101" });
    expect(returnedModels(split).consistent).toBe(false);
    for (const [x, y] of [
      [baseline, split],
      [split, baseline],
    ] as const) {
      const c = compareRuns(x, y);
      expect(c.compatible).toBe(false);
      if (!c.compatible) expect(c.reason).toBe("Versions A and B were answered by different model versions");
    }
    // A split run is never a baseline.
    const splitBase = await live(BASE, BAD, { a: HAIKU_V, b: "claude-haiku-4-5-20260101" });
    const rerun = await live(EDITED);
    expect(selectBaseline([splitBase, rerun], rerun, BASE)).toBeNull();
  });

  it("the two runs answered by different model versions → not comparable; an older matching baseline is chosen instead", async () => {
    const oldMatching = await live(BASE);
    const newerOther = await live(BASE, BAD, { a: "claude-haiku-4-5-20260101" });
    const rerun = await live(EDITED);
    const c = compareRuns(newerOther, rerun);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toBe("Different model versions answered the two runs");
    expect(selectBaseline([oldMatching, newerOther, rerun], rerun, BASE)?.id).toBe(oldMatching.id);
  });

  it("a run whose provider did not report a model id is not comparable", async () => {
    const fake = fakeClients(() => ({ content: [{ type: "text", text: BAD.a }], stop_reason: "end_turn" }));
    const unknown = (await liveRun(s, BASE, HAIKU, fake.clients)).run;
    expect(unknown.responses.a.returnedModel).toBeUndefined();
    const rerun = await live(EDITED);
    const c = compareRuns(unknown, rerun);
    expect(c.compatible).toBe(false);
  });

  it("a different requested model or provider is not comparable, even with matching returned ids", async () => {
    const baseline = await live(BASE);
    for (const other of [SONNET, GPT4O_MINI, GPT41_MINI]) {
      const rerun = await live(EDITED, GOOD, { a: HAIKU_V }, other);
      const c = compareRuns(baseline, rerun);
      expect(c.compatible, other).toBe(false);
      expect(selectBaseline([baseline, rerun], rerun, BASE), other).toBeNull();
    }
  });
});

describe("L2 / fix round: a live run with a version that did not complete is not comparable, and says why", () => {
  const failB = (inputsB: string) => (call: Parameters<NonNullable<Parameters<typeof fakeClients>[0]>>[0]) => {
    const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
    if (u === inputsB) throw new Error("upstream failure");
    return { content: [{ type: "text", text: GOOD.a }], model: HAIKU_V, stop_reason: "end_turn" };
  };

  it("Version B failed → 'Version B did not complete (model error) — rerun to compare'", async () => {
    const baseline = await live(BASE);
    const rerunFail = (await liveRun(s, EDITED, HAIKU, fakeClients(failB(renderInputs(s).b)).clients)).run;
    const c = compareRuns(baseline, rerunFail);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toBe("Version B did not complete (model error) — rerun to compare");
  });

  it("both versions failed, with different reasons → both named", async () => {
    const baseline = await live(BASE);
    const inputs = renderInputs(s);
    const fake = fakeClients((call) => {
      const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
      if (u === inputs.a) return { content: [], model: HAIKU_V, stop_reason: "refusal" };
      throw Object.assign(new Error("x"), {});
    });
    const run = (await liveRun(s, EDITED, HAIKU, fake.clients)).run;
    expect([run.responses.a.status, run.responses.b.status]).toEqual(["provider_refused", "model_error"]);
    const c = compareRuns(baseline, run);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toBe("Versions A and B did not complete (A: declined by the provider; B: model error) — rerun to compare");
  });

  it("no key at all → 'credentials unavailable' named for both versions", async () => {
    const baseline = await live(BASE);
    const run = (await liveRun(s, EDITED, HAIKU, fakeClients().clients, { key: null })).run;
    const c = compareRuns(baseline, run);
    expect(c.compatible).toBe(false);
    if (!c.compatible) expect(c.reason).toMatch(/^Versions A and B did not complete \(A: credentials unavailable; B: credentials unavailable\)/);
  });
});

// ---------------------------------------------------------------------------
// B1 (PO real-key smoke test): a new model's baseline is a baseline, never compared with another model's.
// Expectations from spec §1 step 4 and §4: the baseline is the most recent fully-ok run of the unedited
// instruction that is compatible with the latest run; empty states "No live run yet", "Live baseline only —
// edit and rerun", "Live baseline had errors — run it again".
// ---------------------------------------------------------------------------

const RETURNED: Record<string, string> = {
  [HAIKU]: "claude-haiku-4-5-20251001",
  [SONNET]: "claude-sonnet-5-5-20260901",
  [GPT4O_MINI]: "gpt-4o-mini-2024-07-18",
  [GPT41_MINI]: "gpt-4.1-mini-2025-04-14",
};
let b1seq = 0;
async function modelRun(modelId: string, instruction: string, ok = true): Promise<Run> {
  const inputs = renderInputs(s);
  const fake = fakeClients((call) => {
    const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
    if (!ok && u === inputs.b) throw new Error("upstream failure");
    return perVariant(s, instruction === BASE ? BAD : GOOD, { a: RETURNED[modelId], b: RETURNED[modelId] })(call);
  });
  b1seq += 1;
  return (await liveRun(s, instruction, modelId, fake.clients, { id: `b1-${b1seq}` })).run;
}

/** A fully-ok run whose versions report the given model ids (an id left out is not reported). */
async function splitRun(modelId: string, instruction: string, ids: { a?: string; b?: string }): Promise<Run> {
  const inputs = renderInputs(s);
  const fake = fakeClients((call) => {
    const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
    const v = u === inputs.a ? "a" : "b";
    const text = (instruction === BASE ? BAD : GOOD)[v];
    const id = ids[v];
    const base = call.provider === "anthropic" ? { content: [{ type: "text", text }], stop_reason: "end_turn" } : { choices: [{ index: 0, message: { role: "assistant", content: text, refusal: null }, finish_reason: "stop" }] };
    return id ? { ...base, model: id } : base;
  });
  b1seq += 1;
  return (await liveRun(s, instruction, modelId, fake.clients, { id: `b1s-${b1seq}` })).run;
}

/** What section 5 shows: an empty state, or the comparison/refusal against the planned baseline. */
type Section5 =
  | { empty: "no_live_run" | "baseline_only" | "baseline_errors" }
  | { notComparable: string }
  | { baselineId: string; comparison: ReturnType<typeof compareRuns> };
function section5(runs: Run[], latest: Run): Section5 {
  const plan = planLiveComparison(runs, latest, BASE);
  if ("empty" in plan) return { empty: plan.empty };
  if ("notComparable" in plan) return { notComparable: plan.notComparable };
  return { baselineId: plan.baseline.id, comparison: compareRuns(plan.baseline, latest) };
}

describe("B1: the PO's sequence — a new model's baseline is 'baseline only', then compared with itself", () => {
  it("the actionable config reason is the exact copy in the source", () => {
    expect(LIVE_CONFIG_DIFFERS).toBe("config differs (provider, model, temperature, or max tokens) — click “Run baseline live” with this model first.");
  });

  it("Haiku baseline → Sonnet baseline → Sonnet edited → Haiku edited → GPT-4o mini edited", async () => {
    const runs: Run[] = [];
    const haikuBase = await modelRun(HAIKU, BASE);
    runs.push(haikuBase);
    expect(section5(runs, haikuBase)).toEqual({ empty: "baseline_only" });

    // The reported bug: the Sonnet baseline was compared with the Haiku baseline ("config differs").
    const sonnetBase = await modelRun(SONNET, BASE);
    runs.push(sonnetBase);
    expect(section5(runs, sonnetBase)).toEqual({ empty: "baseline_only" });

    const sonnetEdited = await modelRun(SONNET, EDITED);
    runs.push(sonnetEdited);
    const s5 = section5(runs, sonnetEdited);
    expect("baselineId" in s5 && s5.baselineId).toBe(sonnetBase.id);
    if (!("comparison" in s5)) throw new Error("expected a comparison");
    expect(s5.comparison.compatible).toBe(true);
    if (s5.comparison.compatible) {
      expect(s5.comparison.summary.improved).toBeGreaterThan(0);
      expect(s5.comparison.rows.some((r) => r.variation)).toBe(false);
    }

    const haikuEdited = await modelRun(HAIKU, EDITED);
    runs.push(haikuEdited);
    const h5 = section5(runs, haikuEdited);
    expect("baselineId" in h5 && h5.baselineId).toBe(haikuBase.id);
    expect("comparison" in h5 && h5.comparison.compatible).toBe(true);

    const gptEdited = await modelRun(GPT4O_MINI, EDITED);
    runs.push(gptEdited);
    const g5 = section5(runs, gptEdited);
    if (!("comparison" in g5)) throw new Error("expected a refusal with a reason");
    expect(g5.comparison.compatible).toBe(false);
    if (!g5.comparison.compatible) expect(g5.comparison.reason).toBe(LIVE_CONFIG_DIFFERS);

    const gptBase = await modelRun(GPT4O_MINI, BASE);
    runs.push(gptBase);
    expect(section5(runs, gptBase)).toEqual({ empty: "baseline_only" });
    const gptEdited2 = await modelRun(GPT4O_MINI, EDITED);
    runs.push(gptEdited2);
    const g6 = section5(runs, gptEdited2);
    expect("baselineId" in g6 && g6.baselineId).toBe(gptBase.id);
    expect("comparison" in g6 && g6.comparison.compatible).toBe(true);
  });
});

describe("B1: each planning rule", () => {
  it("a compatible fully-ok baseline is always used, even when the latest is itself an unedited run (run-to-run variation)", async () => {
    const h1 = await modelRun(HAIKU, BASE);
    const sb = await modelRun(SONNET, BASE);
    const h2 = await modelRun(HAIKU, BASE);
    const r = section5([h1, sb, h2], h2);
    expect("baselineId" in r && r.baselineId).toBe(h1.id);
    if ("comparison" in r && r.comparison.compatible) expect(r.comparison.rows.every((x) => x.variation)).toBe(true);
    else throw new Error("expected a compatible comparison");
  });

  it("an unedited latest run with errors is compared with a same-model ok baseline, to say which version did not complete", async () => {
    const sOk = await modelRun(SONNET, BASE);
    const hOk = await modelRun(HAIKU, BASE); // newer, but another model
    const sErr = await modelRun(SONNET, BASE, false);
    const r = section5([sOk, hOk, sErr], sErr);
    expect("baselineId" in r && r.baselineId).toBe(sOk.id);
    if ("comparison" in r && !r.comparison.compatible) expect(r.comparison.reason).toBe("Version B did not complete (model error) — rerun to compare");
    else throw new Error("expected a refusal naming the failed version");
  });

  it("an unedited latest run with errors and only another model's ok baseline → 'baseline had errors', never 'config differs'", async () => {
    const hOk = await modelRun(HAIKU, BASE);
    const sErr = await modelRun(SONNET, BASE, false);
    expect(section5([hOk, sErr], sErr)).toEqual({ empty: "baseline_errors" });
  });

  it("an edited run prefers the most recent same-model ok baseline over a newer other-model baseline", async () => {
    const hOld = await modelRun(HAIKU, BASE);
    const hNew = await modelRun(HAIKU, BASE);
    const sNewest = await modelRun(SONNET, BASE);
    const hEdited = await modelRun(HAIKU, EDITED);
    const r = section5([hOld, hNew, sNewest, hEdited], hEdited);
    expect("baselineId" in r && r.baselineId).toBe(hNew.id);
    expect("comparison" in r && r.comparison.compatible).toBe(true);
  });

  it("an edited run whose same-model baseline was answered by another model version shows that reason, not 'config differs'", async () => {
    const hBase = await modelRun(HAIKU, BASE);
    const hEdited = await (async () => {
      const fake = fakeClients(perVariant(s, GOOD, { a: "claude-haiku-4-5-20260301", b: "claude-haiku-4-5-20260301" }));
      return (await liveRun(s, EDITED, HAIKU, fake.clients, { id: "b1-newversion" })).run;
    })();
    const r = section5([hBase, hEdited], hEdited);
    expect("baselineId" in r && r.baselineId).toBe(hBase.id);
    if ("comparison" in r && !r.comparison.compatible) expect(r.comparison.reason).toBe("Different model versions answered the two runs");
    else throw new Error("expected a refusal");
  });

  it("an edited run with no ok baseline at all: 'baseline had errors' if a baseline was tried, else 'no live run'", async () => {
    const err = await modelRun(HAIKU, BASE, false);
    const edited = await modelRun(HAIKU, EDITED);
    expect(section5([err, edited], edited)).toEqual({ empty: "baseline_errors" });
    expect(section5([edited], edited)).toEqual({ empty: "no_live_run" });
  });

  it("emptyCompareState agrees with the plan", async () => {
    const hBase = await modelRun(HAIKU, BASE);
    const sBase = await modelRun(SONNET, BASE);
    expect(emptyCompareState([hBase, sBase], sBase, BASE)).toBe("baseline_only");
  });
});

describe("B1: invariants over every history of up to three runs (4 models × edited/unedited × ok/errored)", () => {
  it("never compares an unedited run with another setup; always uses the most recent compatible ok baseline", async () => {
    const MODELS = [HAIKU, SONNET, GPT4O_MINI, GPT41_MINI];
    const pool: Run[] = [];
    for (const m of MODELS) for (const instr of [BASE, EDITED]) for (const ok of [true, false]) pool.push(await modelRun(m, instr, ok));
    // B1 follow-up: fully-ok runs whose A and B model ids differ, or where one is missing.
    for (const m of [HAIKU, SONNET]) for (const instr of [BASE, EDITED]) {
      pool.push(await splitRun(m, instr, { a: RETURNED[m], b: `${RETURNED[m]}-other` }));
      pool.push(await splitRun(m, instr, { a: RETURNED[m] }));
    }
    const usable = (r: Run) => returnedModels(r).consistent;
    const fullyOk = (r: Run) => r.responses.a.status === "ok" && r.responses.b.status === "ok";
    const sameCfg = (x: Run, y: Run) => JSON.stringify(x.config) === JSON.stringify(y.config);
    let histories = 0;
    const histories3: Run[][] = [];
    for (const a of pool) {
      histories3.push([a]);
      for (const b of pool) {
        histories3.push([a, b]);
        for (const c of pool) histories3.push([a, b, c]);
      }
    }
    for (const h of histories3) {
      const runs = h.map((r, i) => ({ ...r, id: `inv-${histories}-${i}` }));
      histories += 1;
      const latest = runs[runs.length - 1];
      const plan = planLiveComparison(runs, latest, BASE);
      const compatible = selectBaseline(runs, latest, BASE);
      const ctx = runs.map((r) => `${r.config.model}/${r.instruction === BASE ? "base" : "edit"}/${fullyOk(r) ? "ok" : "err"}`).join(" → ");
      if (compatible) {
        // Spec §4: the most recent compatible fully-ok baseline is used; it always reports one model id.
        expect("baseline" in plan && plan.baseline.id, ctx).toBe(compatible.id);
        expect(usable(compatible), ctx).toBe(true);
        continue;
      }
      // A latest run whose A and B model ids differ or are missing is never "baseline only".
      if (fullyOk(latest) && !usable(latest)) expect("empty" in plan && plan.empty, ctx).not.toBe("baseline_only");
      if ("notComparable" in plan) {
        expect(latest.instruction === BASE && fullyOk(latest) && !usable(latest), ctx).toBe(true);
        expect(plan.notComparable, ctx).toMatch(/different model versions|did not return a model id/);
        continue;
      }
      if ("baseline" in plan) {
        expect(plan.baseline.id, ctx).not.toBe(latest.id);
        expect(plan.baseline.instruction, ctx).toBe(BASE);
        expect(fullyOk(plan.baseline), ctx).toBe(true);
        // An unedited latest run is a baseline of its own setup: never compared with another model.
        if (latest.instruction === BASE) expect(sameCfg(plan.baseline, latest), ctx).toBe(true);
        const c = compareRuns(plan.baseline, latest);
        expect(c.compatible, ctx).toBe(false);
        if (!c.compatible && !sameCfg(plan.baseline, latest)) expect(c.reason, ctx).toBe(LIVE_CONFIG_DIFFERS);
      } else {
        if (latest.instruction === BASE && fullyOk(latest) && usable(latest)) expect(plan.empty, ctx).toBe("baseline_only");
        if (plan.empty === "baseline_only") expect(latest.instruction === BASE && fullyOk(latest), ctx).toBe(true);
        if (plan.empty === "no_live_run") expect(runs.some((r) => r.instruction === BASE), ctx).toBe(false);
      }
    }
    expect(histories).toBe(24 + 24 ** 2 + 24 ** 3);
  });
});

describe("B1 follow-up: a baseline run whose A and B model ids differ or are missing is not comparable, and never a baseline", () => {
  const SPLIT = { a: RETURNED[HAIKU], b: "claude-haiku-4-5-20260301" };

  it("alone: not 'baseline only' — not comparable, with the reason", async () => {
    const split = await splitRun(HAIKU, BASE, SPLIT);
    expect([split.responses.a.status, split.responses.b.status]).toEqual(["ok", "ok"]);
    expect(section5([split], split)).toEqual({ notComparable: "Versions A and B were answered by different model versions" });
    const missing = await splitRun(HAIKU, BASE, { a: RETURNED[HAIKU] });
    const r = section5([missing], missing);
    expect("notComparable" in r && r.notComparable).toMatch(/^Version B did not return a model id/);
  });

  it("with a same-model ok baseline: compared with it, so the reason is shown against that baseline", async () => {
    const good = await modelRun(HAIKU, BASE);
    const otherModel = await modelRun(SONNET, BASE);
    const split = await splitRun(HAIKU, BASE, SPLIT);
    const r = section5([good, otherModel, split], split);
    expect("baselineId" in r && r.baselineId).toBe(good.id);
    if ("comparison" in r && !r.comparison.compatible) expect(r.comparison.reason).toBe("Versions A and B were answered by different model versions");
    else throw new Error("expected a refusal with the model-version reason");
  });

  it("never used as a baseline later: an edited run compares with an older consistent baseline, not the newer split one", async () => {
    const good = await modelRun(HAIKU, BASE);
    const split = await splitRun(HAIKU, BASE, SPLIT);
    const edited = await modelRun(HAIKU, EDITED);
    const r = section5([good, split, edited], edited);
    expect("baselineId" in r && r.baselineId).toBe(good.id);
    expect("comparison" in r && r.comparison.compatible).toBe(true);
  });

  it("never used as a baseline later: a following consistent baseline run is 'baseline only', not compared with the split run", async () => {
    const split = await splitRun(HAIKU, BASE, SPLIT);
    const good = await modelRun(HAIKU, BASE);
    expect(section5([split, good], good)).toEqual({ empty: "baseline_only" });
  });

  it("with only split baselines, an edited run never gets a comparison (only a refusal)", async () => {
    const split = await splitRun(HAIKU, BASE, SPLIT);
    const edited = await modelRun(HAIKU, EDITED);
    const r = section5([split, edited], edited);
    if ("comparison" in r) expect(r.comparison.compatible).toBe(false);
    else expect("empty" in r || "notComparable" in r).toBe(true);
  });
});

