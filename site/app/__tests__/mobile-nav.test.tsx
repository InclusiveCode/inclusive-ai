import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { menuOwnsEscape, MOBILE_MENU_ID, MobileNav } from "../mobile-nav";

const SITE = resolve(__dirname, "../..");

describe("F8: the mobile menu is a disclosure with a constant name", () => {
  const html = renderToStaticMarkup(createElement(MobileNav));
  const button = html.match(/<button[^>]*>/)?.[0] ?? "";

  it("the toggle has one constant accessible name, aria-expanded, and aria-controls", () => {
    expect(button).toMatch(/\btype="button"/);
    expect(button).toMatch(/\baria-label="Menu"/);
    expect(button).toMatch(/\baria-expanded="false"/);
    expect(button).toMatch(new RegExp(`\\baria-controls="${MOBILE_MENU_ID}"`));
    const src = readFileSync(join(SITE, "app/mobile-nav.tsx"), "utf8");
    expect(src).not.toMatch(/Open menu|Close menu/); // the name no longer swaps
    expect(src).toContain("aria-expanded={open}");
  });

  it("the controlled menu always exists, hidden while closed, so aria-controls always resolves", () => {
    expect(html).toMatch(new RegExp(`<div id="${MOBILE_MENU_ID}" hidden=""`));
    expect(html.match(/<a\b/g)).toHaveLength(7); // six site links and GitHub
  });

  it("the icons are decorative", () => {
    expect(html.match(/<svg\b[^>]*>/g)?.every((s) => /aria-hidden="true"/.test(s))).toBe(true);
  });

  // D44 R5': focus may return with { preventScroll: true }, so the page stays where it was.
  it("Escape closes the menu and returns focus to the toggle; navigation closes it", () => {
    const src = readFileSync(join(SITE, "app/mobile-nav.tsx"), "utf8");
    expect(src).toMatch(
      /if \(e\.key !== "Escape"\) return;\s*if \(!menuOwnsEscape\(document\.activeElement, toggleRef\.current, menuRef\.current\)\) return;\s*setOpen\(false\);\s*toggleRef\.current\?\.focus\((?:\{ preventScroll: true \})?\);/,
    );
    expect(src).toContain("ref={menuRef}");
    expect(src).toMatch(/useEffect\(\(\) => \{\s*setOpen\(false\);\s*\}, \[pathname\]\);/);
    expect(src.match(/onClick=\{\(\) => setOpen\(false\)\}/g)).toHaveLength(2); // site links and GitHub
  });
});

describe("F8 review: Escape belongs to the menu only while focus is on the toggle or inside it", () => {
  const toggle = { id: "toggle" } as unknown as Element;
  const link = { id: "menu-link" } as unknown as Element;
  const textarea = { id: "lab-instruction" } as unknown as Element;
  const menu = { contains: (el: Node | null) => el === (link as unknown as Node) };

  it("focus on the toggle or inside the menu: Escape closes the menu (and focus returns to the toggle)", () => {
    expect(menuOwnsEscape(toggle, toggle, menu)).toBe(true);
    expect(menuOwnsEscape(link, toggle, menu)).toBe(true);
  });

  it("focus elsewhere, e.g. the lab's instruction textarea or review form: Escape is left alone", () => {
    expect(menuOwnsEscape(textarea, toggle, menu)).toBe(false);
    expect(menuOwnsEscape(null, toggle, menu)).toBe(false);
    expect(menuOwnsEscape(textarea, null, null)).toBe(false);
  });
});
