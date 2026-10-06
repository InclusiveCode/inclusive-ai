import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SITE = resolve(__dirname, "../..");

/** The zinc palette as Tailwind v4 defines it (oklch), read from the installed theme. */
function zinc(): Record<number, [number, number, number]> {
  const css = readFileSync(join(SITE, "node_modules/tailwindcss/theme.css"), "utf8");
  const out: Record<number, [number, number, number]> = {};
  for (const m of css.matchAll(/--color-zinc-(\d+): oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\);/g)) out[Number(m[1])] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return out;
}

/** oklch → 8-bit sRGB, as the browser renders it. */
function srgb([L, C, h]: [number, number, number]): [number, number, number] {
  const l = L / 100;
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((x) => {
    const c = Math.min(1, Math.max(0, x));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  }) as [number, number, number];
}

function ratio(fg: [number, number, number], bg: [number, number, number]): number {
  const lum = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

describe("F5: text contrast (WCAG 1.4.3)", () => {
  const z = zinc();
  const c = (fg: number, bg: number) => Math.round(ratio(srgb(z[fg]), srgb(z[bg])) * 100) / 100;

  it("matches the ratios axe reports for the old colours", () => {
    expect(srgb(z[500])).toEqual([0x71, 0x71, 0x7b]);
    expect(c(500, 950)).toBe(4.12); // body text, footer
    expect(c(600, 950)).toBe(2.58); // /checklist counters, /registry ids
    expect(c(500, 800)).toBe(3.09); // chips on zinc-800
  });

  it("zinc-400, the smallest step that passes, clears 4.5:1 on every background the site uses", () => {
    expect(c(400, 950)).toBe(7.59);
    expect(c(400, 900)).toBe(6.75);
    expect(c(400, 800)).toBe(5.68);
    for (const bg of [950, 900, 800]) expect(c(500, bg)).toBeLessThan(4.5);
  });

  it("no page uses zinc-500, zinc-600, or zinc-700 as a text colour", () => {
    const offenders = tsxFiles(join(SITE, "app")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/(?<![\w:-])text-zinc-[567]00\b/g)].map((m) => `${f.slice(SITE.length + 1)}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
