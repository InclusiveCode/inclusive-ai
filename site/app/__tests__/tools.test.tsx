import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ToolsPage from "../tools/page";

describe("F9: /tools code blocks are keyboard-scrollable regions (WCAG 2.1.1)", () => {
  const html = renderToStaticMarkup(createElement(ToolsPage));
  const blocks = html.match(/<pre\b[^>]*>/g) ?? [];

  it("every code block is focusable, a region, and has a visible focus style", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(9);
    for (const b of blocks) {
      expect(b).toMatch(/\btabindex="0"/i);
      expect(b).toMatch(/\brole="region"/);
      expect(b).toMatch(/\boverflow-x-auto\b/);
      expect(b).toMatch(/focus-visible:outline-2\b/);
      expect(b).toMatch(/focus-visible:outline-sky-400\b/);
    }
  });

  it("each region has its own name that says what the code is for", () => {
    const labels = blocks.map((b) => b.match(/aria-label="([^"]+)"/)?.[1]);
    for (const l of labels) expect(l).toMatch(/^Code: \S/);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Code: install Eval Suite");
  });
});
