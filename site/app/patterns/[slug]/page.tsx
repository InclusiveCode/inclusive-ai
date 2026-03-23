import Link from "next/link";
import { notFound } from "next/navigation";
import { patterns } from "@/lib/patterns";

export async function generateStaticParams() {
  return patterns.map((p) => ({ slug: p.slug }));
}

const severityColor: Record<string, string> = {
  critical: "text-rose-400 bg-rose-400/10",
  high: "text-red-400 bg-red-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low: "text-green-400 bg-green-400/10",
};

export default async function PatternDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pattern = patterns.find((p) => p.slug === slug);
  if (!pattern) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <Link
        href="/patterns"
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8 inline-block"
      >
        ← Back to patterns
      </Link>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className={`text-xs font-mono px-2 py-0.5 rounded ${severityColor[pattern.severity]}`}>
            {pattern.severity}
          </span>
          <span className="text-xs text-zinc-500 font-mono">{pattern.category}</span>
        </div>
        <h1 className="text-3xl font-bold mb-3">{pattern.title}</h1>
        <p className="text-zinc-400">{pattern.description}</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          {pattern.tags.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded font-mono">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* The Problem */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <span className="text-red-400">⚠</span> The Problem
        </h2>
        <p className="text-zinc-400 mb-4">{pattern.problem.explanation}</p>
        <div className="rounded-lg overflow-hidden bg-red-950/20 border border-red-900/30">
          <div className="px-4 py-2 border-b border-red-900/30 flex items-center gap-2">
            <span className="text-xs font-mono text-red-400">harmful pattern</span>
            <span className="text-xs font-mono text-zinc-600 ml-auto">{pattern.problem.language}</span>
          </div>
          <pre className="p-4 text-sm font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap">
            {pattern.problem.code}
          </pre>
        </div>
      </section>

      {/* Why It Harms */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <span className="text-orange-400">→</span> Why It Harms LGBTQIA+ Users
        </h2>
        <p className="text-zinc-300 leading-relaxed">{pattern.harm}</p>
      </section>

      {/* The Fix */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <span className="text-green-400">✓</span> The Fix
        </h2>
        <p className="text-zinc-400 mb-4">{pattern.fix.explanation}</p>
        <div className="rounded-lg overflow-hidden bg-green-950/20 border border-green-900/30">
          <div className="px-4 py-2 border-b border-green-900/30 flex items-center gap-2">
            <span className="text-xs font-mono text-green-400">safer alternative</span>
            <span className="text-xs font-mono text-zinc-600 ml-auto">{pattern.fix.language}</span>
          </div>
          <pre className="p-4 text-sm font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap">
            {pattern.fix.code}
          </pre>
        </div>
      </section>

      {/* Eval Test Case */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <span className="text-blue-400">🧪</span> Eval Test Case
        </h2>
        <p className="text-zinc-400 mb-4 text-sm">Add this to your eval suite to prevent regression.</p>
        <div className="rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
          <div className="p-4 border-b border-zinc-700">
            <p className="text-xs font-mono text-zinc-500 mb-1">INPUT</p>
            <p className="text-sm text-zinc-300">{pattern.evalCase.input}</p>
          </div>
          <div className="p-4 border-b border-zinc-700 bg-green-950/10">
            <p className="text-xs font-mono text-green-400 mb-1">EXPECTED BEHAVIOR</p>
            <p className="text-sm text-zinc-300">{pattern.evalCase.expectedBehavior}</p>
          </div>
          <div className="p-4 bg-red-950/10">
            <p className="text-xs font-mono text-red-400 mb-1">RED FLAG</p>
            <p className="text-sm text-zinc-300">{pattern.evalCase.redFlag}</p>
          </div>
        </div>
      </section>

      {/* Contribute */}
      <div className="p-6 border border-zinc-800 rounded-xl">
        <h3 className="font-semibold mb-2">Improve this pattern</h3>
        <p className="text-zinc-400 text-sm mb-3">
          Better example? Real-world case? Open a PR — pattern data is in{" "}
          <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded text-xs">
            site/lib/patterns.ts
          </code>
        </p>
        <a
          href="https://github.com/InclusiveCode/inclusive-ai/blob/main/site/lib/patterns.ts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono text-zinc-300 hover:text-white transition-colors"
        >
          Edit on GitHub →
        </a>
      </div>
    </div>
  );
}
