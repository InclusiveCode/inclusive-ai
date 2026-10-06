import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVAL_ALIAS } from "@/lib/cli";
import { reports } from "@/lib/reports";
import ReportPage from "../research/[slug]/page";

async function render(slug: string) {
  return renderToStaticMarkup(await ReportPage({ params: Promise.resolve({ slug }) }));
}

describe("F11: report pages keep every table column reachable at 320 px (WCAG 1.4.10)", () => {
  it("the Results summary table scrolls inside a focusable, named region with a visible focus style", async () => {
    expect(reports.length).toBe(3);
    for (const r of reports) {
      const html = await render(r.slug);
      const region = html.match(/<div[^>]*aria-label="Results summary table"[^>]*>\s*<table/)?.[0];
      expect(region, r.slug).toBeDefined();
      expect(region).toMatch(/\btabindex="0"/i);
      expect(region).toMatch(/\brole="region"/);
      expect(region).toMatch(/\boverflow-x-auto\b/);
      expect(region).not.toMatch(/\boverflow-hidden\b/);
      expect(region).toMatch(/focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400/);
      for (const col of ["Domain", "Passed", "Total", "Pass Rate", "Verdict"]) expect(html).toContain(`>${col}</th>`);
    }
  });

  it("each domain's summary row wraps instead of being clipped", async () => {
    const html = await render(reports[0].slug);
    const summaries = html.match(/<summary class="[^"]*"/g) ?? [];
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) expect(s).toMatch(/\bflex-wrap\b/);
  });
});

describe("N1: failure entries in 'Results by Domain' wrap long words inside their card (WCAG 1.4.10)", () => {
  it("each failure card's title block can shrink and break anywhere, and so can its message and category", async () => {
    for (const r of reports) {
      const html = await render(r.slug);
      // Every rendered failure card: the text after each card's opening tag, up to the next card.
      const cards = html.split('<div class="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">').slice(1);
      expect(cards.length, r.slug).toBe(r.failures.length);
      for (const c of cards) {
        expect(c).toMatch(/<div class="min-w-0 wrap-anywhere"><span class="font-mono text-xs text-zinc-400 mr-2">/);
        expect(c).toMatch(/<p class="[^"]*\bwrap-anywhere\b[^"]*">/);
        expect(c).toMatch(/<div class="mt-2 ml-0 sm:ml-16 wrap-anywhere">/);
      }
    }
    expect(reports.some((r) => r.failures.some((f) => f.title.includes("Military/authoritarian")))).toBe(true);
  });
});

describe("D45: the Haiku report names a real model ID", () => {
  it("uses claude-haiku-4-5-20251001 in the header and the reproduce command, with a dated note naming the old ID", async () => {
    const haiku = reports.find((r) => r.model === "Claude Haiku 4.5");
    expect(haiku?.modelVersion).toBe("claude-haiku-4-5-20251001");
    const html = await render(haiku!.slug);
    expect(html).toContain("Model: Claude Haiku 4.5 (claude-haiku-4-5-20251001)");
    expect(html).toContain(`npx -y ${EVAL_ALIAS} --model claude-haiku-4-5-20251001`);
    expect(html).toMatch(/Corrected 2026-10-06:<\/span> the model ID\s+was published as <code[^>]*>claude-haiku-4-5-20250315<\/code>/);
    expect(html.split("claude-haiku-4-5-20250315").length - 1).toBe(1);
  });

  it("shows no model-ID note on reports whose ID was right", async () => {
    for (const r of reports.filter((r) => !r.modelVersionCorrection)) {
      expect(await render(r.slug), r.slug).not.toMatch(/the model ID\s+was published as/);
    }
    expect(reports.filter((r) => r.modelVersionCorrection).map((r) => r.model)).toEqual(["Claude Haiku 4.5"]);
  });
});

describe("D47: each report's reproduce command runs the pinned inclusive-eval alias with the report's own model", () => {
  it("shows `npx -y inclusive-eval@<pinned> --model <modelVersion>` and no scoped -p form", async () => {
    expect(EVAL_ALIAS).toMatch(/^inclusive-eval@\d+\.\d+\.\d+$/);
    for (const r of reports) {
      const html = await render(r.slug);
      expect(html, r.slug).toContain(`ANTHROPIC_API_KEY=sk-ant-... npx -y ${EVAL_ALIAS} --model ${r.modelVersion}`);
      expect(html, r.slug).not.toContain("-p @anthropic-ai/sdk");
    }
  });
});
