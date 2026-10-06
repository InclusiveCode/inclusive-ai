/**
 * D44 independent verification: shipped content (R1 crisis resources, R2 install commands, R8 no
 * gradient text in the site source). Written from the D44 requirements, not from the
 * implementation. Each check would fail on the pre-D44 tree (1304510).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ToolsPage from "../tools/page";
import { byTag, parse, text } from "./d44-html";

const REPO = resolve(__dirname, "../../..");
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "__tests__", "tests", "test", ".git"]);

/** Files under the given repo-relative paths (a file or a directory), without tests or build output. */
function files(...paths: string[]): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    if (!existsSync(abs)) return;
    if (statSync(abs).isFile()) {
      if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(abs)) out.push(abs);
      return;
    }
    for (const name of readdirSync(abs)) {
      if (SKIP_DIRS.has(name)) continue;
      walk(join(abs, name));
    }
  };
  for (const p of paths) walk(join(REPO, p));
  return out.filter((f) => /\.(md|mdx|ts|tsx|js|mjs|cjs|json|ya?ml|css|txt|sh)$/.test(f) || !/\.\w+$/.test(f));
}
const read = (abs: string) => readFileSync(abs, "utf8");
const rel = (abs: string) => relative(REPO, abs);

// The /tools page as a visitor's browser receives it (server-rendered), and its code blocks' text.
const toolsHtml = renderToStaticMarkup(createElement(ToolsPage));
const toolsTree = parse(toolsHtml);
const toolsBlocks = byTag(toolsTree, "pre").map((p) => text(p));
const toolsCode = toolsBlocks.join("\n");

// =====================================================================================
// R1: "text START to 678-678" is TrevorText (The Trevor Project), never Crisis Text Line
// =====================================================================================
const R1_SCOPE = ["site/app", "site/lib", "templates", "plugin", ".claude/commands", "core/eval-engine/src", "README.md", "hooks"];
const LABELS = /(Crisis Text Line|TrevorText|Trevor Project|Trans Lifeline|\b988\b)/gi;

/** Every 678-678 occurrence, with the resource name nearest before it on the same line and the clause after it. */
function shortcodeMentions(content: string) {
  const out: Array<{ line: number; label: string | null; after: string; context: string }> = [];
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/678[-‑– ]?678/g)) {
      const before = line.slice(0, m.index);
      const labels = [...before.matchAll(LABELS)];
      const after = line.slice(m.index + m[0].length).split(/[).;,]/)[0];
      out.push({ line: i + 1, label: labels.length ? labels[labels.length - 1][1] : null, after, context: line.trim().slice(0, 160) });
    }
  });
  return out;
}

describe("D44 R1: crisis resources are named correctly in shipped content", () => {
  const scoped = files(...R1_SCOPE);

  it("scans the shipped sources the requirement names (site source, templates/, plugin/, .claude/commands, core/eval-engine/src, README.md, hooks/)", () => {
    for (const p of R1_SCOPE) expect(existsSync(join(REPO, p)), p).toBe(true);
    expect(scoped.length).toBeGreaterThan(40);
  });

  it("every 'START to 678-678' is labelled TrevorText, and none is labelled Crisis Text Line", () => {
    const found: string[] = [];
    const bad: string[] = [];
    for (const f of scoped) {
      for (const m of shortcodeMentions(read(f))) {
        found.push(`${rel(f)}:${m.line}`);
        if (m.label?.toLowerCase() !== "trevortext" || /crisis text line/i.test(m.after)) bad.push(`${rel(f)}:${m.line} [nearest label: ${m.label}] ${m.context}`);
      }
    }
    // Not vacuous: the shortcode appears in the checklist, the registry, the patterns, the template, and the plugin.
    expect(found.length, found.join("\n")).toBeGreaterThanOrEqual(8);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("no line names Crisis Text Line together with the 678-678 shortcode or the START keyword", () => {
    const bad: string[] = [];
    for (const f of scoped) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/Crisis Text Line/gi)) {
            const clause = line.slice(m.index).split(/[).;]/)[0];
            if (/678[-‑– ]?678|\bSTART\b/.test(clause)) bad.push(`${rel(f)}:${i + 1} ${line.trim().slice(0, 160)}`);
          }
        });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("where Crisis Text Line is given a number, it is its own (text HOME to 741741)", () => {
    const bad: string[] = [];
    for (const f of scoped) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/Crisis Text Line/gi)) {
            const clause = line.slice(m.index, m.index + 60);
            if (/\d{3}/.test(clause) && !/741741/.test(clause)) bad.push(`${rel(f)}:${i + 1} ${line.trim().slice(0, 160)}`);
          }
        });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("files that give the TrevorText shortcode also name The Trevor Project", () => {
    const bad: string[] = [];
    for (const f of scoped) {
      const c = read(f);
      if (/678[-‑– ]?678/.test(c) && !/Trevor Project/i.test(c)) bad.push(rel(f));
    }
    expect(bad).toEqual([]);
  });
});

// =====================================================================================
// R2: install commands work in a project that is not a clone of this repo
// =====================================================================================
const SHIPPED = ["site/app", "site/lib", "README.md", "CONTRIBUTING.md", "plugin", "templates", "hooks", ".claude/commands", "core", "packages/eval/src", "packages/adversarial/src", "domains", "action"];
const UNSCOPED_NPX = /\bnpx\s+(?:(?:-y|--yes)\s+)?inclusive-eval\b/;

describe("D44 R2: install commands", () => {
  it("/tools shows its commands in code blocks (the checks below are not vacuous)", () => {
    expect(toolsBlocks.length).toBeGreaterThanOrEqual(9);
  });

  it("nothing shipped tells users to run the unscoped `npx inclusive-eval` (that package is not on npm)", () => {
    const bad: string[] = [];
    for (const f of files(...SHIPPED)) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (UNSCOPED_NPX.test(line)) bad.push(`${rel(f)}:${i + 1} ${line.trim().slice(0, 140)}`);
        });
    }
    expect(bad, bad.join("\n")).toEqual([]);
    expect(toolsCode).not.toMatch(UNSCOPED_NPX);
  });

  it("/tools, README.md and plugin/ use `npx @inclusive-ai/eval`", () => {
    expect(toolsCode).toContain("npx @inclusive-ai/eval");
    expect(read(join(REPO, "README.md"))).toContain("npx @inclusive-ai/eval");
    const plugin = files("plugin").filter((f) => read(f).includes("npx @inclusive-ai/eval"));
    expect(plugin.length, "a plugin/ file that shows the eval CLI").toBeGreaterThan(0);
    // The scoped package is the one this repo publishes, and it has a single bin, so `npx @inclusive-ai/eval` runs it.
    const pkg = JSON.parse(read(join(REPO, "packages/eval/package.json")));
    expect(pkg.name).toBe("@inclusive-ai/eval");
    expect(Object.keys(pkg.bin ?? {})).toHaveLength(1);
  });

  it("no /tools command depends on a clone of this repo (no `cp plugin/`, `cp hooks/`, `cp templates/`, or `$(npm root)/@inclusive-ai/eval/hooks`)", () => {
    const bad: string[] = [];
    for (const [i, block] of toolsBlocks.entries()) {
      for (const line of block.split("\n")) {
        if (/\bcp\s+(?:-\S+\s+)*(?:\.\/)?(?:plugin|hooks|templates)\//.test(line)) bad.push(`block ${i + 1}: ${line}`);
        if (/\$\(npm root\)\/@inclusive-ai\/eval\/hooks/.test(line)) bad.push(`block ${i + 1}: ${line}`);
        // Any other read of the repo's own folders by a relative path (cat templates/…, bash hooks/…).
        if (!line.trim().startsWith("#") && /(?<![\w./-])(?:\.\/)?(?:plugin|hooks|templates)\/[\w.-]+/.test(line)) bad.push(`block ${i + 1}: ${line}`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  /** A command that writes CLAUDE.md other than by appending. */
  const OVERWRITES = [
    /\bcp\s+(?:-\S+\s+)*\S+\s+\S*CLAUDE\.md\b/,
    /\bmv\s+(?:-\S+\s+)*\S+\s+\S*CLAUDE\.md\b/,
    /(?<![>\d&])>\s*\S*CLAUDE\.md\b/,
    /(?:\s-o|--output)\s+\S*CLAUDE\.md\b/,
    /\btee\s+(?!-a\b|--append\b)\S*CLAUDE\.md\b/,
  ];
  const overwriteLines = (content: string) =>
    content
      .split("\n")
      .map((l) => l.replace(/^\s*(?:>\s*)+/, "")) // Markdown blockquote markers are not redirections
      .filter((l) => OVERWRITES.some((re) => re.test(l)));

  it("the CLAUDE.md template is appended with `>> CLAUDE.md`, never copied over an existing file (/tools, README.md, plugin/)", () => {
    const append = toolsBlocks.filter((b) => /templates\/CLAUDE\.md/.test(b));
    expect(append.length, "a /tools block that installs the template").toBeGreaterThan(0);
    for (const b of append) expect(b).toMatch(/>>\s*CLAUDE\.md\b/);
    const bad: string[] = [];
    for (const [i, b] of toolsBlocks.entries()) for (const l of overwriteLines(b)) bad.push(`/tools block ${i + 1}: ${l}`);
    for (const f of [join(REPO, "README.md"), ...files("plugin")]) for (const l of overwriteLines(read(f))) bad.push(`${rel(f)}: ${l.trim()}`);
    expect(bad, bad.join("\n")).toEqual([]);
    expect(read(join(REPO, "README.md"))).toMatch(/templates\/CLAUDE\.md\s*>>\s*CLAUDE\.md/);
  });

  it("the plugin installs with `/plugin marketplace add InclusiveCode/inclusive-ai` and `/plugin install inclusive-ai@inclusive-ai` (/tools, README.md, plugin/README.md)", () => {
    const add = /^\/plugin marketplace add InclusiveCode\/inclusive-ai\s*$/m;
    const install = /^\/plugin install inclusive-ai@inclusive-ai\s*$/m;
    const block = toolsBlocks.find((b) => add.test(b));
    expect(block, "a /tools block with the marketplace command").toBeDefined();
    expect(block).toMatch(install);
    for (const f of ["README.md", "plugin/README.md"]) {
      const c = read(join(REPO, f));
      expect(c, f).toMatch(add);
      expect(c, f).toMatch(install);
    }
    // No other install instruction for the plugin on /tools (for example the old marketplace name).
    expect(toolsCode).not.toMatch(/\/plugin install (?!inclusive-ai@inclusive-ai\b)\S+/);
    // The commands resolve: the repo root is a marketplace named inclusive-ai that lists a plugin named inclusive-ai.
    const market = JSON.parse(read(join(REPO, ".claude-plugin/marketplace.json")));
    expect(market.name).toBe("inclusive-ai");
    const plugin = market.plugins.find((p: { name: string }) => p.name === "inclusive-ai");
    expect(plugin).toBeDefined();
    expect(existsSync(join(REPO, plugin.source))).toBe(true);
  });
});

// =====================================================================================
// R8 (source): no text is given a transparent fill anywhere in the site source
// =====================================================================================
describe("D44 R8: no gradient text in the site source", () => {
  it("no -webkit-text-fill-color: transparent, background-clip: text, bg-clip-text or text-transparent in site/app or site/lib", () => {
    const patterns = [
      /WebkitTextFillColor\s*:\s*["'`]transparent/,
      /-webkit-text-fill-color\s*:\s*transparent/i,
      /(?:Webkit)?BackgroundClip\s*:\s*["'`]text/i,
      /background-clip\s*:\s*text/i,
      /\bbg-clip-text\b/,
      /\btext-transparent\b/,
    ];
    // opengraph-image.tsx is drawn into a PNG for link previews (next/og), not a page, so R8 does not cover it.
    const scanned = files("site/app", "site/lib").filter((f) => !/opengraph-image\.tsx$/.test(f));
    expect(scanned.length).toBeGreaterThan(30);
    const bad: string[] = [];
    for (const f of scanned) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (patterns.some((re) => re.test(line))) bad.push(`${rel(f)}:${i + 1} ${line.trim().slice(0, 120)}`);
        });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
