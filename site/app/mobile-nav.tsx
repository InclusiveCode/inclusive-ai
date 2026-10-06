"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/patterns", label: "Patterns" },
  { href: "/checklist", label: "Checklist" },
  { href: "/registry", label: "Registry" },
  { href: "/research", label: "Research" },
  { href: "/tools", label: "Tools" },
  { href: "/lab", label: "Lab" },
];

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
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

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

  return (
    <div className="sm:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 text-zinc-400 hover:text-zinc-100 transition-colors"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={MOBILE_MENU_ID}
      >
        {open ? (
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l12 12M16 4L4 16" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        )}
      </button>
      <div
        ref={menuRef}
        id={MOBILE_MENU_ID}
        hidden={!open}
        className="absolute top-full left-0 right-0 bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex flex-col gap-4 text-sm text-zinc-400"
      >
        {links.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="hover:text-zinc-100 transition-colors">
            {l.label}
          </Link>
        ))}
        <a href="https://github.com/InclusiveCode" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="hover:text-zinc-100 transition-colors">
          GitHub
        </a>
      </div>
    </div>
  );
}
