import Link from "next/link";

const features = [
  {
    title: "Anti-Pattern Library",
    description: "Common LLM prompt and code patterns that harm LGBT users — with safer alternatives.",
    href: "/patterns",
    icon: "⚠️",
  },
  {
    title: "Pre-Ship Checklist",
    description: "A structured review checklist for LLM engineers before launching any user-facing product.",
    href: "/checklist",
    icon: "✅",
  },
  {
    title: "Harm Registry",
    description: "Documented, reproducible cases of LLMs failing LGBT communities. Evidence for advocates and engineers alike.",
    href: "/registry",
    icon: "📋",
  },
];

const failureModes = [
  "System prompts that assume binary gender, deadname users, or misgender trans people",
  "Mental health and companion AI that gives non-affirming responses to LGBT youth in crisis",
  "Content moderation prompts that flag LGBT content at higher rates than equivalent straight content",
  "LLM applications that infer or store sexual orientation without user consent",
  "Prompt templates that treat heterosexuality as the default relationship context",
  "Output pipelines with no eval coverage for LGBT-specific failure scenarios",
];

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-block px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-mono mb-6">
          for llm engineers
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
          Build LLM Products That{" "}
          <span className="bg-gradient-to-r from-red-400 via-yellow-400 via-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            Don&apos;t Harm LGBT People
          </span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          A community resource for AI engineers building with Claude and other LLMs. Patterns, checklists, and eval tools to protect marginalized communities before you ship.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/checklist" className="px-6 py-3 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-white transition-colors">
            Start with the Checklist
          </Link>
          <Link href="/patterns" className="px-6 py-3 border border-zinc-700 rounded-lg font-medium hover:border-zinc-500 transition-colors">
            Browse Patterns
          </Link>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-20">
        {features.map((f) => (
          <Link key={f.href} href={f.href} className="group p-6 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors">
            <div className="text-2xl mb-3">{f.icon}</div>
            <h2 className="font-semibold mb-2 group-hover:text-zinc-100">{f.title}</h2>
            <p className="text-sm text-zinc-500">{f.description}</p>
          </Link>
        ))}
      </div>

      {/* Why This Matters */}
      <div className="mb-20">
        <h2 className="text-2xl font-bold mb-2">Why this matters</h2>
        <p className="text-zinc-400 mb-6">
          LLM engineers are shipping products at speed. Most teams run evals for accuracy, latency, and safety — but almost none test for LGBT-specific failure modes. These aren&apos;t edge cases. They&apos;re predictable, reproducible, and preventable.
        </p>
        <ul className="space-y-3">
          {failureModes.map((mode, i) => (
            <li key={i} className="flex gap-3 text-zinc-300">
              <span className="text-red-400 mt-0.5 shrink-0">→</span>
              <span>{mode}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Get Started */}
      <div className="p-8 border border-zinc-800 rounded-xl bg-zinc-900/50">
        <h2 className="text-xl font-bold mb-2">Contribute</h2>
        <p className="text-zinc-400 mb-4">
          This is a community resource. If you&apos;ve seen an LLM fail an LGBT user — or built a mitigation that works — open a PR. Patterns and registry entries are plain MDX files.
        </p>
        <a href="https://github.com/InclusiveCode/inclusive-ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-mono text-zinc-300 hover:text-white transition-colors">
          github.com/InclusiveCode/inclusive-ai →
        </a>
      </div>
    </div>
  );
}
