"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

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
    // Clear the status first, so a second copy is announced again (a live region only speaks changes).
    // flushSync: when the clipboard API is missing the failure is synchronous, and React would
    // otherwise batch both updates into one render with no change to announce.
    flushSync(() => setState("idle"));
    // Let the empty status reach assistive technology in its own task before the new message.
    await new Promise((resolve) => setTimeout(resolve, 0));
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
        // Scroll only when the selected text is entirely off screen (the checklist's Markdown preview
        // is at the bottom); otherwise the page would move and could hide the focused button.
        const r = target.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) target.scrollIntoView({ block: "nearest" });
      }
      settle("failed");
    }
  }

  const word = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : (label ?? "Copy");
  // Only read after a click (state "failed"), so server and client render the same markup.
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const shortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C";
  const how = touch ? "use your browser's Copy" : `press ${shortcut}`;

  return (
    <span className={`inline-flex gap-2 ${compact ? "flex-col items-end" : "items-center"}`} data-print="hide">
      {/* The hint sits beside the button, or under it (in the flow, never clipped or covering text)
          for compact buttons, where there is no room beside it. */}
      {state === "failed" && !compact && (
        <span className="text-xs text-amber-200" aria-hidden="true">
          {selectId ? `Selected — ${how}` : "Select the text to copy"}
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
      {state === "failed" && compact && (
        <span className="max-w-[12rem] text-right text-xs text-amber-200" aria-hidden="true">
          {selectId ? `Selected — ${how}` : "Select the text to copy"}
        </span>
      )}
      <span role="status" className="sr-only">
        {state === "copied" ? `Copied ${what} to the clipboard.` : state === "failed" ? `Couldn't copy ${what}.${selectId ? ` The text is selected; ${how} to copy it.` : " Select the text and copy it."}` : ""}
      </span>
    </span>
  );
}
