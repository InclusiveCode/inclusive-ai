/**
 * D44 independent verification: shipped content (R1 crisis resources, R2/R2′/R2″ install and CLI
 * commands, R8 no gradient text in the site source). Written from the D44 requirements (as revised
 * after the review of f24607a), not from the implementation. Each check would fail on the pre-D44
 * tree (1304510).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVAL_ALIAS } from "@/lib/cli";
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
// R2′ (review of f24607a): every CLI run brings a provider SDK; R2″: appends start with a newline,
// the hook goes where git says hooks live, and nothing overwrites CLAUDE.md
// =====================================================================================
const SHIPPED = ["site/app", "site/lib", "README.md", "CONTRIBUTING.md", "plugin", "templates", "hooks", ".claude/commands", "core", "packages/eval/src", "packages/adversarial/src", "domains", "action"];
/** D47: the unscoped `inclusive-eval` is this project's npm alias. Without -y, npx stops to ask before installing it. */
const UNSCOPED_NO_YES = /\bnpx\s+inclusive-eval\b/;
/** `npx @inclusive-ai/eval` runs the CLI without a provider SDK: ERR_MODULE_NOT_FOUND once a key is set. */
const BARE_SCOPED_NPX = /\bnpx\s+(?:(?:-y|--yes)\s+)?@inclusive-ai\/eval\b/;
const SDK = String.raw`(?:@anthropic-ai\/sdk|openai)(?:@\S+)?`;
const EVAL = String.raw`@inclusive-ai\/eval(?:@\S+)?`;
/** One-off naming the SDK: npx -y -p @inclusive-ai/eval -p <sdk> inclusive-eval … (either -p order). */
const SCOPED_ONE_OFF = new RegExp(String.raw`\bnpx\s+(?:-y|--yes)\s+(?:-p\s+${EVAL}\s+-p\s+${SDK}|-p\s+${SDK}\s+-p\s+${EVAL})\s+inclusive-eval\b`);
/** D47: one-off through the alias, which has the Anthropic SDK as a dependency: npx -y inclusive-eval … */
const ALIAS_ONE_OFF = /\bnpx\s+(?:-y|--yes)\s+inclusive-eval(?:@\S+)?(?=\s|$)/;
const isOneOff = (l: string) => SCOPED_ONE_OFF.test(l) || ALIAS_ONE_OFF.test(l);
/** In a project: npx --no-install inclusive-eval …, after installing the suite together with an SDK. */
const IN_PROJECT = /\bnpx\s+--no-install\s+inclusive-eval\b/;
const INSTALLS_BOTH = new RegExp(String.raw`\bnpm\s+(?:install|i|add)\b[^\n]*?(?:@inclusive-ai\/eval\b[^\n]*?(?:@anthropic-ai\/sdk|\bopenai\b)|(?:@anthropic-ai\/sdk|\bopenai\b)[^\n]*?@inclusive-ai\/eval\b)`);

/** Shell lines, with continuations joined (a trailing backslash, or a line ending in && or |). */
const shellLines = (text: string) => text.replace(/\\\n\s*/g, " ").replace(/(&&|\|\||\|)[ \t]*\n\s*/g, "$1 ").split("\n");
/** Lines that run the eval CLI (comments and prose such as "the `inclusive-eval` CLI" are not runs). */
const cliRuns = (text: string) =>
  shellLines(text)
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("#") && (/\bnpx\b.*(?:\binclusive-eval\b|@inclusive-ai\/eval\b)/.test(l) || /^(?:[A-Z_]+=\S+\s+)*inclusive-eval\b/.test(l)));
/** The code in a Markdown file: fenced blocks and inline code spans (prose is not a command). */
function markdownCode(md: string): string {
  const fenced = [...md.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((m) => m[1]);
  const inline = [...md.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "").matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return [...fenced, ...inline].join("\n");
}

/** The documents R2 covers: /tools (its code blocks), README.md, and every file in plugin/. */
function r2Documents(): Array<{ name: string; text: string; code: string }> {
  const readme = read(join(REPO, "README.md"));
  return [
    { name: "/tools", text: toolsCode, code: toolsCode },
    { name: "README.md", text: readme, code: markdownCode(readme) },
    ...files("plugin").map((f) => ({ name: rel(f), text: read(f), code: /\.md$/.test(f) ? markdownCode(read(f)) : read(f) })),
  ];
}

describe("D44 R2′: every eval CLI command brings a provider SDK", () => {
  const docs = r2Documents();

  it("/tools shows its commands in code blocks (the checks below are not vacuous)", () => {
    expect(toolsBlocks.length).toBeGreaterThanOrEqual(10);
    expect(docs.map((d) => d.name)).toEqual(expect.arrayContaining(["/tools", "README.md", "plugin/commands/lgbt-red-team.md"]));
  });

  it("the premise: the published CLI's provider SDKs are optional peer dependencies, so they must be installed with it", () => {
    const pkg = JSON.parse(read(join(REPO, "packages/eval/package.json")));
    expect(pkg.name).toBe("@inclusive-ai/eval");
    expect(Object.keys(pkg.bin ?? {})).toEqual(["inclusive-eval"]);
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual(expect.arrayContaining(["@anthropic-ai/sdk", "openai"]));
    expect(pkg.dependencies?.["@anthropic-ai/sdk"]).toBeUndefined();
  });

  it("nothing shipped runs the unscoped `npx inclusive-eval` without -y (D47: it is the project's alias, and -y keeps CI from stopping at a prompt)", () => {
    const bad: string[] = [];
    for (const f of files(...SHIPPED)) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (UNSCOPED_NO_YES.test(line)) bad.push(`${rel(f)}:${i + 1} ${line.trim().slice(0, 140)}`);
        });
    }
    expect(bad, bad.join("\n")).toEqual([]);
    expect(toolsCode).not.toMatch(UNSCOPED_NO_YES);
  });

  it("/tools, README.md and plugin/ never show the bare `npx @inclusive-ai/eval` (it crashes without an SDK)", () => {
    const bad = docs.flatMap((d) => cliRuns(d.text).filter((l) => BARE_SCOPED_NPX.test(l)).map((l) => `${d.name}: ${l}`));
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("no other shipped content shows the bare `npx @inclusive-ai/eval` either (site source, templates, hooks, packages, …)", () => {
    const bad: string[] = [];
    for (const f of files(...SHIPPED)) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (BARE_SCOPED_NPX.test(line)) bad.push(`${rel(f)}:${i + 1} ${line.trim().slice(0, 140)}`);
        });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every CLI run on /tools, in README.md and in plugin/ is `npx -y inclusive-eval …` (D47), `npx -y -p @inclusive-ai/eval -p <sdk> inclusive-eval …`, or `npx --no-install inclusive-eval …` after installing the suite with an SDK", () => {
    const bad: string[] = [];
    let runs = 0;
    for (const d of docs) {
      for (const l of cliRuns(d.text)) {
        runs += 1;
        if (!(isOneOff(l) || (IN_PROJECT.test(l) && INSTALLS_BOTH.test(d.code)))) bad.push(`${d.name}: ${l}`);
      }
    }
    expect(runs).toBeGreaterThanOrEqual(10);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("/tools and README.md offer both forms: a one-off run, and an install of the suite with an SDK", () => {
    for (const d of docs.filter((x) => x.name === "/tools" || x.name === "README.md")) {
      expect(cliRuns(d.text).some((l) => isOneOff(l)), `${d.name}: one-off run`).toBe(true);
      expect(d.code, `${d.name}: install with an SDK`).toMatch(INSTALLS_BOTH);
      expect(cliRuns(d.text).some((l) => IN_PROJECT.test(l)), `${d.name}: in-project run`).toBe(true);
    }
    expect(cliRuns(docs.filter((d) => d.name.startsWith("plugin/")).map((d) => d.text).join("\n")).length).toBeGreaterThan(0);
  });
});

describe("D47: one-off runs use `npx -y inclusive-eval`, the project's npm alias with the Anthropic SDK", () => {
  const docs = r2Documents();
  const OPENAI_ONE_OFF = "npx -y -p @inclusive-ai/eval -p openai inclusive-eval";

  it("the one-off runs on /tools, in README.md and in the plugin's red-team command use the alias", () => {
    for (const name of ["/tools", "README.md", "plugin/commands/lgbt-red-team.md"]) {
      const d = docs.find((x) => x.name === name)!;
      const runs = cliRuns(d.text).filter((l) => isOneOff(l));
      expect(runs.length, `${name}: one-off runs`).toBeGreaterThan(0);
      expect(runs.filter((l) => !ALIAS_ONE_OFF.test(l) && !/-p\s+openai\b/.test(l)), name).toEqual([]);
    }
  });

  it("every alias one-off in shipped content is pinned to the reviewed release in lib/cli.ts (the alias is published outside this repo and runs with the user's key)", () => {
    expect(EVAL_ALIAS).toMatch(/^inclusive-eval@\d+\.\d+\.\d+$/);
    const unpinned: string[] = [];
    for (const f of files(...SHIPPED)) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/\bnpx\s+(?:-y|--yes)\s+(inclusive-eval(?:@\S+)?)/g)) if (m[1] !== EVAL_ALIAS) unpinned.push(`${rel(f)}:${i + 1} ${m[1]}`);
        });
    }
    expect(unpinned, unpinned.join("\n")).toEqual([]);
    for (const d of docs) for (const l of cliRuns(d.text).filter((x) => ALIAS_ONE_OFF.test(x))) expect(l, d.name).toContain(`npx -y ${EVAL_ALIAS} `);
  });

  it("OpenAI users are given the scoped one-off with openai, on /tools and in README.md (the alias brings only the Anthropic SDK)", () => {
    expect(text(toolsTree)).toContain(OPENAI_ONE_OFF);
    expect(read(join(REPO, "README.md"))).toContain(`OPENAI_API_KEY=sk-... ${OPENAI_ONE_OFF}`);
  });

  it("/tools and README.md say what the unscoped package is", () => {
    expect(text(toolsTree)).toContain("inclusive-eval is this project's npm alias for @inclusive-ai/eval with the Anthropic SDK included");
    expect(read(join(REPO, "README.md"))).toContain("`inclusive-eval`, this project's npm alias for `@inclusive-ai/eval` with the Anthropic SDK included");
  });
});

describe("D44 R2‴, D50: /tools shows only flags the published CLI has", () => {
  // Every flag @inclusive-ai/eval@3.4.0's published dist/cli.js reads (D50). 3.3.0 and older read only the flags
  // they know and ignore the rest without a warning, so --output and --judge carry a "3.4.0 or newer" note.
  const PUBLISHED_FLAGS = ["--system", "--category", "--domain", "--severity", "--format", "--adversarial", "--red-team", "--concurrency", "--model", "--output", "--judge-model", "--judge"];
  /** The flags passed to inclusive-eval in every /tools command (continuation lines joined, comments skipped). */
  const toolsFlags = () =>
    toolsBlocks.flatMap((block) =>
      block
        .replace(/\\\n\s*/g, " ")
        .split("\n")
        .filter((l) => !l.trim().startsWith("#") && /\binclusive-eval\b/.test(l))
        .flatMap((l) => l.split(/\binclusive-eval(?:@\S+)?/).slice(1).join(" ").match(/--[a-z][a-z-]*/g) ?? []),
    );

  it("every inclusive-eval flag on /tools is one @inclusive-ai/eval 3.4.0 reads", () => {
    const flags = toolsFlags();
    expect(flags).toContain("--severity");
    expect(flags.filter((f) => !PUBLISHED_FLAGS.includes(f))).toEqual([]);
  });

  it("/tools shows --output, --judge and --judge-model, and says they need @inclusive-ai/eval 3.4.0", () => {
    const flags = toolsFlags();
    for (const f of ["--output", "--judge", "--judge-model"]) expect(flags).toContain(f);
    expect(text(toolsTree)).toContain("--output and --judge need @inclusive-ai/eval 3.4.0 or newer; older versions ignore them without a warning.");
  });

  it("the --judge-model example says the judge must come from the key's provider (3.4.0 passes the ID as-is)", () => {
    const block = toolsBlocks.find((b) => /inclusive-eval --judge-model /.test(b)) ?? "";
    const lines = block.split("\n");
    const at = lines.findIndex((l) => /inclusive-eval --judge-model /.test(l));
    const comment = lines.slice(0, at).reverse().findIndex((l) => !l.startsWith("#"));
    const above = lines.slice(at - (comment === -1 ? at : comment), at).join(" ");
    expect(above).toMatch(/same provider as your\s*#?\s*key/);
    expect(above).toContain("with OPENAI_API_KEY, an OpenAI model ID");
  });
});

describe("D44 R2: no clone, no overwrite; R2″: appends start with a newline, hooks go where git keeps them", () => {
  const docs = r2Documents();

  it("no /tools command depends on a clone of this repo (no `cp plugin/`, `cp hooks/`, `cp templates/`, or `$(npm root)/@inclusive-ai/eval/hooks`)", () => {
    const bad: string[] = [];
    for (const [i, block] of toolsBlocks.entries()) {
      for (const line of block.split("\n")) {
        if (/\bcp\s+(?:-\S+\s+)*(?:\.\/)?(?:plugin|hooks|templates)\//.test(line)) bad.push(`block ${i + 1}: ${line}`);
        if (/\$\(npm root\)\/@inclusive-ai\/eval\/hooks/.test(line)) bad.push(`block ${i + 1}: ${line}`);
        // Any other read of the repo's own folders by a relative path (cat templates/…, bash hooks/…).
        if (!line.trim().startsWith("#") && /(?<![\w./$)-])(?:\.\/)?(?:plugin|hooks|templates)\/[\w.-]+/.test(line)) bad.push(`block ${i + 1}: ${line}`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  /** A command that writes CLAUDE.md other than by appending. */
  const OVERWRITES = [
    /\bcp\s+(?:-\S+\s+)*\S+\s+\S*CLAUDE\.md\b/,
    /\bmv\s+(?:-\S+\s+)*\S+\s+\S*CLAUDE\.md\b/,
    /(?<![>\d&])>(?!>)\s*\S*CLAUDE\.md\b/,
    /(?:\s-o|--output)\s+\S*CLAUDE\.md\b/,
    /\btee\s+(?!-a\b|--append\b)\S*CLAUDE\.md\b/,
  ];
  const overwriteLines = (content: string) =>
    content
      .split("\n")
      .map((l) => l.replace(/^\s*(?:>\s*)+/, "")) // Markdown blockquote markers are not redirections
      .filter((l) => OVERWRITES.some((re) => re.test(l)));

  it("nothing overwrites CLAUDE.md (/tools, README.md, plugin/)", () => {
    const bad = docs.flatMap((d) => overwriteLines(d.code).map((l) => `${d.name}: ${l.trim()}`));
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("the CLAUDE.md template is appended as `{ echo; curl -fsSL …/templates/CLAUDE.md; } >> CLAUDE.md` on /tools, in README.md and in plugin/README.md", () => {
    const FORM = /^\{ echo; curl -fsSL https:\/\/raw\.githubusercontent\.com\/InclusiveCode\/inclusive-ai\/main\/templates\/CLAUDE\.md; \} >> CLAUDE\.md$/;
    for (const d of docs) {
      const uses = shellLines(d.code).map((l) => l.trim()).filter((l) => /templates\/CLAUDE\.md/.test(l));
      if (["/tools", "README.md", "plugin/README.md"].includes(d.name)) expect(uses.length, `${d.name} installs the template`).toBeGreaterThan(0);
      for (const l of uses) expect(l, d.name).toMatch(FORM);
    }
  });

  it("every append (`>>`) starts with a newline, so a file without a trailing newline is not corrupted", () => {
    const bad: string[] = [];
    let appends = 0;
    for (const d of docs) {
      for (const raw of shellLines(d.code)) {
        const l = raw.trim();
        if (!/>>/.test(l) || l.startsWith("#")) continue;
        appends += 1;
        const producer = l.slice(0, l.indexOf(">>")).trim();
        if (!(/^\{\s*echo;/.test(producer) || /^printf\s+(['"])\\n/.test(producer) || /^echo\s+-e\s+(['"])\\n/.test(producer))) bad.push(`${d.name}: ${l}`);
      }
    }
    expect(appends).toBeGreaterThanOrEqual(4);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("husky gets `printf '\\nbash .husky/inclusive-ai-pre-commit\\n' >> .husky/pre-commit` (/tools, README.md)", () => {
    for (const d of docs.filter((x) => x.name === "/tools" || x.name === "README.md")) {
      const lines = shellLines(d.code).map((l) => l.trim()).filter((l) => /\.husky\/pre-commit\b/.test(l) && />>/.test(l));
      expect(lines.length, d.name).toBeGreaterThan(0);
      for (const l of lines) expect(l, d.name).toBe(String.raw`printf '\nbash .husky/inclusive-ai-pre-commit\n' >> .husky/pre-commit`);
    }
  });

  it("the hook installs as `HOOKS=\"$(git rev-parse --git-common-dir)/hooks\" && mkdir -p \"$HOOKS\" && rm -f \"$HOOKS/pre-commit\" && curl … -o \"$HOOKS/pre-commit\" && chmod +x …` on /tools, in README.md and in the hooks/pre-commit header; never a literal .git/hooks path or --git-path", () => {
    // --git-common-dir ignores core.hooksPath (so husky's own hooks are never overwritten) and works from
    // subfolders, worktrees and submodules; mkdir -p covers a repo without a hooks folder; rm -f replaces a
    // symlinked hook instead of writing through it; the && chain stops at the first failure (e.g. outside a repo).
    const FORM = /^(\w+)="\$\(git rev-parse --git-common-dir\)\/hooks" && mkdir -p "\$\1" && rm -f "\$\1\/pre-commit" && curl -fsSL https:\/\/raw\.githubusercontent\.com\/InclusiveCode\/inclusive-ai\/main\/hooks\/pre-commit -o "\$\1\/pre-commit" && chmod \+x "\$\1\/pre-commit"$/;
    const header = read(join(REPO, "hooks/pre-commit"))
      .split("\n")
      .filter((l) => /^#\s*Install:/i.test(l))
      .map((l) => l.replace(/^#\s*Install:\s*/i, ""))
      .join("\n");
    const all = [...docs, { name: "hooks/pre-commit (header)", text: header, code: header }];
    const bad: string[] = [];
    for (const d of all) {
      const lines = shellLines(d.code).map((x) => x.trim());
      for (const l of lines) if (/\.git\/hooks\b|--git-path\s+hooks/.test(l)) bad.push(`${d.name}: ${l}`);
      const installs = lines.filter((l) => /\/hooks\/pre-commit\s+-o\s+/.test(l) && !/-o\s+\.husky\//.test(l));
      if (["/tools", "README.md", "hooks/pre-commit (header)"].includes(d.name) && installs.length === 0) bad.push(`${d.name}: no plain hook install`);
      for (const l of installs) if (!FORM.test(l)) bad.push(`${d.name}: ${l}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
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
