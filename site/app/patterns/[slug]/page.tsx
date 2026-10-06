import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "../../code-block";
import { notFound } from "next/navigation";
import { patterns } from "@/lib/patterns";
import { CopyButton } from "../../copy-button";
import { Arrow, button, cx, Label, NewTab, SeverityBadge, textLink } from "../../ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pattern = patterns.find((p) => p.slug === slug);
  return { title: pattern ? `${pattern.title} — Anti-Pattern Library` : "Anti-Pattern Library" };
}

export async function generateStaticParams() {
  return patterns.map((p) => ({ slug: p.slug }));
}

export default async function PatternDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const index = patterns.findIndex((p) => p.slug === slug);
  const pattern = patterns[index];
  if (!pattern) notFound();
  const prev = patterns[index - 1];
  const next = patterns[index + 1];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <nav aria-label="Breadcrumb" className="mb-8">
        <Link href="/patterns" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100">
          <Arrow className="rotate-180" />
          All patterns
        </Link>
      </nav>

      {/* Header */}
      <header className="mb-12">
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <SeverityBadge severity={pattern.severity} />
          <span className="text-sm text-zinc-400">{pattern.category}</span>
        </div>
        {/* F12 (WCAG 1.4.10): long words such as "Housing/Employment" break rather than widen the page. */}
        <h1 className="font-display text-[2.5rem] leading-[1.05] tracking-[-0.01em] text-zinc-50 wrap-anywhere sm:text-5xl">{pattern.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-300">{pattern.description}</p>
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Tags">
          {pattern.tags.map((t) => (
            <li key={t} className="rounded-md bg-zinc-800/80 px-2 py-0.5 font-mono text-xs text-zinc-300">
              {t}
            </li>
          ))}
        </ul>
      </header>

      {/* The Problem */}
      <section aria-labelledby="problem" className="mb-12">
        <h2 id="problem" className="mb-3 flex items-center gap-2.5 text-xl font-semibold text-zinc-50">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-rose-500/15 text-sm text-rose-300">!</span>
          The problem
        </h2>
        <p className="mb-4 leading-relaxed text-zinc-300">{pattern.problem.explanation}</p>
        <div className="overflow-hidden rounded-xl border border-rose-900/50 bg-rose-950/20">
          <div className="flex min-h-11 flex-wrap items-center gap-x-2 border-b border-rose-900/50 px-4">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-rose-300">Harmful pattern</span>
            <span className="ml-auto font-mono text-xs text-zinc-400">{pattern.problem.language}</span>
          </div>
          <CodeBlock
            label={`Code: harmful pattern (${pattern.problem.language})`}
            className="p-4 text-sm leading-relaxed text-zinc-200 overflow-x-auto whitespace-pre-wrap"
            insetFocus
          >
            {pattern.problem.code}
          </CodeBlock>
        </div>
      </section>

      {/* Why It Harms */}
      <section aria-labelledby="harm" className="mb-12">
        <h2 id="harm" className="mb-3 flex items-center gap-2.5 text-xl font-semibold text-zinc-50">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-orange-500/15 text-sm text-orange-300">?</span>
          Why it harms LGBTQIA+ users
        </h2>
        <p className="leading-relaxed text-zinc-200">{pattern.harm}</p>
      </section>

      {/* The Fix */}
      <section aria-labelledby="fix" className="mb-12">
        <h2 id="fix" className="mb-3 flex items-center gap-2.5 text-xl font-semibold text-zinc-50">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-sm text-emerald-300">✓</span>
          The fix
        </h2>
        <p className="mb-4 leading-relaxed text-zinc-300">{pattern.fix.explanation}</p>
        <div className="overflow-hidden rounded-xl border border-emerald-900/50 bg-emerald-950/20">
          {/* Wraps at 320 px rather than being clipped by the card (WCAG 1.4.10). */}
          <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 border-b border-emerald-900/50 py-1.5 pl-4 pr-2">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-emerald-300">Safer alternative</span>
            <span className="ml-auto mr-1 font-mono text-xs text-zinc-400">{pattern.fix.language}</span>
            <CopyButton text={pattern.fix.code} what="safer alternative" selectId="fix-code" compact />
          </div>
          <CodeBlock
            id="fix-code"
            label={`Code: safer alternative (${pattern.fix.language})`}
            className="p-4 text-sm leading-relaxed text-zinc-200 overflow-x-auto whitespace-pre-wrap"
            insetFocus
          >
            {pattern.fix.code}
          </CodeBlock>
        </div>
      </section>

      {/* Eval Test Case */}
      <section aria-labelledby="test" className="mb-12">
        <h2 id="test" className="mb-3 flex items-center gap-2.5 text-xl font-semibold text-zinc-50">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-sky-500/15 text-sm text-sky-300">✱</span>
          Eval test case
        </h2>
        <p className="mb-4 text-zinc-300">Add this to your eval suite so the fix stays fixed.</p>
        <dl className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/60">
          <div className="border-b border-zinc-800 p-4">
            <dt>
              <Label>Input</Label>
            </dt>
            <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-zinc-100">{pattern.evalCase.input}</dd>
          </div>
          <div className="border-b border-zinc-800 p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-emerald-300">Expected behavior</dt>
            <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-zinc-200">{pattern.evalCase.expectedBehavior}</dd>
          </div>
          <div className="p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-rose-300">Red flag</dt>
            <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-zinc-200">{pattern.evalCase.redFlag}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-zinc-800 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.9375rem] text-zinc-300">Catch this automatically on every pull request.</p>
          <Link href="/tools#quick-start" className={cx(button.secondary, "shrink-0")}>
            Add the eval suite to CI
          </Link>
        </div>
      </section>

      {/* Keep reading: the next pattern is one tap away instead of back-and-forth through the list. */}
      <nav aria-label="More patterns" className="mb-12 grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link href={`/patterns/${prev.slug}`} className="group rounded-xl border border-zinc-800 p-4 transition-colors hover:border-zinc-600 hover:bg-zinc-900/50">
            <span className="text-xs text-zinc-400">Previous</span>
            <span className="mt-1 block font-medium leading-snug text-zinc-100 group-hover:text-zinc-50">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/patterns/${next.slug}`} className="group rounded-xl border border-zinc-800 p-4 text-right transition-colors hover:border-zinc-600 hover:bg-zinc-900/50">
            <span className="text-xs text-zinc-400">Next</span>
            <span className="mt-1 block font-medium leading-snug text-zinc-100 group-hover:text-zinc-50">{next.title}</span>
          </Link>
        )}
      </nav>

      {/* Contribute */}
      <div className="rounded-xl border border-zinc-800 p-6">
        <h2 className="font-semibold text-zinc-50">Improve this pattern</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Better example? Real-world case? Open a PR — pattern data is in{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-200">site/lib/patterns.ts</code>.
        </p>
        <a
          href="https://github.com/InclusiveCode/inclusive-ai/blob/main/site/lib/patterns.ts"
          target="_blank"
          rel="noopener noreferrer"
          className={cx(textLink, "mt-3 text-sm")}
        >
          Edit on GitHub
          <NewTab />
        </a>
      </div>
    </div>
  );
}
