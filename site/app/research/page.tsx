import Link from "next/link";
import { reports } from "@/lib/reports";

const verdictColor: Record<string, string> = {
  PASS: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  NEEDS_WORK: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  FAIL: "bg-rose-900/50 text-rose-300 border-rose-700",
};

function overallVerdict(rate: number): string {
  if (rate >= 90) return "PASS";
  if (rate >= 85) return "NEEDS_WORK";
  return "FAIL";
}

export default function ResearchPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20">
      <div className="mb-12">
        <div className="inline-block px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-mono mb-6">
          research
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          <span
            style={{
              background:
                "linear-gradient(90deg, #FF6B9D, #FF9B71, #FECF6A, #63E6BE, #74B9FF, #A29BFE)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Evaluation Reports
          </span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl">
          Published results from running the InclusiveCode eval suite against production LLM models.
          Each report documents pass rates, failure analysis, and safety gaps.
        </p>
      </div>

      <div className="space-y-6">
        {reports.map((report) => {
          const verdict = overallVerdict(report.totalRate);
          return (
            <Link
              key={report.slug}
              href={`/research/${report.slug}`}
              className="block group border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2
                    className="text-xl font-semibold mb-1"
                    style={{
                      background:
                        "linear-gradient(90deg, #FF6B9D, #FF9B71, #FECF6A, #63E6BE, #74B9FF, #A29BFE)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {report.title}
                  </h2>
                  <p className="text-sm text-zinc-500">
                    {report.date} &middot; {report.model}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-3 py-1 text-xs font-mono rounded border ${verdictColor[verdict]}`}
                >
                  {verdict}
                </span>
              </div>

              {/* Score bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-zinc-400">Overall pass rate</span>
                  <span className="font-mono text-zinc-300">
                    {report.totalPassed}/{report.totalScenarios} ({report.totalRate}%)
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${report.totalRate}%`,
                      background:
                        "linear-gradient(90deg, #FF6B9D, #FF9B71, #FECF6A, #63E6BE, #74B9FF, #A29BFE)",
                    }}
                  />
                </div>
              </div>

              {/* Domain mini-bars */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                {report.results.map((r) => (
                  <div key={r.domain} className="flex items-center gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">{r.domain}</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${r.rate}%`,
                          background:
                            r.rate >= 90
                              ? "#63E6BE"
                              : r.rate >= 85
                              ? "#FECF6A"
                              : "#FF6B9D",
                        }}
                      />
                    </div>
                    <span className="font-mono text-zinc-400 w-8 text-right">{r.rate}%</span>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-sm text-zinc-500 group-hover:text-zinc-400 transition-colors">
                Read full report &rarr;
              </p>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 p-6 border border-zinc-800 rounded-xl text-center">
        <p className="text-zinc-400 text-sm mb-3">Want to run the eval suite against a different model?</p>
        <a
          href="https://github.com/InclusiveCode/inclusive-ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono text-zinc-300 hover:text-white transition-colors"
        >
          Run your own eval &rarr;
        </a>
      </div>
    </div>
  );
}
