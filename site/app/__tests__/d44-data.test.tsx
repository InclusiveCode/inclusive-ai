/**
 * D44 R11 and R13 with altered data: the published reports are all FAIL and the counts are 43, 200
 * and 16, so hand-written text could pass the checks in d44-pages.test.tsx. Here the pages render
 * from changed data (vi.mock of the data modules), and must follow it:
 * - Haiku 4.5: every critical failure downgraded to medium (high ones remain) → NEEDS_WORK; its
 *   adversarial failure renamed so it is no longer a JSON escape; 215 scenarios in its run.
 * - Opus 4.5: every failure medium → PASS; its Identity domain stored as PASS (at 82%).
 * - Sonnet 4.6: unchanged → FAIL, adversarial 28/30 with 2 failures.
 * - 40 patterns instead of 43; 15 checklist items instead of 16.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "../page";
import ReportPage from "../research/[slug]/page";
import ResearchPage from "../research/page";
import { all, barVerdict, byTag, parse, spacedText, text, VERDICT_LABELS } from "./d44-html";

vi.mock("@/lib/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports")>();
  const reports = structuredClone(actual.reports);
  const [haiku, opus] = reports;
  for (const f of haiku.failures) if (f.severity === "critical") f.severity = "medium";
  for (const f of haiku.failures) if (f.domain === "Adversarial") f.title = f.title.replace("JSON escape", "Structured output");
  haiku.totalScenarios = 215;
  for (const f of opus.failures) f.severity = "medium";
  opus.results.find((r) => r.domain === "Identity")!.verdict = "PASS";
  return { ...actual, reports };
});
vi.mock("@/lib/patterns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/patterns")>();
  return { ...actual, patterns: actual.patterns.slice(0, 40) };
});
vi.mock("@/lib/checklist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/checklist")>();
  const checklistSections = structuredClone(actual.checklistSections);
  checklistSections[checklistSections.length - 1].items.pop();
  return { ...actual, checklistSections, CHECKLIST_COUNT: checklistSections.reduce((n, s) => n + s.items.length, 0) };
});

const { reports } = await import("@/lib/reports");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
type V = "PASS" | "NEEDS_WORK" | "FAIL";
const labelsIn = (t: string) => (Object.entries(VERDICT_LABELS) as Array<[V, string]>).filter(([, l]) => new RegExp(`(^|[^\\w])${l}([^\\w]|$)`).test(t)).map(([v]) => v);
const EXPECTED: Record<string, V> = { "Claude Haiku 4.5": "NEEDS_WORK", "Claude Opus 4.5": "PASS", "Claude Sonnet 4.6": "FAIL" };
const renderReport = async (slug: string) => parse(renderToStaticMarkup(await ReportPage({ params: Promise.resolve({ slug }) })));

describe("D44 R11 with altered data: overall verdicts follow the rule, not the pass rate", () => {
  it("the altered data is what the pages import (rates are unchanged: 80%, 78.5%, 77%)", () => {
    expect(reports.map((r) => [r.model, r.totalRate])).toEqual([["Claude Haiku 4.5", 80], ["Claude Opus 4.5", 78.5], ["Claude Sonnet 4.6", 77]]);
    expect(reports[0].failures.some((f) => f.severity === "critical")).toBe(false);
  });

  it("home proof card: Haiku needs work, Opus passes, Sonnet fails", () => {
    const root = parse(renderToStaticMarkup(createElement(Home)));
    for (const r of reports) {
      const li = byTag(root, "li").find((l) => squash(text(l)).includes(r.model))!;
      expect(labelsIn(squash(spacedText(li))), r.model).toEqual([EXPECTED[r.model]]);
    }
  });

  it("/research cards: the same verdicts; Opus's Identity bar follows its stored PASS", () => {
    const root = parse(renderToStaticMarkup(createElement(ResearchPage)));
    for (const r of reports) {
      const card = all(root, (e) => e.tag === "a" && e.attrs.href === `/research/${r.slug}`)[0];
      expect(labelsIn(squash(spacedText(card))), r.model).toEqual([EXPECTED[r.model]]);
    }
    const opus = all(root, (e) => e.tag === "a" && e.attrs.href === `/research/${reports[1].slug}`)[0];
    const row = all(opus, (e) => byTag(e, "span").some((s) => squash(text(s)) === "Identity") && all(e, (x) => (x.attrs.style ?? "").includes("width:82%")).length === 1).pop()!;
    const bar = all(row, (x) => (x.attrs.style ?? "").includes("width:82%"))[0];
    expect(barVerdict(bar)).toBe("PASS");
  });

  it("report pages: overall verdicts follow the rule; Opus's Identity row shows its stored verdict (Pass)", async () => {
    for (const r of reports) {
      const root = await renderReport(r.slug);
      const overall = all(root, (e) => e.tag === "span" && /^Overall result\b/.test(squash(text(e))))[0];
      expect(labelsIn(squash(spacedText(overall))), r.model).toEqual([EXPECTED[r.model]]);
    }
    const root = await renderReport(reports[1].slug);
    const tr = byTag(root, "tr").find((t) => squash(text(byTag(t, "td")[0] ?? t)) === "Identity")!;
    expect(labelsIn(squash(spacedText(tr)))).toEqual(["PASS"]);
    const bar = all(tr, (x) => (x.attrs.style ?? "").includes("width:82%"))[0];
    expect(barVerdict(bar)).toBe("PASS");
  });

  it("the JSON-escape note appears only on reports with a JSON-escape adversarial failure (not Haiku's here)", async () => {
    const shown = Object.fromEntries(await Promise.all(reports.map(async (r) => [r.model, /Note on JSON escape bypass/.test(text(await renderReport(r.slug)))])));
    expect(shown).toEqual({ "Claude Haiku 4.5": false, "Claude Opus 4.5": true, "Claude Sonnet 4.6": true });
  });
});

describe("D44 R13 with altered data: counts follow the data", () => {
  it("home: 40 anti-patterns, 215 scenarios (the largest run), 15 checks", () => {
    const t = squash(spacedText(parse(renderToStaticMarkup(createElement(Home)))));
    const nums = (re: RegExp) => new Set([...t.matchAll(re)].map((m) => Number(m[1])));
    expect(nums(/\b(\d+) anti-patterns\b/g)).toEqual(new Set([40]));
    expect(nums(/(?<!of )\b(\d+) scenarios\b/g)).toEqual(new Set([215]));
    expect(nums(/\b(\d+) checks\b/g)).toEqual(new Set([15]));
  });

  it("/research: 'The same 215 scenarios'", () => {
    const t = squash(spacedText(parse(renderToStaticMarkup(createElement(ResearchPage)))));
    expect(t).toMatch(/\bThe same 215 scenarios\b/);
  });
});
