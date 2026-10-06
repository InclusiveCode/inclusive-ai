import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
