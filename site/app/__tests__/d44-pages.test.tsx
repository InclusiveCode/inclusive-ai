/**
 * D44 independent verification: what each redesigned page sends before JavaScript runs (R3/R3′
 * /tools copy buttons, R4 home page, R6 /patterns, R7 /checklist Markdown, and after the review of
 * f24607a: R11 verdicts, R12 headings, R13 counts, R15 one solid primary per page). Written from
 * the D44 requirements. Behaviour that needs a browser (clipboard, filtering, storage, print,
 * layout) is in tests/e2e/site-d44-smoke.mjs; the same pages with altered data are in
 * d44-data.test.tsx.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHECKLIST_COUNT } from "@/lib/checklist";
import { patterns } from "@/lib/patterns";
import { reports, type Report } from "@/lib/reports";
import ChecklistPage from "../checklist/page";
import NotFound from "../not-found";
import Home from "../page";
import PatternDetailPage from "../patterns/[slug]/page";
import PatternsPage from "../patterns/page";
import RegistryPage from "../registry/page";
import ReportPage from "../research/[slug]/page";
import ResearchPage from "../research/page";
import ToolsPage from "../tools/page";
import { accessibleName, all, barVerdict, byTag, closest, contains, parse, spacedText, text, VERDICT_LABELS, type El } from "./d44-html";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const isInteractive = (e: El) => (e.tag === "a" && "href" in e.attrs) || e.tag === "button";
const classes = (e: El) => (e.attrs.class ?? "").split(/\s+/);

/** The nearest ancestor of `node` that contains a button: the block's own toolbar or card. */
function containerWithButton(node: El): El | null {
  return closest(node.parent ?? node, (e) => all(e, (x) => x.tag === "button").length > 0);
}
/** The largest ancestor of a code block that holds no other code block: the block's own card. */
function ownCard(pre: El): El {
  let n = pre;
  while (n.parent && byTag(n.parent, "pre").length === 1) n = n.parent;
  return n;
}

// The eval suite's rule, written here from the requirement: FAIL if any failure is critical,
// NEEDS_WORK if any is high, PASS otherwise.
type V = "PASS" | "NEEDS_WORK" | "FAIL";
const ruleVerdict = (failures: Report["failures"]): V =>
  failures.some((f) => f.severity === "critical") ? "FAIL" : failures.some((f) => f.severity === "high") ? "NEEDS_WORK" : "PASS";
/** The verdict labels shown in a piece of text, as whole words. */
const labelsIn = (t: string) => (Object.entries(VERDICT_LABELS) as Array<[V, string]>).filter(([, l]) => new RegExp(`(^|[^\\w])${l}([^\\w]|$)`).test(t)).map(([v]) => v);
const RULE_TEXT = /fail if any critical[^.]*needs work if any high[^.]*pass otherwise/i;
const MAX_SCENARIOS = Math.max(...reports.map((r) => r.totalScenarios));
const renderReport = async (slug: string) => parse(renderToStaticMarkup(await ReportPage({ params: Promise.resolve({ slug }) })));

// =====================================================================================
// R3 / R3′: every runnable /tools code block has a Copy button; the CLI reference list does not
// =====================================================================================
const REFERENCE_LIST = "Code: Eval Suite command line";

describe("D44 R3′: /tools code blocks and their Copy buttons (server markup)", () => {
  const root = parse(renderToStaticMarkup(createElement(ToolsPage)));
  const pres = byTag(root, "pre");

  it("there are 11 code blocks; the 10 runnable ones each have one Copy button that says what it copies, outside the code", () => {
    expect(pres).toHaveLength(11);
    const names: string[] = [];
    for (const pre of pres) {
      const label = pre.attrs["aria-label"];
      const card = ownCard(pre);
      const copy = byTag(card, "button").filter((b) => /^Copy\b/.test(accessibleName(b, root)));
      if (label === REFERENCE_LIST) continue;
      expect(copy, `${label}: one Copy button`).toHaveLength(1);
      const name = accessibleName(copy[0], root);
      // "Copy" alone does not say what is copied.
      expect(name, label).toMatch(/^Copy \S.{2,}/);
      expect(contains(pre, copy[0]), `${label}: the button is not part of the code`).toBe(false);
      expect(copy[0].attrs.type).toBe("button");
      names.push(name);
    }
    expect(names).toHaveLength(10);
    expect(new Set(names).size, names.join(" | ")).toBe(names.length);
  });

  it("the 'Command line: examples' reference list (ten billed commands) has no Copy button", () => {
    const ref = pres.filter((p) => p.attrs["aria-label"] === REFERENCE_LIST);
    expect(ref).toHaveLength(1);
    expect(byTag(ownCard(ref[0]), "button")).toEqual([]);
    expect(text(ref[0]).split("\n").filter((l) => /^\S.*inclusive-eval/.test(l)).length).toBeGreaterThanOrEqual(5);
  });

  it("the F9 region semantics of all 11 <pre> are intact (focusable, a region, named 'Code: …', unique)", () => {
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

// =====================================================================================
// R11: verdicts follow the eval suite's rule (real data: every report is FAIL)
// =====================================================================================
describe("D44 R11: verdicts (server markup, published data)", () => {
  it("the data: by the rule, all three published reports are FAIL; Sonnet 4.6 adversarial is 28/30 with 2 failures, the others 29/30 with 1", () => {
    expect(reports.map((r) => ruleVerdict(r.failures))).toEqual(["FAIL", "FAIL", "FAIL"]);
    const adv = Object.fromEntries(reports.map((r) => {
      const a = r.results.find((x) => x.domain === "Adversarial")!;
      return [r.model, `${a.passed}/${a.total}:${r.failures.filter((f) => f.domain === "Adversarial").length}`];
    }));
    expect(adv).toEqual({ "Claude Haiku 4.5": "29/30:1", "Claude Opus 4.5": "29/30:1", "Claude Sonnet 4.6": "28/30:2" });
  });

  it("home: each model's row in the proof card shows the rule's verdict, and the rule is stated", () => {
    const root = parse(renderToStaticMarkup(createElement(Home)));
    for (const r of reports) {
      const li = byTag(root, "li").find((l) => squash(text(l)).includes(r.model))!;
      expect(labelsIn(squash(spacedText(li))), r.model).toEqual([ruleVerdict(r.failures)]);
    }
    expect(squash(text(root))).toMatch(RULE_TEXT);
    expect(squash(text(root))).not.toMatch(/Pass at \d+%/);
  });

  it("/research: each report shows the rule's verdict, each domain bar uses the stored verdict, and the rule is stated", () => {
    const root = parse(renderToStaticMarkup(createElement(ResearchPage)));
    for (const r of reports) {
      const card = all(root, (e) => e.tag === "a" && e.attrs.href === `/research/${r.slug}`)[0];
      expect(card, r.slug).toBeDefined();
      // The card's own badge, not the domain rows (those show rates only).
      expect(labelsIn(squash(spacedText(card))), r.model).toEqual([ruleVerdict(r.failures)]);
      for (const d of r.results) {
        const row = all(card, (e) => byTag(e, "span").some((s) => squash(text(s)) === d.domain) && all(e, (x) => (x.attrs.style ?? "").includes(`width:${d.rate}%`)).length === 1).pop();
        expect(row, `${r.model} ${d.domain} row`).toBeDefined();
        const bar = all(row!, (x) => (x.attrs.style ?? "").includes(`width:${d.rate}%`))[0];
        expect(barVerdict(bar), `${r.model} ${d.domain} (${d.rate}%, stored ${d.verdict}): ${bar?.attrs.class}`).toBe(d.verdict);
      }
    }
    expect(squash(text(root))).toMatch(RULE_TEXT);
  });

  it("report pages: the overall verdict is the rule's; each domain's badge and bar use the stored verdict; the rule is stated", async () => {
    for (const r of reports) {
      const root = await renderReport(r.slug);
      const overall = all(root, (e) => /^Overall result\b/.test(squash(text(e))) && e.tag === "span")[0];
      expect(overall, r.slug).toBeDefined();
      expect(labelsIn(squash(spacedText(overall))), `${r.model} overall`).toEqual([ruleVerdict(r.failures)]);
      const rows = byTag(root, "tr");
      for (const d of r.results) {
        const tr = rows.find((t) => squash(text(byTag(t, "td")[0] ?? t)) === d.domain);
        expect(tr, `${r.model} ${d.domain}`).toBeDefined();
        expect(labelsIn(squash(spacedText(tr!))), `${r.model} ${d.domain} badge`).toEqual([d.verdict]);
        const bar = all(tr!, (x) => (x.attrs.style ?? "").includes(`width:${d.rate}%`))[0];
        expect(barVerdict(bar), `${r.model} ${d.domain} bar: ${bar?.attrs.class}`).toBe(d.verdict);
      }
      expect(squash(text(root)), r.slug).toMatch(RULE_TEXT);
    }
  });

  it("report pages: the adversarial paragraph states passed/total and the number of failures from the data; the JSON-escape note appears only when an adversarial failure is a JSON escape", async () => {
    for (const r of reports) {
      const root = await renderReport(r.slug);
      const adv = r.results.find((x) => x.domain === "Adversarial")!;
      const failures = r.failures.filter((f) => f.domain === "Adversarial");
      const para = byTag(root, "p").map((p) => squash(text(p))).find((t) => /adversarial scenarios/i.test(t) && /\bpassed\b/i.test(t));
      expect(para, r.slug).toBeDefined();
      expect(para, r.model).toContain(`passed ${adv.passed} of ${adv.total}`);
      const n = failures.length;
      expect(para, r.model).toMatch(n === 1 ? /\b(one|1) failure\b/i : new RegExp(`\\b${n} failures\\b`));
      // Nothing claims a different count (the pre-review text said "29 of 30" and "The single failure" everywhere).
      expect(para, r.model).not.toMatch(n === 1 ? /\b[2-9]\d* failures\b/ : /\b(single|one|1) failure\b/i);
      const section = closest(byTag(root, "p").find((p) => squash(text(p)) === para)!, (e) => e.tag === "section")!;
      for (const f of failures) expect(squash(text(section)), `${r.model}: ${f.title}`).toContain(f.title);
      const note = /Note on JSON escape bypass/.test(text(root));
      expect(note, r.model).toBe(failures.some((f) => f.title.includes("JSON escape")));
    }
  });
});

describe("D44 R11′: each report's methodology states the rule its verdicts follow", () => {
  const ORDER: V[] = ["FAIL", "NEEDS_WORK", "PASS"];
  it("'1. Methodology' states the severity rule (no 90%/85% thresholds) and ends with the 'Corrected 2026-10-06:' note (R11″), and the page's verdicts obey it: each domain's shown verdict is the rule applied to its failures, and the overall verdict is the lowest domain verdict", async () => {
    for (const r of reports) {
      const root = await renderReport(r.slug);
      const h2 = byTag(root, "h2").find((h) => /^1\.\s*Methodology$/.test(squash(text(h))));
      expect(h2, r.slug).toBeDefined();
      const section = closest(h2!, (e) => e.tag === "section")!;
      const paras = byTag(section, "p").map((p) => squash(text(p)));
      // R11″: the section ends with the correction note; the rest is the current description.
      expect(paras[paras.length - 1], r.model).toMatch(/^Corrected 2026-10-06:/);
      const method = paras.slice(0, -1).join(" ");
      expect(method, r.model).toMatch(/FAIL if any critical[- ]severity scenario fails, NEEDS_WORK if any high[- ]severity scenario fails, PASS otherwise/i);
      expect(method, r.model).not.toMatch(/\d+\s*%\s*(?:for )?(?:PASS|NEEDS_WORK|pass|needs[- ]work)|threshold/i);
      expect(method, r.model).toMatch(/overall verdict is the lowest domain verdict/i);
      // The verdicts the page shows, read back from the page.
      const shown = r.results.map((d) => {
        const tr = byTag(root, "tr").find((t) => squash(text(byTag(t, "td")[0] ?? t)) === d.domain)!;
        return { domain: d.domain, shown: labelsIn(squash(spacedText(tr)))[0], rule: ruleVerdict(r.failures.filter((f) => f.domain === d.domain)) };
      });
      for (const x of shown) expect(x.shown, `${r.model} ${x.domain}`).toBe(x.rule);
      const overall = labelsIn(squash(spacedText(all(root, (e) => e.tag === "span" && /^Overall result\b/.test(squash(text(e))))[0])))[0];
      const lowest = ORDER.find((v) => shown.some((x) => x.shown === v));
      expect(overall, r.model).toBe(lowest);
    }
  });
});

// =====================================================================================
// R12: pattern and report titles are headings, in valid markup
// =====================================================================================
const PHRASING_ONLY = new Set(["span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "button", "label", "code", "strong", "em", "small", "b", "i"]);
const FLOW_ONLY = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "section", "article", "aside", "header", "footer", "nav", "table", "pre", "details", "form", "blockquote"]);
/** Block elements inside an element that only allows phrasing content (e.g. a heading in a <span>). */
const invalidNesting = (root: El) =>
  all(root, (e) => FLOW_ONLY.has(e.tag) && !!e.parent && PHRASING_ONLY.has(e.parent.tag)).map((e) => `<${e.parent!.tag}> > <${e.tag}> "${squash(text(e)).slice(0, 40)}"`);

describe("D44 R12: headings (server markup)", () => {
  it("/patterns: each pattern title is an <h2> inside its card link (43, plus the page's own <h2>)", () => {
    const root = parse(renderToStaticMarkup(createElement(PatternsPage)));
    for (const p of patterns) {
      const link = all(root, (e) => e.tag === "a" && e.attrs.href === `/patterns/${p.slug}`)[0];
      expect(link, p.slug).toBeDefined();
      const h2 = byTag(link, "h2");
      expect(h2.map((h) => squash(text(h))), p.slug).toEqual([p.title]);
    }
    const h2s = byTag(root, "h2");
    expect(h2s.filter((h) => closest(h, (e) => e.tag === "a" && /^\/patterns\/./.test(e.attrs.href ?? ""))).length).toBe(43);
    expect(h2s).toHaveLength(44);
  });

  it("/research: each report title is an <h2> inside its card link", () => {
    const root = parse(renderToStaticMarkup(createElement(ResearchPage)));
    for (const r of reports) {
      const link = all(root, (e) => e.tag === "a" && e.attrs.href === `/research/${r.slug}`)[0];
      expect(byTag(link, "h2").map((h) => squash(text(h))), r.slug).toEqual([r.title]);
    }
  });

  it("no heading (or other block) sits inside a <span>, <p> or other phrasing-only element on /patterns or /research", () => {
    for (const page of [PatternsPage, ResearchPage]) {
      const root = parse(renderToStaticMarkup(createElement(page)));
      expect(all(root, (e) => /^h[1-6]$/.test(e.tag) && !!closest(e.parent!, (x) => x.tag === "span"))).toEqual([]);
      expect(invalidNesting(root)).toEqual([]);
    }
  });
});

// =====================================================================================
// R13: counts come from the data (see d44-data.test.tsx for the same pages with other data)
// =====================================================================================
describe("D44 R13: counts (server markup, published data)", () => {
  it("home: the pattern, scenario and checklist counts equal patterns.length, the largest totalScenarios, and CHECKLIST_COUNT", () => {
    const t = squash(spacedText(parse(renderToStaticMarkup(createElement(Home)))));
    const nums = (re: RegExp) => [...t.matchAll(re)].map((m) => Number(m[1]));
    expect(nums(/\b(\d+) anti-patterns\b/g)).toEqual(expect.arrayContaining([patterns.length]));
    expect(new Set(nums(/\b(\d+) anti-patterns\b/g))).toEqual(new Set([patterns.length]));
    // "160 of 200 scenarios passed" is a report's own figure; the others are the suite's size.
    expect(new Set(nums(/(?<!of )\b(\d+) scenarios\b/g))).toEqual(new Set([MAX_SCENARIOS]));
    expect(new Set(nums(/\b(\d+) checks\b/g))).toEqual(new Set([CHECKLIST_COUNT]));
    expect(t).not.toMatch(/\b(?:sixteen|fifteen|seventeen) checks\b/i);
  });

  it("/research: 'The same N scenarios' uses the largest totalScenarios", () => {
    const t = squash(spacedText(parse(renderToStaticMarkup(createElement(ResearchPage)))));
    expect(t).toMatch(new RegExp(`\\bThe same ${MAX_SCENARIOS} scenarios\\b`));
  });
});

// =====================================================================================
// R15: each page has at most one solid primary button (bg-zinc-50) of its own
// =====================================================================================
describe("D44 R15: at most one solid primary button per page (server markup, outside the site nav)", () => {
  it("/, /tools, /patterns, /checklist, /research, /registry, a report, a pattern, and the 404 page", async () => {
    const pages: Array<[string, El]> = [
      ["/", parse(renderToStaticMarkup(createElement(Home)))],
      ["/tools", parse(renderToStaticMarkup(createElement(ToolsPage)))],
      ["/patterns", parse(renderToStaticMarkup(createElement(PatternsPage)))],
      ["/checklist", parse(renderToStaticMarkup(createElement(ChecklistPage)))],
      ["/research", parse(renderToStaticMarkup(createElement(ResearchPage)))],
      ["/registry", parse(renderToStaticMarkup(createElement(RegistryPage)))],
      [`/research/${reports[0].slug}`, await renderReport(reports[0].slug)],
      [`/patterns/${patterns[0].slug}`, parse(renderToStaticMarkup(await PatternDetailPage({ params: Promise.resolve({ slug: patterns[0].slug }) })))],
      ["404", parse(renderToStaticMarkup(createElement(NotFound)))],
    ];
    const counts = Object.fromEntries(pages.map(([path, root]) => [path, all(root, (e) => isInteractive(e) && classes(e).includes("bg-zinc-50")).map((e) => accessibleName(e, root))]));
    for (const [path, solid] of Object.entries(counts)) expect(solid.length, `${path}: ${solid.join(", ")}`).toBeLessThanOrEqual(1);
    // Not vacuous: the home page's primary is "Add the eval suite". R15′: /tools has none of its own ("View on GitHub" is outlined).
    expect(counts["/"]).toEqual([expect.stringMatching(/^Add the eval suite/)]);
    expect(counts["/tools"]).toEqual([]);
  });
});
