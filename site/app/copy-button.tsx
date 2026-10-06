"use client";

import { useEffect, useRef, useState } from "react";

type State = "idle" | "copied" | "failed";

/**
 * Copies `text` to the clipboard and says what happened: "Copied" for two seconds, or, if the
 * browser refuses (no clipboard API, permission denied, insecure context), selects the text in
 * `selectId` so a keyboard shortcut still works and says so. The visible word starts the
 * accessible name (WCAG 2.5.3); `what` finishes it for screen readers ("Copy install command").
 */
export function CopyButton({
  text,
  what,
  selectId,
  className,
  compact = false,
  label,
  large = false,
}: {
  text: string;
  what: string;
  selectId?: string;
  className?: string;
  /** Icon only below 640 px, to leave room for the code. */
  compact?: boolean;
  /** Idle word instead of "Copy", e.g. "Copy as Markdown"; it then names the button by itself. */
  label?: string;
  /** Full-size button, for a toolbar next to other buttons. */
  large?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function settle(next: State) {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), next === "copied" ? 2000 : 6000);
  }

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      settle("copied");
    } catch {
      const target = selectId ? document.getElementById(selectId) : null;
      if (target) {
        // Text inside a closed <details> can't be selected; open it first.
        const details = target.closest("details");
        if (details && !details.open) details.open = true;
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      settle("failed");
    }
  }

  const word = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : (label ?? "Copy");
  const shortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C";

  return (
    <span className="inline-flex items-center gap-2" data-print="hide">
      {state === "failed" && (
        <span className={`text-xs text-amber-200 ${compact ? "hidden sm:inline" : ""}`} aria-hidden="true">
          {selectId ? `Selected — press ${shortcut}` : "Select the text to copy"}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        className={`inline-flex items-center justify-center gap-1.5 border font-semibold transition-colors ${
          large ? "min-h-11 rounded-lg px-5 text-[0.9375rem]" : `min-h-11 rounded-md px-2.5 text-xs sm:min-h-9 ${compact ? "min-w-11 sm:min-w-[5.5rem]" : "min-w-[5.5rem]"}`
        } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 active:translate-y-px ${
          state === "copied"
            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
            : state === "failed"
              ? "border-amber-300/50 bg-amber-400/10 text-amber-100"
              : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-400 hover:text-zinc-50 active:bg-zinc-800"
        } ${className ?? ""}`}
      >
        {state === "copied" ? (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="m3 7.5 2.5 2.5L11 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 2.5h-6a1 1 0 0 0-1 1v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
        <span className={compact && state === "idle" ? "sr-only sm:not-sr-only" : undefined}>{word}</span>
        {!label && <span className="sr-only"> {what}</span>}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? `Copied ${what} to the clipboard.` : state === "failed" ? `Couldn't copy ${what}.${selectId ? ` The text is selected; press ${shortcut} to copy it.` : " Select the text and copy it."}` : ""}
      </span>
    </span>
  );
}
