import Link from "next/link";
import { patterns } from "@/lib/patterns";

const severityColor: Record<string, string> = {
  critical: "text-rose-400 bg-rose-400/10",
  high: "text-red-400 bg-red-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low: "text-green-400 bg-green-400/10",
};

const prideColors = ["#FF6B9D", "#FF9B71", "#FECF6A", "#63E6BE", "#74B9FF", "#A29BFE", "#DDA0DD"];

export default function PatternsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20">
      <div className="mb-10">
        <div className="inline-block px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-mono mb-6">
          anti-patterns
        </div>
        <h1 className="text-3xl font-bold mb-3">
          <span style={{ background: "linear-gradient(90deg, #FF6B9D, #FF9B71, #FECF6A, #63E6BE, #74B9FF, #A29BFE)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Anti-Pattern Library</span>
        </h1>
        <p className="text-zinc-400">
          Common patterns in LLM prompts, code, and product decisions that harm LGBTQIA+ users. Each entry includes the problem, why it happens, and a safer alternative.
        </p>
      </div>
      <div className="space-y-4">
        {patterns.map((p, i) => (
          <Link
            key={p.slug}
            href={`/patterns/${p.slug}`}
            className="block p-6 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors group border-l-2"
            style={{ borderLeftColor: prideColors[i % prideColors.length] }}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${severityColor[p.severity]}`}>
                  {p.severity}
                </span>
                <span className="text-xs text-zinc-500 font-mono">{p.category}</span>
              </div>
            </div>
            <h2 className="font-semibold mb-1 group-hover:text-zinc-100">{p.title}</h2>
            <p className="text-sm text-zinc-400">{p.description}</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {p.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded font-mono">
                  {t}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-10 p-6 border border-zinc-800 rounded-xl text-center">
        <p className="text-zinc-400 text-sm mb-3">Know a pattern that&apos;s missing?</p>
        <a
          href="https://github.com/InclusiveCode/inclusive-ai/issues/new?template=new_pattern.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono text-zinc-300 hover:text-white transition-colors"
        >
          Open an issue on GitHub →
        </a>
      </div>
    </div>
  );
}
