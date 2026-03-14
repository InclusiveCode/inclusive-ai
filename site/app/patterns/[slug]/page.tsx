import Link from "next/link";

export default async function PatternDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/patterns" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8 inline-block">
        ← Back to patterns
      </Link>
      <div className="p-8 border border-zinc-800 rounded-xl text-center">
        <p className="text-zinc-400 mb-2 text-sm font-mono">detailed pattern pages</p>
        <p className="text-zinc-600 text-xs font-mono mb-4">{slug}</p>
        <p className="text-zinc-500 text-sm">Full pattern detail pages with code examples and alternatives are coming soon.</p>
        <p className="text-zinc-500 text-sm mt-2">Want to write this one? <a href="https://github.com/InclusiveCode/inclusive-ai" className="text-zinc-300 hover:text-white" target="_blank" rel="noopener noreferrer">Contribute on GitHub →</a></p>
      </div>
    </div>
  );
}
