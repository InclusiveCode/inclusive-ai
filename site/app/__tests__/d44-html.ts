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
