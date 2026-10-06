import type { Metadata } from "next";
import Link from "next/link";

// Unknown URLs get their own title too (WCAG 2.4.2): "Page not found — InclusiveCode".
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="text-3xl font-bold mb-3">Page not found</h1>
      <p className="text-zinc-400 mb-8">There is no page at this address. It may have moved, or the link may be mistyped.</p>
      <Link href="/" className="inline-block px-6 py-3 border border-zinc-700 rounded-lg font-medium hover:border-zinc-500 transition-colors">
        Go to the home page
      </Link>
    </div>
  );
}
