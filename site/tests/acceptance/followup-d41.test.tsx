/**
 * D41 follow-up (PR #7): markup-level acceptance checks for F2, F6, and F9.
 * Browser behavior (F1 sync, F3 paint, F4 titles, F5 contrast, F7 reflow, F8 menu, keyboard use) is in
 * tests/e2e/site-followup-smoke.mjs.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChecklistPage from "../../app/checklist/page";
import { liveAlertText, providerRefusalAsymmetryNote, runLabel, withRunLabel } from "../../app/lab/components/status";
import ToolsPage from "../../app/tools/page";
import { renderInputs } from "../../lib/lab/render";
import { getScenario } from "../../lib/lab/scenarios";
import { simRun } from "./helpers";
import { anthropicReply, fakeClients, HAIKU, liveRun } from "./live-helpers";

const s = getScenario("spouse-parity");

describe("F2: run alerts name their run", () => {
  it("lab run ids map to 'Run N', the precomputed baseline to 'Baseline run'", () => {
    expect(runLabel({ id: "spouse-parity-run-1" })).toBe("Run 1");
    expect(runLabel({ id: "disclosure-boundary-run-42" })).toBe("Run 42");
    expect(runLabel({ id: "stated-identity-baseline" })).toBe("Baseline run");
  });

  it("a failed live run's alert and a one-sided refusal note carry its label; no alert stays no alert", async () => {
    const failing = fakeClients(() => {
      throw new Error("upstream failure");
    });
    const { run } = await liveRun(s, s.baselineInstruction, HAIKU, failing.clients, { id: "spouse-parity-run-7" });
    expect(withRunLabel(run, liveAlertText(run))).toBe("Run 7: Live request failed — not evaluated (Provider unavailable)");
    const ok = (await liveRun(s, s.baselineInstruction, HAIKU, fakeClients().clients, { id: "spouse-parity-run-8" })).run;
    expect(withRunLabel(ok, liveAlertText(ok))).toBeNull();
    const inputsB = renderInputs(s).b;
    const oneSided = fakeClients((call) => {
      const u = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
      return u === inputsB ? anthropicReply("", { stop_reason: "refusal" }) : anthropicReply("Happy to help, Jordan Lee.");
    });
    const refused = (await liveRun(s, s.baselineInstruction, HAIKU, oneSided.clients, { id: "spouse-parity-run-9" })).run;
    expect(withRunLabel(refused, providerRefusalAsymmetryNote(refused))).toBe(
      "Run 9: Only Version B was declined by the provider's safety system (one sample). This asymmetry may itself be the harm under test.",
    );
  });

  it("simulated runs never produce a live alert, labelled or not", async () => {
    const sim = await simRun(s.id, undefined, "timeout", "spouse-parity-run-3");
    expect(withRunLabel(sim, providerRefusalAsymmetryNote(sim))).toBeNull();
  });
});

describe("F6: /checklist items are checkboxes in labelled groups", () => {
  const html = renderToStaticMarkup(createElement(ChecklistPage));
  const boxes = [...html.matchAll(/<button[^>]*role="checkbox"[^>]*>/g)].map((m) => m[0]);

  it("every item is role=checkbox with aria-checked, named by its label and described by its detail", () => {
    expect(boxes.length).toBeGreaterThan(10);
    for (const b of boxes) {
      expect(b).toMatch(/aria-checked="false"/);
      const labelled = /aria-labelledby="([^"]+)"/.exec(b)?.[1];
      const described = /aria-describedby="([^"]+)"/.exec(b)?.[1];
      expect(labelled && html.includes(`id="${labelled}"`), b).toBe(true);
      expect(described && html.includes(`id="${described}"`), b).toBe(true);
    }
    expect(new Set(boxes.map((b) => /aria-labelledby="([^"]+)"/.exec(b)?.[1])).size).toBe(boxes.length);
  });

  it("checkboxes sit in groups labelled by their section heading", () => {
    const groups = [...html.matchAll(/<div role="group" aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(groups.length).toBeGreaterThanOrEqual(4);
    for (const g of groups) expect(html).toMatch(new RegExp(`<h2[^>]*id="${g}"`));
  });
});

describe("F9: /tools code blocks are focusable, labelled regions", () => {
  it("every <pre> is role=region with tabindex=0 and a unique aria-label", () => {
    const html = renderToStaticMarkup(createElement(ToolsPage));
    const pres = [...html.matchAll(/<pre\b[^>]*>/g)].map((m) => m[0]);
    expect(pres.length).toBeGreaterThanOrEqual(6);
    for (const p of pres) {
      expect(p).toMatch(/role="region"/);
      expect(p).toMatch(/tabindex="0"|tabIndex="0"/);
    }
    const labels = pres.map((p) => /aria-label="([^"]+)"/.exec(p)?.[1] ?? "");
    expect(labels.every((l) => l.length > 5)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
