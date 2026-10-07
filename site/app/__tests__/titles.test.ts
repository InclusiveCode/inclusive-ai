import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import { patterns } from "@/lib/patterns";
import { reports } from "@/lib/reports";
import { metadata as checklist } from "../checklist/layout";
import { metadata as lab } from "../lab/page";
import { metadata as promptTest } from "../lab/prompt-test/page";
import { generateMetadata as patternMetadata } from "../patterns/[slug]/page";
import { metadata as patternsIndex } from "../patterns/page";
import { metadata as registry } from "../registry/page";
import { generateMetadata as reportMetadata } from "../research/[slug]/page";
import { metadata as research } from "../research/page";
import { metadata as tools } from "../tools/page";

const SITE = resolve(__dirname, "../..");
const DEFAULT = "InclusiveCode — LGBTQIA+ Safety Tools for LLM Engineers";
const TEMPLATE = "%s — InclusiveCode";
/** The document title Next renders from a route's metadata and the root template. */
const rendered = (m: Metadata | undefined) => (typeof m?.title === "string" ? TEMPLATE.replace("%s", m.title) : DEFAULT);
const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });

describe("F4: every page has its own descriptive title (WCAG 2.4.2)", () => {
  it("the root layout sets the default title and the '%s — InclusiveCode' template", () => {
    const src = readFileSync(join(SITE, "app/layout.tsx"), "utf8");
    expect(src).toContain(`default: "${DEFAULT}",`);
    expect(src).toContain(`template: "${TEMPLATE}",`);
    // The home page sets no title of its own, so it gets the default.
    expect(readFileSync(join(SITE, "app/page.tsx"), "utf8")).not.toMatch(/export (const metadata|async function generateMetadata)/);
  });

  it("the top-level routes render distinct titles", () => {
    const titles = {
      "/": rendered(undefined),
      "/checklist": rendered(checklist),
      "/lab": rendered(lab),
      "/lab/prompt-test": rendered(promptTest),
      "/patterns": rendered(patternsIndex),
      "/registry": rendered(registry),
      "/research": rendered(research),
      "/tools": rendered(tools),
    };
    expect(titles).toEqual({
      "/": DEFAULT,
      "/checklist": "Pre-Ship Checklist — InclusiveCode",
      "/lab": "Evaluation Lab — InclusiveCode",
      "/lab/prompt-test": "Test Your Prompt — Evaluation Lab — InclusiveCode",
      "/patterns": "Anti-Pattern Library — InclusiveCode",
      "/registry": "Harm Registry — InclusiveCode",
      "/research": "Evaluation Reports — InclusiveCode",
      "/tools": "Developer Tools — InclusiveCode",
    });
    expect(new Set(Object.values(titles)).size).toBe(Object.keys(titles).length);
  });

  it("each pattern and report page is titled by its own name", async () => {
    const all: string[] = [];
    for (const p of patterns) {
      const t = rendered(await patternMetadata(slug(p.slug)));
      expect(t).toBe(`${p.title} — Anti-Pattern Library — InclusiveCode`);
      all.push(t);
    }
    for (const r of reports) {
      const t = rendered(await reportMetadata(slug(r.slug)));
      expect(t).toBe(`${r.title} — Evaluation Reports — InclusiveCode`);
      all.push(t);
    }
    expect(new Set(all).size).toBe(all.length);
    expect(rendered(await patternMetadata(slug("no-such-pattern")))).toBe("Anti-Pattern Library — InclusiveCode");
  });
});
