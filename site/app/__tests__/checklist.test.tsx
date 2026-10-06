import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChecklistPage from "../checklist/page";

const SITE = resolve(__dirname, "../..");
const html = renderToStaticMarkup(createElement(ChecklistPage));
const text = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
const byId = (id: string) => {
  const m = html.match(new RegExp(`<(\\w+)[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? text(m[2]) : null;
};

describe("F6: /checklist items are checkboxes with their state exposed (WCAG 4.1.2)", () => {
  const items = html.match(/<button[^>]*role="checkbox"[^>]*>/g) ?? [];

  it("every item is a role=checkbox button with aria-checked (unchecked before the saved state loads)", () => {
    expect(items).toHaveLength(16);
    expect(html.match(/<button\b/g)).toHaveLength(16); // no item left as a plain button
    for (const b of items) {
      expect(b).toMatch(/\btype="button"/);
      expect(b).toMatch(/\baria-checked="false"/);
    }
  });

  it("each checkbox is named by its label and described by its detail", () => {
    for (const b of items) {
      const label = b.match(/aria-labelledby="([^"]+)"/)![1];
      const detail = b.match(/aria-describedby="([^"]+)"/)![1];
      expect(label).toMatch(/-label$/);
      expect(detail).toMatch(/-detail$/);
      expect(byId(label), label).toBeTruthy();
      expect(byId(detail), detail).toBeTruthy();
      expect(byId(label)).not.toBe(byId(detail));
    }
  });

  it("each section's checkboxes form a group labelled by the section heading", () => {
    const groups = html.match(/<div role="group" aria-labelledby="(checklist-section-\d+)"/g) ?? [];
    expect(groups).toHaveLength(5);
    for (const g of groups) {
      const id = g.match(/aria-labelledby="([^"]+)"/)![1];
      expect(html).toMatch(new RegExp(`<h2 id="${id}"`));
    }
  });

  it("the visual square is hidden from assistive technology and its unchecked border is zinc-500 (4.12:1, at least 3:1)", () => {
    const squares = html.match(/<div aria-hidden="true" class="w-5 h-5 rounded border[^"]*"/g) ?? [];
    expect(squares).toHaveLength(16);
    for (const sq of squares) {
      expect(sq).toContain("border-zinc-500");
      expect(sq).not.toContain("border-zinc-600");
    }
  });

  it("keeps the localStorage behaviour: load on mount, save on toggle, remove on reset", () => {
    const src = readFileSync(join(SITE, "app/checklist/page.tsx"), "utf8");
    expect(src).toContain('const STORAGE_KEY = "inclusive-ai-checklist";');
    expect(src).toContain("const stored = localStorage.getItem(STORAGE_KEY);");
    expect(src).toContain("localStorage.setItem(STORAGE_KEY, JSON.stringify(next));");
    expect(src).toContain("localStorage.removeItem(STORAGE_KEY);");
    expect(src).toContain("aria-checked={isChecked}");
  });
});
