/**
 * REQ 8: model failures, timeouts, and unavailable credentials stay distinguishable from evaluation failures.
 * REQ 9: failed or missing runs never appear as passes.
 */
import { describe, expect, it } from "vitest";
import { compareRuns } from "../../lib/lab/compare";
import { scenarioVerdict, validateResults, evaluate } from "../../lib/lab/evaluate";
import { countsAfterReview } from "../../lib/lab/overrides";
import Anthropic from "@anthropic-ai/sdk";
import { CLIENT_MESSAGES, PROVIDER_MESSAGES } from "../../lib/lab/live-messages";
import { renderInputs } from "../../lib/lab/render";
import { liveConfig, makeLiveResponder, runScenario, type Responder } from "../../lib/lab/run";
import { getScenario, type Scenario } from "../../lib/lab/scenarios";
import { SIMULATED_CONFIG } from "../../lib/lab/simulator";
import type { CheckResult, FaultKind, Override } from "../../lib/lab/types";
import { ALL_PASS_HEADLINE, FAULTS, fixedResponder, opts, SCENARIO_IDS, simRun, SNIP, withSnippets } from "./helpers";
import { anthropicReply, FAKE_KEY, fakeClients, HAIKU, leaksKey, liveRun, model } from "./live-helpers";

/** Presets that make every check pass for each scenario under the simulator (verified below). */
const ALL_PASS_INSTRUCTION: Record<string, string[]> = {
  "spouse-parity": [SNIP.verify, SNIP.terms],
  "stated-identity": [SNIP.pronouns, SNIP.terms],
  "disclosure-boundary": [SNIP.privacy],
};

function affected(fault: FaultKind): Array<"a" | "b"> {
  if (fault === "model_error" || fault === "timeout") return ["b"];
  if (fault === "credentials_unavailable") return ["a", "b"];
  return [];
}

describe("REQ 9: a fixed (all-pass) instruction really passes without faults (control)", () => {
  for (const id of SCENARIO_IDS) {
    it(`${id}: control run is all-pass`, async () => {
      const s = getScenario(id);
      const run = await simRun(id, withSnippets(s.baselineInstruction, ...ALL_PASS_INSTRUCTION[id]));
      expect(scenarioVerdict(run.results).headline).toBe(ALL_PASS_HEADLINE);
    });
  }
});

describe("REQ 9: injected faults never read as a pass, even when every other check would pass", () => {
  for (const id of SCENARIO_IDS) {
    for (const fault of FAULTS) {
      it(`${id} + ${fault}`, async () => {
        const s = getScenario(id);
        const run = await simRun(id, withSnippets(s.baselineInstruction, ...ALL_PASS_INSTRUCTION[id]), fault);
        const v = scenarioVerdict(run.results);
        expect(v.headline).not.toBe(ALL_PASS_HEADLINE);
        expect(v.headline.toLowerCase()).toMatch(/incomplete|not a pass/);
        // No result touching an affected version may be pass.
        for (const r of run.results) {
          const touches = r.variant === "pair" ? affected(fault).length > 0 : affected(fault).includes(r.variant);
          if (touches) expect(r.status, `${r.checkId}/${r.variant}`).toBe("not_evaluated");
        }
        // The full expected set is still reported (nothing silently vanishes).
        const expected = s.checks.reduce((n, c) => n + (c.scope === "each" ? 2 : 1), 0);
        expect(run.results).toHaveLength(expected);
      });
    }
  }
});

describe("REQ 9: missing results and empty result sets never read as a pass", () => {
  it("scenarioVerdict([]) is not a pass", () => {
    expect(scenarioVerdict([]).headline).not.toBe(ALL_PASS_HEADLINE);
  });

  it("only not_evaluated results is not a pass", () => {
    const rs: CheckResult[] = [{ checkId: "x", variant: "a", status: "not_evaluated", evidence: [], rationale: "", flags: [] }];
    expect(scenarioVerdict(rs).headline).not.toBe(ALL_PASS_HEADLINE);
  });

  it("an evaluator that returns zero results yields errors for every expected check", async () => {
    const run = await simRun("spouse-parity", withSnippets(getScenario("spouse-parity").baselineInstruction, SNIP.verify, SNIP.terms));
    const { results } = validateResults(getScenario("spouse-parity"), run.responses, []);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.status === "error")).toBe(true);
    expect(scenarioVerdict(results).headline).not.toBe(ALL_PASS_HEADLINE);
  });

  it("dropping one passing result from an otherwise all-pass set is not a pass", async () => {
    const s = getScenario("stated-identity");
    const run = await simRun(s.id, withSnippets(s.baselineInstruction, SNIP.pronouns, SNIP.terms));
    const raw = evaluate(s, run.responses);
    expect(raw.every((r) => r.status === "pass")).toBe(true);
    const { results } = validateResults(s, run.responses, raw.slice(1));
    expect(scenarioVerdict(results).headline).not.toBe(ALL_PASS_HEADLINE);
    expect(results.find((r) => r.checkId === raw[0].checkId && r.variant === raw[0].variant)?.status).toBe("error");
  });

  it("a forged human 'pass' override on a not-evaluated result does not count as a pass after review", async () => {
    const run = await simRun("spouse-parity", undefined, "timeout");
    const ne = run.results.find((r) => r.status === "not_evaluated")!;
    const forged: Override = {
      runId: run.id,
      scenarioId: run.scenarioId,
      scenarioVersion: run.scenarioVersion,
      rubricVersion: run.rubricVersion,
      instructionFingerprint: run.instructionFingerprint,
      checkId: ne.checkId,
      variant: ne.variant,
      automatedStatus: "not_evaluated",
      humanStatus: "pass",
      reason: "forged",
      createdAt: "2026-10-05T00:00:00Z",
    };
    const before = countsAfterReview(run.results, [], run.id);
    const after = countsAfterReview(run.results, [forged], run.id);
    expect(after).toEqual(before);
  });

  it("a fail -> not evaluated change is never classified as improved", async () => {
    const base = await simRun("spouse-parity");
    const faulted = await simRun("spouse-parity", undefined, "credentials_unavailable");
    const c = compareRuns(base, faulted);
    expect(c.compatible).toBe(true);
    if (!c.compatible) return;
    expect(c.summary.improved).toBe(0);
    expect(c.summary.regressed).toBe(0);
    expect(c.rows.every((r) => r.classification === "inconclusive")).toBe(true);
  });
});

describe("REQ 9 / spec AC7: empty or refusing responses never pass", () => {
  const empties: Array<[string, string]> = [
    ["empty", ""],
    ["whitespace", "   \n\t "],
    ["generic refusal", "I'm sorry, but I can't help with that request."],
  ];
  for (const id of SCENARIO_IDS) {
    for (const [label, text] of empties) {
      it(`${id}: ${label} responses produce no pass`, async () => {
        const s = getScenario(id);
        const run = await runScenario(s, s.baselineInstruction, fixedResponder(s, text, text), SIMULATED_CONFIG, opts());
        expect(run.results.filter((r) => r.status === "pass")).toEqual([]);
        expect(scenarioVerdict(run.results).headline).not.toBe(ALL_PASS_HEADLINE);
      });
    }
  }

  // Spec AC7: "Empty or refusing responses are inconclusive, never pass."
  // Spec §5: non-vacuity is meant to ensure "a refusal or empty output can never pass or 'improve.'"
  it("spouse-parity: a refusal that names Jordan in both versions is not 'All displayed checks passed'", async () => {
    const s = getScenario("spouse-parity");
    const refusal = "I'm sorry, but I can't help with adding Jordan Lee as an authorized user.";
    const run = await runScenario(s, s.baselineInstruction, fixedResponder(s, refusal, refusal), SIMULATED_CONFIG, opts());
    expect(scenarioVerdict(run.results).headline).not.toBe(ALL_PASS_HEADLINE);
  });
});

describe("REQ 8: fault kinds are distinct from each other and from evaluator failures", () => {
  it("model error affects only Version B and is labeled as a model error, not an evaluator error", async () => {
    const run = await simRun("spouse-parity", undefined, "model_error");
    expect(run.responses.a.status).toBe("ok");
    expect(run.responses.b.status).toBe("model_error");
    const b = run.results.filter((r) => r.variant !== "a");
    expect(b.every((r) => r.status === "not_evaluated")).toBe(true);
    expect(b.every((r) => !r.flags.includes("malformed"))).toBe(true);
    expect(b.every((r) => /model error/i.test(r.rationale))).toBe(true);
    // Version A is still genuinely evaluated.
    expect(run.results.filter((r) => r.variant === "a").every((r) => r.status !== "not_evaluated")).toBe(true);
  });

  it("timeout is labeled as a timeout", async () => {
    const run = await simRun("stated-identity", undefined, "timeout");
    expect(run.responses.b.status).toBe("timeout");
    const b = run.results.filter((r) => r.variant === "b");
    expect(b.every((r) => r.status === "not_evaluated" && /timed out/i.test(r.rationale))).toBe(true);
  });

  it("credentials unavailable affects both versions and is labeled as such", async () => {
    const run = await simRun("disclosure-boundary", undefined, "credentials_unavailable");
    expect(run.responses.a.status).toBe("credentials_unavailable");
    expect(run.responses.b.status).toBe("credentials_unavailable");
    expect(run.results.every((r) => r.status === "not_evaluated" && /credentials unavailable/i.test(r.rationale))).toBe(true);
  });

  it("a malformed evaluator result is an evaluator error (status error + malformed), with OK responses", async () => {
    const run = await simRun("spouse-parity", undefined, "malformed_result");
    expect(run.responses.a.status).toBe("ok");
    expect(run.responses.b.status).toBe("ok");
    const errs = run.results.filter((r) => r.status === "error");
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.every((r) => r.flags.includes("malformed"))).toBe(true);
    expect(run.results.some((r) => r.status === "not_evaluated")).toBe(false);
  });

  it("the four fault kinds produce pairwise distinct (response status, result status, rationale) signatures", async () => {
    const sigs = await Promise.all(
      FAULTS.map(async (f) => {
        const run = await simRun("spouse-parity", undefined, f);
        return JSON.stringify([run.responses.a.status, run.responses.b.status, run.results.map((r) => [r.status, r.rationale])]);
      }),
    );
    expect(new Set(sigs).size).toBe(FAULTS.length);
  });

  it("a check that throws becomes an evaluator error, distinct from not_evaluated", async () => {
    const base = getScenario("stated-identity");
    const broken: Scenario = {
      ...base,
      checks: base.checks.map((c, i) =>
        i === 0
          ? {
              ...c,
              evaluateEach: () => {
                throw new Error("boom");
              },
            }
          : c,
      ),
    };
    const s = broken;
    const run = await runScenario(s, s.baselineInstruction, fixedResponder(s, "Rowan", "Rowan"), SIMULATED_CONFIG, opts());
    const r = run.results.filter((x) => x.checkId === s.checks[0].id);
    expect(r.every((x) => x.status === "error" && x.flags.includes("malformed"))).toBe(true);
    expect(scenarioVerdict(run.results).headline).not.toBe(ALL_PASS_HEADLINE);
  });

  it("a responder that throws or rejects is recorded as a model error, and its message is not forwarded", async () => {
    const s = getScenario("spouse-parity");
    const throwing: Responder = async () => {
      throw new Error("upstream said: sk-labcanarySECRETSECRET");
    };
    const rejecting: Responder = () => Promise.reject("raw string rejection SECRETSECRET");
    for (const r of [throwing, rejecting]) {
      const run = await runScenario(s, s.baselineInstruction, r, SIMULATED_CONFIG, opts());
      expect(run.responses.a.status).toBe("model_error");
      expect(run.responses.b.status).toBe("model_error");
      expect(JSON.stringify(run)).not.toContain("SECRETSECRET");
      expect(run.results.every((x) => x.status === "not_evaluated")).toBe(true);
    }
  });
});

// The six tests below replace the stub-era versions (live-mode spec v0.2 §6: stub tests are replaced deliberately).
// The stub route answered every call with 503 credentials_unavailable; the live route now forwards to a provider,
// so each test pins the new mapping and keeps the original guarantee: every transport failure is a distinct,
// non-pass status, and no raw server or provider text (or the key) is forwarded.
describe("REQ 8: live responder maps transport outcomes to distinct, non-pass statuses", () => {
  const s = getScenario("spouse-parity");
  const m = model(HAIKU);
  const call = (f: typeof fetch, timeoutMs?: number, key: string | null = FAKE_KEY) =>
    makeLiveResponder({ scenario: s, provider: "anthropic", model: m, key: { get: () => key }, fetchImpl: f, timeoutMs })({
      instruction: "x",
      input: renderInputs(s).b,
      config: liveConfig(m),
    });
  const outcomes = new Map<string, string>();
  const remember = (name: string, rec: { status: string; error?: string }) => outcomes.set(name, `${rec.status}|${rec.error ?? ""}`);

  it("the provider rejects the key (server result credentials_unavailable) -> credentials_unavailable; no key at all -> credentials_unavailable with no request", async () => {
    const f = (async () => Response.json({ status: "credentials_unavailable", error: PROVIDER_MESSAGES.badKey, durationMs: 3 })) as typeof fetch;
    const rec = await call(f);
    expect(rec).toMatchObject({ status: "credentials_unavailable", error: PROVIDER_MESSAGES.badKey });
    remember("bad key", rec);
    let fetched = 0;
    const counting = (async () => {
      fetched += 1;
      return Response.json({ status: "ok", text: "hi", durationMs: 1 });
    }) as typeof fetch;
    const none = await call(counting, undefined, null);
    expect(none).toMatchObject({ status: "credentials_unavailable", error: CLIENT_MESSAGES.noKey });
    expect(fetched).toBe(0);
    remember("no key", none);
  });

  it("500 -> model_error; raw server error text is not forwarded", async () => {
    const f = (async () => Response.json({ error: "sk-labcanaryLEAKEDKEY", message: `key ${FAKE_KEY}` }, { status: 500 })) as typeof fetch;
    const rec = await call(f);
    expect(rec).toMatchObject({ status: "model_error", error: CLIENT_MESSAGES.serverFailed });
    expect(JSON.stringify(rec)).not.toContain("LEAKEDKEY");
    expect(leaksKey(JSON.stringify(rec))).toBe(false);
    remember("500", rec);
  });

  it("a 200 body that is not a well-formed result is never ok, and an ok body cannot smuggle metadata or unlisted messages", async () => {
    for (const body of [
      JSON.stringify({ text: "Happy to help, your husband Jordan" }),
      JSON.stringify({ status: "pass", text: "Happy to help, your husband Jordan" }),
      "Happy to help, your husband Jordan",
    ]) {
      const f = (async () => new Response(body, { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
      const rec = await call(f);
      expect(rec.status, body).not.toBe("ok");
      expect(rec.error).toBe(CLIENT_MESSAGES.serverFailed);
    }
    const smuggle = (async () =>
      Response.json({ status: "ok", text: "Happy to help", error: "sk-labcanaryLEAKEDKEY", rulesMatched: ["FIX-VERIFY"], failureModesApplied: [] })) as typeof fetch;
    const rec = await call(smuggle);
    expect(rec.status).toBe("ok");
    expect(rec.error).toBeUndefined();
    expect(rec.rulesMatched).toBeUndefined();
    expect(rec.failureModesApplied).toBeUndefined();
  });

  it("network error -> model_error", async () => {
    const f = (async () => {
      throw new TypeError(`fetch failed ${FAKE_KEY}`);
    }) as typeof fetch;
    const rec = await call(f);
    expect(rec).toMatchObject({ status: "model_error", error: CLIENT_MESSAGES.unreachable });
    expect(leaksKey(JSON.stringify(rec))).toBe(false);
    remember("network", rec);
  });

  it("a hung request -> timeout", async () => {
    const f = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    const rec = await call(f, 25);
    expect(rec).toMatchObject({ status: "timeout", error: CLIENT_MESSAGES.timedOut });
    remember("timeout", rec);
    // The provider-side timeout result from the server is also a timeout.
    const server = (async () => Response.json({ status: "timeout", durationMs: 30_000 })) as typeof fetch;
    expect((await call(server)).status).toBe("timeout");
  });

  it("end to end through the real route handler: a provider that rejects the key leaves every check not evaluated and the headline is not a pass", async () => {
    // Control: the same chain with a provider that answers is evaluated.
    const okRun = (await liveRun(s, s.baselineInstruction, HAIKU, fakeClients(() => anthropicReply("Happy to help, Jordan Lee.")).clients)).run;
    expect(okRun.results.some((r) => r.status !== "not_evaluated")).toBe(true);

    const rejecting = fakeClients(() => {
      throw Anthropic.APIError.generate(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());
    });
    const { run } = await liveRun(s, s.baselineInstruction, HAIKU, rejecting.clients, { id: "live-1" });
    expect(run.mode).toBe("live");
    expect(run.responses.a.status).toBe("credentials_unavailable");
    expect(run.responses.b.status).toBe("credentials_unavailable");
    expect(run.responses.a.error).toBe(PROVIDER_MESSAGES.badKey);
    expect(run.results.every((r) => r.status === "not_evaluated")).toBe(true);
    expect(scenarioVerdict(run.results).headline).not.toBe(ALL_PASS_HEADLINE);
    expect(leaksKey(JSON.stringify(run))).toBe(false);
    // Every transport outcome above is distinct from the others and none is ok.
    expect([...outcomes.values()].every((v) => !v.startsWith("ok|"))).toBe(true);
    expect(new Set(outcomes.values()).size).toBe(outcomes.size);
    expect(outcomes.size).toBe(5);
  });
});
