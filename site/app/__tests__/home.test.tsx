import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../page";

describe("F7: the home page reflows at 320 px (WCAG 1.4.10)", () => {
  it("the GitHub link can wrap: an inline block capped at the container width, breaking the URL only where needed", () => {
    const html = renderToStaticMarkup(createElement(Home));
    const link = html.match(/<a href="https:\/\/github\.com\/InclusiveCode\/inclusive-ai"[^>]*>/)?.[0];
    expect(link).toBeDefined();
    expect(link).toMatch(/class="[^"]*\binline-block\b/);
    expect(link).toMatch(/class="[^"]*\bmax-w-full\b/);
    expect(link).toMatch(/class="[^"]*\bwrap-anywhere\b/);
    // A flex container would keep the URL on one line (its text item never shrinks below the word).
    expect(link).not.toMatch(/\binline-flex\b|\bwhitespace-nowrap\b/);
  });
});
