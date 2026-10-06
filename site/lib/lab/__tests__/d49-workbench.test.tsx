/**
 * D49: the lab workbench. From lg up, the results (inspect, findings) and the editor share one
 * screen (the editor in a sticky column); on narrower screens a bar fixed to the bottom keeps the
 * verdict in view and jumps to the editor. The DOM order, copy, and controls are unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Findings, findingAnchor } from "../../../app/lab/components/findings";
import { comparisonLine, countLine, ResultCard } from "../../../app/lab/components/result-card";
import { RunBar } from "../../../app/lab/components/run-bar";
import { RunMeta } from "../../../app/lab/components/run-details";
import { BUTTON } from "../../../app/lab/components/status";
import { focusKeepingScroll, fullyVisible } from "../../../app/lab/focus";
import { LabClient } from "../../../app/lab/lab-client";
import { scenarioVerdict } from "../evaluate";
import { findModel, LIVE_RESPONDER_VERSION } from "../models";
import { liveConfig, runScenario, type Responder } from "../run";
import { getScenario, scenarios } from "../scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder, SNIPPET_RULES } from "../simulator";
import type { ResponseRecord, Run } from "../types";

const SITE = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(SITE, p), "utf8");
const HAIKU = findModel("anthropic", "claude-haiku-4-5")!;

function baselines(): Promise<Run[]> {
  return Promise.all(
    scenarios.map((s) =>
      runScenario(s, s.baselineInstruction, simulatedResponder, SIMULATED_CONFIG, {
        id: `${s.id}-baseline`,
        createdAt: "2026-10-05T00:00:00.000Z",
        mode: "simulated",
        responderVersion: SIMULATOR_VERSION,
      }),
    ),
  );
}

async function simulatedRun(instruction: string, id = "spouse-parity-run-1"): Promise<Run> {
  const s = getScenario("spouse-parity");
  return runScenario(s, instruction, simulatedResponder, SIMULATED_CONFIG, {
    id,
    createdAt: "2026-10-05T12:00:00.000Z",
    mode: "simulated",
    responderVersion: SIMULATOR_VERSION,
  });
}

async function liveRun(instruction: string, id: string): Promise<Run> {
  const s = getScenario("spouse-parity");
  const text = "Happy to help. Please bring both IDs to a branch.";
  const responder: Responder = async () => ({ status: "ok", durationMs: 500, text, returnedModel: "claude-haiku-4-5-20251001" }) as ResponseRecord;
  return runScenario(s, instruction, responder, liveConfig(HAIKU), {
    id,
    createdAt: "2026-10-05T12:00:00.000Z",
    mode: "live",
    responderVersion: LIVE_RESPONDER_VERSION,
  });
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("D49 workbench layout", () => {
  it("keeps the section order (spec §2) and puts inspect + findings beside a sticky edit section from lg up", async () => {
    const html = renderToStaticMarkup(<LabClient baselineRuns={await baselines()} />);
    const order = [...html.matchAll(/<section aria-labelledby="([a-z-]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["choose", "inspect", "findings", "edit", "compare", "review-log", "simulator-rules", "limitations"]);
    expect(html).toMatch(
      /<div class="[^"]*lg:grid [^"]*lg:items-start[^"]*"><div class="min-w-0 space-y-16"><section aria-labelledby="inspect">[\s\S]*?<section aria-labelledby="findings">[\s\S]*?<\/section><\/div><section aria-labelledby="edit" class="([^"]*)"/,
    );
    const editClass = /<section aria-labelledby="edit" class="([^"]*)"/.exec(html)![1];
    // Sticky below the 4 rem site bar (it ends at 68 px), never taller than the viewport, and scrollable
    // (it holds focusable controls, so the scroll region is keyboard reachable: WCAG 2.1.1).
    for (const c of ["lg:sticky", "lg:top-20", "lg:max-h-[calc(100dvh-6rem)]", "lg:overflow-y-auto", "lg:scroll-pb-40", "@container"]) expect(editClass.split(" ")).toContain(c);
  });

  it("pins the run row to the bottom of the editor column on desktop, with Rerun first and the status line in it", async () => {
    const html = renderToStaticMarkup(<LabClient baselineRuns={await baselines()} />);
    const row = /<div class="([^"]*lg:sticky lg:bottom-0[^"]*)"><button[^>]*>Rerun<\/button>[\s\S]*?role="status"/.exec(html);
    expect(row).not.toBeNull();
    for (const c of ["lg:bg-zinc-950", "lg:border-t", "lg:z-10"]) expect(row![1].split(" ")).toContain(c);
  });

  it("makes Rerun the page's one solid primary action", async () => {
    const html = renderToStaticMarkup(<LabClient baselineRuns={await baselines()} />);
    const solid = [...html.matchAll(/<(button|a)\b[^>]*class="[^"]*\bbg-zinc-50\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => textOf(m[2]).trim());
    expect(solid).toEqual(["Rerun"]);
  });

  it("gives lab buttons, step links, and source options a 44 px touch target below lg (36 px from lg)", async () => {
    expect(BUTTON).toMatch(/\bmin-h-11\b/);
    expect(BUTTON).toMatch(/\blg:min-h-9\b/);
    const html = renderToStaticMarkup(<LabClient baselineRuns={await baselines()} />);
    const stepLinks = [...html.matchAll(/<nav aria-label="Lab steps"[\s\S]*?<\/nav>/g)][0][0];
    expect((stepLinks.match(/<a [^>]*class="[^"]*min-h-11/g) ?? []).length).toBe(6);
    const sourceLabels = html.match(/<label class="[^"]*has-\[:checked\]:border-sky-400[^"]*"><input [^>]*name="response-source"/g) ?? [];
    expect(sourceLabels.length).toBe(2);
    for (const l of sourceLabels) expect(l).toContain("min-h-11");
  });

  it("lets phones swipe the step links and scenario cards in one row without widening the page", async () => {
    const html = renderToStaticMarkup(<LabClient baselineRuns={await baselines()} />);
    expect(html).toMatch(/<nav aria-label="Lab steps" class="[^"]*overflow-x-auto[^"]*md:overflow-visible/);
    expect(html).toMatch(/<fieldset class="[^"]*min-w-0[^"]*"><legend[^>]*>Scenario/);
    const cards = html.match(/<label class="[^"]*snap-start[^"]*"/g) ?? [];
    expect(cards.length).toBe(3);
    expect(cards.filter((c) => c.includes("border-sky-400")).length).toBe(1);
  });

  it("lets the instruction box grow with its text, within limits", async () => {
    const html = renderToStaticMarkup(<LabClient baselineRuns={await baselines()} />);
    const ta = /<textarea[^>]*id="lab-instruction"[^>]*>/.exec(html)![0];
    for (const c of ["field-sizing-content", "min-h-36", "max-h-[45vh]", "lg:max-h-[30vh]", "border-zinc-500"]) expect(ta).toContain(c);
  });

  it("restores focus after a run without scrolling when the target is already fully on screen", () => {
    const src = read("app/lab/lab-client.tsx");
    expect(src).toContain("if (running && cancellable && cancelButtonRef.current) focusKeepingScroll(cancelButtonRef.current, document);");
    expect(src).toContain("if (target) focusKeepingScroll(target, document);");
    // The only other focus() call is the key field's (no key / bad key), which scrolls as before.
    expect((src.match(/\.focus\(/g) ?? []).length).toBe(1);
  });

  it("focusKeepingScroll: no scroll for a fully visible, uncovered element; a normal focus otherwise", () => {
    const doc = (hit: (x: number, y: number) => unknown) => ({ documentElement: { clientWidth: 1280, clientHeight: 900 }, elementFromPoint: hit });
    const button = (rect: { top: number; left: number; bottom: number; right: number }) => {
      const calls: unknown[] = [];
      const el = {
        isConnected: true,
        focus: (o?: FocusOptions) => void calls.push(o),
        getBoundingClientRect: () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }),
        contains: (other: unknown) => other === el || other === label,
      };
      return { el, calls };
    };
    const label = {};
    const nav = {};
    const inRow = { top: 820, left: 900, bottom: 860, right: 990 };

    // Pinned run row, on screen: hit-tests land on the button or its text.
    let b = button(inRow);
    focusKeepingScroll(b.el, doc(() => label));
    expect(b.calls).toEqual([{ preventScroll: true }]);
    expect(fullyVisible(b.el, doc(() => b.el))).toBe(true);

    // Partly below the viewport, partly above it, or covered at a corner (the site bar, the phone run bar): scroll.
    for (const [rect, hit] of [
      [{ top: 880, left: 900, bottom: 920, right: 990 }, () => label],
      [{ top: -10, left: 900, bottom: 30, right: 990 }, () => label],
      [inRow, (_x: number, y: number) => (y < 830 ? nav : label)],
    ] as const) {
      b = button(rect);
      focusKeepingScroll(b.el, doc(hit));
      expect(b.calls).toEqual([undefined]);
    }

    // Not laid out (zero size, as in a test DOM) or not measurable: a normal focus.
    b = button({ top: 0, left: 0, bottom: 0, right: 0 });
    focusKeepingScroll(b.el, doc(() => b.el));
    expect(b.calls).toEqual([undefined]);
    const plain: unknown[] = [];
    focusKeepingScroll({ isConnected: true, focus: (o?: FocusOptions) => void plain.push(o) }, doc(() => null));
    expect(plain).toEqual([undefined]);
  });

  it("the site bar covers the strip under the pride stripe, so checks that cannot see the stripe see it covered", () => {
    const layout = read("app/layout.tsx");
    const nav = /<nav aria-label="Main"[^>]*className="([^"]*)"/.exec(layout)?.[1] ?? "";
    for (const c of ["sticky", "top-0", "border-t-[3px]", "border-t-transparent", "border-b", "border-b-zinc-800", "bg-zinc-950"]) expect(nav.split(" ")).toContain(c);
    expect(nav).not.toContain("top-[3px]");
    expect(read("app/globals.css")).toMatch(/body::before \{[^}]*position: fixed;[^}]*top: 0;[^}]*height: 3px;[^}]*z-index: 100;/);
  });

  it("after a run of the displayed scenario, scrolls its result card into view without moving focus or (on desktop) the page", () => {
    const src = read("app/lab/lab-client.tsx");
    const effect = /useEffect\(\(\) => \{\s*if \(!revealResultRef\.current\) return;[\s\S]*?\}, \[latestRun\?\.id\]\);/.exec(src)?.[0] ?? "";
    // Desktop: only the editor column scrolls (to its end, where the card is); phones: the page, minimally.
    expect(effect).toContain("column.scrollTop = column.scrollHeight;");
    expect(effect).toContain('card.scrollIntoView({ block: "nearest" });');
    expect(effect).toMatch(/if \(getComputedStyle\(column\)\.overflowY !== "visible"\) \{\s*column\.scrollTop = column\.scrollHeight;\s*\} else \{\s*card\.scrollIntoView/);
    expect(effect).not.toMatch(/\.focus\(/);
    expect(src).toContain("revealResultRef.current = displayedScenarioRef.current === s.id;");
  });
});

describe("D49 result card", () => {
  it("before any run, holds the place with a plain note", () => {
    const html = renderToStaticMarkup(<ResultCard scenario={getScenario("spouse-parity")} baseline={undefined} history={[]} latest={undefined} />);
    expect(html).toContain('id="lab-result"');
    expect(textOf(html)).toContain("Your run's result appears here");
  });

  it("summarises the latest run: label, verdict, counts, the change against the baseline, and links", async () => {
    const s = getScenario("spouse-parity");
    const [base] = await baselines();
    const latest = await simulatedRun([s.baselineInstruction, SNIPPET_RULES.find((r) => r.id === "FIX-VERIFY")!.snippet].join("\n"));
    const html = renderToStaticMarkup(<ResultCard scenario={s} baseline={base} history={[latest]} latest={latest} />);
    const text = textOf(html);
    const verdict = scenarioVerdict(latest.results);
    expect(text).toContain("Your last run: Run 1, simulated");
    expect(text).toContain(verdict.headline);
    expect(text).toContain(countLine(verdict.counts));
    expect(text).toMatch(/Against the baseline: \d+ improved, \d+ regressed, \d+ unchanged/);
    expect(html).toContain('href="#findings"');
    expect(html).toContain('href="#compare"');
    // Not a live region: the one polite status line announces runs (spec §10).
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/);
    // Never reads as the "5. Compare runs" summary or its empty states (the e2e suites match those).
    expect(text).not.toMatch(/\d+ improved · \d+ regressed · \d+ unchanged · \d+\s+inconclusive/);
    for (const exact of ["Rerun to compare.", "No live run yet", "Live baseline only — edit and rerun", "Live baseline had errors — run it again", "Not comparable:"]) expect(text).not.toContain(exact);
  });

  it("explains live comparisons in its own words", async () => {
    const s = getScenario("spouse-parity");
    const edited = `${s.baselineInstruction}\nBe kind.`;
    const liveBaseline = await liveRun(s.baselineInstruction, "spouse-parity-run-1");
    const liveEdited = await liveRun(edited, "spouse-parity-run-2");
    expect(comparisonLine(s, undefined, [liveBaseline], liveBaseline)).toBe("This is the live baseline. Edit the instruction and rerun to compare.");
    expect(comparisonLine(s, undefined, [liveEdited], liveEdited)).toBe("No live baseline to compare with yet. Use Run baseline live first.");
    expect(comparisonLine(s, undefined, [liveBaseline, liveEdited], liveEdited)).toMatch(/^Against the baseline: \d+ improved, \d+ regressed, \d+ unchanged/);
  });

  it("lists only the statuses that occur, fails first", () => {
    expect(countLine({ pass: 2, fail: 1, inconclusive: 0, not_evaluated: 0, error: 0 })).toBe("1 failed, 2 passed.");
    expect(countLine({ pass: 0, fail: 0, inconclusive: 0, not_evaluated: 3, error: 0 })).toBe("3 not evaluated.");
  });
});

describe("D49 phone run bar", () => {
  it("is fixed to the bottom below lg, shows the displayed run's verdict, and links to the editor", async () => {
    const html = renderToStaticMarkup(<LabClient baselineRuns={await baselines()} />);
    const bar = /<div id="lab-run-bar"[^>]*class="([^"]*)"[\s\S]*?<\/div><\/div>/.exec(html);
    expect(bar).not.toBeNull();
    for (const c of ["fixed", "bottom-0", "lg:hidden"]) expect(bar![1].split(" ")).toContain(c);
    expect(textOf(bar![0])).toContain("Baseline run");
    expect(textOf(bar![0])).toContain(scenarioVerdict((await baselines())[0].results).headline);
    expect(bar![0]).toMatch(/<a href="#edit"[^>]*class="[^"]*min-h-11[^"]*">Edit and run<\/a>/);
    expect(bar![0]).not.toMatch(/role="(status|alert)"|aria-live|bg-zinc-50/);
    // After all lab content, so it is the last stop in the lab's Tab order.
    expect(html.indexOf('id="lab-run-bar"')).toBeGreaterThan(html.indexOf('aria-labelledby="limitations"'));
  });

  it("says Running… while a run is in flight", () => {
    const html = renderToStaticMarkup(<RunBar label="Run 2" headline="Checks failed" running />);
    expect(textOf(html)).toContain("Running…");
    expect(textOf(html)).not.toContain("Checks failed");
  });

  it("keeps focus and the page end clear of the bar (WCAG 2.2 SC 2.4.11)", () => {
    const css = read("app/globals.css").replace(/\s+/g, " ");
    expect(css).toMatch(/@media \(width < 64rem\) \{ html:has\(#lab-run-bar\) \{ scroll-padding-bottom: calc\(5rem \+ env\(safe-area-inset-bottom\)\); \} body:has\(#lab-run-bar\) \{ padding-bottom: calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\); \} \}/);
    // The bar's own height stays under that padding: a 44 px link plus 8 px above and at least 8 px below.
    const src = read("app/lab/components/run-bar.tsx");
    expect(src).toContain("pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]");
    expect(src).toContain("min-h-11");
    // The top scroll padding for the site bar is unchanged.
    expect(css).toMatch(/html \{ scroll-padding-top: 5rem;/);
  });
});

describe("D49 findings and metadata", () => {
  it("adds a linked list of every check above the rows, without matching the row list or the count boxes", async () => {
    const s = getScenario("spouse-parity");
    const [base] = await baselines();
    const html = renderToStaticMarkup(<Findings scenario={s} run={base} overrides={[]} onSave={() => null} />);
    const nav = /<nav aria-label="Checks at a glance"[^>]*>([\s\S]*?)<\/nav>/.exec(html)![0];
    expect(nav).not.toMatch(/<ol\b|\bgrid\b/);
    const links = [...nav.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(base.results.map((r) => findingAnchor(r)));
    for (const id of links) expect(html).toMatch(new RegExp(`<li id="${id}" class="[^"]*scroll-mt-24`));
    // The rows stay the first ordered list in the section.
    expect(html.indexOf("<ol")).toBeGreaterThan(html.indexOf("Checks at a glance"));
  });

  it("animates a new verdict only for users who allow motion", () => {
    for (const f of ["app/lab/components/findings.tsx", "app/lab/components/result-card.tsx"]) {
      const src = read(f);
      const uses = src.match(/\S*animate-lab-flash/g) ?? [];
      expect(uses.length, f).toBeGreaterThan(0);
      for (const u of uses) expect(u, f).toMatch(/motion-safe:animate-lab-flash/);
    }
  });

  it("never calls simulated output a model (spec §7), and keeps every label directly followed by its value", async () => {
    const [sim] = await baselines();
    const simHtml = renderToStaticMarkup(<RunMeta run={sim} />);
    expect(simHtml).toMatch(/<dt[^>]*>Simulator<\/dt><dd[^>]*>lab-simulator-rules-v1<\/dd>/);
    expect(simHtml).not.toMatch(/>Model</);
    const live = await liveRun(getScenario("spouse-parity").baselineInstruction, "spouse-parity-run-1");
    const liveHtml = renderToStaticMarkup(<RunMeta run={live} />);
    expect(liveHtml).toMatch(/<dt[^>]*>Requested model<\/dt><dd/);
    for (const html of [simHtml, liveHtml]) {
      expect((html.match(/<dt/g) ?? []).length).toBe((html.match(/<\/dt><dd/g) ?? []).length);
      expect(html).toMatch(/<dl class="[^"]*grid-cols-1[^"]*sm:grid-cols-2[^"]*@3xl:grid-cols-3/);
    }
  });
});
