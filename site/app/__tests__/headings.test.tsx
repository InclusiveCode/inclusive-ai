import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { patterns } from "@/lib/patterns";
import { reports } from "@/lib/reports";
import PatternDetailPage from "../patterns/[slug]/page";
import ReportPage from "../research/[slug]/page";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("F12: long words in page headings break instead of widening the page at 320 px (WCAG 1.4.10)", () => {
  it("every pattern page h1 can wrap anywhere (e.g. 'Housing/Employment')", async () => {
    expect(patterns.some((p) => p.title.includes("Housing/Employment"))).toBe(true);
    for (const p of patterns) {
      const h1 = renderToStaticMarkup(await PatternDetailPage(params(p.slug))).match(/<h1\b[^>]*>/)?.[0];
      expect(h1, p.slug).toMatch(/class="[^"]*\bwrap-anywhere\b/);
    }
  });

  it("every report page h1 can wrap anywhere", async () => {
    for (const r of reports) {
      const h1 = renderToStaticMarkup(await ReportPage(params(r.slug))).match(/<h1\b[^>]*>/)?.[0];
      expect(h1, r.slug).toMatch(/class="[^"]*\bwrap-anywhere\b/);
    }
  });
});
