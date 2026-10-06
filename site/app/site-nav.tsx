"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent, NAV_LINKS } from "./nav-links";

/** Desktop links inside the site's main nav. The current section is marked for assistive technology and visibly (D44). */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <ul className="hidden items-center gap-1 text-[0.9375rem] lg:flex">
      {NAV_LINKS.map((l) => {
        const current = isCurrent(pathname, l.href);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={current ? "page" : undefined}
              className={`relative inline-flex min-h-10 items-center rounded-md px-3 font-medium transition-colors hover:bg-zinc-900 hover:text-zinc-50 active:bg-zinc-800 ${
                current ? "text-zinc-50 after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-zinc-50" : "text-zinc-400"
              }`}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
