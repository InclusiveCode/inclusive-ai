import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { reports, type Report, type ReportFailure } from "@/lib/reports";
import { verdictFor, VERDICT_RULE } from "@/lib/verdict";
import { Arrow, SeverityBadge, VERDICT_BAR, VerdictBadge, type Severity } from "../../ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const report = reports.find((r) => r.slug === slug);
  return { title: report ? `${report.title} — Evaluation Reports` : "Evaluation Reports" };
}

export async function generateStaticParams() {
  return reports.map((r) => ({ slug: r.slug }));
}

// D44: pass/fail colours are semantic (emerald, amber, rose), the same as on /research and the
// home page, and never the pride palette. Badges come from the shared VerdictBadge/SeverityBadge.
const verdictColor: Record<string, string> = {
  PASS: "text-emerald-300",
  NEEDS_WORK: "text-amber-200",
  FAIL: "text-rose-300",
};

function groupFailuresByDomain(failures: ReportFailure[]): Record<string, ReportFailure[]> {
  const groups: Record<string, ReportFailure[]> = {};
  for (const f of failures) {
    if (!groups[f.domain]) groups[f.domain] = [];
    groups[f.domain].push(f);
  }
  return groups;
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = reports.find((r) => r.slug === slug);
  if (!report) return notFound();

  const failuresByDomain = groupFailuresByDomain(report.failures);
  const adversarialResult = report.results.find((r) => r.domain === "Adversarial");
  const adversarialFailures = failuresByDomain["Adversarial"] || [];
  const nonAdversarialDomains = report.results.filter((r) => r.domain !== "Adversarial");

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
      <nav aria-label="Breadcrumb" className="mb-8">
        <Link href="/research" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100">
          <Arrow className="rotate-180" />
          All reports
        </Link>
      </nav>

      {/* Header */}
      <div className="mb-12">
        <h1 className="font-display text-[2.375rem] leading-[1.08] tracking-[-0.01em] text-zinc-50 wrap-anywhere sm:text-5xl">{report.title}</h1>
        <p className="mt-4 text-sm text-zinc-400">
          Published {report.date} &middot; Model: {report.model} ({report.modelVersion}) &middot;
          Author: {report.author}
        </p>

        {/* Overall scorecard */}
        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm text-zinc-300">
              Overall result <VerdictBadge verdict={verdictFor(report.failures)} />
            </span>
            <span className="font-mono text-lg text-zinc-100">
              {report.totalPassed}/{report.totalScenarios} passed ({report.totalRate}%)
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
            <div className={`h-full rounded-full ${VERDICT_BAR[verdictFor(report.failures)]}`} style={{ width: `${report.totalRate}%` }} />
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            {report.failures.length} failures across {report.results.length} domains &middot;{" "}
            {report.failures.filter((f) => f.severity === "critical").length} critical,{" "}
            {report.failures.filter((f) => f.severity === "high").length} high,{" "}
            {report.failures.filter((f) => f.severity === "medium").length} medium
          </p>
          <p className="mt-1 text-xs text-zinc-400">{VERDICT_RULE}</p>
        </div>
      </div>

      {/* Abstract */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">Abstract</h2>
        <div
          className="pl-6 text-zinc-300 leading-relaxed"
          style={{ borderLeft: "3px solid #52525b" }}
        >
          {report.abstract}
        </div>
      </section>

      {/* 1. Methodology */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">1. Methodology</h2>
        <div className="space-y-4 text-zinc-400 leading-relaxed">
          {report.methodology.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* 2. Results Summary */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">2. Results Summary</h2>
        {/* F11 (WCAG 1.4.10, 2.1.1): wider than a 320 px screen, so it scrolls in a keyboard-reachable region. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Results summary table"
          className="border border-zinc-800 rounded-xl overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Passed</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium w-1/3">Pass Rate</th>
                <th className="px-4 py-3 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <tr key={r.domain} className="border-b border-zinc-800/50">
                  <td className="px-4 py-3 text-zinc-200 font-medium">{r.domain}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{r.passed}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{r.total}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${VERDICT_BAR[r.verdict]}`} style={{ width: `${r.rate}%` }} />
                      </div>
                      <span className={`font-mono text-xs ${verdictColor[r.verdict]}`}>
                        {r.rate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <VerdictBadge verdict={r.verdict} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Results by Domain */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">3. Results by Domain</h2>
        <div className="space-y-3">
          {nonAdversarialDomains.map((r) => {
            const domainFailures = failuresByDomain[r.domain] || [];
            return (
              <details
                key={r.domain}
                className="border border-zinc-800 rounded-xl overflow-hidden group"
              >
                <summary className="px-5 py-4 cursor-pointer hover:bg-zinc-900/50 transition-colors flex flex-wrap items-center justify-between gap-2 list-none">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-zinc-200 font-medium">{r.domain}</span>
                    <span className={`text-xs font-mono ${verdictColor[r.verdict]}`}>
                      {r.passed}/{r.total} ({r.rate}%)
                    </span>
                    <VerdictBadge verdict={r.verdict} />
                  </div>
                  <span className="text-zinc-400 text-sm">
                    {domainFailures.length} failure{domainFailures.length !== 1 ? "s" : ""}{" "}
                    &#9662;
                  </span>
                </summary>
                <div className="px-5 pb-5 space-y-3 border-t border-zinc-800/50 pt-4">
                  {domainFailures.length === 0 ? (
                    <p className="text-sm text-zinc-400">All scenarios passed.</p>
                  ) : (
                    domainFailures.map((f) => (
                      <FailureCard key={f.id} failure={f} />
                    ))
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* 4. Adversarial Results */}
      {adversarialResult && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 text-zinc-200">4. Adversarial Results</h2>
          <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/50 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-300 font-medium">Adversarial Robustness</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-zinc-200">
                  {adversarialResult.passed}/{adversarialResult.total} ({adversarialResult.rate}%)
                </span>
                <VerdictBadge verdict={adversarialResult.verdict} />
              </div>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${VERDICT_BAR[adversarialResult.verdict]}`} style={{ width: `${adversarialResult.rate}%` }} />
            </div>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">
            The model passed {adversarialResult.passed} of {adversarialResult.total} adversarial scenarios
            {adversarialFailures.length === 0
              ? "."
              : adversarialFailures.length === 1
                ? ". The one failure is below."
                : `. The ${adversarialFailures.length} failures are below.`}
          </p>
          {adversarialFailures.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400 font-medium">{adversarialFailures.length === 1 ? "Failure:" : "Failures:"}</p>
              {adversarialFailures.map((f) => (
                <FailureCard key={f.id} failure={f} />
              ))}
            </div>
          )}
          {adversarialFailures.some((f) => f.title.includes("JSON escape")) && (
          <div
            className="mt-4 p-4 rounded-lg bg-zinc-900/80 text-sm text-zinc-400 leading-relaxed"
            style={{ borderLeft: "3px solid #fcd34d" }}
          >
            <strong className="text-amber-200">Note on JSON escape bypass:</strong> The model
            produced structured orientation predictions when the request was framed as JSON output
            generation. This suggests that structured output modes may receive less safety oversight
            than natural language responses — a pattern worth investigating across other model
            families.
          </div>
          )}
        </section>
      )}

      {/* 5. Discussion */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">5. Discussion</h2>
        <div className="space-y-4 text-zinc-400 leading-relaxed">
          {report.discussion.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* 6. Conclusion */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">6. Conclusion</h2>
        <div
          className="pl-6 text-zinc-300 leading-relaxed"
          style={{ borderLeft: "3px solid #52525b" }}
        >
          {report.conclusion}
        </div>
      </section>

      {/* 7. Methodology Appendix */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">7. Methodology Appendix</h2>
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/50 text-sm text-zinc-400 space-y-3">
          <p>
            The eval suite source code, all 200 scenarios, and pass functions are available at:{" "}
            <a
              href="https://github.com/InclusiveCode/inclusive-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline hover:text-white transition-colors"
            >
              github.com/InclusiveCode/inclusive-ai
            </a>
          </p>
          <p>
            Each scenario defines a <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">pass</code> function
            that receives the model&apos;s response and returns a boolean. Pass functions use string
            matching, regex patterns, and semantic checks to detect specific failure modes. They are
            intentionally conservative — a scenario only fails when the response contains a clear,
            unambiguous violation of the safety requirement.
          </p>
          <p>
            To reproduce these results, install the eval package and run:{" "}
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
              npx @inclusive-ai/eval --model claude-haiku-4-5-20250315
            </code>
          </p>
        </div>
      </section>

      {/* Back link */}
      <div className="pt-6 border-t border-zinc-800">
        <Link href="/research" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-50">
          <Arrow className="rotate-180" />
          All reports
        </Link>
      </div>
    </div>
  );
}

function FailureCard({ failure }: { failure: ReportFailure }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
      <div className="flex items-start gap-3 mb-2">
        <span className="shrink-0">
          <SeverityBadge severity={failure.severity as Severity} />
        </span>
        {/* N1 (WCAG 1.4.10): long words such as "Military/authoritarian" break inside the card. */}
        <div className="min-w-0 wrap-anywhere">
          <span className="font-mono text-xs text-zinc-400 mr-2">{failure.id}</span>
          <span className="text-sm text-zinc-200">{failure.title}</span>
        </div>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed ml-0 sm:ml-16 wrap-anywhere">{failure.failMessage}</p>
      <div className="mt-2 ml-0 sm:ml-16 wrap-anywhere">
        <span className="text-xs text-zinc-400 font-mono">{failure.category}</span>
      </div>
    </div>
  );
}
