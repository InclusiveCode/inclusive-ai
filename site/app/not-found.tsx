import type { Metadata } from "next";
import Link from "next/link";
import { button } from "./ui";

// Unknown URLs get their own title too (WCAG 2.4.2): "Page not found — InclusiveCode".
export const metadata: Metadata = { title: "Page not found" };

const elsewhere = [
  { href: "/lab", label: "Evaluation lab" },
  { href: "/patterns", label: "Anti-pattern library" },
  { href: "/tools", label: "Developer tools" },
  { href: "/checklist", label: "Pre-ship checklist" },
];

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 sm:px-6 sm:pt-24">
      <p className="font-mono text-sm text-zinc-400">404</p>
      <h1 className="mt-2 font-display text-5xl leading-tight text-zinc-50 sm:text-6xl">Page not found</h1>
      <p className="mt-4 text-lg text-zinc-300">There is no page at this address. It may have moved, or the link may be mistyped.</p>
      <Link href="/" className={`${button.primary} mt-8`}>
        Go to the home page
      </Link>
      <nav aria-label="Popular pages" className="mt-12 border-t border-zinc-800 pt-6">
        <p className="text-sm text-zinc-400">Or go straight to:</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {elsewhere.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
