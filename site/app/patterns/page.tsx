import type { Metadata } from "next";
import { patterns } from "@/lib/patterns";
import { button, ISSUE_PATTERN_URL, NewTab, PageHeader } from "../ui";
import { PatternBrowser, type PatternCard } from "./pattern-browser";

export const metadata: Metadata = { title: "Anti-Pattern Library" };

/** "Healthcare — Transition Care" → "Healthcare"; categories without a domain prefix are core. */
function domainOf(category: string): string {
  const i = category.indexOf(" — ");
  return i === -1 ? "Core (any product)" : category.slice(0, i);
}

export default function PatternsPage() {
  // Only what the list needs reaches the browser, not the code samples.
  const items: PatternCard[] = patterns.map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    severity: p.severity,
    category: p.category,
    domain: domainOf(p.category),
    tags: p.tags,
  }));
  const domains = [...new Set(items.map((p) => p.domain))];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16">
      <PageHeader
        title="Anti-Pattern Library"
        lead={`${patterns.length} patterns in LLM prompts, code, and product decisions that harm LGBTQIA+ users. Each one has the harmful pattern, why it harms, a safer alternative, and an eval test case.`}
      />
      <PatternBrowser items={items} domains={domains} />
      <div className="mt-16 flex flex-col items-start gap-4 rounded-2xl border border-zinc-800 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-zinc-50">Know a pattern that&apos;s missing?</h2>
          <p className="mt-1 text-sm text-zinc-400">Describe it in an issue; the template asks for the harm, an example, and a fix.</p>
        </div>
        <a href={ISSUE_PATTERN_URL} target="_blank" rel="noopener noreferrer" className={button.secondary}>
          Propose a pattern
          <NewTab />
        </a>
      </div>
    </div>
  );
}
