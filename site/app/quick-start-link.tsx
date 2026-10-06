"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * A link to /tools#quick-start that always lands there. Next's Link does nothing when the URL
 * already ends in #quick-start (which every earlier click leaves behind), so on /tools itself the
 * click scrolls to the section directly.
 */
export function QuickStartLink({ className, children }: { className: string; children: ReactNode }) {
  const pathname = usePathname();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/tools" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const target = document.getElementById("quick-start");
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ block: "start" });
    if (window.location.hash !== "#quick-start") window.history.pushState(null, "", "#quick-start");
  }

  return (
    <Link href="/tools#quick-start" onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
