import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InclusiveCode — LGBT Safety for LLM Builders",
  description: "Patterns, checklists, and eval tools for AI/ML engineers building LLM products that don't harm LGBT communities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100 min-h-screen flex flex-col`}>
        <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/90 backdrop-blur-sm z-10">
          <Link href="/" className="text-lg font-semibold">
            Inclusive<span className="bg-gradient-to-r from-red-400 via-yellow-400 via-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">Code</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="/patterns" className="hover:text-zinc-100 transition-colors">Patterns</Link>
            <Link href="/checklist" className="hover:text-zinc-100 transition-colors">Checklist</Link>
            <Link href="/registry" className="hover:text-zinc-100 transition-colors">Registry</Link>
            <a href="https://github.com/InclusiveCode" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-100 transition-colors">GitHub</a>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-800 px-6 py-6 text-center text-sm text-zinc-500">
          Built for the community, by the community. MIT License.
        </footer>
      </body>
    </html>
  );
}
