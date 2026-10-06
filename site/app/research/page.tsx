import type { Metadata } from "next";
import Link from "next/link";
import { reports } from "@/lib/reports";
import { verdictFor, VERDICT_RULE } from "@/lib/verdict";
import { Arrow, button, cx, NewTab, PageHeader, REPO_URL, VERDICT_BAR, VerdictBadge } from "../ui";

export const metadata: Metadata = { title: "Evaluation Reports" };

const SCENARIOS = Math.max(...reports.map((r) => r.totalScenarios));

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6 sm:pt-16">
      <PageHeader
        title="Evaluation Reports"
        lead="Published results from running the InclusiveCode eval suite against production LLM models: pass rates, failure analysis, and safety gaps."
      >
        <p className="mt-4 text-sm text-zinc-400">{VERDICT_RULE}</p>
      </PageHeader>

      <ul className="space-y-5">
        {reports.map((report) => {
          const verdict = verdictFor(report.failures);
          return (
            <li key={report.slug}>
              <Link
                href={`/research/${report.slug}`}
                className="group block rounded-2xl border border-zinc-800 p-5 transition-colors hover:border-zinc-600 hover:bg-zinc-900/40 active:bg-zinc-900 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold leading-snug text-zinc-50">{report.title}</h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      {report.date} &middot; {report.model}
                    </p>
                  </div>
                  <VerdictBadge verdict={verdict} />
                </div>

                {/* Overall */}
                <span className="mt-5 block">
                  <span className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-zinc-300">Overall pass rate</span>
                    <span className="font-mono text-zinc-100">
                      {report.totalPassed}/{report.totalScenarios} ({report.totalRate}%)
                    </span>
                  </span>
                  <span className="block h-2 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                    <span className={cx("block h-full rounded-full", VERDICT_BAR[verdict])} style={{ width: `${report.totalRate}%` }} />
                  </span>
                </span>

                {/* Domains */}
                <span className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm min-[420px]:grid-cols-2 sm:grid-cols-3">
                  {report.results.map((r) => (
                    <span key={r.domain} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-zinc-400">{r.domain}</span>
                      <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                        <span className={cx("block h-full rounded-full", VERDICT_BAR[r.verdict])} style={{ width: `${r.rate}%` }} />
                      </span>
                      <span className="w-10 text-right font-mono text-zinc-300">{r.rate}%</span>
                    </span>
                  ))}
                </span>

                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-zinc-200 group-hover:text-zinc-50">
                  Read the full report
                  <Arrow />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-zinc-800 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-zinc-50">Run the suite against your model</h2>
          <p className="mt-1 text-sm text-zinc-400">The same {SCENARIOS} scenarios, your system prompt, your API key.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/tools#quick-start" className={button.primary}>
            Quick start
          </Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={button.secondary}>
            Source on GitHub
            <NewTab />
          </a>
        </div>
      </div>
    </div>
  );
}
