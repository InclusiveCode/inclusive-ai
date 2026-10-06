/** Site sections in the order a new visitor needs them: see it, fix it, prevent it, review, evidence. */
export const NAV_LINKS = [
  { href: "/lab", label: "Lab" },
  { href: "/patterns", label: "Patterns" },
  { href: "/tools", label: "Tools" },
  { href: "/checklist", label: "Checklist" },
  { href: "/research", label: "Research" },
  { href: "/registry", label: "Registry" },
] as const;

/** A section is current on its own page and on the pages under it (/patterns/…). */
export function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
