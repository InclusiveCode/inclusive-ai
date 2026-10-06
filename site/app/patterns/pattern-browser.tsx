"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { cx, SEVERITY_EDGE, SeverityBadge, type Severity } from "../ui";

export type PatternCard = {
  slug: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  domain: string;
  tags: string[];
};

const SEVERITIES: Severity[] = ["critical", "high", "medium"];

/**
 * D44: 43 patterns were one 12,000–15,000 px scroll on a phone. Filter by severity and domain,
 * search titles, descriptions, and tags, and always say how many match. Without JavaScript the
 * server-rendered list shows every pattern.
 */
export function PatternBrowser({ items, domains }: { items: PatternCard[]; domains: string[] }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [domain, setDomain] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const domainId = useId();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of items) c[p.severity] = (c[p.severity] ?? 0) + 1;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return items.filter(
      (p) =>
        (severity === "all" || p.severity === severity) &&
        (domain === "all" || p.domain === domain) &&
        (!q || [p.title, p.description, p.category, ...p.tags].some((t) => t.toLowerCase().includes(q))),
    );
  }, [items, severity, domain, deferredQuery]);

  const filtered = severity !== "all" || domain !== "all" || query.trim() !== "";
  // The Clear buttons disappear once nothing is filtered, so focus moves to the search box.
  const clear = () => {
    setQuery("");
    setSeverity("all");
    setDomain("all");
    searchRef.current?.focus();
  };

  const chip = (active: boolean) =>
    cx(
      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors active:translate-y-px sm:min-h-9",
      active ? "border-zinc-100 bg-zinc-100 text-zinc-950" : "border-zinc-700 text-zinc-300 hover:border-zinc-400 hover:text-zinc-50",
    );

  return (
    <div>
      <div role="search" aria-label="Filter patterns" className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_15rem]">
          <div>
            <label htmlFor={searchId} className="sr-only">
              Search patterns
            </label>
            <div className="relative">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search, e.g. pronouns"
                autoComplete="off"
                className="min-h-11 w-full rounded-lg border border-zinc-600 bg-zinc-950 pl-10 pr-3 text-[0.9375rem] text-zinc-100 placeholder:text-zinc-400 hover:border-zinc-400"
              />
            </div>
          </div>
          <div>
            <label htmlFor={domainId} className="sr-only">
              Domain
            </label>
            <select
              id={domainId}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 text-[0.9375rem] text-zinc-100 hover:border-zinc-400"
            >
              <option value="all">All domains</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset>
          <legend className="sr-only">Severity</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={severity === "all"} onClick={() => setSeverity("all")} className={chip(severity === "all")}>
              All <span className="font-mono text-xs opacity-80">{items.length}</span>
              <span className="sr-only"> patterns</span>
            </button>
            {SEVERITIES.map((s) => (
              <button key={s} type="button" aria-pressed={severity === s} onClick={() => setSeverity(s)} className={chip(severity === s)}>
                <span className="capitalize">{s}</span> <span className="font-mono text-xs opacity-80">{counts[s] ?? 0}</span>
                <span className="sr-only"> patterns</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-6 flex min-h-11 items-center justify-between gap-4">
        <p role="status" className="text-sm text-zinc-300">
          {shown.length === items.length ? `Showing all ${items.length} patterns` : `Showing ${shown.length} of ${items.length} patterns`}
        </p>
        {filtered && (
          <button type="button" onClick={clear} className="min-h-11 rounded-md px-3 text-sm font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-50 hover:decoration-zinc-300">
            Clear filters
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 p-10 text-center">
          <p className="font-medium text-zinc-100">No patterns match {query.trim() ? `“${query.trim()}”` : "these filters"}.</p>
          <p className="mt-2 text-sm text-zinc-400">Try a broader word, another domain, or all severities.</p>
          <button type="button" onClick={clear} className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-zinc-600 px-4 text-sm font-semibold text-zinc-100 hover:border-zinc-300">
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {shown.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/patterns/${p.slug}`}
                className={cx(
                  "group relative flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-5 pl-6 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 hover:border-zinc-600 hover:bg-zinc-900/60 active:bg-zinc-900",
                  SEVERITY_EDGE[p.severity],
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <SeverityBadge severity={p.severity} />
                  <span className="text-xs text-zinc-400">{p.category}</span>
                </div>
                <h2 className="mt-3 text-[1.0625rem] font-semibold leading-snug text-zinc-50">{p.title}</h2>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-zinc-300">{p.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-zinc-200 group-hover:text-zinc-50">
                  Problem, fix, and test
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
                    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
