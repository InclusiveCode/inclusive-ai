// D44 e2e checks (site UX overhaul, requirements R1–R19, as revised after the reviews of f24607a and
// 6ee9805: R2′ CLI commands bring a provider SDK, R2″ newline-safe appends and a --git-common-dir hook
// path, R2‴ only published CLI flags on /tools (D50: --output and --judge, from 3.4.0), R3′ the CLI reference list has no Copy, R5′ menu focus,
// R11–R19 verdicts, headings, counts, checklist, header CTA, copy feedback, filters, social image,
// footer). Independent verification; not run in CI.
//
// Usage (against a production build; nothing here calls a model provider):
//   cd site && npm run build && npx next start -p 3921 &
//   SITE_URL=http://localhost:3921 AXE_PATH=/path/to/axe.min.js EVIDENCE_DIR=/path/to/evidence \
//     node tests/e2e/site-d44-smoke.mjs
//
// Optional:
//   ONLY=R3,R7          run only these sections (R1 … R19)
//   PLAYWRIGHT_DIR=dir  a node_modules folder that holds playwright, if it is not resolvable from here
//
// Requirements are from decision D44, not from the implementation. Facts the checks compare
// against (report figures, pattern slugs) are read from the product's data files, as
// site-followup-smoke.mjs does with the lab scenarios.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

function loadPlaywright() {
  const bases = [import.meta.url, process.env.PLAYWRIGHT_DIR && join(process.env.PLAYWRIGHT_DIR, "/"), "/opt/node-tools/node_modules/"].filter(Boolean);
  for (const base of bases) {
    try {
      return createRequire(base)("playwright");
    } catch {}
  }
  const root = execSync("npm root -g").toString().trim();
  return createRequire(join(root, "/"))("playwright");
}
const { chromium } = loadPlaywright();

const ORIGIN = (process.env.SITE_URL ?? "http://localhost:3921").replace(/\/$/, "");
const EVIDENCE = process.env.EVIDENCE_DIR ?? "/tmp/site-d44-evidence";
const AXE_PATH = process.env.AXE_PATH;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
mkdirSync(EVIDENCE, { recursive: true });
const want = (k) => !ONLY || ONLY.has(k);

const results = [];
const observations = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${String(detail).slice(0, 400)}]` : ""}`);
}
function observe(msg) {
  observations.push(msg);
  console.log(`NOTE  ${msg}`);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(`${name} (step completed without exception)`, false, String(e?.stack ?? e).slice(0, 600));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name, opts = {}) => page.screenshot({ path: join(EVIDENCE, name), ...opts }).catch(() => {});

// ---------- facts from the product's data ----------
const REPORTS_SRC = readFileSync(new URL("../../lib/reports.ts", import.meta.url), "utf8");
const REPORTS = [...REPORTS_SRC.matchAll(/\n {4}model: "([^"]+)",[\s\S]*?totalScenarios: (\d+),\s*totalPassed: (\d+),\s*totalRate: ([\d.]+),/g)].map((m) => ({
  model: m[1],
  totalScenarios: Number(m[2]),
  totalPassed: Number(m[3]),
  totalRate: Number(m[4]),
}));
const PATTERN_SLUGS = [...readFileSync(new URL("../../lib/patterns.ts", import.meta.url), "utf8").matchAll(/\n {4}slug: "([^"]+)",/g)].map((m) => m[1]);
check(
  `SETUP read ${REPORTS.length} reports and ${PATTERN_SLUGS.length} pattern slugs from the product data`,
  REPORTS.length >= 3 && REPORTS.length === (REPORTS_SRC.match(/\n {4}slug: "/g) ?? []).length && PATTERN_SLUGS.length === 43,
  REPORTS.map((r) => `${r.model} ${r.totalRate}%`).join("; "),
);
// Per report (R11): slug, title, model, scenario count, domain results (with the stored verdict) and failures.
const REPORT_FACTS = REPORTS_SRC.split(/\n {2}\{\n {4}slug: "/)
  .slice(1)
  .map((chunk) => {
    const failures = [...chunk.matchAll(/\n {6}\{\n {8}id: "[^"]+",\n {8}severity: "(\w+)",\n {8}title: "((?:[^"\\]|\\.)*)",\n {8}domain: "([^"]+)"/g)].map((m) => ({ severity: m[1], title: m[2], domain: m[3] }));
    return {
      slug: chunk.slice(0, chunk.indexOf('"')),
      title: /\n {4}title: "([^"]+)"/.exec(chunk)?.[1],
      model: /\n {4}model: "([^"]+)"/.exec(chunk)?.[1],
      totalScenarios: Number(/\n {4}totalScenarios: (\d+)/.exec(chunk)?.[1]),
      results: [...chunk.matchAll(/\{ domain: "([^"]+)", passed: (\d+), total: (\d+), rate: ([\d.]+), verdict: "(\w+)" \}/g)].map((m) => ({ domain: m[1], passed: Number(m[2]), total: Number(m[3]), rate: Number(m[4]), verdict: m[5] })),
      failures,
      // The eval suite's rule, from the requirement: FAIL on any critical failure, NEEDS_WORK on any high one.
      verdict: failures.some((f) => f.severity === "critical") ? "FAIL" : failures.some((f) => f.severity === "high") ? "NEEDS_WORK" : "PASS",
    };
  });
const MAX_SCENARIOS = Math.max(...REPORT_FACTS.map((r) => r.totalScenarios));
const CHECKLIST_COUNT = [...readFileSync(new URL("../../lib/checklist.ts", import.meta.url), "utf8").matchAll(/^\s+id: "[a-z0-9-]+",\s*$/gm)].length;
const PRIDE = [...readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8").matchAll(/--color-pride-\d:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase());
check(
  `SETUP read ${REPORT_FACTS.length} reports' results and failures, ${CHECKLIST_COUNT} checklist items and ${PRIDE.length} pride colours from the product data`,
  REPORT_FACTS.length === REPORTS.length && REPORT_FACTS.every((r) => r.results.length >= 6 && r.failures.length === r.results.reduce((n, d) => n + d.total - d.passed, 0)) && CHECKLIST_COUNT === 16 && PRIDE.length === 6,
  REPORT_FACTS.map((r) => `${r.model}: ${r.failures.length} failures, ${r.verdict}`).join("; "),
);
const INSTALL = "npm install --save-dev @inclusive-ai/eval";
const SECTIONS = [
  ["/lab", "/lab"],
  ["/patterns", "/patterns"],
  ["/tools", "/tools"],
  ["/checklist", "/checklist"],
  ["/research", "/research"],
  ["/registry", "/registry"],
  [`/patterns/${PATTERN_SLUGS[0]}`, "/patterns"],
];
const MAIN_PAGES = ["/", "/patterns", "/tools", "/checklist", "/research", "/registry"];
// Saved by the pre-D44 checklist (same key, same item ids): progress saved before D44 must still load.
const SAVED_BEFORE_D44 = {
  "pronouns-collected": "You collect preferred pronouns explicitly, not inferred from name or photo",
  "crisis-resources": "Your LLM surfaces LGBTQIA+-specific crisis resources when appropriate",
};

// ---------- browser ----------
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
let axeSource = null;
if (AXE_PATH && existsSync(AXE_PATH)) axeSource = readFileSync(AXE_PATH, "utf8");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function newPage(viewport = { width: 1280, height: 900 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const cap = { console: [], pageErrors: [] };
  page.on("console", (m) => m.type() === "error" && cap.console.push(m.text()));
  page.on("pageerror", (e) => cap.pageErrors.push(String(e)));
  return { page, context, cap };
}
async function axe(page) {
  if (!axeSource) return null;
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (tags) => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: "tag", values: tags } });
    return res.violations.map((x) => `${x.id}×${x.nodes.length} [${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}]`);
  }, AXE_TAGS);
}
/** The accessible name Playwright computes (from its aria snapshot). */
async function nameOf(locator) {
  const snap = await locator.ariaSnapshot();
  return /^- \w+ "((?:[^"\\]|\\.)*)"/.exec(snap)?.[1]?.replace(/\\"/g, '"') ?? "";
}
const mainNav = (page) => page.locator('nav[aria-label="Main"], body > nav').first();
const menuToggle = (page) => mainNav(page).getByRole("button", { name: "Menu" });
const noHScroll = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));

// Shared in-page helpers (installed with addInitScript).
const HELPERS = () => {
  window.__d44 = {
    rgba(c) {
      const cv = (window.__d44cv ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }));
      const x = cv.getContext("2d", { willReadFrequently: true });
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = "rgba(1, 2, 3, 0.5)";
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    },
    lum([r, g, b]) {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    contrast(a, b) {
      const [x, y] = [this.lum(a), this.lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    },
    visible(el) {
      return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    },
    ownText(el) {
      return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    },
  };
};

// =====================================================================================
// R1: the rendered site never labels "text START to 678-678" as Crisis Text Line
// =====================================================================================
async function sitemapPaths() {
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}
const htmlText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

if (want("R1")) {
  await step("R1 crisis resources on every page", async () => {
    const paths = await sitemapPaths();
    const LABELS = /(Crisis Text Line|TrevorText|Trevor Project|Trans Lifeline|\b988\b)/gi;
    const found = [];
    const bad = [];
    for (const path of paths) {
      const text = htmlText(await (await fetch(`${ORIGIN}${path}`)).text());
      for (const m of text.matchAll(/678[-‑– ]?678/g)) {
        const before = text.slice(Math.max(0, m.index - 160), m.index);
        const labels = [...before.matchAll(LABELS)];
        const label = labels.length ? labels[labels.length - 1][1] : null;
        const after = text.slice(m.index + m[0].length, m.index + 80).split(/[).;,]/)[0];
        found.push(path);
        if (label?.toLowerCase() !== "trevortext" || /crisis text line/i.test(after)) bad.push(`${path}: [${label}] …${before.slice(-70)}${m[0]}`);
      }
      for (const m of text.matchAll(/Crisis Text Line/gi)) {
        const clause = text.slice(m.index, m.index + 60);
        if (/678[-‑– ]?678|\bSTART\b/.test(clause.split(/[).;]/)[0])) bad.push(`${path}: ${clause}`);
      }
    }
    check(`R1 the 678-678 shortcode appears on the site (${found.length} times on ${new Set(found).size} of ${paths.length} pages): not vacuous`, found.length >= 3, [...new Set(found)].join(", "));
    check("R1 every 'text START to 678-678' on the site is labelled TrevorText; none is labelled Crisis Text Line", bad.length === 0, bad.slice(0, 4).join(" | "));
  });
}

// =====================================================================================
// R2: /tools install commands work outside a clone
// R2′ (after the review of f24607a): every CLI run brings a provider SDK; no bare npx form
// D47: the unscoped `inclusive-eval` is now this project's npm alias with the Anthropic SDK, so
// `npx -y inclusive-eval` is a one-off form; without -y, npx stops to ask before installing it
// R2″: appends start with a newline; the hook goes where `git rev-parse --git-path hooks` says
// =====================================================================================
const UNSCOPED_NO_YES = /\bnpx\s+inclusive-eval\b/;
/** Runs the CLI without a provider SDK: ERR_MODULE_NOT_FOUND as soon as a key is set. */
const BARE_SCOPED_NPX = /\bnpx\s+(?:(?:-y|--yes)\s+)?@inclusive-ai\/eval\b/;
const SDK_ = String.raw`(?:@anthropic-ai\/sdk|openai)(?:@\S+)?`;
const EVAL_ = String.raw`@inclusive-ai\/eval(?:@\S+)?`;
const SCOPED_ONE_OFF = new RegExp(String.raw`\bnpx\s+(?:-y|--yes)\s+(?:-p\s+${EVAL_}\s+-p\s+${SDK_}|-p\s+${SDK_}\s+-p\s+${EVAL_})\s+inclusive-eval\b`);
const ALIAS_ONE_OFF = /\bnpx\s+(?:-y|--yes)\s+inclusive-eval(?:@\S+)?(?=\s|$)/;
/** D47 (review of ba9d041): the alias runs with the user's key and is published outside this repo, so it is pinned. */
const ALIAS_PINNED = /\bnpx\s+(?:-y|--yes)\s+inclusive-eval@\d+\.\d+\.\d+(?=\s|$)/;
const UNPINNED_ALIAS = /\bnpx\s+(?:-y|--yes)\s+inclusive-eval(?=\s|$)/;
const isOneOff = (l) => SCOPED_ONE_OFF.test(l) || ALIAS_ONE_OFF.test(l);
const IN_PROJECT = /\bnpx\s+--no-install\s+inclusive-eval\b/;
const INSTALLS_BOTH = new RegExp(String.raw`\bnpm\s+(?:install|i|add)\b[^\n]*?(?:@inclusive-ai\/eval\b[^\n]*?(?:@anthropic-ai\/sdk|\bopenai\b)|(?:@anthropic-ai\/sdk|\bopenai\b)[^\n]*?@inclusive-ai\/eval\b)`);
const shellLines = (t) => t.replace(/\\\n\s*/g, " ").replace(/(&&|\|\||\|)[ \t]*\n\s*/g, "$1 ").split("\n").map((l) => l.trim());
const cliRuns = (t) => shellLines(t).filter((l) => !l.startsWith("#") && (/\bnpx\b.*(?:\binclusive-eval\b|@inclusive-ai\/eval\b)/.test(l) || /^(?:[A-Z_]+=\S+\s+)*inclusive-eval\b/.test(l)));

if (want("R2")) {
  await step("R2 /tools install commands", async () => {
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    const blocks = await page.$$eval("main pre", (els) => els.map((e) => e.textContent ?? ""));
    const all = blocks.join("\n");
    const lines = shellLines(all);
    check(`R2 /tools shows its commands in ${blocks.length} code blocks`, blocks.length >= 10);
    check("R2′/D47 no /tools command runs the unscoped `npx inclusive-eval` without -y", !UNSCOPED_NO_YES.test(all), all.match(/.*npx\s+inclusive-eval.*/)?.[0]);
    check("R2′ no /tools command runs the bare `npx @inclusive-ai/eval` (it crashes without a provider SDK)", !BARE_SCOPED_NPX.test(all), lines.filter((l) => BARE_SCOPED_NPX.test(l)).join(" | "));
    const runs = cliRuns(all);
    const badRuns = runs.filter((l) => !(isOneOff(l) || (IN_PROJECT.test(l) && INSTALLS_BOTH.test(all))));
    check(
      `R2′/D47 every CLI run on /tools (${runs.length}) is \`npx -y inclusive-eval@<version> …\`, \`npx -y -p @inclusive-ai/eval -p <sdk> inclusive-eval …\`, or \`npx --no-install inclusive-eval …\` with the suite and an SDK installed on the page; the pinned alias one-off and the in-project form are both offered`,
      runs.length >= 5 && badRuns.length === 0 && runs.some((l) => ALIAS_PINNED.test(l)) && runs.filter((l) => ALIAS_ONE_OFF.test(l)).every((l) => ALIAS_PINNED.test(l)) && runs.some((l) => IN_PROJECT.test(l)) && INSTALLS_BOTH.test(all),
      badRuns.join(" | ") || runs.slice(0, 2).join(" | "),
    );
    const clone = lines.filter((l) => /\bcp\s+(?:-\S+\s+)*(?:\.\/)?(?:plugin|hooks|templates)\//.test(l) || /\$\(npm root\)\/@inclusive-ai\/eval\/hooks/.test(l));
    check("R2 no /tools command needs a clone (`cp plugin/`, `cp hooks/`, `cp templates/`, `$(npm root)/@inclusive-ai/eval/hooks`)", clone.length === 0, clone.join(" | "));
    const tmpl = lines.filter((l) => /templates\/CLAUDE\.md/.test(l));
    const overwrite = lines.filter((l) => /\b(?:cp|mv)\s+(?:-\S+\s+)*\S+\s+\S*CLAUDE\.md\b|(?<![>\d&])>(?!>)\s*\S*CLAUDE\.md\b|\s-o\s+\S*CLAUDE\.md\b|\btee\s+(?!-a\b)\S*CLAUDE\.md\b/.test(l));
    check(
      "R2″ the CLAUDE.md template is appended as `{ echo; curl -fsSL …/templates/CLAUDE.md; } >> CLAUDE.md`; nothing overwrites CLAUDE.md",
      tmpl.length > 0 && tmpl.every((l) => /^\{ echo; curl -fsSL https:\/\/raw\.githubusercontent\.com\/InclusiveCode\/inclusive-ai\/main\/templates\/CLAUDE\.md; \} >> CLAUDE\.md$/.test(l)) && overwrite.length === 0,
      JSON.stringify({ tmpl, overwrite }),
    );
    const appends = lines.filter((l) => />>/.test(l) && !l.startsWith("#"));
    const noNewline = appends.filter((l) => {
      const producer = l.slice(0, l.indexOf(">>")).trim();
      return !(/^\{\s*echo;/.test(producer) || /^printf\s+(['"])\\n/.test(producer) || /^echo\s+-e\s+(['"])\\n/.test(producer));
    });
    check(`R2″ every append on /tools (${appends.length}) starts with a newline`, appends.length >= 2 && noNewline.length === 0, noNewline.join(" | "));
    const husky = lines.filter((l) => /\.husky\/pre-commit\b/.test(l) && />>/.test(l));
    check("R2″ husky gets `printf '\\nbash .husky/inclusive-ai-pre-commit\\n' >> .husky/pre-commit`", husky.length > 0 && husky.every((l) => l === String.raw`printf '\nbash .husky/inclusive-ai-pre-commit\n' >> .husky/pre-commit`), husky.join(" | "));
    // R2″ (second review): --git-common-dir ignores core.hooksPath, so husky's dispatcher is never overwritten.
    const HOOK_FORM = /^(\w+)="\$\(git rev-parse --git-common-dir\)\/hooks" && mkdir -p "\$\1" && rm -f "\$\1\/pre-commit" && curl -fsSL https:\/\/raw\.githubusercontent\.com\/InclusiveCode\/inclusive-ai\/main\/hooks\/pre-commit -o "\$\1\/pre-commit" && chmod \+x "\$\1\/pre-commit"$/;
    const hookInstalls = lines.filter((l) => /\/hooks\/pre-commit\s+-o\s+/.test(l) && !/-o\s+\.husky\//.test(l));
    const literal = lines.filter((l) => /\.git\/hooks\b|--git-path\s+hooks/.test(l));
    check(
      "R2″ the hook installs as `HOOKS=\"$(git rev-parse --git-common-dir)/hooks\" && mkdir -p \"$HOOKS\" && rm -f \"$HOOKS/pre-commit\" && curl … -o \"$HOOKS/pre-commit\" && chmod +x …` (no literal .git/hooks, no --git-path)",
      hookInstalls.length >= 1 && hookInstalls.every((l) => HOOK_FORM.test(l)) && literal.length === 0,
      JSON.stringify({ hookInstalls, literal }),
    );
    // D50: every flag @inclusive-ai/eval@3.4.0's published dist/cli.js reads; older versions ignore unknown flags.
    const PUBLISHED_FLAGS = ["--system", "--category", "--domain", "--severity", "--format", "--adversarial", "--red-team", "--concurrency", "--model", "--output", "--judge-model", "--judge"];
    const flags = blocks.flatMap((b) =>
      b
        .replace(/\\\n\s*/g, " ")
        .split("\n")
        .filter((l) => !l.trim().startsWith("#") && /\binclusive-eval\b/.test(l))
        .flatMap((l) => l.split(/\binclusive-eval(?:@\S+)?/).slice(1).join(" ").match(/--[a-z][a-z-]*/g) ?? []),
    );
    const unpublished = flags.filter((f) => !PUBLISHED_FLAGS.includes(f));
    check("R2‴ every inclusive-eval flag on /tools is one the published @inclusive-ai/eval@3.4.0 reads", flags.includes("--severity") && unpublished.length === 0, unpublished.join(" | "));
    const pageText = await page.evaluate(() => document.body.innerText);
    check(
      "D50 /tools shows --output, --judge and --judge-model, and says they need @inclusive-ai/eval 3.4.0 or newer",
      ["--output", "--judge", "--judge-model"].every((f) => flags.includes(f)) && pageText.includes("--output and --judge need @inclusive-ai/eval 3.4.0 or newer; older versions ignore them without a warning."),
      JSON.stringify([...new Set(flags)]),
    );
    const plugin = blocks.find((b) => /^\/plugin marketplace add InclusiveCode\/inclusive-ai\s*$/m.test(b));
    check(
      "R2 the plugin installs with `/plugin marketplace add InclusiveCode/inclusive-ai` then `/plugin install inclusive-ai@inclusive-ai`",
      !!plugin && /^\/plugin install inclusive-ai@inclusive-ai\s*$/m.test(plugin) && !/\/plugin install (?!inclusive-ai@inclusive-ai\b)\S+/.test(all),
      plugin ?? all.match(/.*\/plugin.*/g)?.join(" | "),
    );
    await context.close();
  });

  // Beyond the pages R2′ names (/tools, README.md, plugin/): the same crash anywhere else on the site.
  await step("R2′ no page on the site shows a bare `npx @inclusive-ai/eval`, `npx inclusive-eval` without -y, or an unpinned alias", async () => {
    const paths = await sitemapPaths();
    const bad = [];
    for (const path of paths) {
      const text = htmlText(await (await fetch(`${ORIGIN}${path}`)).text());
      for (const re of [BARE_SCOPED_NPX, UNSCOPED_NO_YES, UNPINNED_ALIAS]) {
        const m = new RegExp(re.source, "g");
        for (const hit of text.matchAll(m)) bad.push(`${path}: "${text.slice(hit.index, hit.index + 70).trim()}"`);
      }
    }
    check(`R2′ none of the ${paths.length} sitemap pages shows a bare \`npx @inclusive-ai/eval\`, \`npx inclusive-eval\` without -y, or an unpinned \`npx -y inclusive-eval\` (beyond the /tools scope)`, paths.length >= 50 && bad.length === 0, bad.slice(0, 4).join(" | "));
  });
}

// =====================================================================================
// R3 / R3′: Copy buttons on every runnable /tools code block
// =====================================================================================
/** The CLI examples are a reference list: pasting the block would run ten billed commands, so it has no Copy. */
const REFERENCE_LIST = "Code: Eval Suite command line";
/** For each code block in main: its index, label, text, and the buttons in its own card (the largest ancestor holding no other code block). */
async function codeCards(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("main pre")].map((pre, i) => {
      let card = pre;
      while (card.parentElement && card.parentElement !== document.body && card.parentElement.querySelectorAll("pre").length === 1) card = card.parentElement;
      const buttons = [...card.querySelectorAll("button")];
      buttons.forEach((b, k) => b.setAttribute("data-d44-btn", `${i}-${k}`));
      pre.setAttribute("data-d44-pre", String(i));
      return {
        i,
        label: pre.getAttribute("aria-label"),
        role: pre.getAttribute("role"),
        tabindex: pre.getAttribute("tabindex"),
        text: pre.textContent ?? "",
        buttons: buttons.map((b, k) => ({ id: `${i}-${k}`, insidePre: pre.contains(b) })),
      };
    }),
  );
}

if (want("R3")) {
  await step("R3 /tools Copy buttons: names, clipboard, Copied", async () => {
    const { page, context, cap } = await newPage();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    const cards = await codeCards(page);
    const problems = [];
    const names = [];
    const copies = [];
    let reference = null;
    for (const c of cards) {
      const named = [];
      for (const b of c.buttons) named.push({ ...b, name: await nameOf(page.locator(`[data-d44-btn="${b.id}"]`)) });
      const copy = named.filter((b) => /^Copy\b/.test(b.name));
      if (c.label === REFERENCE_LIST) {
        reference = { buttons: named.length };
        continue;
      }
      if (copy.length !== 1) {
        problems.push(`${c.label}: ${copy.length} Copy buttons`);
        continue;
      }
      if (!/^Copy \S.{2,}/.test(copy[0].name)) problems.push(`${c.label}: name "${copy[0].name}" does not say what it copies`);
      if (copy[0].insidePre) problems.push(`${c.label}: the button is inside the code`);
      names.push(copy[0].name);
      copies.push({ ...c, button: copy[0] });
    }
    check(`R3′ /tools has 11 code blocks; each of the 10 runnable ones has one Copy button whose name starts with "Copy" and says what it copies`, cards.length === 11 && copies.length === 10 && problems.length === 0, `${cards.length} blocks, ${copies.length} with Copy; ${problems.slice(0, 4).join(" | ")}`);
    check(`R3′ the "Command line: examples" reference list (${REFERENCE_LIST}) has no Copy button`, reference?.buttons === 0, JSON.stringify(reference));
    check("R3 the Copy button names are distinct", names.length > 0 && new Set(names).size === names.length, names.join(" | "));
    observe(`R3 Copy button names: ${names.join("; ")}`);

    const bad = [];
    for (const c of copies) {
      await page.evaluate(() => navigator.clipboard.writeText("D44-SENTINEL"));
      const btn = page.locator(`[data-d44-btn="${c.button.id}"]`);
      await btn.click();
      const shown = await page
        .waitForFunction((id) => /\bCopied\b/.test(document.querySelector(`[data-d44-btn="${id}"]`)?.textContent ?? ""), c.button.id, { timeout: 2500 })
        .then(() => true)
        .catch(() => false);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      const visible = await btn.evaluate((b) => b.innerText);
      if (clip !== c.text) bad.push(`${c.label}: clipboard ${JSON.stringify(clip.slice(0, 50))} ≠ block ${JSON.stringify(c.text.slice(0, 50))}`);
      if (!shown || !/Copied/.test(visible)) bad.push(`${c.label}: no visible "Copied" (${JSON.stringify(visible)})`);
    }
    check(`R3 with clipboard permission, each Copy button puts exactly its block's text on the clipboard and shows "Copied" (${copies.length} blocks)`, copies.length >= 10 && bad.length === 0, bad.slice(0, 4).join(" | "));
    check("R3 no page errors while copying", cap.pageErrors.length === 0, cap.pageErrors.join(" | "));
    await context.close();
  });

  await step("R3 /tools Copy buttons when the clipboard refuses", async () => {
    const { page, context, cap } = await newPage();
    await context.addInitScript(() => {
      if (window.Clipboard) Clipboard.prototype.writeText = () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
    });
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    const cards = await codeCards(page);
    const bad = [];
    let tried = 0;
    for (const c of cards) {
      let copyId = null;
      for (const b of c.buttons) if (/^Copy\b/.test(await nameOf(page.locator(`[data-d44-btn="${b.id}"]`)))) copyId = b.id;
      if (!copyId) continue;
      tried += 1;
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      const btn = page.locator(`[data-d44-btn="${copyId}"]`);
      await btn.click();
      await sleep(150);
      const st = await page.evaluate(
        ({ id, i }) => {
          const b = document.querySelector(`[data-d44-btn="${id}"]`);
          const pre = document.querySelector(`[data-d44-pre="${i}"]`);
          const live = [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')].map((e) => (e.textContent ?? "").trim()).filter(Boolean);
          return { visible: b?.innerText ?? "", selection: window.getSelection()?.toString() ?? "", pre: pre?.textContent ?? "", live };
        },
        { id: copyId, i: c.i },
      );
      if (!/fail|couldn.t|could not|not copied/i.test(st.visible) || /Copied/.test(st.visible)) bad.push(`${c.label}: button shows ${JSON.stringify(st.visible)}`);
      if (st.selection !== st.pre) bad.push(`${c.label}: selection ${JSON.stringify(st.selection.slice(0, 40))} ≠ block text`);
      if (!st.live.some((t) => /couldn.t copy|could not copy|copy failed|failed to copy|not copied/i.test(t))) bad.push(`${c.label}: no status message (${JSON.stringify(st.live)})`);
      if (tried === 1) {
        await shot(page, "r3-tools-copy-failed.png");
        observe(`R3 failure state, first block: button ${JSON.stringify(st.visible)}; status ${JSON.stringify(st.live)}`);
      }
    }
    check(`R3 when writeText rejects: a failure state on the button, the block's text selected, and a status message (${tried} blocks)`, tried >= 10 && bad.length === 0, bad.slice(0, 4).join(" | "));
    check("R3 no page errors when the clipboard refuses", cap.pageErrors.length === 0, cap.pageErrors.join(" | "));
    const f9 = await codeCards(page);
    check(
      `R3 (F9) all ${f9.length} /tools <pre> blocks are still focusable regions named 'Code: …', unique, with no button inside`,
      f9.length >= 11 && f9.every((c) => c.role === "region" && c.tabindex === "0" && /^Code: \S/.test(c.label ?? "") && c.buttons.every((b) => !b.insidePre)) && new Set(f9.map((c) => c.label)).size === f9.length,
      JSON.stringify(f9.filter((c) => c.role !== "region" || c.tabindex !== "0").map((c) => c.label)),
    );
    await context.close();
  });
}

// =====================================================================================
// R4: home page
// =====================================================================================
if (want("R4")) {
  // With fonts: the usual case. Without: a slow first visit, where font-display "optional" keeps the fallback fonts.
  for (const [width, fonts] of [[320, true], [375, true], [320, false], [375, false]]) {
    await step(`R4 home page above the fold at ${width}×740${fonts ? "" : " (web fonts unavailable)"}`, async () => {
      const { page, context } = await newPage({ width, height: 740 });
      await context.addInitScript(HELPERS);
      if (!fonts) await page.route(/\.(woff2?|ttf|otf)(\?|$)/, (route) => route.abort());
      await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
      const label = `${width}×740${fonts ? "" : " with fallback fonts"}`;
      await shot(page, `r4-home-${width}x740${fonts ? "" : "-fallback-fonts"}.png`);
      const cta = page.getByRole("link", { name: /^Add the eval suite\b/ });
      const n = await cta.count();
      const box = n ? await cta.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const [cx, cy] = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
        // The centre and the middle of each edge (corners are rounded, so they are not hit-testable).
        const pts = [[cx, cy], [r.left + 3, cy], [r.right - 3, cy], [cx, r.top + 3], [cx, r.bottom - 3]];
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, scrollY: window.scrollY, uncovered: pts.every(([x, y]) => el.contains(document.elementFromPoint(x, y))), href: el.getAttribute("href") };
      }) : null;
      check(
        `R4 at ${label} the "Add the eval suite" button is fully visible without scrolling (not covered by the nav)`,
        !!box && box.scrollY === 0 && box.top >= 0 && box.bottom <= 740 && box.left >= 0 && box.right <= width && box.uncovered,
        box ? JSON.stringify(box) : "no 'Add the eval suite' link",
      );
      // Filled (primary-looking) actions above the fold: opaque background that stands out from the page.
      const filled = await page.evaluate(() => {
        const pageBg = __d44.rgba(getComputedStyle(document.body).backgroundColor);
        return [...document.querySelectorAll("a[href], button")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (!__d44.visible(el) || r.bottom <= 0 || r.top >= window.innerHeight || r.width === 0) return false;
            const cs = getComputedStyle(el);
            const bg = __d44.rgba(cs.backgroundColor);
            return (bg[3] >= 0.9 && __d44.contrast(bg, pageBg) >= 3) || /gradient/.test(cs.backgroundImage);
          })
          .map((el) => ({ name: (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "), href: el.getAttribute("href"), top: Math.round(el.getBoundingClientRect().top), inMain: !!el.closest("main") }));
      });
      const ctaHref = box?.href;
      check(
        `R4 at ${label} there is one primary call to action above the fold (every filled action there goes to the same place as "Add the eval suite")`,
        !!ctaHref && filled.length > 0 && filled.every((f) => f.href === ctaHref),
        JSON.stringify(filled),
      );
      observe(`R4 filled actions above the fold at ${label}: ${JSON.stringify(filled)}`);
      if (!n) {
        const first = await page.evaluate(() => {
          const el = document.querySelector("main a[href], main button");
          return el ? { text: el.textContent.trim().slice(0, 40), top: Math.round(el.getBoundingClientRect().top) } : null;
        });
        observe(`R4 at ${label} the first action in main is ${JSON.stringify(first)}`);
      }
      await context.close();
    });
  }

  await step("R4 home page: install command with a working Copy button; model figures equal lib/reports.ts", async () => {
    const { page, context } = await newPage({ width: 375, height: 740 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const cmd = await page.evaluate((install) => {
      const leaf = [...document.querySelectorAll("main *")].find((e) => (e.textContent ?? "").trim() === install && ![...e.children].some((c) => (c.textContent ?? "").trim() === install));
      if (!leaf) return null;
      let card = leaf.parentElement;
      while (card && card !== document.body && !card.querySelector("button")) card = card.parentElement;
      const buttons = card && card !== document.body ? [...card.querySelectorAll("button")] : [];
      buttons.forEach((b, k) => b.setAttribute("data-d44-home", String(k)));
      return { buttons: buttons.length, visible: leaf.getClientRects().length > 0 };
    }, INSTALL);
    let copyOk = false;
    let name = "";
    if (cmd?.buttons) {
      for (let k = 0; k < cmd.buttons; k++) {
        const b = page.locator(`[data-d44-home="${k}"]`);
        const nm = await nameOf(b);
        if (!/^Copy\b/.test(nm)) continue;
        name = nm;
        await page.evaluate(() => navigator.clipboard.writeText("D44-SENTINEL"));
        await b.click();
        await sleep(200);
        copyOk = (await page.evaluate(() => navigator.clipboard.readText())) === INSTALL && /Copied/.test(await b.evaluate((x) => x.textContent ?? ""));
      }
    }
    check(`R4 the npm install command is on the home page (\`${INSTALL}\`)`, !!cmd?.visible, JSON.stringify(cmd));
    check("R4 its Copy button puts exactly the command on the clipboard and shows Copied", copyOk && /^Copy .*install/i.test(name), name);

    const rows = await page.evaluate((models) => {
      const items = [...document.querySelectorAll("main li")];
      return models.map((m) => {
        const li = items.find((l) => (l.innerText ?? "").includes(m));
        return { model: m, text: li ? li.innerText.replace(/\s+/g, " ") : null };
      });
    }, REPORTS.map((r) => r.model));
    const wrong = [];
    for (const r of REPORTS) {
      const row = rows.find((x) => x.model === r.model);
      if (!row?.text) wrong.push(`${r.model}: not shown`);
      else if (!row.text.includes(`${r.totalRate}%`) || !row.text.includes(`${r.totalPassed} of ${r.totalScenarios}`)) wrong.push(`${r.model}: "${row.text}" (expected ${r.totalRate}%, ${r.totalPassed} of ${r.totalScenarios})`);
    }
    check(`R4 each published model is shown with its pass rate and counts from lib/reports.ts (${REPORTS.length} models)`, wrong.length === 0, wrong.join(" | "));
    const mainText = await page.evaluate(() => document.querySelector("main")?.innerText ?? "");
    const named = [...mainText.matchAll(/\b(?:Claude (?:Haiku|Sonnet|Opus) \d+(?:\.\d+)?|GPT-[\w.-]+|Gemini [\w.]+|Llama [\w.]+)/g)].map((m) => m[0]);
    const unknown = named.filter((m) => !REPORTS.some((r) => r.model === m));
    check("R4 no model is named on the home page that is not in lib/reports.ts", named.length > 0 && unknown.length === 0, JSON.stringify({ named, unknown }));
    const range = mainText.match(/misses (\d+(?:\.\d+)?)(?:[–-](\d+(?:\.\d+)?))?%/);
    if (range) {
      const fails = REPORTS.map((r) => 100 - r.totalRate);
      check("R4 the summary range of misses equals 100 − the reports' pass rates", Number(range[1]) === Math.min(...fails) && Number(range[2] ?? range[1]) === Math.max(...fails), range[0]);
    }
    await context.close();
  });
}

// =====================================================================================
// R5: navigation
// =====================================================================================
if (want("R5")) {
  await step("R5 aria-current on each section page (1280 px)", async () => {
    const { page, context } = await newPage();
    await context.addInitScript(HELPERS);
    const bad = [];
    for (const [path, expected] of SECTIONS) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      const cur = await mainNav(page).evaluate((nav) => [...nav.querySelectorAll('a[aria-current="page"]')].filter((a) => __d44.visible(a)).map((a) => new URL(a.href).pathname));
      if (cur.length !== 1 || cur[0] !== expected) bad.push(`${path}: ${JSON.stringify(cur)} (expected ["${expected}"])`);
    }
    check(`R5 on each of ${SECTIONS.length} section pages exactly one visible main-nav link has aria-current="page", the right one`, bad.length === 0, bad.join(" | "));
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const home = await mainNav(page).evaluate((nav) => nav.querySelectorAll('a[aria-current="page"]').length);
    observe(`R5 links with aria-current on the home page: ${home}`);
    await context.close();
  });

  await step("R5 mobile menu: target sizes, current link, backdrop, scroll lock (375 px)", async () => {
    const { page, context } = await newPage({ width: 375, height: 800 }, { hasTouch: true });
    await context.addInitScript(HELPERS);
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    const toggle = menuToggle(page);
    const tb = await toggle.boundingBox();
    check("R5 the menu toggle is at least 44×44 px", !!tb && tb.width >= 44 && tb.height >= 44, JSON.stringify(tb));
    await toggle.tap();
    await sleep(200);
    const menuId = await toggle.getAttribute("aria-controls");
    const rows = await page.evaluate((id) => [...document.querySelectorAll(`#${CSS.escape(id)} a, #${CSS.escape(id)} button`)].filter((a) => __d44.visible(a)).map((a) => ({ name: a.innerText.trim().split("\n")[0], h: a.getBoundingClientRect().height, current: a.getAttribute("aria-current"), path: new URL(a.href, location.href).pathname })), menuId);
    check(`R5 each of the ${rows.length} menu rows is at least 44 px tall`, rows.length >= 6 && rows.every((r) => r.h >= 44), JSON.stringify(rows.map((r) => `${r.name}:${Math.round(r.h)}`)));
    const cur = rows.filter((r) => r.current === "page");
    check('R5 on /tools the open menu marks exactly one link aria-current="page": Tools', cur.length === 1 && cur[0].path === "/tools", JSON.stringify(cur));
    await shot(page, "r5-menu-open-375.png");

    // Backdrop: a tap below the menu closes it, and does not reach the page underneath.
    await page.goto(`${ORIGIN}/patterns`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(150);
    const yBefore = await page.evaluate(() => window.scrollY);
    // Tap the toggle where it is (locator.tap() would first scroll the page to bring it into view).
    const tbox = await toggle.boundingBox();
    await page.touchscreen.tap(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
    await sleep(200);
    const menuBottom = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().bottom ?? 0, menuId);
    const pt = { x: 187, y: Math.round((menuBottom + 800) / 2) };
    const under = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? `<${el.tagName.toLowerCase()}> ${(el.textContent ?? "").trim().slice(0, 30)}` : null;
    }, pt);
    const url = page.url();
    if (pt.y <= menuBottom + 10) check("R5 there is room below the open menu to tap the backdrop", false, JSON.stringify({ menuBottom, pt }));
    // Scroll lock while open: wheel over the backdrop and over the menu, and a touch drag.
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.wheel(0, 700);
    await sleep(350);
    await page.mouse.move(187, Math.round(menuBottom - 40));
    await page.mouse.wheel(0, 700);
    await sleep(350);
    let touchNote = "";
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.synthesizeScrollGesture", { x: pt.x, y: pt.y, yDistance: -400, gestureSourceType: "touch", speed: 1200 });
      await sleep(300);
    } catch (e) {
      touchNote = `touch gesture unavailable: ${String(e).slice(0, 80)}`;
    }
    const y1 = await page.evaluate(() => window.scrollY);
    const stillOpen = (await toggle.getAttribute("aria-expanded")) === "true";
    check("R5 the page does not scroll while the menu is open, mid-page (opening keeps the position; wheel over backdrop and menu, touch drag)", stillOpen && yBefore === 400 && y0 === yBefore && y1 === y0, JSON.stringify({ yBefore, y0, y1, stillOpen, touchNote }));
    await page.touchscreen.tap(pt.x, pt.y);
    await sleep(300);
    const after = {
      expanded: await toggle.getAttribute("aria-expanded"),
      menuVisible: await page.evaluate((id) => __d44.visible(document.getElementById(id)), menuId),
      url: page.url(),
      focusOnToggle: await toggle.evaluate((b) => document.activeElement === b),
    };
    const yAfter = await page.evaluate(() => window.scrollY);
    check("R5 tapping the backdrop closes the menu, does not activate what is underneath, and leaves the page where it was", after.expanded === "false" && !after.menuVisible && after.url === url && yAfter === yBefore, JSON.stringify({ ...after, under, yAfter }));
    check("R5′ after a backdrop tap, focus is on the toggle (and the page did not move)", after.focusOnToggle && yAfter === yBefore, JSON.stringify({ focusOnToggle: after.focusOnToggle, yBefore, yAfter }));
    // Control: once closed, the same wheel scrolls the page (the lock is released and the method works).
    const c0 = await page.evaluate(() => window.scrollY);
    await page.mouse.move(pt.x, 300);
    await page.mouse.wheel(0, 500);
    await sleep(400);
    const c1 = await page.evaluate(() => window.scrollY);
    check("R5 (control) with the menu closed the page scrolls again", c1 > c0, JSON.stringify({ c0, c1 }));
    await context.close();
  });

  await step("R5′ mobile menu: Escape returns focus without moving the page; tabbing out closes the menu (375 px)", async () => {
    const { page, context } = await newPage({ width: 375, height: 800 });
    await context.addInitScript(HELPERS);
    await page.goto(`${ORIGIN}/patterns`, { waitUntil: "networkidle" });
    const toggle = menuToggle(page);
    const menuId = await toggle.getAttribute("aria-controls");
    const state = () =>
      page.evaluate((id) => {
        const t = document.querySelector(`[aria-controls="${id}"]`);
        const menu = document.getElementById(id);
        return {
          expanded: t?.getAttribute("aria-expanded"),
          menuVisible: __d44.visible(menu),
          onToggle: document.activeElement === t,
          inMenu: !!menu?.contains(document.activeElement),
          y: Math.round(window.scrollY),
          focus: (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 30),
        };
      }, menuId);
    // Open the menu from the keyboard with the page scrolled to y=400.
    const openMidPage = async () => {
      await page.evaluate(() => window.scrollTo(0, 400));
      await sleep(150);
      await toggle.evaluate((b) => b.focus({ preventScroll: true }));
      await page.keyboard.press("Enter");
      await sleep(200);
    };
    await openMidPage();
    const opened = await state();
    const ys = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      ys.push((await state()).y);
    }
    const inMenu = await state();
    // R5: the page behind the open menu does not move, whatever moves focus inside the menu.
    check("R5 tabbing through the open menu does not scroll the page behind it (y stays 400)", opened.y === 400 && ys.every((y) => y === 400), JSON.stringify({ opened: opened.y, afterTabs: ys }));
    await page.keyboard.press("Escape");
    await sleep(250);
    const esc = await state();
    check(
      "R5′ Escape from a menu link closes the menu, puts focus on the toggle, and does not move the page",
      inMenu.inMenu && inMenu.expanded === "true" && esc.expanded === "false" && !esc.menuVisible && esc.onToggle && esc.y === inMenu.y,
      JSON.stringify({ inMenu, esc }),
    );

    await openMidPage();
    const items = await page.evaluate((id) => document.getElementById(id)?.querySelectorAll("a[href], button").length ?? 0, menuId);
    for (let i = 0; i < items; i++) await page.keyboard.press("Tab");
    const last = await state();
    await page.keyboard.press("Tab");
    await sleep(250);
    const out = await state();
    check(
      `R5′ Tab past the last of the ${items} menu items, onto the page, closes the menu`,
      items >= 6 && last.inMenu && last.expanded === "true" && !out.inMenu && !out.onToggle && out.expanded === "false" && !out.menuVisible,
      JSON.stringify({ last, out }),
    );

    await openMidPage();
    await page.keyboard.press("Shift+Tab");
    await sleep(250);
    const back = await state();
    check("R5′ Shift+Tab from the open toggle, onto the header's other links, closes the menu", !back.inMenu && !back.onToggle && back.expanded === "false" && !back.menuVisible, JSON.stringify(back));
    await context.close();
  });

  await step("R5 skip link is the first Tab stop and moves focus to the main content", async () => {
    const { page, context } = await newPage();
    const bad = [];
    for (const path of ["/", "/lab", "/patterns", "/tools", "/checklist", "/research", "/registry"]) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      await page.keyboard.press("Tab");
      const first = await page.evaluate(() => {
        const a = document.activeElement;
        const r = a?.getBoundingClientRect();
        return { tag: a?.tagName, text: (a?.textContent ?? "").trim(), href: a?.getAttribute("href"), onScreen: !!r && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0 };
      });
      if (first.tag !== "A" || !/^skip to (main )?content$/i.test(first.text) || !first.onScreen) {
        bad.push(`${path}: first Tab stop ${JSON.stringify(first)}`);
        continue;
      }
      await page.keyboard.press("Enter");
      await sleep(150);
      const landed = await page.evaluate(() => ({ inMain: !!document.activeElement?.closest("main"), tag: document.activeElement?.tagName }));
      await page.keyboard.press("Tab");
      const next = await page.evaluate(() => ({ inMain: !!document.activeElement?.closest("main"), inNav: !!document.activeElement?.closest("nav[aria-label='Main'], body > nav"), text: (document.activeElement?.textContent ?? "").trim().slice(0, 30) }));
      if (!landed.inMain || !next.inMain || next.inNav) bad.push(`${path}: after Enter ${JSON.stringify(landed)}, next Tab ${JSON.stringify(next)}`);
    }
    check("R5 on 7 pages the first Tab stop is a visible 'Skip to content' link; Enter moves focus into <main> and the next Tab stays in main", bad.length === 0, bad.join(" | "));
    await context.close();
  });
}

// =====================================================================================
// R6: /patterns filter
// =====================================================================================
const cards = (page) => page.$$eval("main a[href^='/patterns/']", (as) => as.filter((a) => a.getClientRects().length > 0).map((a) => ({ href: a.getAttribute("href"), text: a.innerText.replace(/\s+/g, " ") })));
const countText = (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("main *")].find((e) => /^Showing\b.*\bpatterns?$/.test((e.textContent ?? "").trim()) && ![...e.children].some((c) => /^Showing\b/.test((c.textContent ?? "").trim())));
    if (!el) return null;
    return { text: el.textContent.trim(), live: !!el.closest('[role="status"], [aria-live]') };
  });
const countMatches = (ct, n) => {
  if (!ct) return false;
  const m = /^Showing (?:all (\d+)|(\d+) of (\d+)) patterns?$/.exec(ct.text);
  return !!m && (m[1] ? Number(m[1]) === n && n === 43 : Number(m[2]) === n && Number(m[3]) === 43);
};
async function settle(page, pred, arg) {
  return page.waitForFunction(pred, arg, { timeout: 4000 }).then(() => true).catch(() => false);
}

if (want("R6")) {
  await step("R6 /patterns search, severity chips, domain select, empty state", async () => {
    const { page, context, cap } = await newPage({ width: 1280, height: 900 });
    await page.goto(`${ORIGIN}/patterns`, { waitUntil: "networkidle" });
    let ct = await countText(page);
    let list = await cards(page);
    check("R6 the count is a live region and starts at all 43 patterns", list.length === 43 && countMatches(ct, 43) && ct.live, JSON.stringify({ ct, cards: list.length }));

    const search = page.getByRole("searchbox");
    const target = "Binary Gender Assumption";
    if (await search.count()) {
      await search.fill(target);
      await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length < 43);
      await sleep(200);
    }
    list = await cards(page);
    ct = await countText(page);
    check(`R6 searching "${target}" narrows the list and keeps that pattern`, list.length > 0 && list.length < 43 && list.some((c) => c.text.includes(target)), `${list.length} cards`);
    check("R6 after a search the count text ('Showing N of 43 patterns') equals the number of cards", countMatches(ct, list.length) && ct.live, JSON.stringify({ ct, cards: list.length }));

    // Clear, then severity chips.
    if (await search.count()) await search.fill("");
    await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length === 43);
    const chips = await page.$$eval("main button[aria-pressed]", (bs) => bs.map((b) => ({ name: b.textContent.trim().replace(/\s+/g, " "), pressed: b.getAttribute("aria-pressed") })));
    check("R6 the severity chips are toggle buttons with aria-pressed ('All' pressed to start)", chips.length >= 4 && chips.filter((c) => c.pressed === "true").length === 1 && /^All\b/.test(chips.find((c) => c.pressed === "true")?.name ?? ""), JSON.stringify(chips));
    const critical = page.locator("main button[aria-pressed]", { hasText: /^\s*Critical\b/i });
    if (await critical.count()) {
      await critical.first().click();
      await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length < 43);
      await sleep(200);
    }
    const pressed = await page.$$eval("main button[aria-pressed]", (bs) => bs.map((b) => `${b.textContent.trim().split(/\s/)[0]}=${b.getAttribute("aria-pressed")}`));
    list = await cards(page);
    ct = await countText(page);
    check(
      "R6 pressing 'Critical' sets aria-pressed on it (only), shows only critical patterns, and the count matches",
      pressed.filter((p) => p.endsWith("=true")).length === 1 && pressed.some((p) => /^critical=true$/i.test(p)) && list.length > 0 && list.length < 43 && list.every((c) => /^critical\b/i.test(c.text.trim())) && countMatches(ct, list.length),
      JSON.stringify({ pressed, cards: list.length, ct }),
    );
    const allChip = page.locator("main button[aria-pressed]", { hasText: /^\s*All\b/ });
    if (await allChip.count()) await allChip.first().click();
    await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length === 43);

    // Domain select.
    const select = page.locator("main select");
    let picked = null;
    if (await select.count()) {
      const options = await select.first().locator("option").evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent.trim() })));
      picked = options.find((o, i) => i > 0 && !/^core/i.test(o.label)) ?? options[1];
      await select.first().selectOption(picked.value);
      await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length < 43);
      await sleep(200);
    }
    list = await cards(page);
    ct = await countText(page);
    check(
      `R6 choosing the domain "${picked?.label}" filters the list to that domain and the count matches`,
      !!picked && list.length > 0 && list.length < 43 && list.every((c) => c.text.includes(picked.label)) && countMatches(ct, list.length),
      JSON.stringify({ cards: list.length, ct, sample: list.slice(0, 2).map((c) => c.text.slice(0, 60)) }),
    );
    // Empty state with a working Clear filters: with the domain still chosen, a severity pressed, and a query.
    if (await critical.count()) await critical.first().click();
    const query = "zzqv-no-such-pattern";
    if (await search.count()) {
      await search.fill(query);
      await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length === 0);
      await sleep(200);
    }
    list = await cards(page);
    ct = await countText(page);
    const empty = await page.evaluate(() => {
      const msg = [...document.querySelectorAll("main *")].find((e) => /^No patterns match\b/i.test((e.textContent ?? "").trim()) && e.children.length === 0);
      if (!msg) return null;
      let box = msg.parentElement;
      while (box && box !== document.body && !box.querySelector("button")) box = box.parentElement;
      const btn = box && box !== document.body ? [...box.querySelectorAll("button")].find((b) => /^Clear filters$/i.test(b.textContent.trim())) : null;
      btn?.setAttribute("data-d44-clear", "1");
      return { message: msg.textContent.trim(), button: !!btn };
    });
    await shot(page, "r6-patterns-empty.png");
    check("R6 a query with no match shows an empty state with a 'Clear filters' button, and the count says 0", list.length === 0 && !!empty?.button && countMatches(ct, 0), JSON.stringify({ cards: list.length, empty, ct }));
    if (empty?.button) {
      await page.locator("[data-d44-clear]").click();
      await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length === 43);
    }
    list = await cards(page);
    ct = await countText(page);
    const reset = {
      query: (await search.count()) ? await search.inputValue() : null,
      select: (await select.count()) ? await select.first().evaluate((s) => s.selectedIndex) : null,
      pressed: await page.$$eval("main button[aria-pressed='true']", (bs) => bs.map((b) => b.textContent.trim().split(/\s/)[0])),
    };
    check(
      "R6 'Clear filters' in the empty state clears the search, the domain and the severity, and brings back all 43 patterns",
      list.length === 43 && countMatches(ct, 43) && reset.query === "" && reset.select === 0 && reset.pressed.length === 1 && /^All$/.test(reset.pressed[0]),
      JSON.stringify({ cards: list.length, ct, reset }),
    );
    check("R6 no page errors while filtering", cap.pageErrors.length === 0, cap.pageErrors.join(" | "));
    await context.close();
  });

  await step("R6 /patterns without JavaScript lists all 43 patterns", async () => {
    const { page, context } = await newPage({ width: 1280, height: 900 }, { javaScriptEnabled: false });
    await page.goto(`${ORIGIN}/patterns`, { waitUntil: "load" });
    const hrefs = await page.$$eval("main a[href^='/patterns/']", (as) => as.filter((a) => a.getClientRects().length > 0).map((a) => a.getAttribute("href")));
    const expected = new Set(PATTERN_SLUGS.map((s) => `/patterns/${s}`));
    check("R6 without JavaScript all 43 patterns are listed (one visible link each)", hrefs.length === 43 && hrefs.every((h) => expected.has(h)) && new Set(hrefs).size === 43, `${hrefs.length} links`);
    await context.close();
  });
}

// =====================================================================================
// R7: /checklist
// =====================================================================================
const boxState = (page) => page.$$eval("[role=checkbox]", (bs) => bs.map((b) => b.getAttribute("aria-checked")));
const boxLabels = (page) =>
  page.$$eval("[role=checkbox]", (bs) =>
    bs.map((b) => {
      const ids = (b.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      return (ids.length ? ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : b.getAttribute("aria-label") ?? b.textContent ?? "").replace(/\s+/g, " ").trim();
    }),
  );
async function checklistReady(page) {
  await page.goto(`${ORIGIN}/checklist`, { waitUntil: "networkidle" });
  // Hydrated when the tools that need JavaScript appear; the pre-D44 page has none, so fall back to a pause.
  const ok = await page.getByRole("button", { name: "Print" }).waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
  if (!ok) await sleep(800);
  return ok;
}

if (want("R7")) {
  await step("R7 /checklist when localStorage.setItem throws", async () => {
    const { page, context, cap } = await newPage();
    await context.addInitScript(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      };
    });
    await checklistReady(page);
    const boxes = page.locator("[role=checkbox]");
    const clickErrors = [];
    for (const i of [0, 1]) {
      // The pre-D44 page threw inside a state update here; keep going so the checks below report it.
      await boxes.nth(i).click({ timeout: 3000 }).catch((e) => clickErrors.push(String(e).slice(0, 80)));
      await sleep(250);
    }
    const state = await boxState(page).catch(() => []);
    const page2 = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? null, crashed: /Application error|client-side exception/i.test(document.body.innerText) }));
    const notice = await page.evaluate(() => {
      const t = document.body.innerText;
      return /(won.t|will not|can.t|cannot|isn.t|not) be saved|won.t be saved|not saved|can.t save|cannot save/i.exec(t)?.[0] ?? null;
    });
    await shot(page, "r7-checklist-storage-blocked.png");
    check("R7 with setItem throwing, clicking items still checks them", state[0] === "true" && state[1] === "true", JSON.stringify({ state: state.slice(0, 3), clickErrors }));
    check("R7 with setItem throwing, the page does not crash (no page error, content still there)", cap.pageErrors.length === 0 && !!page2.h1 && !page2.crashed, JSON.stringify({ errors: cap.pageErrors.slice(0, 2), ...page2 }));
    check("R7 with setItem throwing, a notice says progress won't be saved", !!notice, notice);
    await context.close();
  });

  await step("R7 /checklist Reset then Undo restores the previous checks", async () => {
    const { page, context } = await newPage();
    await checklistReady(page);
    const boxes = page.locator("[role=checkbox]");
    for (const i of [0, 3, 7]) await boxes.nth(i).click();
    await sleep(200);
    const before = await boxState(page);
    const reset = page.getByRole("button", { name: /^Reset\b/ });
    if (await reset.count()) await reset.first().click();
    await sleep(200);
    const cleared = await boxState(page);
    const undo = page.getByRole("button", { name: /^Undo\b/ });
    const undoShown = (await undo.count()) > 0 && (await undo.first().isVisible());
    check("R7 Reset clears every check and offers Undo", cleared.every((s) => s === "false") && undoShown, JSON.stringify({ cleared: cleared.filter((s) => s === "true").length, undoShown }));
    if (undoShown) await undo.first().click();
    await sleep(200);
    const restored = await boxState(page);
    const stored = await page.evaluate(() => localStorage.getItem("inclusive-ai-checklist"));
    check("R7 Undo restores exactly the previous checks", JSON.stringify(restored) === JSON.stringify(before) && before.filter((s) => s === "true").length === 3, JSON.stringify({ before: before.map((s, i) => (s === "true" ? i : null)).filter((x) => x !== null), restored: restored.map((s, i) => (s === "true" ? i : null)).filter((x) => x !== null) }));
    await page.reload({ waitUntil: "networkidle" });
    await sleep(500);
    check("R7 the restored checks are saved (they survive a reload)", JSON.stringify(await boxState(page)) === JSON.stringify(before), stored);
    await context.close();
  });

  await step("R7 /checklist Print and Copy as Markdown after hydration", async () => {
    const { page, context } = await newPage();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    await context.addInitScript(() => {
      window.__printed = 0;
      window.print = () => {
        window.__printed += 1;
      };
    });
    await checklistReady(page);
    const print = page.getByRole("button", { name: "Print" });
    const copy = page.getByRole("button", { name: /^Copy as Markdown\b/ });
    const shown = { print: (await print.count()) > 0 && (await print.first().isVisible()), copy: (await copy.count()) > 0 && (await copy.first().isVisible()) };
    check("R7 after hydration the page has a Print button and a Copy as Markdown button", shown.print && shown.copy, JSON.stringify(shown));
    if (shown.print) {
      await print.first().click();
      await sleep(100);
    }
    check("R7 Print opens the browser's print dialog (window.print)", (await page.evaluate(() => window.__printed)) === 1);
    let md = "";
    if (shown.copy) {
      await page.evaluate(() => navigator.clipboard.writeText("D44-SENTINEL"));
      await copy.first().click();
      await sleep(250);
      md = await page.evaluate(() => navigator.clipboard.readText());
    }
    const labels = await boxLabels(page);
    const tasks = md.split("\n").filter((l) => /^\s*[-*] \[[ xX]\] /.test(l));
    const taskLabels = tasks.map((l) => l.replace(/^\s*[-*] \[[ xX]\] /, "").trim());
    check(
      `R7 Copy as Markdown copies a GitHub task list of all ${labels.length} items, in order`,
      labels.length === 16 && tasks.length === 16 && tasks.every((l) => /^- \[ \] /.test(l)) && JSON.stringify(taskLabels) === JSON.stringify(labels),
      md.slice(0, 160).replace(/\n/g, "⏎"),
    );
    await context.close();
  });

  await step("R7 /checklist print stylesheet", async () => {
    const { page, context } = await newPage();
    await context.addInitScript(HELPERS);
    await checklistReady(page);
    await page.emulateMedia({ media: "print" });
    await sleep(200);
    const pr = await page.evaluate(() => {
      const hidden = (el) => !el || !__d44.visible(el);
      const nav = document.querySelector('nav[aria-label="Main"]') ?? document.querySelector("body > nav");
      const footer = document.querySelector("body > footer, footer");
      const notBlack = [];
      let measured = 0;
      for (const el of document.querySelectorAll("body *")) {
        if (!__d44.ownText(el) || !__d44.visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        measured += 1;
        const cs = getComputedStyle(el);
        const c = __d44.rgba(cs.color);
        const fill = __d44.rgba(cs.webkitTextFillColor);
        if (c[0] + c[1] + c[2] !== 0 || c[3] < 1 || fill[0] + fill[1] + fill[2] !== 0 || fill[3] < 1) notBlack.push(`<${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 30)}" ${cs.color} / ${cs.webkitTextFillColor}`);
      }
      return { navHidden: hidden(nav), navExists: !!nav, footerHidden: hidden(footer), footerExists: !!footer, measured, notBlack, items: [...document.querySelectorAll("[role=checkbox]")].filter((b) => __d44.visible(b)).length };
    });
    check("R7 print: the main nav and the footer are hidden", pr.navExists && pr.navHidden && pr.footerExists && pr.footerHidden, JSON.stringify({ nav: [pr.navExists, pr.navHidden], footer: [pr.footerExists, pr.footerHidden] }));
    check(`R7 print: all ${pr.measured} visible text elements print black`, pr.measured > 30 && pr.notBlack.length === 0, pr.notBlack.slice(0, 4).join(" | "));
    check("R7 print: all 16 checklist items are printed", pr.items === 16, pr.items);
    await page.pdf({ path: join(EVIDENCE, "r7-checklist-print.pdf"), format: "A4" }).catch(() => {});
    await context.close();
  });

  await step("R7 /checklist loads progress saved under 'inclusive-ai-checklist'", async () => {
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/checklist`, { waitUntil: "networkidle" });
    await page.evaluate((saved) => localStorage.setItem("inclusive-ai-checklist", JSON.stringify(Object.fromEntries(Object.keys(saved).map((k) => [k, true])))), SAVED_BEFORE_D44);
    await page.reload({ waitUntil: "networkidle" });
    await sleep(600);
    const labels = await boxLabels(page);
    const state = await boxState(page);
    const on = labels.filter((_, i) => state[i] === "true");
    const counter = await page.evaluate(() => /(\d+)\s*\/\s*(\d+) checks/.exec(document.body.innerText)?.[0] ?? null);
    check("R7 progress saved in the pre-D44 format is loaded (the two saved items are checked, nothing else)", JSON.stringify(on.sort()) === JSON.stringify(Object.values(SAVED_BEFORE_D44).sort()) && /^2\s*\/\s*16 checks$/.test(counter ?? ""), JSON.stringify({ on, counter }));
    await context.close();
  });
}

// =====================================================================================
// R8: no transparent text fill (gradient text) on any page
// =====================================================================================
const transparentText = () => {
  const out = [];
  let n = 0;
  const describe = (el, pseudo) => `<${el.tagName.toLowerCase()}${pseudo ?? ""}> "${(el.textContent ?? "").trim().slice(0, 30)}"`;
  for (const el of document.querySelectorAll("*")) {
    n += 1;
    for (const pseudo of [null, "::before", "::after"]) {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === "none" || cs.content === "normal" || cs.content === '""')) continue;
      const clip = `${cs.backgroundClip} ${cs.webkitBackgroundClip ?? ""}`;
      const fill = __d44.rgba(cs.webkitTextFillColor);
      const hasText = pseudo ? true : __d44.ownText(el);
      if (/\btext\b/.test(clip)) out.push(`${describe(el, pseudo)} background-clip: ${clip.trim()}`);
      else if (fill[3] === 0 && hasText) out.push(`${describe(el, pseudo)} -webkit-text-fill-color: ${cs.webkitTextFillColor}`);
    }
  }
  return { n, out };
};

if (want("R8")) {
  await step("R8 no gradient text", async () => {
    const { page, context } = await newPage();
    await context.addInitScript(HELPERS);
    for (const path of MAIN_PAGES) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      const r = await page.evaluate(transparentText);
      check(`R8 ${path}: no element (of ${r.n}, with ::before/::after) has a transparent text fill or background-clip: text`, r.n > 50 && r.out.length === 0, r.out.slice(0, 4).join(" | "));
    }
    // The completed checklist (its "All clear" state was gradient text before D44).
    await checklistReady(page);
    const boxes = page.locator("[role=checkbox]");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).click();
    await sleep(300);
    const r = await page.evaluate(transparentText);
    check("R8 /checklist with every item checked: no transparent text fill", r.out.length === 0, r.out.slice(0, 4).join(" | "));
    await context.close();
  });
}

// =====================================================================================
// R9: fonts
// =====================================================================================
if (want("R9")) {
  await step("R9 fonts computed, loaded, and used", async () => {
    const { page, context } = await newPage();
    const expected = { body: "Atkinson Hyperlegible Next", h1: "Instrument Serif", code: "Atkinson Hyperlegible Mono" };
    const cdp = await context.newCDPSession(page);
    const rendered = async (selector) => {
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) return [];
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      return fonts.map((f) => f.familyName);
    };
    for (const path of ["/", "/tools"]) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      const r = await page.evaluate(async () => {
        await document.fonts.ready;
        const first = (el) => (el ? getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "") : null);
        const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ""), status: f.status }));
        return {
          body: first(document.body),
          h1: first(document.querySelector("h1")),
          code: first(document.querySelector("main code")),
          faces,
        };
      });
      const loaded = await page.evaluate((fams) => Object.fromEntries(fams.map((f) => [f, [...document.fonts].some((x) => x.family.replace(/^["']|["']$/g, "") === f && x.status === "loaded") && document.fonts.check(`16px "${f}"`)])), Object.values(expected));
      check(
        `R9 ${path}: computed font-family of body, h1 and code is ${Object.values(expected).join(", ")}`,
        r.body === expected.body && r.h1 === expected.h1 && r.code === expected.code,
        JSON.stringify({ body: r.body, h1: r.h1, code: r.code }),
      );
      check(`R9 ${path}: document.fonts reports all three loaded`, Object.values(loaded).every(Boolean), JSON.stringify({ loaded, faces: r.faces.map((f) => `${f.family}:${f.status}`) }));
      const used = { body: await rendered("main p"), h1: await rendered("h1"), code: await rendered("main code") };
      check(
        `R9 ${path}: the browser renders text with them (platform fonts for main p, h1, main code)`,
        used.body.some((f) => f.startsWith(expected.body)) && used.h1.some((f) => f.startsWith(expected.h1)) && used.code.some((f) => f.startsWith(expected.code)),
        JSON.stringify(used),
      );
    }
    await context.close();
  });
}

// =====================================================================================
// R10: axe and reflow
// =====================================================================================
if (want("R10")) {
  await step("R10 axe 0 violations and no horizontal scroll", async () => {
    const pages = ["/", "/lab", "/patterns", "/tools", "/checklist", "/research", "/registry", `/patterns/${PATTERN_SLUGS[0]}`];
    if (!axeSource) observe("AXE_PATH not set: axe scans skipped");
    for (const width of [1280, 320]) {
      const { page, context } = await newPage({ width, height: 900 });
      const fails = [];
      const overflow = [];
      for (const path of pages) {
        await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
        const v = await axe(page);
        if (v?.length) fails.push(`${path}: ${v.join(", ")}`);
        if (width === 320) {
          const m = await noHScroll(page);
          if (m.doc > m.inner || m.body > m.inner) overflow.push(`${path}: ${m.doc}/${m.inner}`);
        }
      }
      if (axeSource) check(`R10 axe (WCAG 2.x A/AA + best practice) at ${width} px: 0 violations on ${pages.length} pages`, fails.length === 0, fails.join(" | "));
      if (width === 320) check(`R10 no horizontal scroll at 320 px on ${pages.length} pages`, overflow.length === 0, overflow.join(" | "));
      await context.close();
    }
  });

  await step("R10 axe and reflow in the new interface states (320 px)", async () => {
    const states = [];
    const run = async (label, fn, options = {}) => {
      const { page, context } = await newPage({ width: 320, height: 800 }, options.context ?? {});
      if (options.init) await context.addInitScript(options.init);
      try {
        await fn(page, context);
        const v = await axe(page);
        const m = await noHScroll(page);
        states.push({ label, axe: v, overflow: m.doc > m.inner || m.body > m.inner ? `${m.doc}/${m.inner}` : null });
      } catch (e) {
        states.push({ label, error: String(e).slice(0, 160) });
      }
      await context.close();
    };
    await run("mobile menu open on /", async (page) => {
      await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
      await menuToggle(page).click();
      await sleep(200);
    });
    await run("/patterns empty state", async (page) => {
      await page.goto(`${ORIGIN}/patterns`, { waitUntil: "networkidle" });
      await page.getByRole("searchbox").fill("zzqv-no-such-pattern");
      await sleep(400);
    });
    await run(
      "/checklist storage blocked, after Reset (notice and Undo showing)",
      async (page) => {
        await checklistReady(page);
        await page.locator("[role=checkbox]").first().click();
        await page.getByRole("button", { name: /^Reset\b/ }).click();
        await sleep(200);
      },
      { init: () => (Storage.prototype.setItem = () => { throw new DOMException("blocked", "QuotaExceededError"); }) },
    );
    await run(
      "/tools after a refused copy",
      async (page) => {
        await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /^Copy\b/ }).first().click();
        await sleep(200);
      },
      { init: () => window.Clipboard && (Clipboard.prototype.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"))) },
    );
    await run(
      "/ after a refused compact copy (the hint below the hero install)",
      async (page) => {
        await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /^Copy\b.*install command/ }).first().click();
        await sleep(250);
      },
      { init: () => window.Clipboard && (Clipboard.prototype.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"))) },
    );
    for (const s of states) {
      if (s.error) check(`R10 state "${s.label}" could be reached`, false, s.error);
      else {
        if (axeSource) check(`R10 axe at 320 px, ${s.label}: 0 violations`, s.axe.length === 0, s.axe.join(" | "));
        check(`R10 no horizontal scroll at 320 px, ${s.label}`, !s.overflow, s.overflow ?? "");
      }
    }
  });
}

// =====================================================================================
// R11: verdicts follow the eval suite's rule (FAIL on any critical, NEEDS_WORK on any high)
// =====================================================================================
const VERDICT_LABELS = { PASS: "Pass", NEEDS_WORK: "Needs work", FAIL: "Fail" };
const labelsIn = (t) => Object.entries(VERDICT_LABELS).filter(([, l]) => new RegExp(`(^|[^\\w])${l}([^\\w]|$)`).test(t)).map(([v]) => v);
const RULE_TEXT = /fail if any critical[^.]*needs work if any high[^.]*pass otherwise/i;
/** Pass/fail colours are semantic: rose for FAIL, amber for NEEDS_WORK, emerald for PASS. */
const HUE_OF = () => {
  window.__d44hue = (c) => {
    const [r, g, b] = __d44.rgba(c).map((v, i) => (i < 3 ? v / 255 : v));
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return null;
    let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    h = (h * 60 + 360) % 360;
    return h >= 330 || h < 15 ? "FAIL" : h >= 30 && h < 65 ? "NEEDS_WORK" : h >= 120 && h < 175 ? "PASS" : `hue ${Math.round(h)}`;
  };
};

if (want("R11")) {
  await step("R11 verdicts: home proof card, /research, report pages", async () => {
    const { page, context } = await newPage();
    await context.addInitScript(HELPERS);
    await context.addInitScript(HUE_OF);
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const home = await page.evaluate((models) => models.map((m) => [...document.querySelectorAll("main li")].find((l) => l.innerText.includes(m))?.innerText ?? null), REPORT_FACTS.map((r) => r.model));
    const homeBad = REPORT_FACTS.filter((r, i) => JSON.stringify(labelsIn(home[i] ?? "")) !== JSON.stringify([r.verdict])).map((r, i) => `${r.model}: ${JSON.stringify(home[REPORT_FACTS.indexOf(r)])}`);
    check(`R11 home proof card: each model shows the rule's verdict (${REPORT_FACTS.map((r) => `${r.model} ${r.verdict}`).join(", ")})`, REPORT_FACTS.every((r) => r.verdict === "FAIL") && homeBad.length === 0, homeBad.join(" | "));
    check("R11 home: the verdict rule is stated", RULE_TEXT.test(await page.evaluate(() => document.querySelector("main").innerText)));

    await page.goto(`${ORIGIN}/research`, { waitUntil: "networkidle" });
    const research = await page.evaluate((facts) =>
      facts.map((r) => {
        const card = document.querySelector(`main a[href="/research/${r.slug}"]`);
        if (!card) return null;
        const bars = r.results.map((d) => {
          const row = [...card.querySelectorAll("span, div")].find((e) => [...e.children].some((c) => c.textContent.trim() === d.domain) && e.querySelector(`[style*="width: ${d.rate}%"], [style*="width:${d.rate}%"]`));
          const bar = row?.querySelector(`[style*="width: ${d.rate}%"], [style*="width:${d.rate}%"]`);
          return { domain: d.domain, stored: d.verdict, hue: bar ? __d44hue(getComputedStyle(bar).backgroundColor) : "no bar" };
        });
        return { text: card.innerText, bars };
      }),
    REPORT_FACTS);
    const resBad = REPORT_FACTS.map((r, i) => ({ r, x: research[i] })).filter(({ r, x }) => !x || JSON.stringify(labelsIn(x.text)) !== JSON.stringify([r.verdict])).map(({ r }) => r.model);
    check("R11 /research: each report card shows the rule's verdict", resBad.length === 0, resBad.join(" | "));
    const barBad = research.flatMap((x) => (x?.bars ?? []).filter((b) => b.hue !== b.stored).map((b) => `${b.domain}: stored ${b.stored}, bar ${b.hue}`));
    check(`R11 /research: every domain bar's colour follows the stored verdict (incl. Adversarial at 93–97%: needs work)`, research.every(Boolean) && barBad.length === 0, [...new Set(barBad)].join(" | "));
    check("R11 /research: the verdict rule is stated", RULE_TEXT.test(await page.evaluate(() => document.querySelector("main").innerText)));

    const bad = [];
    const methodBad = [];
    for (const r of REPORT_FACTS) {
      await page.goto(`${ORIGIN}/research/${r.slug}`, { waitUntil: "networkidle" });
      const st = await page.evaluate((r) => {
        const main = document.querySelector("main");
        const overall = [...main.querySelectorAll("span, div, p")].find((e) => /^Overall result\b/.test(e.innerText.trim()) && e.innerText.length < 60);
        const rows = r.results.map((d) => {
          const tr = [...main.querySelectorAll("tr")].find((t) => t.querySelector("td")?.textContent.trim() === d.domain);
          const bar = tr?.querySelector(`[style*="width: ${d.rate}%"], [style*="width:${d.rate}%"]`);
          return { domain: d.domain, stored: d.verdict, text: tr?.innerText ?? null, hue: bar ? __d44hue(getComputedStyle(bar).backgroundColor) : "no bar" };
        });
        const para = [...main.querySelectorAll("p")].map((p) => p.innerText.replace(/\s+/g, " ").trim()).find((t) => /adversarial scenarios/i.test(t) && /\bpassed\b/i.test(t)) ?? null;
        const mh = [...main.querySelectorAll("h2")].find((h) => /^1\.\s*Methodology$/.test(h.textContent.trim()));
        const mparas = [...((mh?.closest("section") ?? mh?.parentElement)?.querySelectorAll("p") ?? [])].map((p) => p.innerText.replace(/\s+/g, " ").trim());
        // R11″: the last paragraph is the correction note; the rest is the current description.
        const correction = mparas[mparas.length - 1] ?? null;
        const method = mparas.length ? mparas.slice(0, -1).join(" ") : null;
        return { overall: overall?.innerText ?? null, rows, para, note: /Note on JSON escape bypass/.test(main.innerText), rule: main.innerText, method, correction };
      }, r);
      // R11′: the methodology states the severity rule, and the verdicts on the page obey it.
      const shownDomains = st.rows.map((row) => labelsIn(row.text ?? "")[0]);
      const ruleDomains = r.results.map((d) => {
        const fs = r.failures.filter((f) => f.domain === d.domain);
        return fs.some((f) => f.severity === "critical") ? "FAIL" : fs.some((f) => f.severity === "high") ? "NEEDS_WORK" : "PASS";
      });
      const lowest = ["FAIL", "NEEDS_WORK", "PASS"].find((v) => shownDomains.includes(v));
      const methodOk =
        !!st.method &&
        /FAIL if any critical[- ]severity scenario fails, NEEDS_WORK if any high[- ]severity scenario fails, PASS otherwise/i.test(st.method) &&
        !/\d+\s*%\s*(?:for )?(?:PASS|NEEDS_WORK|pass|needs[- ]work)|threshold/i.test(st.method) &&
        /^Corrected 2026-10-06:/.test(st.correction ?? "") &&
        JSON.stringify(shownDomains) === JSON.stringify(ruleDomains) &&
        (!/overall verdict is the lowest domain verdict/i.test(st.method) || JSON.stringify(labelsIn(st.overall ?? "")) === JSON.stringify([lowest]));
      if (!methodOk) methodBad.push(`${r.model}: ${JSON.stringify({ method: (st.method ?? "").match(/[^.]*(?:verdict|threshold)[^.]*\./gi), correction: (st.correction ?? "").slice(0, 40), shownDomains, ruleDomains, overall: st.overall })}`);
      if (JSON.stringify(labelsIn(st.overall ?? "")) !== JSON.stringify([r.verdict])) bad.push(`${r.model}: overall ${JSON.stringify(st.overall)}`);
      for (const row of st.rows) {
        if (JSON.stringify(labelsIn(row.text ?? "")) !== JSON.stringify([row.stored])) bad.push(`${r.model} ${row.domain}: badge ${JSON.stringify(row.text)} (stored ${row.stored})`);
        if (row.hue !== row.stored) bad.push(`${r.model} ${row.domain}: bar ${row.hue} (stored ${row.stored})`);
      }
      if (!RULE_TEXT.test(st.rule)) bad.push(`${r.model}: no rule text`);
      const adv = r.results.find((d) => d.domain === "Adversarial");
      const n = r.failures.filter((f) => f.domain === "Adversarial").length;
      const countOk = st.para && st.para.includes(`passed ${adv.passed} of ${adv.total}`) && (n === 1 ? /\b(one|1) failure\b/i.test(st.para) && !/\b\d+ failures\b/.test(st.para) : new RegExp(`\\b${n} failures\\b`).test(st.para) && !/\b(single|one|1) failure\b/i.test(st.para));
      if (!countOk) bad.push(`${r.model}: adversarial paragraph ${JSON.stringify(st.para)} (data: ${adv.passed}/${adv.total}, ${n} failures)`);
      const wantNote = r.failures.some((f) => f.domain === "Adversarial" && f.title.includes("JSON escape"));
      if (st.note !== wantNote) bad.push(`${r.model}: JSON-escape note ${st.note ? "shown" : "missing"}`);
    }
    check(
      "R11 report pages: overall verdict by the rule; domain badges and bars by the stored verdict; rule stated; adversarial passed/total and failure count from the data (Sonnet 28/30, 2; others 29/30, 1); JSON-escape note only with a JSON-escape failure",
      bad.length === 0,
      bad.slice(0, 5).join(" | "),
    );
    check(
      "R11′/R11″ report pages: '1. Methodology' states the severity rule (no 90%/85% thresholds) and ends with the 'Corrected 2026-10-06:' note; each domain's shown verdict is that rule applied to its failures, and the overall is the lowest domain verdict",
      methodBad.length === 0,
      methodBad.slice(0, 3).join(" | "),
    );
    await context.close();
  });
}

// =====================================================================================
// R12: headings
// =====================================================================================
if (want("R12")) {
  await step("R12 /patterns and /research titles are headings, never inside a <span>", async () => {
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/patterns`, { waitUntil: "networkidle" });
    const pat = await page.evaluate(() => ({
      h2: document.querySelectorAll("main h2").length,
      inCards: [...document.querySelectorAll("main a[href^='/patterns/'] h2")].length,
      cards: document.querySelectorAll("main a[href^='/patterns/']").length,
      inSpan: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => h.parentElement?.closest("span")).length,
    }));
    check("R12 /patterns: 43 pattern titles are <h2> inside their card links (44 <h2> with the page's own), none inside a <span>", pat.h2 === 44 && pat.inCards === 43 && pat.cards === 43 && pat.inSpan === 0, JSON.stringify(pat));
    await page.goto(`${ORIGIN}/research`, { waitUntil: "networkidle" });
    const res = await page.evaluate((titles) => ({
      titles: titles.map((t) => [...document.querySelectorAll("main a[href^='/research/'] h2")].some((h) => h.textContent.trim() === t)),
      inSpan: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => h.parentElement?.closest("span")).length,
    }), REPORT_FACTS.map((r) => r.title));
    check("R12 /research: each report title is an <h2> inside its card link, none inside a <span>", res.titles.every(Boolean) && res.inSpan === 0, JSON.stringify(res));
    await context.close();
  });
}

// =====================================================================================
// R13: counts from data
// =====================================================================================
if (want("R13")) {
  await step("R13 counts on the home page and /research come from the data", async () => {
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const t = (await page.evaluate(() => document.querySelector("main").innerText)).replace(/\s+/g, " ");
    const nums = (re) => [...new Set([...t.matchAll(re)].map((m) => Number(m[1])))];
    const got = { patterns: nums(/\b(\d+) anti-patterns\b/g), scenarios: nums(/(?<!of )\b(\d+) scenarios\b/g), checks: nums(/\b(\d+) checks\b/g) };
    check(
      `R13 home: pattern, scenario and checklist counts are ${PATTERN_SLUGS.length}, ${MAX_SCENARIOS} and ${CHECKLIST_COUNT} (patterns.length, the largest totalScenarios, CHECKLIST_COUNT)`,
      JSON.stringify(got) === JSON.stringify({ patterns: [PATTERN_SLUGS.length], scenarios: [MAX_SCENARIOS], checks: [CHECKLIST_COUNT] }),
      JSON.stringify(got),
    );
    await page.goto(`${ORIGIN}/research`, { waitUntil: "networkidle" });
    const r = await page.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " "));
    check(`R13 /research says "The same ${MAX_SCENARIOS} scenarios"`, new RegExp(`\\bThe same ${MAX_SCENARIOS} scenarios\\b`).test(r), r.match(/[^.]*same[^.]*scenarios[^.]*/i)?.[0]);
    await context.close();
  });
}

// =====================================================================================
// R14: /checklist robustness and Reset/Undo
// =====================================================================================
if (want("R14")) {
  for (const stored of ["null", "[]"]) {
    await step(`R14 /checklist with a stored value of ${stored}`, async () => {
      const { page, context, cap } = await newPage();
      await page.goto(`${ORIGIN}/checklist`, { waitUntil: "networkidle" });
      await page.evaluate((v) => localStorage.setItem("inclusive-ai-checklist", v), stored);
      await page.reload({ waitUntil: "networkidle" });
      const hydrated = await page.getByRole("button", { name: "Print" }).waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
      const before = await boxState(page);
      if (before.length) await page.locator("[role=checkbox]").first().click({ timeout: 3000 }).catch(() => {});
      await sleep(200);
      const after = await boxState(page);
      const crashed = await page.evaluate(() => /couldn.t load|Application error|client-side exception/i.test(document.body.innerText));
      check(
        `R14 a stored ${stored} does not crash /checklist: 16 unchecked items, clicking one checks it, no page error`,
        hydrated && !crashed && cap.pageErrors.length === 0 && before.length === 16 && before.every((s) => s === "false") && after[0] === "true",
        JSON.stringify({ hydrated, crashed, errors: cap.pageErrors.slice(0, 1), before: before.length, first: after[0] }),
      );
      await context.close();
    });
  }

  await step("R14 Reset/Undo: focus moves between them, 44 px targets, no time limit, Undo goes on the next change", async () => {
    const { page, context } = await newPage({ width: 375, height: 800 });
    await checklistReady(page);
    const boxes = page.locator("[role=checkbox]");
    await boxes.nth(0).click();
    await boxes.nth(2).click();
    const reset = page.getByRole("button", { name: /^Reset\b/ });
    const undo = page.getByRole("button", { name: /^Undo\b/ });
    const resetH = (await reset.count()) ? (await reset.first().boundingBox())?.height : null;
    if (await reset.count()) await reset.first().click();
    await sleep(250);
    const afterReset = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
    const undoH = (await undo.count()) ? (await undo.first().boundingBox())?.height : null;
    check("R14 after Reset, focus is on Undo", /^Undo$/.test(afterReset), afterReset);
    check("R14 Reset and Undo are at least 44 px tall at 375 px", resetH >= 44 && undoH >= 44, JSON.stringify({ resetH, undoH }));
    await sleep(10500);
    const stillThere = (await undo.count()) > 0 && (await undo.first().isVisible());
    check("R14 Undo has no time limit: still there after 10.5 s", stillThere);
    if (stillThere) await undo.first().click();
    await sleep(250);
    const afterUndo = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
    check("R14 after Undo, focus is on Reset (and the checks are back)", /^Reset$/.test(afterUndo) && (await boxState(page)).filter((s) => s === "true").length === 2, afterUndo);
    if (await reset.count()) await reset.first().click();
    await sleep(200);
    const shownAgain = (await undo.count()) > 0;
    await boxes.nth(5).click();
    await sleep(250);
    check("R14 Undo goes away on the next change (a toggle)", shownAgain && (await undo.count()) === 0, JSON.stringify({ shownAgain, after: await undo.count() }));
    await context.close();
  });

  await step("R14 the skip link is hidden in print", async () => {
    const { page, context } = await newPage();
    await context.addInitScript(HELPERS);
    await checklistReady(page);
    await page.emulateMedia({ media: "print" });
    const skip = await page.evaluate(() => {
      const a = [...document.querySelectorAll("body a")].find((x) => /^skip to (main )?content$/i.test(x.textContent.trim()));
      return a ? { exists: true, rendered: __d44.visible(a), display: getComputedStyle(a).display } : { exists: false };
    });
    check("R14 under emulateMedia('print') the skip link is not rendered", skip.exists && !skip.rendered, JSON.stringify(skip));
    await context.close();
  });
}

// =====================================================================================
// R15: header "Add to CI"
// =====================================================================================
const SOLID_PRIMARY = () => {
  const probe = document.createElement("div");
  probe.className = "bg-zinc-50";
  document.body.append(probe);
  const zinc50 = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const nav = document.querySelector('nav[aria-label="Main"]') ?? document.querySelector("body > nav");
  return [...document.querySelectorAll("a[href], button")]
    .filter((el) => !nav?.contains(el) && el.getClientRects().length > 0 && !/^skip to/i.test(el.textContent.trim()) && getComputedStyle(el).backgroundColor === zinc50 && zinc50 !== "rgba(0, 0, 0, 0)")
    .map((el) => el.textContent.trim().replace(/\s+/g, " ").slice(0, 40));
};

if (want("R15")) {
  for (const width of [1280, 375]) {
    await step(`R15 header "Add to CI" brings #quick-start to the top (${width} px)`, async () => {
      const { page, context } = await newPage({ width, height: 800 });
      const cta = mainNav(page).getByRole("link", { name: "Add to CI" });
      const measure = () =>
        page.evaluate(() => {
          const q = document.getElementById("quick-start")?.getBoundingClientRect();
          const nav = (document.querySelector('nav[aria-label="Main"]') ?? document.querySelector("body > nav"))?.getBoundingClientRect();
          return { top: q ? Math.round(q.top) : null, navBottom: nav ? Math.round(nav.bottom) : null, y: Math.round(window.scrollY), hash: location.hash, path: location.pathname };
        });
      const atTop = (m) => m.top !== null && m.top >= m.navBottom - 2 && m.top <= m.navBottom + 120;
      await page.goto(`${ORIGIN}/tools#quick-start`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 3000));
      await sleep(200);
      const before = await measure();
      if (await cta.count()) await cta.click();
      await sleep(700);
      const after = await measure();
      // Scrolled down, the section is far above the viewport; the URL already ends in #quick-start.
      check(`R15 at ${width} px, on /tools#quick-start scrolled down, the header "Add to CI" brings #quick-start to the top`, before.top < -800 && before.hash === "#quick-start" && atTop(after), JSON.stringify({ before, after }));
      // R15′: focus moves there too, so the next Tab continues from the Quick start.
      const focus = await page.evaluate(() => ({ id: document.activeElement?.id ?? null, tabindex: document.activeElement?.getAttribute("tabindex") ?? null }));
      await page.keyboard.press("Tab");
      const next = await page.evaluate(() => ({ inQuickStart: !!document.activeElement?.closest("#quick-start"), name: (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 40) }));
      check(`R15′ at ${width} px, after the header "Add to CI" on /tools, focus is on #quick-start-title (tabindex=-1) and the next Tab stays in the Quick start`, focus.id === "quick-start-title" && focus.tabindex === "-1" && next.inQuickStart, JSON.stringify({ focus, next }));
      // And from another page.
      await page.goto(`${ORIGIN}/patterns`, { waitUntil: "networkidle" });
      if (await cta.count()) await cta.click();
      await page.waitForURL("**/tools#quick-start", { timeout: 5000 }).catch(() => {});
      await sleep(700);
      const fromElsewhere = await measure();
      check(`R15 at ${width} px, from /patterns the header "Add to CI" lands on #quick-start at the top`, fromElsewhere.path === "/tools" && atTop(fromElsewhere), JSON.stringify(fromElsewhere));
      await context.close();
    });
  }

  await step("R15 the header CTA is outlined; each page has at most one solid primary button of its own", async () => {
    const { page, context } = await newPage();
    await context.addInitScript(HELPERS);
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const cta = await mainNav(page)
      .getByRole("link", { name: "Add to CI" })
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        const bg = __d44.rgba(cs.backgroundColor);
        const page = __d44.rgba(getComputedStyle(document.body).backgroundColor);
        return { bg: cs.backgroundColor, solid: bg[3] >= 0.9 && __d44.contrast(bg, page) >= 3, border: cs.borderTopWidth, borderColor: cs.borderTopColor, borderAlpha: __d44.rgba(cs.borderTopColor)[3] };
      })
      .catch(() => null);
    check("R15 the header 'Add to CI' is outlined (a visible border, no solid fill)", !!cta && !cta.solid && parseFloat(cta.border) >= 1 && cta.borderAlpha > 0, JSON.stringify(cta));
    const paths = await sitemapPaths();
    const over = [];
    for (const path of paths) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      const solid = await page.evaluate(SOLID_PRIMARY);
      if (solid.length > 1) over.push(`${path}: ${solid.join(", ")}`);
    }
    check(`R15 each of the ${paths.length} sitemap pages has at most one solid primary (bg-zinc-50) button outside the nav`, paths.length >= 50 && over.length === 0, over.slice(0, 4).join(" | "));
    await context.close();
  });
}

// =====================================================================================
// R16: copy feedback
// =====================================================================================
if (want("R16")) {
  await step("R16 a second click of the same Copy button is announced again", async () => {
    const { page, context } = await newPage();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    // Pin the button: once it says "Copied", a /^Copy/ name locator would move on to the next block.
    const first = page.getByRole("button", { name: /^Copy\b/ }).first();
    const found = (await first.count()) > 0;
    if (found) await first.evaluate((b) => b.setAttribute("data-d44-repeat", "1"));
    const btn = page.locator("[data-d44-repeat]");
    let seq = [];
    if (found) {
      await btn.evaluate((b) => {
        let n = b.parentElement;
        while (n && !n.querySelector('[role="status"]')) n = n.parentElement;
        n?.querySelector('[role="status"]')?.setAttribute("data-d44-status", "1");
      });
      await btn.click();
      await page.waitForFunction(() => /^Copied\b/.test(document.querySelector("[data-d44-status]")?.textContent ?? ""), null, { timeout: 2500 }).catch(() => {});
      await page.evaluate(() => {
        const st = document.querySelector("[data-d44-status]");
        window.__seq = [st?.textContent ?? null];
        if (st) new MutationObserver(() => window.__seq.push(st.textContent)).observe(st, { childList: true, subtree: true, characterData: true });
      });
      await btn.click();
      await sleep(600);
      seq = await page.evaluate(() => window.__seq);
    }
    const emptyAt = seq.indexOf("", 1);
    check(
      "R16 the status goes empty, then back to 'Copied …', on a second click (so it is announced again)",
      found && /^Copied\b/.test(seq[0] ?? "") && emptyAt > 0 && seq.slice(emptyAt + 1).some((s) => /^Copied\b/.test(s ?? "")),
      JSON.stringify(seq),
    );
    await context.close();
  });

  await step("R16 on a touch screen a refused copy says to use the browser's Copy", async () => {
    const { page, context } = await newPage({ width: 375, height: 800 }, { hasTouch: true, isMobile: true });
    await context.addInitScript(() => window.Clipboard && (Clipboard.prototype.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"))));
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    const btn = page.getByRole("button", { name: /^Copy\b/ }).first();
    let st = null;
    if (await btn.count()) {
      await btn.tap();
      await sleep(300);
      st = await btn.evaluate((b) => {
        let n = b.parentElement;
        while (n && !n.querySelector('[role="status"]')) n = n.parentElement;
        return { status: n?.querySelector('[role="status"]')?.textContent ?? "", around: n?.innerText ?? "" };
      });
    }
    check(
      "R16 coarse pointer: the refused-copy message says \"use your browser's Copy\", not Ctrl+C or ⌘C",
      coarse && !!st && /use your browser.s Copy/.test(st.status) && !/Ctrl\+C|⌘C/.test(st.status + st.around),
      JSON.stringify({ coarse, ...st }),
    );
    await context.close();
  });

  await step("R16 /checklist: a refused Copy as Markdown opens the preview, selects all of it, and scrolls it into view", async () => {
    const { page, context } = await newPage();
    await context.addInitScript(() => window.Clipboard && (Clipboard.prototype.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"))));
    await checklistReady(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const btn = page.getByRole("button", { name: /^Copy as Markdown\b/ }).first();
    const before = await page.evaluate(() => {
      const pre = [...document.querySelectorAll("main pre")].find((p) => /^- \[ \] /m.test(p.textContent));
      return pre ? { open: !!pre.closest("details")?.open, inView: pre.getBoundingClientRect().top < innerHeight } : null;
    });
    if (await btn.count()) await btn.click();
    await sleep(500);
    const st = await page.evaluate(() => {
      const pre = [...document.querySelectorAll("main pre")].find((p) => /^- \[ \] /m.test(p.textContent));
      if (!pre) return null;
      const r = pre.getBoundingClientRect();
      return { open: !!pre.closest("details")?.open, selected: (window.getSelection()?.toString() ?? "") === pre.textContent, inView: r.top < innerHeight && r.bottom > 0, top: Math.round(r.top) };
    });
    check(
      "R16 refused Copy as Markdown: the preview <details> opens, all its text is selected, and it is scrolled into view",
      !!before && !before.open && !before.inView && !!st && st.open && st.selected && st.inView,
      JSON.stringify({ before, after: st }),
    );
    await context.close();
  });
}

// R16′: compact Copy buttons (home hero install, a pattern's "safer alternative") show the hint below the button.
const REJECT_CLIPBOARD = () => window.Clipboard && (Clipboard.prototype.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError")));
const NO_CLIPBOARD = () => Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined, configurable: true });
const COMPACT = [
  ["/", /^Copy\b.*install command/],
  [`/patterns/${PATTERN_SLUGS[0]}`, /^Copy\b.*safer alternative/],
];

if (want("R16")) {
  for (const coarse of [false, true]) {
    await step(`R16′ compact Copy buttons: a refused copy shows the "Selected" hint below the button at 375 px${coarse ? " (touch screen)" : ""}`, async () => {
      const bad = [];
      const seen = [];
      for (const [path, name] of COMPACT) {
        const { page, context } = await newPage({ width: 375, height: 800 }, coarse ? { hasTouch: true, isMobile: true } : {});
        await context.addInitScript(HELPERS);
        await context.addInitScript(REJECT_CLIPBOARD);
        await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
        const btn = page.getByRole("button", { name }).first();
        if (!(await btn.count())) {
          bad.push(`${path}: no compact Copy button`);
          await context.close();
          continue;
        }
        await btn.evaluate((b) => b.setAttribute("data-d44-compact", "1"));
        const pinned = page.locator("[data-d44-compact]");
        await pinned.scrollIntoViewIfNeeded();
        if (coarse) await pinned.tap();
        else await pinned.click();
        await sleep(300);
        const st = await pinned.evaluate((b) => {
          let n = b.parentElement;
          while (n && ![...n.querySelectorAll("*")].some((e) => /^Selected\b/.test(e.textContent.trim()) && e.children.length === 0)) n = n.parentElement;
          const hint = n ? [...n.querySelectorAll("*")].find((e) => /^Selected\b/.test(e.textContent.trim()) && e.children.length === 0) : null;
          const hr = hint?.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return {
            text: hint?.textContent.trim() ?? null,
            visible: !!hint && __d44.visible(hint) && hr.width > 0,
            // R16″: in the normal flow under the button, not an absolute popover.
            inFlow: !!hint && !/absolute|fixed/.test(getComputedStyle(hint).position) && !/absolute|fixed/.test(getComputedStyle(hint.parentElement).position),
            below: !!hr && hr.top >= br.bottom - 1,
            inside: !!hr && hr.left >= 0 && hr.right <= innerWidth && hr.top >= 0 && hr.bottom <= innerHeight,
            hscroll: document.documentElement.scrollWidth > innerWidth,
          };
        });
        seen.push(`${path}: ${JSON.stringify(st.text)}`);
        const wording = coarse ? /use your browser.s Copy/.test(st.text ?? "") && !/Ctrl\+C|⌘C/.test(st.text ?? "") : /press (Ctrl\+C|⌘C)/.test(st.text ?? "");
        if (!(st.visible && st.inFlow && st.below && st.inside && !st.hscroll && wording)) bad.push(`${path}: ${JSON.stringify(st)}`);
        if (path === "/") await shot(page, `r16-home-hint-375${coarse ? "-touch" : ""}.png`);
        await context.close();
      }
      check(
        `R16′/R16″ ${coarse ? "touch screen" : "mouse"}, 375 px: on the home hero install and a pattern's "safer alternative", a refused copy shows a visible "Selected — ${coarse ? "use your browser's Copy" : "press Ctrl+C"}" hint in the flow under the button, inside the viewport`,
        bad.length === 0,
        bad.slice(0, 2).join(" | ") || seen.join(" | "),
      );
    });
  }

  for (const width of [320, 375]) {
    await step(`R16″ compact hint at ${width} px on the home hero and every pattern page: in the flow, not clipped by its card, not over the code`, async () => {
      const { page, context } = await newPage({ width, height: 800 });
      await context.addInitScript(HELPERS);
      await context.addInitScript(REJECT_CLIPBOARD);
      const targets = [["/", /^Copy\b.*install command/], ...PATTERN_SLUGS.map((slug) => [`/patterns/${slug}`, /^Copy\b.*safer alternative/])];
      const bad = [];
      let measured = 0;
      for (const [path, name] of targets) {
        await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
        const btn = page.getByRole("button", { name }).first();
        if (!(await btn.count())) {
          bad.push(`${path}: no compact Copy button`);
          continue;
        }
        await btn.evaluate((b) => b.setAttribute("data-d44-hint", "1"));
        const pinned = page.locator("[data-d44-hint]");
        await pinned.scrollIntoViewIfNeeded();
        await pinned.click();
        await sleep(200);
        const st = await pinned.evaluate((b) => {
          let wrap = b.parentElement;
          while (wrap && ![...wrap.querySelectorAll("*")].some((e) => /^Selected\b/.test(e.textContent.trim()) && e.children.length === 0)) wrap = wrap.parentElement;
          const hint = wrap ? [...wrap.querySelectorAll("*")].find((e) => /^Selected\b/.test(e.textContent.trim()) && e.children.length === 0) : null;
          if (!hint) return { hint: false };
          const hr = hint.getBoundingClientRect();
          // The nearest ancestor that clips (overflow other than visible).
          let clip = hint.parentElement;
          while (clip && clip !== document.body && !/(hidden|clip|auto|scroll)/.test(getComputedStyle(clip).overflowX + getComputedStyle(clip).overflowY)) clip = clip.parentElement;
          const cr = (clip && clip !== document.body ? clip : document.documentElement).getBoundingClientRect();
          const inside = hr.left >= cr.left - 0.5 && hr.right <= cr.right + 0.5 && hr.top >= cr.top - 0.5 && hr.bottom <= cr.bottom + 0.5;
          // The code nearby: every pre/code in the nearest ancestor that has any.
          let box = b.parentElement;
          while (box && box !== document.body && !box.querySelector("pre, code")) box = box.parentElement;
          const codes = box ? [...box.querySelectorAll("pre, code")].filter((c) => !c.contains(hint)) : [];
          const overlaps = codes.filter((c) => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && hr.left < r.right && hr.right > r.left && hr.top < r.bottom && hr.bottom > r.top;
          }).length;
          return {
            hint: true,
            visible: __d44.visible(hint) && hr.width > 0 && hr.height > 0,
            inFlow: !/absolute|fixed/.test(getComputedStyle(hint).position),
            inside,
            clipTag: clip?.tagName,
            overlaps,
            codes: codes.length,
            hscroll: document.documentElement.scrollWidth > innerWidth,
          };
        });
        measured += 1;
        if (!(st.hint && st.visible && st.inFlow && st.inside && st.overlaps === 0 && st.codes > 0 && !st.hscroll)) bad.push(`${path}: ${JSON.stringify(st)}`);
      }
      check(`R16″ at ${width} px, on the home hero and all ${targets.length - 1} pattern pages, the refused-copy hint is in the flow, fully inside its clipping card, clear of the code, with no horizontal scroll`, measured === targets.length && bad.length === 0, bad.slice(0, 3).join(" | "));
      await context.close();
    });
  }

  await step("R16″ a refused copy scrolls only when the selected text is entirely off screen", async () => {
    const { page, context } = await newPage({ width: 375, height: 800 });
    await context.addInitScript(NO_CLIPBOARD);
    await page.goto(`${ORIGIN}/patterns/identity-inference`, { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: /^Copy\b.*safer alternative/ }).first();
    let st = null;
    if (await btn.count()) {
      await btn.focus();
      await sleep(250);
      const before = await page.evaluate(() => Math.round(window.scrollY));
      await page.keyboard.press("Enter");
      await sleep(500);
      st = await btn.evaluate((b, y0) => {
        const nav = (document.querySelector('nav[aria-label="Main"]') ?? document.querySelector("body > nav"))?.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        return { y0, y1: Math.round(window.scrollY), navBottom: Math.round(nav?.bottom ?? 0), buttonTop: Math.round(r.top), focused: document.activeElement === b, selected: (window.getSelection()?.toString() ?? "").length };
      }, before);
    }
    check(
      "R16″ /patterns/identity-inference at 375 px, no clipboard: Enter on the focused 'Copy safer alternative' selects the code without moving the page, and the button stays clear of the nav",
      !!st && st.y1 === st.y0 && st.buttonTop >= st.navBottom && st.navBottom > 0 && st.selected > 0,
      JSON.stringify(st),
    );
    await context.close();
  });

  for (const [mode, init] of [["writeText rejects", REJECT_CLIPBOARD], ["navigator.clipboard is missing", NO_CLIPBOARD]]) {
    await step(`R16′ a second refused copy is announced again (${mode})`, async () => {
      const { page, context } = await newPage({ width: 375, height: 800 });
      await context.addInitScript(init);
      await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
      const missing = await page.evaluate(() => !navigator.clipboard);
      const btn = page.getByRole("button", { name: /^Copy\b.*install command/ }).first();
      let seq = [];
      if (await btn.count()) {
        await btn.evaluate((b) => {
          b.setAttribute("data-d44-refuse", "1");
          let n = b.parentElement;
          while (n && !n.querySelector('[role="status"]')) n = n.parentElement;
          n?.querySelector('[role="status"]')?.setAttribute("data-d44-status2", "1");
        });
        const pinned = page.locator("[data-d44-refuse]");
        await pinned.click();
        await sleep(300);
        // Record every change to the status (each mutation record, not just the text when the observer
        // runs): with a synchronous failure the empty state and the new message land in the same task.
        await page.evaluate(() => {
          const st = document.querySelector("[data-d44-status2]");
          window.__recs = [];
          if (st)
            new MutationObserver((recs) => {
              for (const r of recs) {
                if (r.type === "characterData") window.__recs.push(r.target.textContent === "" ? "emptied" : /^Couldn.t copy/.test(r.target.textContent) ? "filled" : "other");
                // "emptied" only if the status is still empty when the observer runs, i.e. the new message
                // did not arrive in the same task (R16″: the empty status gets its own task).
                for (const n of r.removedNodes) if (/^Couldn.t copy/.test(n.textContent ?? "")) window.__recs.push(st.textContent === "" ? "emptied" : "refilled-same-task");
                for (const n of r.addedNodes) if (/^Couldn.t copy/.test(n.textContent ?? "")) window.__recs.push("filled");
              }
            }).observe(st, { childList: true, subtree: true, characterData: true });
        });
        seq = [await page.evaluate(() => document.querySelector("[data-d44-status2]")?.textContent ?? null)];
        for (let k = 0; k < 2; k++) {
          await page.evaluate(() => window.__recs.push("click"));
          await pinned.click();
          await sleep(400);
        }
        seq = seq.concat(await page.evaluate(() => window.__recs));
        seq.push(await page.evaluate(() => document.querySelector("[data-d44-status2]")?.textContent ?? null));
      }
      const failed = (t) => /^Couldn.t copy\b/.test(t ?? "");
      // Each further click empties the status and fills it again.
      const clicks = seq.slice(1, -1).join(" ").split("click").slice(1).map((x) => x.trim());
      check(
        `R16′/R16″ ${mode}: on every click the status empties (staying empty past the click's task) and then says "Couldn't copy …" again, so each refusal can be announced`,
        (mode.includes("missing") ? missing : true) && failed(seq[0]) && failed(seq[seq.length - 1]) && clicks.length === 2 && clicks.every((c) => /(^| )emptied( .*)? filled( |$)/.test(c) && !/same-task/.test(c)),
        JSON.stringify({ missing, seq }),
      );
      await context.close();
    });
  }
}

// =====================================================================================
// R17′: Clear filters returns focus to the "All" chip
// =====================================================================================
if (want("R17")) {
  await step("R17′ /patterns: after Clear filters, focus is on the 'All' severity chip", async () => {
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/patterns`, { waitUntil: "networkidle" });
    const search = page.getByRole("searchbox");
    // R17′: focus goes to the "All" severity chip, not the search box (which would open a phone's keyboard).
    const onSearch = () => page.evaluate(() => !!document.activeElement?.matches("button[aria-pressed]") && /^All\b/.test(document.activeElement.textContent.trim()) && document.activeElement.getAttribute("aria-pressed") === "true");
    const results = [];
    if (await search.count()) {
      // From the empty state.
      await search.fill("zzqv-no-such-pattern");
      await settle(page, () => document.querySelectorAll("main a[href^='/patterns/']").length === 0);
      const empty = page.locator("main").getByRole("button", { name: "Clear filters" }).last();
      await empty.click();
      await sleep(250);
      results.push(["empty state", await onSearch()]);
      // From the count row, with a severity chip pressed.
      await page.locator("main button[aria-pressed]", { hasText: /^\s*Critical\b/i }).first().click();
      await sleep(250);
      await page.locator("main").getByRole("button", { name: "Clear filters" }).first().click();
      await sleep(250);
      results.push(["count row", await onSearch()]);
    }
    check("R17′ 'Clear filters' (empty state and count row) leaves focus on the pressed 'All' chip, not the search box", results.length === 2 && results.every(([, ok]) => ok), JSON.stringify(results));
    await context.close();
  });
}

// =====================================================================================
// R18: the social image (rendered PNG): discrete stripes
// =====================================================================================
if (want("R18")) {
  await step("R18 the social image's stripes are six discrete pride bands", async () => {
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const og = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null);
    const url = og ? `${ORIGIN}${new URL(og).pathname}${new URL(og).search}` : null;
    const sample = url
      ? await page.evaluate(async (src) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const cv = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
          const x = cv.getContext("2d", { willReadFrequently: true });
          x.drawImage(img, 0, 0);
          const band = img.naturalWidth / 6;
          const at = (px, py) => [...x.getImageData(Math.round(px), py, 1, 1).data].slice(0, 3);
          return { w: img.naturalWidth, h: img.naturalHeight, rows: [2, img.naturalHeight - 3].map((y) => Array.from({ length: 6 }, (_, k) => [0.2, 0.5, 0.8].map((f) => at(band * (k + f), y)))) };
        }, url)
      : null;
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const near = (a, b, t = 6) => a.every((v, i) => Math.abs(v - b[i]) <= t);
    const bad = [];
    for (const [ri, row] of (sample?.rows ?? []).entries()) {
      row.forEach((pts, k) => {
        if (!pts.every((p) => near(p, pts[0], 2))) bad.push(`${ri ? "bottom" : "top"} band ${k + 1} is not one colour: ${JSON.stringify(pts)}`);
        if (!near(pts[1], hex(PRIDE[k]))) bad.push(`${ri ? "bottom" : "top"} band ${k + 1} is ${JSON.stringify(pts[1])}, expected ${PRIDE[k]}`);
      });
    }
    check("R18 the rendered social image (top and bottom stripes) shows the six pride colours as flat, discrete bands", !!sample && sample.rows.length === 2 && bad.length === 0, bad.slice(0, 3).join(" | ") || `${sample?.w}×${sample?.h}`);
    await context.close();
  });
}

// =====================================================================================
// R19: footer link targets
// =====================================================================================
if (want("R19")) {
  await step("R19 footer links are at least 44 px tall at 375 px", async () => {
    const { page, context } = await newPage({ width: 375, height: 800 });
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const links = await page.$$eval("footer a", (as) => as.map((a) => ({ name: a.textContent.trim().slice(0, 30), h: Math.round(a.getBoundingClientRect().height * 10) / 10 })));
    const small = links.filter((l) => l.h < 44);
    check(`R19 all ${links.length} footer links are at least 44 px tall at 375 px`, links.length >= 6 && small.length === 0, JSON.stringify(small.length ? small : links.slice(0, 3)));
    await context.close();
  });
}

// ---------- wrap-up ----------
await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(EVIDENCE, "site-d44-results.json"), JSON.stringify({ origin: ORIGIN, at: new Date().toISOString(), results, observations }, null, 2));
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} checks passed; ${failed.length} failed.`);
for (const f of failed) console.log(`  FAILED: ${f.name}  [${String(f.detail).slice(0, 300)}]`);
for (const o of observations) console.log(`  NOTE: ${o}`);
process.exit(failed.length > 0 ? 1 : 0);
