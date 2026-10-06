import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { patterns } from "@/lib/patterns";
import { CodeBlock } from "../code-block";
import PatternDetailPage from "../patterns/[slug]/page";

const SITE = resolve(__dirname, "../..");

describe("F10: code blocks on every pattern page are keyboard-scrollable, named regions (WCAG 2.1.1)", () => {
  it("each pattern page has two, labelled by what the code is, unique on the page, with an inset focus outline", async () => {
    expect(patterns.length).toBe(43);
    for (const p of patterns) {
      const html = renderToStaticMarkup(await PatternDetailPage({ params: Promise.resolve({ slug: p.slug }) }));
      const blocks = html.match(/<pre\b[^>]*>/g) ?? [];
      expect(blocks, p.slug).toHaveLength(2);
      const labels = blocks.map((b) => b.match(/aria-label="([^"]+)"/)?.[1]);
      expect(labels, p.slug).toEqual([`Code: harmful pattern (${p.problem.language})`, `Code: safer alternative (${p.fix.language})`]);
      for (const b of blocks) {
        expect(b).toMatch(/\btabindex="0"/i);
        expect(b).toMatch(/\brole="region"/);
        expect(b).toMatch(/\boverflow-x-auto\b/);
        // The blocks sit in overflow-hidden containers, so the outline is drawn inside.
        expect(b).toMatch(/focus-visible:outline-2 focus-visible:outline-sky-400 focus-visible:-outline-offset-2/);
      }
    }
  });

  it("/tools and the pattern pages share one CodeBlock component", () => {
    for (const f of ["app/tools/page.tsx", "app/patterns/[slug]/page.tsx"]) {
      const src = readFileSync(join(SITE, f), "utf8");
      expect(src, f).toMatch(/import \{ CodeBlock \} from "\.\.?\/(\.\.\/)?code-block";/);
      expect(src, f).not.toMatch(/function CodeBlock|<pre\b/);
    }
  });

  it("CodeBlock draws the outline outside by default and wraps content in <code> when asked", () => {
    const html = renderToStaticMarkup(createElement(CodeBlock, { label: "Code: example", className: "overflow-x-auto", codeClassName: "text-green-400", children: "npm i" }));
    expect(html).toBe(
      '<pre tabindex="0" role="region" aria-label="Code: example" class="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-400 focus-visible:outline-offset-2"><code class="text-green-400">npm i</code></pre>',
    );
  });
});
