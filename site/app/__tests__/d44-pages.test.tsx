/**
 * D44 independent verification: what each redesigned page sends before JavaScript runs (R3 /tools
 * copy buttons, R4 home page, R6 /patterns, R7 /checklist Markdown). Written from the D44
 * requirements. Behaviour that needs a browser (clipboard, filtering, storage, print, layout) is in
 * tests/e2e/site-d44-smoke.mjs.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { patterns } from "@/lib/patterns";
import { reports } from "@/lib/reports";
import ChecklistPage from "../checklist/page";
import Home from "../page";
import PatternsPage from "../patterns/page";
import ToolsPage from "../tools/page";
import { accessibleName, all, byTag, closest, contains, parse, spacedText, text, type El } from "./d44-html";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const isInteractive = (e: El) => (e.tag === "a" && "href" in e.attrs) || e.tag === "button";

/** The nearest ancestor of `node` that contains a button: the block's own toolbar or card. */
function containerWithButton(node: El): El | null {
  return closest(node.parent ?? node, (e) => all(e, (x) => x.tag === "button").length > 0);
}

// =====================================================================================
// R3: every /tools code block has a Copy button that says what it copies
// =====================================================================================
describe("D44 R3: /tools code blocks have Copy buttons (server markup)", () => {
  const root = parse(renderToStaticMarkup(createElement(ToolsPage)));
  const pres = byTag(root, "pre");

  it("each code block shares its card with exactly one button named 'Copy …' that says what it copies, outside the code", () => {
    expect(pres.length).toBeGreaterThanOrEqual(9);
    const names: string[] = [];
    for (const pre of pres) {
      const label = pre.attrs["aria-label"];
      const card = containerWithButton(pre);
      expect(card, `${label}: no button near the block`).not.toBeNull();
      expect(byTag(card!, "pre"), `${label}: its card holds one code block`).toHaveLength(1);
      const copy = byTag(card!, "button").filter((b) => /^Copy\b/.test(accessibleName(b, root)));
      expect(copy, `${label}: one Copy button`).toHaveLength(1);
      const name = accessibleName(copy[0], root);
      // "Copy" alone does not say what is copied.
      expect(name, label).toMatch(/^Copy \S.{2,}/);
      expect(contains(pre, copy[0]), `${label}: the button is not part of the code`).toBe(false);
      expect(copy[0].attrs.type).toBe("button");
      names.push(name);
    }
    expect(new Set(names).size, names.join(" | ")).toBe(names.length);
  });

  it("the F9 region semantics of every <pre> are intact (focusable, a region, named 'Code: …', unique)", () => {
    const labels = pres.map((p) => p.attrs["aria-label"]);
    for (const p of pres) {
      expect(p.attrs.tabindex).toBe("0");
      expect(p.attrs.role).toBe("region");
      expect(p.attrs["aria-label"]).toMatch(/^Code: \S/);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// =====================================================================================
// R4: home page
// =====================================================================================
describe("D44 R4: home page (server markup)", () => {
  const root = parse(renderToStaticMarkup(createElement(Home)));
  const pageText = squash(spacedText(root));
  const INSTALL = "npm install --save-dev @inclusive-ai/eval";

  it("the first action on the page is the primary call to action, 'Add the eval suite', leading to the tools", () => {
    const first = all(root, isInteractive)[0];
    expect(first).toBeDefined();
    expect(accessibleName(first, root)).toMatch(/^Add the eval suite\b/);
    expect(first.tag).toBe("a");
    expect(first.attrs.href).toMatch(/^\/tools\b/);
  });

  it("shows the npm install command with a Copy button for it", () => {
    const cmd = all(root, (e) => squash(text(e)) === INSTALL && !all(e, (x) => squash(text(x)) === INSTALL).length);
    expect(cmd.length, "an element whose text is the install command").toBeGreaterThan(0);
    const card = containerWithButton(cmd[0]);
    expect(card).not.toBeNull();
    const copy = byTag(card!, "button").filter((b) => /^Copy\b/.test(accessibleName(b, root)));
    expect(copy).toHaveLength(1);
    expect(accessibleName(copy[0], root)).toMatch(/^Copy .*install/i);
  });

  it("shows every published report's model with its own pass rate and counts, as in lib/reports.ts", () => {
    expect(reports.length).toBeGreaterThanOrEqual(3);
    const items = byTag(root, "li");
    for (const r of reports) {
      const li = items.filter((l) => squash(text(l)).includes(r.model));
      expect(li.length, `${r.model} is shown`).toBeGreaterThan(0);
      const t = squash(text(li[0]));
      expect(t, r.model).toContain(`${r.totalRate}%`);
      expect(t, r.model).toContain(`${r.totalPassed} of ${r.totalScenarios}`);
      // No other report's rate in this model's row.
      for (const o of reports) if (o !== r && o.totalRate !== r.totalRate) expect(t, r.model).not.toContain(`${o.totalRate}%`);
    }
  });

  it("names no model that is not in lib/reports.ts, and any summary range of misses matches the reports", () => {
    const shown = [...pageText.matchAll(/\b(?:Claude (?:Haiku|Sonnet|Opus) \d+(?:\.\d+)?|GPT-[\w.-]+|Gemini [\w.]+|Llama [\w.]+)/g)].map((m) => m[0]);
    const known = new Set(reports.map((r) => r.model));
    expect(shown.length).toBeGreaterThan(0);
    for (const s of shown) expect(known, s).toContain(s);
    const range = pageText.match(/misses (\d+(?:\.\d+)?)(?:[–-](\d+(?:\.\d+)?))?%/);
    if (range) {
      const fails = reports.map((r) => 100 - r.totalRate);
      expect(Number(range[1])).toBe(Math.min(...fails));
      expect(Number(range[2] ?? range[1])).toBe(Math.max(...fails));
    }
  });
});

// =====================================================================================
// R6: /patterns without JavaScript, and the filter controls it ships
// =====================================================================================
describe("D44 R6: /patterns (server markup, before JavaScript)", () => {
  const root = parse(renderToStaticMarkup(createElement(PatternsPage)));

  it("lists all 43 patterns, one link each", () => {
    expect(patterns).toHaveLength(43);
    const hrefs = all(root, (e) => e.tag === "a" && /^\/patterns\/[\w-]+$/.test(e.attrs.href ?? "")).map((a) => a.attrs.href);
    expect(new Set(hrefs)).toEqual(new Set(patterns.map((p) => `/patterns/${p.slug}`)));
    expect(hrefs).toHaveLength(43);
  });

  it("the count is a live status that starts at all 43", () => {
    const live = all(root, (e) => e.attrs.role === "status" || !!e.attrs["aria-live"]);
    const count = live.map((e) => squash(text(e))).find((t) => /^Showing\b/.test(t));
    expect(count).toMatch(/^Showing (all 43 patterns|43 of 43 patterns)$/);
  });

  it("severity chips are toggle buttons (aria-pressed), 'All' pressed, one per severity in the data", () => {
    const chips = all(root, (e) => e.tag === "button" && "aria-pressed" in e.attrs);
    const names = chips.map((c) => accessibleName(c, root));
    const severities = [...new Set(patterns.map((p) => p.severity))];
    expect(chips.length).toBe(severities.length + 1);
    const allChip = chips.find((c) => /^All\b/.test(accessibleName(c, root)));
    expect(allChip?.attrs["aria-pressed"]).toBe("true");
    for (const s of severities) {
      const chip = chips.find((c) => new RegExp(`^${s}\\b`, "i").test(accessibleName(c, root)));
      expect(chip, `${s} chip among ${names.join(", ")}`).toBeDefined();
      expect(chip!.attrs["aria-pressed"]).toBe("false");
    }
  });

  it("has a labelled search box and a labelled domain select with more than one domain", () => {
    const labelFor = (id: string) => all(root, (e) => e.tag === "label" && e.attrs.for === id).map((l) => squash(text(l)))[0];
    const search = all(root, (e) => e.tag === "input" && e.attrs.type === "search");
    expect(search).toHaveLength(1);
    expect(labelFor(search[0].attrs.id) ?? search[0].attrs["aria-label"]).toMatch(/search/i);
    const selects = byTag(root, "select");
    expect(selects).toHaveLength(1);
    expect(labelFor(selects[0].attrs.id) ?? selects[0].attrs["aria-label"]).toMatch(/domain/i);
    expect(byTag(selects[0], "option").length).toBeGreaterThanOrEqual(3);
  });
});

// =====================================================================================
// R7: /checklist as Markdown
// =====================================================================================
describe("D44 R7: /checklist Markdown export (server markup)", () => {
  const root = parse(renderToStaticMarkup(createElement(ChecklistPage)));
  const boxes = all(root, (e) => e.attrs.role === "checkbox");
  const labels = boxes.map((b) => accessibleName(b, root));

  it("the page ships the checklist as a GitHub task list of all 16 items, in order, all unchecked", () => {
    expect(labels).toHaveLength(16);
    const md = all(root, (e) => /^- \[ \] /m.test(text(e)) && (e.tag === "pre" || e.tag === "code" || e.tag === "textarea"))[0];
    expect(md, "a code block holding the Markdown").toBeDefined();
    const tasks = text(md)
      .split("\n")
      .filter((l) => /^\s*- \[[ xX]\] /.test(l));
    expect(tasks).toHaveLength(16);
    expect(tasks.every((l) => l.startsWith("- [ ] "))).toBe(true);
    expect(tasks.map((l) => l.slice(6).trim())).toEqual(labels);
  });
});
