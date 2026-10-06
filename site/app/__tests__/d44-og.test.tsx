/**
 * D44 R18 independent verification: the social image (app/opengraph-image.tsx) follows the site's
 * type and colour rules. next/og's ImageResponse is replaced by a stand-in that keeps the element
 * tree, so the test reads the image's actual elements and styles rather than its source text.
 * tests/e2e/site-d44-smoke.mjs also samples the rendered PNG's stripes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(
      public element: ReactNode,
      public options: unknown,
    ) {}
  },
}));

const { default: Image } = await import("../opengraph-image");
type Node = { style: Record<string, unknown>; text: string; children: Node[] };

/** Every element in the image (flattened, in document order), each with its style, own text, and element children. */
function walk(n: ReactNode, out: Node[] = []): Node[] {
  if (Array.isArray(n)) {
    for (const c of n) walk(c, out);
    return out;
  }
  if (!isValidElement(n)) return out;
  const props = (n as ReactElement<{ style?: Record<string, unknown>; children?: ReactNode }>).props;
  const kids = Array.isArray(props.children) ? props.children.flat(Infinity) : [props.children];
  const node: Node = { style: props.style ?? {}, text: kids.filter((k) => typeof k === "string" || typeof k === "number").join(""), children: [] };
  out.push(node);
  const before = out.length;
  walk(props.children, out);
  // Direct element children: the nodes added at this level (their own descendants follow each of them).
  const added = out.slice(before);
  const nested = new Set(added.flatMap((c) => descendants(c)));
  node.children = added.filter((c) => !nested.has(c));
  return out;
}
function descendants(n: Node): Node[] {
  return n.children.flatMap((c) => [c, ...descendants(c)]);
}

const css = readFileSync(resolve(__dirname, "../globals.css"), "utf8");
// The six flag colours, in order, plus the seventh (#DDA0DD) the old rainbow used.
const FLAG = ["#ff6b9d", "#ff9b71", "#fecf6a", "#63e6be", "#74b9ff", "#a29bfe"];
const PRIDE = new Set([...FLAG, "#dda0dd"]);
const TOKENS = [...css.matchAll(/--color-pride-\d:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());

const res = (await Image()) as unknown as { element: ReactNode };
const nodes = walk(res.element);
const styles = nodes.map((n) => n.style);
const str = (v: unknown) => String(v ?? "").toLowerCase();

describe("D44 R18: the social image", () => {
  it("renders an element tree (not vacuous); the flag colours are the site's pride tokens", () => {
    expect(nodes.length).toBeGreaterThan(10);
    expect(TOKENS).toEqual(FLAG);
  });

  it("has no gradient text: no backgroundClip/WebkitBackgroundClip 'text' and no transparent text colour", () => {
    expect(styles.filter((s) => str(s.backgroundClip) === "text" || str(s.WebkitBackgroundClip) === "text")).toEqual([]);
    expect(styles.filter((s) => /^(transparent|rgba\([^)]*,\s*0\))$/.test(str(s.color)) || str(s.WebkitTextFillColor) === "transparent")).toEqual([]);
  });

  it("has no radial glow", () => {
    expect(styles.filter((s) => /radial-gradient/.test(str(s.background) + str(s.backgroundImage)))).toEqual([]);
  });

  it("its stat numbers are not in pride colours", () => {
    const stats = nodes.filter((n) => /^\d+$/.test(n.text.trim()));
    expect(stats.length).toBeGreaterThanOrEqual(3);
    for (const s of stats) expect(PRIDE.has(str(s.style.color)), `${s.text}: ${s.style.color}`).toBe(false);
  });

  it("R18′: its stripes are six flex: 1 blocks in the six flag colours, top and bottom; no gradient anywhere (the renderer ignores hard stops)", () => {
    expect(styles.filter((s) => /gradient\(/.test(str(s.background) + str(s.backgroundImage)))).toEqual([]);
    const stripes = nodes.filter((n) => n.children.length === 6 && n.children.every((c) => Number(c.style.flex) === 1));
    expect(stripes.length).toBeGreaterThanOrEqual(2);
    for (const st of stripes) expect(st.children.map((c) => str(c.style.background || c.style.backgroundColor))).toEqual(FLAG);
  });
});
