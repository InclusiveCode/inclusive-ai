import Link from "next/link";

const patterns = [
  {
    slug: "binary-gender-assumption",
    title: "Binary Gender Assumption",
    category: "System Prompt Design",
    severity: "high",
    description: "System prompts that assume all users identify as male or female, excluding non-binary, genderqueer, and other gender identities.",
    tags: ["system-prompt", "gender", "non-binary"],
  },
  {
    slug: "non-affirming-defaults",
    title: "Non-Affirming Mental Health Defaults",
    category: "Mental Health",
    severity: "high",
    description: "Companion and mental health LLM apps that respond to LGBT identity disclosures with pathologizing language or suggest 'therapy' to 'address' identity.",
    tags: ["mental-health", "companion-ai", "affirming"],
  },
  {
    slug: "moderation-parity",
    title: "Content Moderation Parity Gap",
    category: "Content Moderation",
    severity: "high",
    description: "LLM moderation prompts that flag LGBT content (e.g. 'two men kissing') while passing equivalent straight content ('a man and woman kissing').",
    tags: ["moderation", "parity", "bias"],
  },
  {
    slug: "identity-inference",
    title: "Unconsented Identity Inference",
    category: "Identity Handling",
    severity: "high",
    description: "LLM applications that infer or log a user's sexual orientation or gender identity from conversation context without explicit consent.",
    tags: ["privacy", "identity", "consent"],
  },
  {
    slug: "heterosexual-default",
    title: "Heterosexual Relationship Default",
    category: "System Prompt Design",
    severity: "medium",
    description: "Prompt templates that default to assuming heterosexual relationship context — e.g. 'tell me about your husband/wife' or generating relationship advice for opposite-sex couples only.",
    tags: ["system-prompt", "relationship", "default"],
  },
  {
    slug: "name-pronoun-inference",
    title: "Name-Based Pronoun Inference",
    category: "Output Safety",
    severity: "medium",
    description: "Models that infer pronouns from a user's name or profile photo and use them in output without asking — deadnaming and misgendering trans users.",
    tags: ["pronouns", "trans", "output"],
  },
  {
    slug: "eval-gap",
    title: "Missing LGBT Eval Coverage",
    category: "Eval Coverage",
    severity: "medium",
    description: "Shipping LLM products with zero test cases for LGBT-specific inputs, meaning harm patterns are never caught before production.",
    tags: ["eval", "testing", "ci"],
  },
  {
    slug: "crisis-mishandling",
    title: "LGBT Youth Crisis Mishandling",
    category: "Mental Health",
    severity: "high",
    description: "LLM products that fail to surface affirming resources (Trevor Project, Trans Lifeline) when LGBT youth disclose crisis — or worse, route to non-affirming hotlines.",
    tags: ["mental-health", "crisis", "youth"],
  },
];

const severityColor: Record<string, string> = {
  high: "text-red-400 bg-red-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low: "text-green-400 bg-green-400/10",
};

export default function PatternsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-3">Anti-Pattern Library</h1>
        <p className="text-zinc-400">
          Common patterns in LLM prompts, code, and product decisions that harm LGBT users. Each entry includes the problem, why it happens, and a safer alternative.
        </p>
      </div>
      <div className="space-y-4">
        {patterns.map((p) => (
          <Link
            key={p.slug}
            href={`/patterns/${p.slug}`}
            className="block p-6 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors group"
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
