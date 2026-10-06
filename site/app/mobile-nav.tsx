"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent, NAV_LINKS } from "./nav-links";

export const MOBILE_MENU_ID = "mobile-menu";

/**
 * Escape belongs to the menu only while focus is on the toggle or inside the menu. Elsewhere (for
 * example the lab's instruction textarea or its review form, which handle Escape themselves) the
 * key is left alone.
 */
export function menuOwnsEscape(
  active: Element | null,
  toggle: Element | null,
  menu: Pick<Element, "contains"> | null,
): boolean {
  return active !== null && (active === toggle || !!menu?.contains(active));
}

/**
 * F8: a disclosure button with one constant name ("Menu"). aria-expanded carries the state, and
 * aria-controls points at the menu, which is always in the DOM (hidden when closed). Escape with
 * focus on the toggle or in the menu closes it and returns focus to the toggle; any navigation
 * closes it.
 *
 * D44: 44 px toggle and 48 px rows for thumbs, the current section marked, a backdrop that closes
 * the menu when tapped, and the page behind it held still while it is open.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const dismiss = () => setOpen(false);

  // Close on navigation, including Back/Forward and links outside the menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!menuOwnsEscape(document.activeElement, toggleRef.current, menuRef.current)) return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Hold the page still behind the open menu.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 active:bg-zinc-800"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={MOBILE_MENU_ID}
      >
        {open ? (
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 6h14M3 10h14M3 14h14" />
          </svg>
        )}
      </button>
      {open && <div aria-hidden="true" onClick={dismiss} className="fixed inset-x-0 bottom-0 top-[67px] bg-zinc-950/80" />}
      <div
        ref={menuRef}
        id={MOBILE_MENU_ID}
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-67px)] overflow-y-auto border-b border-zinc-800 bg-zinc-950 px-2 pb-4 pt-2 shadow-2xl shadow-black/60"
      >
        <ul>
          {NAV_LINKS.map((l) => {
            const current = isCurrent(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-12 items-center justify-between rounded-md px-4 text-base font-medium transition-colors hover:bg-zinc-900 active:bg-zinc-800 ${current ? "bg-zinc-900 text-zinc-50" : "text-zinc-300"}`}
                >
                  {l.label}
                  {current && <span aria-hidden="true" className="size-1.5 rounded-full bg-zinc-50" />}
                </Link>
              </li>
            );
          })}
          <li className="mt-2 border-t border-zinc-800 pt-2">
            <a
              href="https://github.com/InclusiveCode"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center justify-between rounded-md px-4 text-base font-medium text-zinc-300 transition-colors hover:bg-zinc-900 active:bg-zinc-800"
            >
              GitHub
              <span className="sr-only"> (opens in a new tab)</span>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 3H3v8h8V8.5M8 3h3v3M11 3 6.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
