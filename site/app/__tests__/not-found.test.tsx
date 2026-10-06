import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "../not-found";

describe("F4 review: unknown URLs have their own title (WCAG 2.4.2)", () => {
  it("sets the title 'Page not found', rendered as 'Page not found — InclusiveCode' by the root template", () => {
    expect(metadata.title).toBe("Page not found");
    expect("%s — InclusiveCode".replace("%s", String(metadata.title))).toBe("Page not found — InclusiveCode");
  });

  it("says so in its heading and links home", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Go to the home page<\/a>/);
  });
});
