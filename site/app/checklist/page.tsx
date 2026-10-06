"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { CodeBlock } from "../code-block";
import { CopyButton } from "../copy-button";
import { checklistSections as sections, CHECKLIST_COUNT } from "@/lib/checklist";
import { button, PageHeader } from "../ui";

const STORAGE_KEY = "inclusive-ai-checklist";
const totalItems = CHECKLIST_COUNT;
const INSTALL = "npm install --save-dev @inclusive-ai/eval";

/** The checklist as a GitHub task list, for a PR template ("Make it a PR requirement"). */
const MARKDOWN = [
  "## LGBTQIA+ pre-ship checklist",
  "",
  ...sections.flatMap((s) => [`### ${s.title}`, ...s.items.map((i) => `- [ ] ${i.label}`), ""]),
  "Source: https://inclusive-ai.vercel.app/checklist",
].join("\n");

function loadChecked(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    // Anything but a plain object (e.g. a stored "null") is ignored rather than crashing the page.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Storage can be blocked (site data off, some private modes, managed browsers). D44: a blocked
 * write never breaks the page; the checklist keeps working for this visit and says progress
 * won't be saved. Returns whether the write happened.
 */
function save(next: Record<string, boolean> | null): boolean {
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export default function ChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [undo, setUndo] = useState<Record<string, boolean> | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<"undo" | "reset" | null>(null);

  useEffect(() => {
    setChecked(loadChecked());
    setMounted(true);
  }, []);

  // Reset and Undo replace each other, so focus moves to the one that appears instead of being lost.
  useEffect(() => {
    if (focusAfter.current === "undo") undoRef.current?.focus();
    if (focusAfter.current === "reset") resetRef.current?.focus();
    focusAfter.current = null;
  }, [undo]);

  // Saving happens after the state change, never inside it, so a storage error can't break rendering.
  const persist = useCallback((next: Record<string, boolean> | null) => {
    setStorageOk(save(next));
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const next = { ...checked, [id]: !checked[id] };
      setChecked(next);
      persist(next);
      setUndo(null);
    },
    [checked, persist],
  );

  // Reset can be undone instead of asking "are you sure?" first. Undo stays until the next change,
  // with no time limit (WCAG 2.2.1).
  const reset = useCallback(() => {
    setUndo(checked);
    setChecked({});
    persist(null);
    focusAfter.current = "undo";
  }, [checked, persist]);

  const undoReset = useCallback(() => {
    if (!undo) return;
    setChecked(undo);
    persist(undo);
    setUndo(null);
    focusAfter.current = "reset";
  }, [undo, persist]);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const progress = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;
  const complete = mounted && checkedCount === totalItems;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 sm:pt-16">
      <PageHeader
        title="Pre-Ship Checklist"
        lead="Run through this before launching any LLM-powered product that interacts with users. Print it, put it in your deploy runbook, or make it a PR requirement."
      >
        {/* Tools that need JavaScript appear once it has loaded; there are no dead buttons before. */}
        {/* The row's height is reserved before hydration, so the buttons appearing don't shift the page. */}
        <div data-print="hide" className="mt-6 flex min-h-11 flex-wrap items-center gap-2">
          {mounted && (
            <>
            <button type="button" onClick={() => window.print()} className={button.secondary}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              Print
            </button>
            <CopyButton text={MARKDOWN} what="the checklist as Markdown" label="Copy as Markdown" selectId="checklist-markdown" large />
            </>
          )}
        </div>
      </PageHeader>

      {/* Progress */}
      <div className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-4 sm:px-5" data-print="hide">
        <div className="mb-2 flex min-h-11 items-center justify-between gap-3 text-sm">
          <span className="font-mono text-zinc-300">
            {mounted ? checkedCount : 0}/{totalItems} checks
          </span>
          <span className="flex items-center gap-3">
            {complete && <span className="font-semibold text-emerald-300">All clear</span>}
            {mounted && checkedCount > 0 && !complete && <span className="font-medium text-amber-200">In progress</span>}
            {mounted && checkedCount > 0 && (
              <button ref={resetRef} type="button" onClick={reset} className="min-h-11 rounded-md px-3 text-sm font-medium text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:bg-zinc-900 hover:text-zinc-50 hover:decoration-zinc-300 active:bg-zinc-800">
                Reset
              </button>
            )}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
          <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${complete ? "bg-emerald-400" : "bg-sky-400"}`} style={{ width: mounted ? `${progress}%` : "0%" }} />
        </div>
        {undo && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-zinc-200">
            <span>Checklist reset.</span>
            <button ref={undoRef} type="button" onClick={undoReset} className="min-h-11 rounded-md px-3 font-semibold text-sky-300 underline underline-offset-4 hover:bg-zinc-900 hover:text-sky-200 active:bg-zinc-800">
              Undo
            </button>
          </p>
        )}
        <div role="status" className="text-sm">
          {undo && <span className="sr-only">Checklist reset. Undo is available.</span>}
          {complete && <span className="sr-only">All {totalItems} checks complete.</span>}
          {!storageOk && <p className="mt-3 text-amber-200">This browser is blocking site storage, so your progress won&apos;t be saved when you leave the page.</p>}
        </div>
      </div>

      <div className="space-y-12">
        {sections.map((section, si) => {
          const sectionChecked = section.items.filter((item) => checked[item.id]).length;
          return (
            <section key={section.title}>
              <h2 id={`checklist-section-${si}`} className="mb-4 flex items-center gap-3 text-lg font-semibold text-zinc-50">
                <span aria-hidden="true" className={`h-5 w-1 rounded-full ${section.accent}`} />
                <span>{section.title}</span>
                <span className="ml-auto font-mono text-xs font-normal text-zinc-400">
                  {mounted ? sectionChecked : 0}/{section.items.length}
                </span>
              </h2>
              <div role="group" aria-labelledby={`checklist-section-${si}`} className="space-y-3">
                {section.items.map((item) => {
                  const isChecked = mounted && !!checked[item.id];
                  return (
                    // F6 (WCAG 4.1.2): a checklist item is a checkbox, so it says so and exposes its state.
                    // Its name is the label; the detail is its description.
                    <button
                      key={item.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-labelledby={`${item.id}-label`}
                      aria-describedby={`${item.id}-detail`}
                      onClick={() => toggle(item.id)}
                      className={`flex w-full gap-4 rounded-xl border p-4 text-left transition-colors duration-150 active:translate-y-px ${
                        isChecked ? "border-emerald-800/60 bg-emerald-950/25 hover:border-emerald-700" : "border-zinc-800 hover:border-zinc-500 hover:bg-zinc-900/50"
                      }`}
                    >
                      <div
                        aria-hidden="true"
                        className={`w-5 h-5 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors duration-150 ${
                          isChecked ? "bg-emerald-400 border-emerald-400" : "border-zinc-500"
                        }`}
                      >
                        {isChecked && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-zinc-950">
                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p id={`${item.id}-label`} className={`mb-1 font-medium leading-snug transition-colors ${isChecked ? "text-zinc-300" : "text-zinc-50"}`}>
                          {item.label}
                        </p>
                        <p id={`${item.id}-detail`} className="text-sm leading-relaxed text-zinc-400">
                          {item.detail}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div data-print="hide" className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="font-semibold text-zinc-50">Make it a PR requirement</h2>
          <p className="mt-1 text-sm text-zinc-400">All 16 checks as a GitHub task list for your pull request template.</p>
          <div className="mt-4 min-h-11">{mounted && <CopyButton text={MARKDOWN} what="the checklist as Markdown" label="Copy as Markdown" selectId="checklist-markdown" large />}</div>
          <details className="group mt-3">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-zinc-50 [&::-webkit-details-marker]:hidden">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" className="transition-transform group-open:rotate-90">
                <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Preview the Markdown
            </summary>
            <CodeBlock id="checklist-markdown" label="Code: checklist as Markdown" className="mt-2 max-h-72 overflow-x-auto overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-200">
              {MARKDOWN}
            </CodeBlock>
          </details>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="font-semibold text-zinc-50">Automate the eval checks in CI</h2>
          <p className="mt-1 text-sm text-zinc-400">The eval-coverage items above are a runnable test suite.</p>
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-4 pr-2">
            <code id="checklist-install" className="min-w-0 flex-1 wrap-anywhere font-mono text-[0.8125rem] text-zinc-100 sm:text-sm">
              {INSTALL}
            </code>
            {mounted && <CopyButton text={INSTALL} what="install command" selectId="checklist-install" compact />}
          </div>
          <Link href="/tools#quick-start" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-50">
            See the two-step CI quick start
          </Link>
        </div>
      </div>
    </div>
  );
}
