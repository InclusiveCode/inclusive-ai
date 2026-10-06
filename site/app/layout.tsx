import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { MobileNav } from "./mobile-nav";
import { QuickStartLink } from "./quick-start-link";
import { SiteNav } from "./site-nav";
import { button, ExternalIcon, ISSUE_PATTERN_URL, ISSUE_REGISTRY_URL, NewTab, PrideMark, REPO_URL } from "./ui";

// D44: type chosen on purpose. Atkinson Hyperlegible was designed for low-vision readers, which suits
// a site about inclusion; Instrument Serif gives page titles a human, editorial voice.
// A late font swap reflows the page (measured CLS 0.09 on a throttled phone; next/font has no
// metrics to size-match a fallback for Atkinson). "optional" keeps the fallback on a slow first
// visit instead of shifting text; the fonts are cached for the next page.
const body = Atkinson_Hyperlegible_Next({ variable: "--font-body", subsets: ["latin"], display: "optional", adjustFontFallback: false });
const code = Atkinson_Hyperlegible_Mono({ variable: "--font-code", subsets: ["latin"], display: "optional", adjustFontFallback: false });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", display: "optional" });

export const metadata: Metadata = {
  // Each route sets its own title (WCAG 2.4.2); the home page uses the default.
  title: {
    default: "InclusiveCode — LGBTQIA+ Safety Tools for LLM Engineers",
    template: "%s — InclusiveCode",
  },
  description: "200 eval scenarios, 43 anti-patterns, and adversarial red-teaming across 5 domains. Catch harms before you ship.",
  metadataBase: new URL("https://inclusive-ai.vercel.app"),
  openGraph: {
    title: "InclusiveCode — LGBTQIA+ Safety Tools for LLM Engineers",
    description: "200 eval scenarios, 43 anti-patterns, and adversarial red-teaming across 5 domains. Catch harms before you ship.",
    siteName: "InclusiveCode",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "InclusiveCode — LGBTQIA+ Safety Tools for LLM Engineers",
    description: "200 eval scenarios, 43 anti-patterns, and adversarial red-teaming across 5 domains.",
  },
  verification: {
    google: "20behInZTSA1-SKhOmjHuo190BZtEEFOn08J68OLNbM",
  },
};

const footerColumns = [
  {
    title: "Use it",
    links: [
      { href: "/lab", label: "Evaluation lab" },
      { href: "/tools", label: "Developer tools" },
      { href: "/checklist", label: "Pre-ship checklist" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/patterns", label: "Anti-pattern library" },
      { href: "/research", label: "Evaluation reports" },
      { href: "/registry", label: "Harm registry" },
    ],
  },
  {
    title: "Contribute",
    links: [
      { href: REPO_URL, label: "Source on GitHub", external: true },
      { href: ISSUE_REGISTRY_URL, label: "Report a harm", external: true },
      { href: ISSUE_PATTERN_URL, label: "Propose a pattern", external: true },
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${body.variable} ${code.variable} ${serif.variable}`}>
      <body className="flex min-h-screen flex-col bg-zinc-950 font-sans text-base text-zinc-100 antialiased">
        {/* Off-screen until focused (not clipped), so it is never "hidden text" to a reflow check. */}
        <a
          href="#main"
          data-print="hide"
          className="fixed left-4 top-[76px] z-50 -translate-y-[300%] rounded-md bg-zinc-50 px-4 py-3 font-semibold text-zinc-950 focus:translate-y-0"
        >
          Skip to content
        </a>
        {/* The site bar is the main navigation landmark, as before D44 (body > nav). D49: it starts at
            the very top, its transparent 3 px top border under the pride stripe, so the bar itself
            covers that strip. axe cannot see the stripe (a pseudo-element), so with the bar at
            top-[3px] it counted controls scrolled under the bar as uncovered. It looks the same. */}
        <nav aria-label="Main" data-print="hide" className="sticky top-0 z-20 border-t-[3px] border-b border-t-transparent border-b-zinc-800 bg-zinc-950">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/" className="-ml-1 inline-flex min-h-11 items-center gap-2.5 rounded-md px-1">
              <PrideMark className="size-[18px]" />
              <span className="font-display text-[1.625rem] leading-none tracking-tight text-zinc-50">
                Inclusive<span className="text-zinc-400">Code</span>
              </span>
            </Link>
            <SiteNav />
            <div className="flex items-center gap-1 sm:gap-2">
              <a
                href="https://github.com/InclusiveCode"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden min-h-10 items-center gap-1.5 rounded-md px-3 text-[0.9375rem] font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50 lg:inline-flex"
              >
                GitHub
                <NewTab />
                <ExternalIcon />
              </a>
              {/* Hidden below 360 px, where it would crowd the logo; Tools is in the menu there. Outlined, so
                  each page keeps a single solid primary button of its own. */}
              <span className="hidden min-[360px]:block">
                <QuickStartLink className={`${button.secondary} whitespace-nowrap px-4 py-2 text-sm`}>Add to CI</QuickStartLink>
              </span>
              <MobileNav />
            </div>
          </div>
        </nav>
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <footer data-print="hide" className="mt-20 border-t border-zinc-800">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="max-w-xs">
              <p className="inline-flex items-center gap-2.5">
                <PrideMark className="size-4" />
                <span className="font-display text-xl text-zinc-50">
                  Inclusive<span className="text-zinc-400">Code</span>
                </span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Open-source safety tools for LLM engineers. Built for the community, by the community. MIT License.
              </p>
            </div>
            {footerColumns.map((col) => (
              <nav key={col.title} aria-label={`Footer: ${col.title}`}>
                <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-zinc-400">{col.title}</p>
                <ul className="mt-3 space-y-1">
                  {col.links.map((l) =>
                    "external" in l ? (
                      <li key={l.href}>
                        <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-300 transition-colors hover:text-zinc-50 sm:min-h-10">
                          {l.label}
                          <NewTab />
                          <ExternalIcon />
                        </a>
                      </li>
                    ) : (
                      <li key={l.href}>
                        <Link href={l.href} className="inline-flex min-h-11 items-center text-sm text-zinc-300 transition-colors hover:text-zinc-50 sm:min-h-10">
                          {l.label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </nav>
            ))}
          </div>
        </footer>
      </body>
    </html>
  );
}
