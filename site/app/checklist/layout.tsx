import type { Metadata } from "next";

// The checklist page is a client component, so its title lives here (WCAG 2.4.2).
export const metadata: Metadata = { title: "Pre-Ship Checklist" };

export default function ChecklistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
