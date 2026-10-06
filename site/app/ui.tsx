/**
 * Shared presentation pieces (D44). Server-safe: no hooks, no browser APIs.
 */
import type { ReactNode } from "react";

export const REPO_URL = "https://github.com/InclusiveCode/inclusive-ai";
export const ISSUE_PATTERN_URL = `${REPO_URL}/issues/new?template=new_pattern.md`;
export const ISSUE_REGISTRY_URL = `${REPO_URL}/issues/new?template=registry_case.md`;

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[0.9375rem] font-semibold leading-tight transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:pointer-events-none disabled:opacity-50";

/** One primary action per view; secondary for the alternative; quiet for low-stakes tools. */
export const button = {
  primary: `${BUTTON_BASE} bg-zinc-50 text-zinc-950 hover:bg-white active:bg-zinc-200`,
  secondary: `${BUTTON_BASE} border border-zinc-700 bg-zinc-900/60 text-zinc-100 hover:border-zinc-400 hover:bg-zinc-900 active:bg-zinc-800`,
  quiet: "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 active:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400",
} as const;

/** Text link with a visible affordance: underlined on hover, arrow nudges. */
export const textLink =
  "group/link inline-flex min-h-11 items-center gap-1 font-medium text-zinc-100 underline decoration-zinc-600 underline-offset-4 transition-colors hover:decoration-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";

export function Arrow({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className={cx("shrink-0 transition-transform duration-150 group-hover/link:translate-x-0.5 group-hover:translate-x-0.5", className)}>
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <path d="M5.5 3H3v8h8V8.5M8 3h3v3M11 3 6.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Screen-reader note for links that open a new tab (WCAG technique G201). */
export function NewTab() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}

/** The flag mark: six discrete stripes. Decorative. */
export function PrideMark({ className }: { className?: string }) {
  const stripes = ["var(--color-pride-1)", "var(--color-pride-2)", "var(--color-pride-3)", "var(--color-pride-4)", "var(--color-pride-5)", "var(--color-pride-6)"];
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className={cx("shrink-0 rounded-[3px]", className)}>
      {stripes.map((fill, i) => (
        <rect key={fill} x="0" y={i * 2} width="12" height="2" fill={fill} />
      ))}
    </svg>
  );
}

/** Page title block: serif display title, one-paragraph lead, optional actions. */
export function PageHeader({
  title,
  lead,
  children,
  titleClassName,
}: {
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <header className="mb-12 sm:mb-16">
      <h1 className={cx("font-display text-[2.625rem] leading-[1.05] tracking-[-0.01em] text-zinc-50 sm:text-6xl", titleClassName)}>{title}</h1>
      {lead && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-300 sm:text-xl">{lead}</p>}
      {children}
    </header>
  );
}

/** Small uppercase label above a block, e.g. "Install". */
export function Label({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <p id={id} className={cx("font-mono text-xs font-medium uppercase tracking-[0.08em] text-zinc-400", className)}>
      {children}
    </p>
  );
}

export type Severity = "critical" | "high" | "medium" | "low";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-rose-500/15 text-rose-200 ring-rose-400/40",
  high: "bg-orange-500/15 text-orange-200 ring-orange-400/40",
  medium: "bg-yellow-400/10 text-yellow-100 ring-yellow-300/35",
  low: "bg-zinc-700/40 text-zinc-200 ring-zinc-500/40",
};

/** Severity marker colour, for the edge of a card. */
export const SEVERITY_EDGE: Record<Severity, string> = {
  critical: "before:bg-rose-400",
  high: "before:bg-orange-400",
  medium: "before:bg-yellow-300",
  low: "before:bg-zinc-500",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset", SEVERITY_STYLE[severity])}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {severity}
      <span className="sr-only"> severity</span>
    </span>
  );
}

export type Verdict = "PASS" | "NEEDS_WORK" | "FAIL";

export const VERDICT_LABEL: Record<Verdict, string> = { PASS: "Pass", NEEDS_WORK: "Needs work", FAIL: "Fail" };

/** Bar fills and text accents for a verdict. Never the pride colours. */
export const VERDICT_BAR: Record<Verdict, string> = { PASS: "bg-emerald-400", NEEDS_WORK: "bg-amber-300", FAIL: "bg-rose-400" };

const VERDICT_STYLE: Record<Verdict, string> = {
  PASS: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40",
  NEEDS_WORK: "bg-amber-400/15 text-amber-100 ring-amber-300/40",
  FAIL: "bg-rose-500/15 text-rose-200 ring-rose-400/40",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", VERDICT_STYLE[verdict])}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
