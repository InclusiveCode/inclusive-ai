import Link from "next/link";
import { notFound } from "next/navigation";
import { reports, type Report, type ReportFailure } from "@/lib/reports";

export async function generateStaticParams() {
  return reports.map((r) => ({ slug: r.slug }));
}

const severityColor: Record<string, string> = {
  critical: "bg-rose-900/50 text-rose-300 border-rose-700",
  high: "bg-red-900/50 text-red-300 border-red-700",
  medium: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
};

const verdictColor: Record<string, string> = {
  PASS: "text-emerald-400",
  NEEDS_WORK: "text-yellow-400",
  FAIL: "text-rose-400",
};

const verdictBg: Record<string, string> = {
  PASS: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  NEEDS_WORK: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  FAIL: "bg-rose-900/50 text-rose-300 border-rose-700",
};

const barColor: Record<string, string> = {
  PASS: "#63E6BE",
  NEEDS_WORK: "#FECF6A",
  FAIL: "#FF6B9D",
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
    <div className="max-w-4xl mx-auto px-6 py-20">
      <Link
        href="/research"
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8 inline-block"
      >
        &larr; Back to all reports
      </Link>

      {/* Header */}
      <div className="mb-12">
        <div className="inline-block px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-mono mb-6">
          research report
        </div>
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
          style={{
            background:
              "linear-gradient(90deg, #FF6B9D, #FF9B71, #FECF6A, #63E6BE, #74B9FF, #A29BFE)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {report.title}
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Published {report.date} &middot; Model: {report.model} ({report.modelVersion}) &middot;
          Author: {report.author}
        </p>

        {/* Overall scorecard */}
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Overall result</span>
            <span className="font-mono text-lg text-zinc-100">
              {report.totalPassed}/{report.totalScenarios} passed ({report.totalRate}%)
            </span>
          </div>
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${report.totalRate}%`,
                background:
                  "linear-gradient(90deg, #FF6B9D, #FF9B71, #FECF6A, #63E6BE, #74B9FF, #A29BFE)",
              }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {report.failures.length} failures across {report.results.length} domains &middot;{" "}
            {report.failures.filter((f) => f.severity === "critical").length} critical,{" "}
            {report.failures.filter((f) => f.severity === "high").length} high,{" "}
            {report.failures.filter((f) => f.severity === "medium").length} medium
          </p>
        </div>
      </div>

      {/* Abstract */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-zinc-200">Abstract</h2>
        <div
          className="pl-6 text-zinc-300 leading-relaxed"
          style={{ borderLeft: "3px solid #A29BFE" }}
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
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
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
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${r.rate}%`,
                            backgroundColor: barColor[r.verdict],
                          }}
                        />
                      </div>
                      <span className={`font-mono text-xs ${verdictColor[r.verdict]}`}>
                        {r.rate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-mono rounded border ${verdictBg[r.verdict]}`}
                    >
                      {r.verdict}
                    </span>
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
                <summary className="px-5 py-4 cursor-pointer hover:bg-zinc-900/50 transition-colors flex items-center justify-between list-none">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-200 font-medium">{r.domain}</span>
                    <span className={`text-xs font-mono ${verdictColor[r.verdict]}`}>
                      {r.passed}/{r.total} ({r.rate}%)
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-mono rounded border ${verdictBg[r.verdict]}`}
                    >
                      {r.verdict}
                    </span>
                  </div>
                  <span className="text-zinc-600 text-sm">
                    {domainFailures.length} failure{domainFailures.length !== 1 ? "s" : ""}{" "}
                    &#9662;
                  </span>
                </summary>
                <div className="px-5 pb-5 space-y-3 border-t border-zinc-800/50 pt-4">
                  {domainFailures.length === 0 ? (
                    <p className="text-sm text-zinc-500">All scenarios passed.</p>
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
                <span
                  className={`px-2 py-0.5 text-xs font-mono rounded border ${verdictBg[adversarialResult.verdict]}`}
                >
                  {adversarialResult.verdict}
                </span>
              </div>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${adversarialResult.rate}%`,
                  backgroundColor: barColor[adversarialResult.verdict],
                }}
              />
            </div>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">
            The model demonstrated strong resistance to adversarial attacks, passing 29 of 30
            scenarios. Prompt injection, jailbreak, role-play exploitation, and social engineering
            attempts were all successfully rejected. The single failure involved a JSON-structured
            output escape technique.
          </p>
          {adversarialFailures.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-500 font-medium">Failure:</p>
              {adversarialFailures.map((f) => (
                <FailureCard key={f.id} failure={f} />
              ))}
            </div>
          )}
          <div
            className="mt-4 p-4 rounded-lg bg-zinc-900/80 text-sm text-zinc-400 leading-relaxed"
            style={{ borderLeft: "3px solid #FECF6A" }}
          >
            <strong className="text-yellow-300">Note on JSON escape bypass:</strong> The model
            produced structured orientation predictions when the request was framed as JSON output
            generation. This suggests that structured output modes may receive less safety oversight
            than natural language responses — a pattern worth investigating across other model
            families.
          </div>
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
          style={{ borderLeft: "3px solid #63E6BE" }}
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
        <Link
          href="/research"
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          &larr; Back to all reports
        </Link>
      </div>
    </div>
  );
}

function FailureCard({ failure }: { failure: ReportFailure }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
      <div className="flex items-start gap-3 mb-2">
        <span
          className={`shrink-0 px-2 py-0.5 text-xs font-mono rounded border ${severityColor[failure.severity]}`}
        >
          {failure.severity}
        </span>
        <div>
          <span className="font-mono text-xs text-zinc-500 mr-2">{failure.id}</span>
          <span className="text-sm text-zinc-200">{failure.title}</span>
        </div>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed ml-0 sm:ml-16">{failure.failMessage}</p>
      <div className="mt-2 ml-0 sm:ml-16">
        <span className="text-xs text-zinc-600 font-mono">{failure.category}</span>
      </div>
    </div>
  );
}
