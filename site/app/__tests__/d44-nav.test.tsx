/**
 * D44 R5 independent verification (server markup): the site layout marks the current section in
 * the main navigation, and a skip link comes first. next/navigation's pathname and next/font are
 * stand-ins here (the layout is rendered outside Next.js); the browser checks are in
 * tests/e2e/site-d44-smoke.mjs.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { accessibleName, all, byId, byTag, contains, parse, type El } from "./d44-html";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => route.pathname,
}));
// next/font only works inside a Next.js build; any font loader returns a class name here.
vi.mock("next/font/google", () => {
  const loader = () => ({ className: "font", variable: "font-var", style: { fontFamily: "font" } });
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, name) => (name === "then" ? undefined : name === "__esModule" ? true : loader),
    has: () => true,
  });
});

let RootLayout: (props: { children: React.ReactNode }) => React.ReactElement;
beforeAll(async () => {
  RootLayout = (await import("../layout")).default as typeof RootLayout;
});

function render(pathname: string): El {
  route.pathname = pathname;
  return parse(renderToStaticMarkup(createElement(RootLayout, null, createElement("p", null, "Page content"))));
}

/** The site's main navigation: the nav landmark named "Main", or failing that the first nav in <body>. */
function mainNav(root: El): El {
  const navs = byTag(root, "nav");
  return navs.find((n) => /^main\b/i.test(n.attrs["aria-label"] ?? "")) ?? navs[0];
}

const SECTIONS: Array<[string, string]> = [
  ["/lab", "/lab"],
  ["/patterns", "/patterns"],
  ["/tools", "/tools"],
  ["/checklist", "/checklist"],
  ["/research", "/research"],
  ["/registry", "/registry"],
  ["/patterns/binary-gender-assumption", "/patterns"],
];

describe("D44 R5: the main navigation marks the current section", () => {
  for (const [path, expected] of SECTIONS) {
    it(`on ${path}, only links to ${expected} carry aria-current="page", one in each list (desktop bar, menu)`, () => {
      const root = render(path);
      const nav = mainNav(root);
      expect(nav).toBeDefined();
      const current = all(nav, (e) => e.tag === "a" && e.attrs["aria-current"] === "page");
      expect(current.length, `${path}: links marked current`).toBeGreaterThan(0);
      for (const a of current) expect(a.attrs.href, path).toBe(expected);
      // Never two marked links in the same list: each <ul> has at most one.
      for (const ul of byTag(nav, "ul")) expect(all(ul, (e) => e.attrs["aria-current"] === "page").length, path).toBeLessThanOrEqual(1);
      // aria-current is only ever "page" on a nav link, never a stray value.
      expect(all(root, (e) => "aria-current" in e.attrs && e.attrs["aria-current"] !== "page")).toEqual([]);
    });
  }
});

describe("D44 R5: a skip link is the first focusable element and targets the main content", () => {
  it("the first link in <body> is 'Skip to content', and its target is the <main> element, which can take focus", () => {
    const root = render("/tools");
    const body = byTag(root, "body")[0];
    const focusable = all(body, (e) => (e.tag === "a" && "href" in e.attrs) || ["button", "input", "select", "textarea"].includes(e.tag) || (e.attrs.tabindex !== undefined && e.attrs.tabindex !== "-1"));
    const first = focusable[0];
    expect(accessibleName(first, root)).toMatch(/^skip to (main )?content$/i);
    expect(first.attrs.href).toMatch(/^#./);
    const target = byId(root, first.attrs.href.slice(1));
    expect(target?.tag).toBe("main");
    // Focus can move to it (a link to a non-focusable target only scrolls in some browsers).
    expect(target?.attrs.tabindex).toBe("-1");
    expect(contains(mainNav(root), first)).toBe(false);
  });
});

describe("D44 R15: the header 'Add to CI' is outlined, not the solid primary", () => {
  it("on every page the nav's 'Add to CI' links to the quick start, has a border, and no solid bg-zinc-50 fill", () => {
    for (const path of ["/", "/tools", "/patterns"]) {
      const root = render(path);
      const cta = all(mainNav(root), (e) => e.tag === "a" && /^Add to CI$/.test(accessibleName(e, root)));
      expect(cta, path).toHaveLength(1);
      expect(cta[0].attrs.href).toBe("/tools#quick-start");
      const cls = (cta[0].attrs.class ?? "").split(/\s+/);
      expect(cls, path).not.toContain("bg-zinc-50");
      expect(cls, path).toContain("border");
    }
  });
});
