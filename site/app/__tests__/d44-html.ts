/**
 * A small HTML tree for the D44 tests: enough to ask "which button sits with this code block",
 * "what is this element's text", or "what is this button's accessible name" about the markup
 * renderToStaticMarkup produces (well-formed; attribute values never contain a double quote).
 * Not a test file: vitest only collects *.test.* files.
 */
export type El = { tag: string; attrs: Record<string, string>; children: Array<El | string>; parent: El | null };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

export function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function parse(html: string): El {
  const root: El = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    const [, close, tag, rawAttrs, selfClose, text] = m;
    if (text !== undefined) {
      cur.children.push(decode(text));
      continue;
    }
    if (!tag) continue; // comment or doctype
    const name = tag.toLowerCase();
    if (close) {
      // Walk up to the matching open element (tolerates nothing else: the markup is well-formed).
      let n: El | null = cur;
      while (n && n.tag !== name) n = n.parent;
      if (n?.parent) cur = n.parent;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs ?? "").matchAll(/([^\s=>/]+)(?:="([^"]*)")?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? "");
    const el: El = { tag: name, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (!selfClose && !VOID.has(name)) cur = el;
  }
  return root;
}

export function all(node: El, pred: (e: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (n: El) => {
    for (const c of n.children) {
      if (typeof c === "string") continue;
      if (pred(c)) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export const byTag = (node: El, tag: string) => all(node, (e) => e.tag === tag);
export const byId = (node: El, id: string) => all(node, (e) => e.attrs.id === id)[0] ?? null;

export function closest(node: El, pred: (e: El) => boolean): El | null {
  for (let n: El | null = node; n; n = n.parent) if (pred(n)) return n;
  return null;
}

/** textContent. */
export function text(node: El | string): string {
  if (typeof node === "string") return node;
  return node.children.map(text).join("");
}

/** Text with a space at every element boundary, so adjacent cells ("Claude Haiku 4.5" | "80%") stay apart. */
export function spacedText(node: El | string): string {
  if (typeof node === "string") return node;
  return node.children.map((c) => (typeof c === "string" ? c : ` ${spacedText(c)} `)).join("");
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Accessible name of a button or link: aria-label, aria-labelledby, or its text minus aria-hidden parts. */
export function accessibleName(el: El, root: El): string {
  if (el.attrs["aria-label"]) return squash(el.attrs["aria-label"]);
  if (el.attrs["aria-labelledby"]) {
    return squash(
      el.attrs["aria-labelledby"]
        .split(/\s+/)
        .map((id) => {
          const t = byId(root, id);
          return t ? text(t) : "";
        })
        .join(" "),
    );
  }
  const visibleText = (n: El | string): string => {
    if (typeof n === "string") return n;
    if (n.attrs["aria-hidden"] === "true" || n.tag === "svg") return "";
    return n.children.map(visibleText).join("");
  };
  return squash(visibleText(el));
}

export function contains(ancestor: El, node: El): boolean {
  for (let n: El | null = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

// ---------- D44 R11 verdict vocabulary ----------

/** The verdict words the site shows. */
export const VERDICT_LABELS = { PASS: "Pass", NEEDS_WORK: "Needs work", FAIL: "Fail" } as const;

/**
 * A bar's verdict from its colour: pass/fail colours are semantic (emerald/green, amber/yellow,
 * rose/red), whether set by a Tailwind class or an inline hex colour.
 */
export function barVerdict(bar: El | undefined): "PASS" | "NEEDS_WORK" | "FAIL" | null {
  const cls = bar?.attrs.class ?? "";
  if (/\bbg-(?:emerald|green|lime)-\d/.test(cls)) return "PASS";
  if (/\bbg-(?:amber|yellow)-\d/.test(cls)) return "NEEDS_WORK";
  if (/\bbg-(?:rose|red)-\d/.test(cls)) return "FAIL";
  const hex = /background(?:-color)?:\s*#([0-9a-f]{6})/i.exec(bar?.attrs.style ?? "")?.[1];
  if (!hex) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const h = ((max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4) * 60 + 360) % 360;
  return h >= 330 || h < 15 ? "FAIL" : h >= 30 && h < 65 ? "NEEDS_WORK" : h >= 120 && h < 175 ? "PASS" : null;
}
