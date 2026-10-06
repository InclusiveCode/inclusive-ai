import Link from "next/link";
import { reports } from "@/lib/reports";
import { overallVerdict, VERDICT_RULE } from "@/lib/verdict";
import { CopyButton } from "./copy-button";
import { Arrow, button, cx, ISSUE_PATTERN_URL, ISSUE_REGISTRY_URL, NewTab, PrideMark, REPO_URL, textLink, VERDICT_BAR, VerdictBadge } from "./ui";

const INSTALL = "npm install --save-dev @inclusive-ai/eval";

// D44: the home page tells one story — see the failure, fix it, gate it, review it — and every step
// ends in an action. The feature grid it replaces gave five products equal weight and no order.
const steps = [
  {
    n: "01",
    title: "See it fail",
    body: "Paired inputs that differ in one detail. Edit the system instruction, rerun, and compare what improved or regressed. Runs in your browser, no setup.",
    href: "/lab",
    cta: "Open the lab",
  },
  {
    n: "02",
    title: "Fix the pattern",
    body: "43 anti-patterns in prompts, data models, and product flows, each with the harmful code, a safer alternative, and a regression test.",
    href: "/patterns",
    cta: "Browse patterns",
  },
  {
    n: "03",
    title: "Gate the release",
    body: "200 scenarios as an npm package and a GitHub Action that fails the build on any critical failure. In your own tests, assertSafe also stops on high-severity ones.",
    href: "/tools#quick-start",
    cta: "Add to CI",
  },
  {
    n: "04",
    title: "Review before launch",
    body: "Sixteen checks across identity, moderation, crisis flows, privacy, and eval coverage. Copy it into your PR template.",
    href: "/checklist",
    cta: "Run the checklist",
  },
];

const failureModes = [
  { text: "System prompts that assume binary gender, deadname users, or misgender trans people", href: "/patterns/binary-gender-assumption" },
  { text: "Mental health and companion AI that gives non-affirming responses to LGBTQIA+ youth in crisis", href: "/patterns/crisis-mishandling" },
  { text: "Content moderation that flags LGBTQIA+ content at higher rates than equivalent straight content", href: "/patterns/moderation-parity" },
  { text: "Applications that infer or store sexual orientation without consent", href: "/patterns/identity-inference" },
  { text: "Prompt templates that treat heterosexuality as the default relationship context", href: "/patterns/heterosexual-default" },
  { text: "Pipelines with no eval coverage for LGBTQIA+-specific failures", href: "/patterns/eval-gap" },
];

const pride = ["bg-pride-1", "bg-pride-2", "bg-pride-3", "bg-pride-4", "bg-pride-5", "bg-pride-6"];

export default function HomePage() {
  const failRates = reports.map((r) => 100 - r.totalRate);
  const lowestFail = Math.min(...failRates);
  const highestFail = Math.max(...failRates);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-20">
      {/* Hero: one promise, one primary action, the install command right there. */}
      <section aria-labelledby="hero-title" className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-16">
        <div>
          <h1 id="hero-title" className="font-display text-[2.75rem] leading-[1.02] tracking-[-0.015em] text-zinc-50 sm:text-7xl">
            Catch LGBTQIA+ harms before your users do.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
            Misgendering, outing, non-affirming crisis replies, biased moderation: predictable failures you can test for. Open-source eval scenarios, fixes, and a CI gate for LLM products.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/tools#quick-start" className={button.primary}>
              Add the eval suite
              <Arrow />
            </Link>
            <Link href="/lab" className={button.secondary}>
              Try the lab — no setup
            </Link>
          </div>
          <div className="mt-6 flex max-w-xl items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-4 pr-2">
            <span aria-hidden="true" className="select-none font-mono text-sm text-zinc-400">
              $
            </span>
            <code id="hero-install" className="min-w-0 flex-1 wrap-anywhere font-mono text-[0.8125rem] text-zinc-100 sm:text-sm">
              {INSTALL}
            </code>
            <CopyButton text={INSTALL} what="install command" selectId="hero-install" compact />
          </div>
          <p className="mt-4 text-sm text-zinc-400">
            MIT licensed · TypeScript · works with any model{" "}
            <span aria-hidden="true">·</span>{" "}
            <Link href="/checklist" className="text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-50 hover:decoration-zinc-300">
              or start with the checklist
            </Link>
          </p>
        </div>

        {/* Proof: the published baselines, straight from the report data. */}
        <aside aria-labelledby="proof-title" className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-7">
          <p id="proof-title" className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-zinc-400">
            Published baselines
          </p>
          <p className="mt-3 text-2xl font-semibold leading-snug text-zinc-50">
            Every model we have published misses {lowestFail === highestFail ? `${lowestFail}%` : `${lowestFail}–${highestFail}%`} of these scenarios.
          </p>
          <ul className="mt-6 space-y-5">
            {reports.map((r) => {
              const verdict = overallVerdict(r.totalRate);
              return (
                <li key={r.slug}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-zinc-100">{r.model}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm text-zinc-300">{r.totalRate}%</span>
                      <VerdictBadge verdict={verdict} />
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                    <div className={cx("h-full rounded-full", VERDICT_BAR[verdict])} style={{ width: `${r.totalRate}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-400">
                    {r.totalPassed} of {r.totalScenarios} scenarios passed · {r.date}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-400">{VERDICT_RULE}</p>
          <Link href="/research" className={cx(textLink, "mt-3 text-sm")}>
            Read the reports
            <Arrow />
          </Link>
        </aside>
      </section>

      {/* The journey, as numbered steps that each end in an action. */}
      <section aria-labelledby="how-title" className="mt-24 sm:mt-32">
        <h2 id="how-title" className="font-display text-4xl leading-tight text-zinc-50 sm:text-5xl">
          From first failure to release gate
        </h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col bg-zinc-950 p-6">
              <span className="font-mono text-sm text-zinc-400" aria-hidden="true">
                {s.n}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-50">{s.title}</h3>
              <p className="mt-2 flex-1 text-[0.9375rem] leading-relaxed text-zinc-300">{s.body}</p>
              <Link href={s.href} className={cx(textLink, "mt-5 self-start text-[0.9375rem]")}>
                {s.cta}
                <Arrow />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Why: each failure mode links to the pattern that fixes it. */}
      <section aria-labelledby="why-title" className="mt-24 grid gap-10 sm:mt-32 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <div>
          <h2 id="why-title" className="font-display text-4xl leading-tight text-zinc-50 sm:text-5xl">
            Not edge cases.
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-zinc-300">
            Most teams evaluate accuracy, latency, and general safety. Almost none test the failures LGBTQIA+ users hit — and they are predictable, reproducible, and preventable.
          </p>
        </div>
        <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
          {failureModes.map((m, i) => (
            <li key={m.href}>
              <Link href={m.href} className="group flex min-h-14 items-center gap-4 py-4 pr-1 transition-colors hover:bg-zinc-900/50">
                <span aria-hidden="true" className={cx("h-8 w-1 shrink-0 rounded-full", pride[i % pride.length])} />
                <span className="flex-1 text-[0.9375rem] leading-snug text-zinc-200 group-hover:text-zinc-50">{m.text}</span>
                <Arrow className="text-zinc-400 group-hover:text-zinc-100" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Contribute */}
      <section aria-labelledby="contribute-title" className="mt-24 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:mt-32 sm:p-10">
        <div className="flex items-center gap-3">
          <PrideMark className="size-5" />
          <h2 id="contribute-title" className="font-display text-3xl text-zinc-50 sm:text-4xl">
            Seen an LLM fail someone?
          </h2>
        </div>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-300">
          This is a community resource. Report a harm you have seen, or a mitigation that works. Patterns and registry entries are plain data files anyone can improve.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a href={ISSUE_REGISTRY_URL} target="_blank" rel="noopener noreferrer" className={button.secondary}>
            Report a harm
            <NewTab />
          </a>
          <a href={ISSUE_PATTERN_URL} target="_blank" rel="noopener noreferrer" className={button.secondary}>
            Propose a pattern
            <NewTab />
          </a>
        </div>
        {/* F7 (WCAG 1.4.10): the URL wraps instead of widening the page at 320 px. */}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block max-w-full wrap-anywhere py-3 font-mono text-sm text-zinc-300 underline decoration-zinc-700 underline-offset-4 transition-colors hover:text-zinc-50 hover:decoration-zinc-300">
          github.com/InclusiveCode/inclusive-ai
          <NewTab />
        </a>
      </section>
    </div>
  );
}
