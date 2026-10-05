/**
 * L2 (spec v0.2 §7, §1 step 4, §4): a live baseline plus a rerun produce a comparable pair;
 * live and simulated runs never compare; mismatched returned model ids are not comparable.
 *
 * Every live run here goes client responder → real route handler → fake SDK client, so the
 * returned model id each version reports is exactly what a provider would have said.
 */
import { describe, expect, it } from "vitest";
import { compareRuns, returnedModels } from "../../lib/lab/compare";
import { emptyCompareState, selectBaseline } from "../../lib/lab/history";
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

