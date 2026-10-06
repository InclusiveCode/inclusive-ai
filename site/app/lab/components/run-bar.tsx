"use client";

import { useEffect, useState } from "react";
import { FOCUS } from "./status";

/**
 * D49: on screens narrower than the two-column workbench, a bar fixed to the bottom of the
 * viewport keeps the displayed run's verdict in view and one tap from the editor. While the
 * editor is on screen (EDIT_IN_VIEW) it points back to the findings instead. Hidden from `lg` up, where the
 * editor sits beside the results.
 *
 * WCAG 2.2 SC 2.4.11: globals.css adds scroll-padding-bottom (focused and anchored elements stop
 * above the bar) and body padding (the page end scrolls clear of it) while this bar exists.
 * Not a live region: the edit section's polite status line announces runs.
 */
/**
 * The editor counts as on screen while it crosses a band through the middle of the viewport (the
 * middle 10 %, roughly midway between the site bar and this bar). A ratio threshold can't express
 * that: engines differ on whether an entry below the threshold reports isIntersecting, and an
 * editor more than five screens tall never reaches a 20 % ratio. A sliver at the bottom, under or
 * just above this bar, or at the top, under the site bar, does not count. rootMargin takes only px
 * and %.
 */
export const EDIT_IN_VIEW: IntersectionObserverInit = { rootMargin: "-45% 0px -45% 0px", threshold: 0 };

export function RunBar({ label, headline, running }: { label: string; headline: string; running: boolean }) {
  const [editInView, setEditInView] = useState(false);

  useEffect(() => {
    const edit = document.querySelector("section[aria-labelledby=edit]");
    if (!edit || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setEditInView(entry.isIntersecting), EDIT_IN_VIEW);
    io.observe(edit);
    return () => io.disconnect();
  }, []);

  return (
    <div id="lab-run-bar" data-print="hide" className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-700 bg-zinc-950 lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <p className="min-w-0 text-sm leading-snug">
          <span className="block text-xs text-zinc-400">{label}</span>
          {/* Wraps rather than truncates: the site's checks reject text that is clipped. */}
          <span className="block break-words font-semibold text-zinc-50">{running ? "Running…" : headline}</span>
        </p>
        <a
          href={editInView ? "#findings" : "#edit"}
          className={`inline-flex min-h-11 shrink-0 items-center rounded-lg border border-zinc-600 bg-zinc-900 px-4 text-sm font-semibold text-zinc-50 hover:border-zinc-400 ${FOCUS}`}
        >
          {editInView ? "See findings" : "Edit and run"}
        </a>
      </div>
    </div>
  );
}
