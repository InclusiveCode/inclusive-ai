// Follow-up e2e checks for PR #7 (decision D41, items F1–F9). Independent verification; not run in CI.
//
// Usage (port 3921 is the verifier's port; any provider call is answered by a test double):
//   cd site && npm run build && npx next start -p 3921 &
//   SITE_URL=http://localhost:3921 AXE_PATH=/path/to/axe.min.js EVIDENCE_DIR=/path/to/evidence \
//     node tests/e2e/site-followup-smoke.mjs
//
// Optional:
//   MATRIX_OUT=/path/out.json      write the simulated UI result matrix (F3) to a file
//   MATRIX_EXPECT=/path/in.json    compare against a matrix (default: tests/e2e/fixtures/sim-ui-matrix-d49.json)
//   SKIP_MATRIX=1                  skip the 480-run simulated sweep
//   ONLY=F1,F3                     run only these sections
//
// Requirements are from D41 and PR #7's description, not from the implementation's unit tests.
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
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

const ORIGIN = process.env.SITE_URL ?? "http://localhost:3921";
const LAB = `${ORIGIN}/lab`;
const EVIDENCE = process.env.EVIDENCE_DIR ?? "/tmp/site-followup-evidence";
const AXE_PATH = process.env.AXE_PATH;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const MATRIX_EXPECT = process.env.MATRIX_EXPECT ?? new URL("./fixtures/sim-ui-matrix-d49.json", import.meta.url).pathname;
mkdirSync(EVIDENCE, { recursive: true });
const want = (k) => !ONLY || ONLY.has(k);

const ANT_KEY = "sk-ant-test-VerifierFakeKeyNotRealAbcdefghij";
const OAI_KEY = "sk-test-VerifierFakeKeyNotRealKlmnopqrst";

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

// ---------- scenario facts, read from the product source ----------
const SCEN_SRC = readFileSync(new URL("../../lib/lab/scenarios.ts", import.meta.url), "utf8");
const SCENARIOS = [...SCEN_SRC.matchAll(/id: "([a-z-]+)",\s*version: "[^"]+",\s*title: "([^"]+)",[\s\S]*?baselineInstruction:\s*"([^"]+)"/g)].map((m) => ({ id: m[1], title: m[2], baseline: m[3] }));
const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
const byTitle = Object.fromEntries(SCENARIOS.map((s) => [s.title, s]));
const SIM_SRC = readFileSync(new URL("../../lib/lab/simulator.ts", import.meta.url), "utf8");
const SNIPPETS = [...SIM_SRC.matchAll(/id: "((?:FIX|OVER)-[A-Z]+)",\s*snippet: "([^"]+)"/g)].map((m) => ({ id: m[1], snippet: m[2] }));
const FAULTS = ["none", "model_error", "timeout", "credentials_unavailable", "malformed_result"];
check("SETUP read 3 scenarios and 5 snippet rules from the product source", SCENARIOS.length === 3 && SNIPPETS.length === 5, `${SCENARIOS.map((s) => s.id)} | ${SNIPPETS.map((s) => s.id)}`);

// ---------- browsers ----------
const browser = await chromium.launch({ headless: true });
let bfBrowser = null;
try {
  // The new headless mode with Playwright's --disable-back-forward-cache dropped supports the back/forward cache.
  bfBrowser = await chromium.launch({ headless: true, channel: "chromium", ignoreDefaultArgs: ["--disable-back-forward-cache"] });
} catch (e) {
  observe(`back/forward-cache browser unavailable: ${String(e).slice(0, 160)}`);
}

let axeSource = null;
if (AXE_PATH && existsSync(AXE_PATH)) axeSource = readFileSync(AXE_PATH, "utf8");

async function newPage(b = browser, viewport = { width: 1280, height: 900 }) {
  const context = await b.newContext({ viewport });
  const page = await context.newPage();
  const cap = { console: [], pageErrors: [], api: [], context };
  page.on("console", (m) => cap.console.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => cap.pageErrors.push(String(e)));
  return { page, cap, context };
}

/** A test double for /api/lab/run: the provider is never called. */
async function liveDouble(page, cap, reply) {
  cap.reply = reply;
  await page.route("**/api/lab/run", async (route) => {
    let body = null;
    try {
      body = JSON.parse(route.request().postData() ?? "");
    } catch {}
    cap.api.push({ body, auth: route.request().headers().authorization ?? null });
    const r = cap.reply(body);
    await route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.json) }).catch(() => {});
  });
}
const okReply = (body) => ({ json: { status: "ok", text: "Happy to help, Jordan Lee. Thanks for reaching out.", returnedModel: `${body?.model}-2099`, stopReason: "end_turn", durationMs: 5 } });

// ---------- lab state, as the page shows it ----------
/**
 * Everything that says which state the lab is in, read from the page:
 * - the scenario: the card styled as selected and the instruction label (both rendered from state);
 * - the mode: whether the live panel exists and whether the fault select is disabled (from state);
 * - the instruction: the character counter (from state) against the textarea's own value;
 * and what the form controls show (the checked radios, the textarea).
 */
async function labState(page) {
  return page.evaluate(() => {
    const checked = (name) => document.querySelector(`input[type=radio][name="${name}"]:checked`)?.value ?? null;
    const card = [...document.querySelectorAll("input[type=radio][name=scenario]")].find((r) => r.closest("label")?.className.includes("border-sky-400"));
    const label = document.querySelector("label[for=lab-instruction]")?.textContent ?? "";
    const ta = document.querySelector("#lab-instruction");
    const count = Number(/^(\d+) \//.exec(document.querySelector("#lab-instruction-count")?.textContent ?? "")?.[1] ?? NaN);
    return {
      stateTitle: /“(.*)”/.exec(label)?.[1] ?? null,
      stateCard: card?.value ?? null,
      stateLive: !!document.querySelector("#lab-live-key"),
      faultDisabled: document.querySelector("#lab-fault")?.disabled ?? null,
      stateCount: count,
      radioScenario: checked("scenario"),
      radioSource: checked("response-source"),
      textarea: ta?.value ?? null,
      readOnly: ta?.readOnly ?? null,
    };
  });
}
function consistent(st) {
  const s = byTitle[st.stateTitle];
  return (
    !!s &&
    st.radioScenario === s.id &&
    st.stateCard === s.id &&
    (st.radioSource === "live") === st.stateLive &&
    st.faultDisabled === st.stateLive &&
    st.textarea !== null &&
    st.textarea.length === st.stateCount
  );
}
const describe = (st) => JSON.stringify({ ...st, textarea: st.textarea ? `${st.textarea.slice(0, 40)}… (${st.textarea.length})` : st.textarea });
async function waitHydrated(page) {
  await page.waitForFunction(() => {
    const ta = document.querySelector("#lab-instruction");
    return !!ta && !ta.readOnly;
  }, null, { timeout: 30000 });
}
let runCounter = new Map();
async function rerunAndWait(page, scenarioId) {
  const n = (runCounter.get(page) ?? {})[scenarioId] ?? 0;
  await page.getByRole("button", { name: "Rerun", exact: true }).click();
  await page.waitForFunction((k) => [...document.querySelectorAll("[role=status]")].some((s) => (s.textContent ?? "").includes(`Run ${k} complete`)), n + 1, { timeout: 20000 });
  runCounter.set(page, { ...(runCounter.get(page) ?? {}), [scenarioId]: n + 1 });
}
const instructionUsed = (page) =>
  page.evaluate(() => {
    const p = [...document.querySelectorAll("section[aria-labelledby=inspect] p")].find((x) => (x.textContent ?? "").trim() === "Instruction used");
    return p?.nextElementSibling?.textContent ?? null;
  });

// =====================================================================================
// F1: the visible controls always equal the state that runs
// =====================================================================================
async function f1Back({ label, b, fullDocument, expectBfcache = false }) {
  const { page, cap, context } = await newPage(b);
  runCounter.set(page, {});
  await page.goto(LAB, { waitUntil: "networkidle" });
  await waitHydrated(page);
  // The PO's repro: pick the speaker-bio scenario, select Live, leave via Tools, come back.
  await page.locator("input[name=scenario][value=stated-identity]").check();
  await page.locator("input[name=response-source][value=live]").check();
  const extra = "\nVERIFIER-EDIT: keep bios short.";
  await page.locator("#lab-instruction").focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(extra);
  const before = await labState(page);
  check(`F1 ${label}: before leaving, controls equal state (speaker bio, Live, edited)`, consistent(before) && before.radioScenario === "stated-identity" && before.stateLive && before.textarea.endsWith(extra), describe(before));
  await page.evaluate(() => {
    window.__verifierMarker = "kept";
    window.addEventListener("pageshow", (e) => (window.__persisted = e.persisted));
  });
  if (fullDocument) {
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    await page.goBack({ waitUntil: "commit" });
  } else {
    await page.locator('body > nav a[href="/tools"]').first().click();
    await page.waitForURL("**/tools");
    await page.goBack({ waitUntil: "commit" });
  }
  // A back/forward-cache restore fires no load event, so wait only for the URL to commit.
  await page.waitForURL("**/lab", { waitUntil: "commit" });
  await page.locator("#lab-instruction").waitFor();
  await waitHydrated(page);
  await sleep(500);
  const nav = await page.evaluate(() => ({ sameDocument: window.__verifierMarker === "kept", persisted: window.__persisted ?? null }));
  const after = await labState(page);
  const how = !fullDocument ? "same document, client-side" : nav.sameDocument ? "restored from the back/forward cache" : "document reloaded";
  check(`F1 ${label}: after Back, every control equals the state (${how})`, consistent(after), describe(after));
  if (expectBfcache) check(`F1 ${label}: the page really came back from the back/forward cache (pageshow persisted)`, nav.sameDocument && nav.persisted === true, JSON.stringify(nav));
  if (fullDocument && !expectBfcache) check(`F1 ${label}: the document really was reloaded (not the back/forward cache)`, !nav.sameDocument, JSON.stringify(nav));
  // The instruction that runs is exactly the visible text (simulated, so no request is involved).
  if (after.stateLive) {
    await page.locator("input[name=response-source][value=simulated]").check();
  }
  const visible = await page.locator("#lab-instruction").inputValue();
  const s = byTitle[after.stateTitle];
  await rerunAndWait(page, s.id);
  const used = await instructionUsed(page);
  check(`F1 ${label}: Rerun runs exactly the visible instruction`, used === visible, `${JSON.stringify((used ?? "").slice(-40))} vs ${JSON.stringify(visible.slice(-40))}`);
  await context.close();
}

if (want("F1")) {
  await step("F1 client-side navigation to Tools and Back", () => f1Back({ label: "client-side nav + Back", b: browser, fullDocument: false }));
  await step("F1 full-document navigation and Back (no bfcache)", () => f1Back({ label: "full-document nav + Back, no bfcache", b: browser, fullDocument: true }));
  if (bfBrowser) await step("F1 full-document navigation and Back (bfcache)", () => f1Back({ label: "full-document nav + Back, bfcache", b: bfBrowser, fullDocument: true, expectBfcache: true }));

  await step("F1 clicks before hydration are adopted; typing is blocked until hydrated", async () => {
    for (const variant of ["scenario + Live", "fault (simulated)"]) {
      const { page, cap, context } = await newPage();
      runCounter.set(page, {});
      let release;
      const gate = new Promise((r) => (release = r));
      let held = 0;
      // Hold back only the scripts (not the stylesheets), so the server markup renders but cannot hydrate.
      await page.route("**/_next/static/chunks/**", async (route) => {
        if (route.request().resourceType() !== "script") return route.continue().catch(() => {});
        held += 1;
        await gate;
        await route.continue().catch(() => {});
      });
      await page.goto(LAB, { waitUntil: "commit" });
      await page.locator("#lab-instruction").waitFor({ state: "attached" });
      await sleep(300);
      const pre = await labState(page);
      check(`F1 pre-hydration (${variant}): scripts are held and the server markup is showing (textarea read-only)`, held > 0 && pre.readOnly === true, JSON.stringify({ held, readOnly: pre.readOnly }));
      const typed = "TYPED-BEFORE-HYDRATION";
      if (variant === "scenario + Live") {
        await page.locator("input[name=scenario][value=stated-identity]").check();
        await page.locator("input[name=response-source][value=live]").check();
      } else {
        await page.locator("#lab-fault").selectOption("timeout");
      }
      await page.locator("#lab-instruction").focus();
      await page.keyboard.type(typed);
      const blocked = await page.locator("#lab-instruction").inputValue();
      check(`F1 pre-hydration (${variant}): typing into the instruction is blocked`, !blocked.includes(typed), blocked.slice(0, 60));
      release();
      await waitHydrated(page);
      await sleep(500);
      const st = await labState(page);
      check(`F1 pre-hydration (${variant}): after hydration every control equals the state`, consistent(st), describe(st));
      if (variant === "scenario + Live") {
        check("F1 pre-hydration: the scenario click was adopted (speaker bio is the state)", st.stateTitle === byId["stated-identity"].title && st.radioScenario === "stated-identity", describe(st));
        check("F1 pre-hydration: the Live click was adopted (live panel shown)", st.stateLive && st.radioSource === "live", describe(st));
        check("F1 pre-hydration: the instruction is the speaker-bio baseline, without the blocked typing", st.textarea === byId["stated-identity"].baseline, st.textarea?.slice(0, 60));
        // Typing works once hydrated, and a live run sends exactly the visible text.
        await page.locator("#lab-instruction").focus();
        await page.keyboard.press("Control+End");
        await page.keyboard.type(" Use their name.");
        const visible = await page.locator("#lab-instruction").inputValue();
        check("F1 typing works after hydration", visible.endsWith(" Use their name."));
        await liveDouble(page, cap, okReply);
        await page.locator("#lab-live-key").fill(ANT_KEY);
        await page.getByRole("button", { name: "Rerun", exact: true }).click();
        await page.waitForFunction(() => [...document.querySelectorAll("[role=status]")].some((s) => /Run 1 complete/.test(s.textContent ?? "")), null, { timeout: 15000 });
        check("F1 a live Rerun sends exactly the visible instruction for the visible scenario", cap.api.length === 2 && cap.api.every((r) => r.body?.instruction === visible && r.body?.scenarioId === "stated-identity"), JSON.stringify(cap.api.map((r) => [r.body?.scenarioId, (r.body?.instruction ?? "").slice(-20)])));
      } else {
        const fault = await page.locator("#lab-fault").inputValue();
        check("F1 pre-hydration: the fault choice was adopted and is what runs", fault === "timeout", fault);
        await rerunAndWait(page, "spouse-parity");
        const inspect = await page.locator("section[aria-labelledby=inspect]").innerText();
        check("F1 the run used the adopted fault (Version B timed out)", /Fault injected\s+timeout/.test(inspect) && inspect.includes("Timed out — not evaluated"), inspect.slice(-300).replace(/\n/g, " "));
      }
      await context.close();
    }
  });

  await step("F1 a late restoration followed by pageshow (persisted) is forced back to state", async () => {
    const { page, context } = await newPage();
    await page.goto(LAB, { waitUntil: "networkidle" });
    await waitHydrated(page);
    const before = await labState(page);
    // Simulate a browser restoring stale form values after hydration.
    await page.evaluate(() => {
      for (const r of document.querySelectorAll("input[name=scenario]")) r.checked = r.value === "disclosure-boundary";
      for (const r of document.querySelectorAll("input[name=response-source]")) r.checked = r.value === "live";
      document.querySelector("#lab-instruction").value = "STALE RESTORED TEXT";
      document.querySelector("#lab-fault").value = "timeout";
    });
    const stale = await labState(page);
    check("F1 (control) the simulated restoration really desynchronised the controls", !consistent(stale), describe(stale));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await sleep(200);
    const after = await labState(page);
    const fault = await page.locator("#lab-fault").inputValue();
    check("F1 after pageshow (persisted) every control is forced back to the state", consistent(after) && after.radioScenario === before.radioScenario && after.textarea === before.textarea && fault === "none", describe(after));
    await context.close();
  });
}

// =====================================================================================
// F2: run alerts name the run they belong to
// =====================================================================================
if (want("F2")) {
  await step("F2 run labels follow the displayed run, through a provider switch and key errors", async () => {
    const { page, cap, context } = await newPage();
    await page.goto(LAB, { waitUntil: "networkidle" });
    await waitHydrated(page);
    await liveDouble(page, cap, okReply);
    await page.locator("input[name=response-source][value=live]").check();
    await page.locator("#lab-live-key").fill(ANT_KEY);
    const alerts = () => page.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=edit] [role=alert]:not(#lab-live-key-error)")].map((a) => (a.textContent ?? "").trim()));
    const keyAlert = () => page.locator("#lab-live-key-error").innerText().catch(() => null);
    const run = async (n, reply) => {
      cap.reply = reply;
      await page.getByRole("button", { name: "Run baseline live" }).click();
      await page.waitForFunction((k) => [...document.querySelectorAll("[role=status]")].some((s) => (s.textContent ?? "").includes(`Run ${k} complete`)), n, { timeout: 15000 });
    };
    await run(1, () => ({ json: { status: "timeout", durationMs: 30000 } }));
    await run(2, () => ({ json: { status: "credentials_unavailable", error: "The provider rejected the API key", durationMs: 5 } }));
    await run(3, okReply);
    check("F2 an all-ok run has no alert", (await alerts()).length === 0, JSON.stringify(await alerts()));
    await page.locator("input[name=view-run][value=spouse-parity-run-1]").check();
    check("F2 showing run 1: 'Run 1: Live request timed out — not evaluated'", JSON.stringify(await alerts()) === JSON.stringify(["Run 1: Live request timed out — not evaluated"]), JSON.stringify(await alerts()));
    await page.locator("input[name=view-run][value=spouse-parity-run-2]").check();
    const r2 = ["Run 2: Credentials unavailable — not evaluated (The provider rejected the API key)"];
    check("F2 showing run 2: its own label and alert", JSON.stringify(await alerts()) === JSON.stringify(r2), JSON.stringify(await alerts()));
    // A provider switch clears the key; the run 2 alert stays labelled as run 2.
    await page.locator("#lab-live-provider").selectOption("openai");
    check("F2 after a provider switch the alert still names run 2 (the run on screen)", JSON.stringify(await alerts()) === JSON.stringify(r2), JSON.stringify(await alerts()));
    // A key error (no key) adds the key-field alert; the run alert is unchanged.
    await page.getByRole("button", { name: "Run baseline live" }).click();
    await sleep(300);
    check("F2 a key error shows its own alert and leaves the run 2 alert unchanged", (await keyAlert()) === "Enter your API key to run live." && JSON.stringify(await alerts()) === JSON.stringify(r2), JSON.stringify({ key: await keyAlert(), run: await alerts() }));
    await page.locator("#lab-live-key").fill(ANT_KEY);
    await page.getByRole("button", { name: "Run baseline live" }).click();
    await sleep(300);
    check("F2 a provider-mismatch key error leaves the run 2 alert unchanged", ((await keyAlert()) ?? "").startsWith("This key does not match the selected provider") && JSON.stringify(await alerts()) === JSON.stringify(r2), JSON.stringify({ key: await keyAlert(), run: await alerts() }));
    // The precomputed baseline is simulated: no live alert at all.
    await page.locator("input[name=view-run][value=baseline]").check();
    check("F2 showing the baseline run: no live run alert", (await alerts()).length === 0, JSON.stringify(await alerts()));
    const radioLabel = await page.locator("input[name=view-run][value=baseline]").evaluate((el) => (el.parentElement?.textContent ?? "").trim());
    check("F2 the baseline is called 'Baseline run' in Show run (the label used for it)", radioLabel === "Baseline run", radioLabel);
    await context.close();
  });
}

// =====================================================================================
// F3: "Running…" paints before the evaluation; results unchanged
// =====================================================================================
async function signature(page) {
  return page.evaluate(() => {
    const f = document.querySelector("section[aria-labelledby=findings]")?.innerText ?? "";
    const i = (document.querySelector("section[aria-labelledby=inspect]")?.innerText ?? "").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<time>");
    return `${f}\n----\n${i}`;
  });
}
if (want("F3")) {
  await step("F3 'Running…' is painted before the evaluation (simulated runs)", async () => {
    const { page, context } = await newPage();
    await page.goto(LAB, { waitUntil: "networkidle" });
    await waitHydrated(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.evaluate(() => {
      window.__events = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (e.interactionId) window.__events.push({ name: e.name, duration: e.duration, processing: e.processingEnd - e.processingStart, id: e.interactionId });
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    });
    const painted = [];
    for (let k = 1; k <= 3; k++) {
      await page.evaluate(() => {
        window.__frames = [];
        const loop = () => {
          window.__frames.push([...document.querySelectorAll("[role=status]")].map((s) => s.textContent).join("|"));
          if (window.__frames.length < 2000) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      await sleep(100);
      await page.getByRole("button", { name: "Rerun", exact: true }).click();
      await page.waitForFunction((n) => [...document.querySelectorAll("[role=status]")].some((s) => (s.textContent ?? "").includes(`Run ${n} complete`)), k, { timeout: 30000 });
      await sleep(100);
      const frames = await page.evaluate(() => window.__frames);
      painted.push(frames.some((f) => f.includes("Running…")));
    }
    check("F3 for each of 3 simulated reruns, a frame showing 'Running…' is painted before the result", painted.every(Boolean), JSON.stringify(painted));
    await sleep(300);
    const ev = await page.evaluate(() => window.__events);
    const clicks = ev.filter((e) => e.name === "click" || e.name === "pointerup" || e.name === "pointerdown");
    const byInteraction = {};
    for (const e of clicks) byInteraction[e.id] = Math.max(byInteraction[e.id] ?? 0, e.processing);
    observe(`F3 timing at 4× CPU: Rerun click handler processing per interaction (ms): ${Object.values(byInteraction).map((x) => Math.round(x)).join(", ") || "(no entries ≥ 16 ms)"}`);
    await context.close();
  });

  if (process.env.SKIP_MATRIX !== "1") {
    await step("F3 simulated results through the page are unchanged: 3 scenarios × 32 snippet sets × 5 faults", async () => {
      const { page, context } = await newPage();
      await page.goto(LAB, { waitUntil: "networkidle" });
      await waitHydrated(page);
      const rows = {};
      const t0 = Date.now();
      for (const s of SCENARIOS) {
        await page.locator(`input[name=scenario][value=${s.id}]`).check();
        let n = 0;
        for (let mask = 0; mask < 32; mask++) {
          const picked = SNIPPETS.filter((_, i) => mask & (1 << i));
          const instruction = [s.baseline, ...picked.map((x) => x.snippet)].join("\n");
          await page.locator("#lab-instruction").fill(instruction);
          for (const fault of FAULTS) {
            await page.locator("#lab-fault").selectOption(fault);
            await page.getByRole("button", { name: "Rerun", exact: true }).click();
            n += 1;
            await page.waitForFunction((k) => [...document.querySelectorAll("[role=status]")].some((x) => (x.textContent ?? "").includes(`Run ${k} complete`)), n, { timeout: 30000 });
            const sig = await signature(page);
            rows[`${s.id}|${picked.map((x) => x.id).join("+") || "baseline"}|${fault}`] = createHash("sha256").update(sig).digest("hex").slice(0, 24);
          }
        }
      }
      observe(`F3 matrix sweep: ${Object.keys(rows).length} runs through the page in ${Math.round((Date.now() - t0) / 1000)} s`);
      if (process.env.MATRIX_OUT) writeFileSync(process.env.MATRIX_OUT, JSON.stringify({ origin: ORIGIN, rowCount: Object.keys(rows).length, rows }, null, 1) + "\n");
      if (existsSync(MATRIX_EXPECT)) {
        const base = JSON.parse(readFileSync(MATRIX_EXPECT, "utf8"));
        const diff = Object.keys(base.rows).filter((k) => rows[k] !== base.rows[k]);
        check(`F3 all ${Object.keys(rows).length} simulated runs show the same findings, statuses, and metadata as before F3 (${base.source ?? "fixture"})`, Object.keys(rows).length === 480 && base.rowCount === 480 && diff.length === 0, diff.slice(0, 5).join(" | "));
      } else observe(`F3 no matrix fixture at ${MATRIX_EXPECT}; comparison skipped`);
      await context.close();
    });
  }
}

// =====================================================================================
// F4: every route has its own title
// =====================================================================================
const ROUTES_MAIN = ["/", "/lab", "/checklist", "/patterns", "/registry", "/research", "/tools"];
async function routeList() {
  const html = (await (await fetch(`${ORIGIN}/patterns`)).text()) + (await (await fetch(`${ORIGIN}/research`)).text());
  const slugs = [...new Set([...html.matchAll(/href="(\/(?:patterns|research)\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
  return [...ROUTES_MAIN, ...slugs];
}
if (want("F4")) {
  await step("F4 every route has its own page title", async () => {
    const routes = await routeList();
    const titles = {};
    for (const r of routes) {
      const html = await (await fetch(`${ORIGIN}${r}`)).text();
      const all = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'"));
      titles[r] = all;
    }
    const single = Object.values(titles).every((t) => t.length === 1 && t[0].trim().length > 0);
    check(`F4 each of ${routes.length} routes renders exactly one non-empty <title>`, routes.length > 40 && single, JSON.stringify(Object.entries(titles).filter(([, t]) => t.length !== 1)));
    const flat = Object.entries(titles).map(([r, t]) => [r, t[0]]);
    const dupes = flat.filter(([, t], i) => flat.findIndex(([, u]) => u === t) !== i);
    check("F4 every route's title is unique", dupes.length === 0, JSON.stringify(dupes.slice(0, 5)));
    const off = flat.filter(([r, t]) => r !== "/" && !t.endsWith(" — InclusiveCode"));
    check("F4 every route but the home page uses '<page> — InclusiveCode'", off.length === 0, JSON.stringify(off.slice(0, 5)));
    observe(`F4 titles: ${ROUTES_MAIN.map((r) => `${r} = "${titles[r][0]}"`).join("; ")}`);
    // An unknown URL: a real 404 with its own title.
    const nf = await fetch(`${ORIGIN}/no-such-page-verifier`);
    const nfTitles = [...(await nf.text()).matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
    check("F4 an unknown URL returns 404 with the title 'Page not found — InclusiveCode' (distinct from every route)", nf.status === 404 && nfTitles.length === 1 && nfTitles[0] === "Page not found — InclusiveCode" && !flat.some(([, t]) => t === nfTitles[0]), JSON.stringify({ status: nf.status, nfTitles }));
    // Client-side navigation updates document.title too.
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const seen = [];
    for (const href of ["/patterns", "/checklist", "/registry", "/research", "/tools", "/lab"]) {
      await page.locator(`body > nav a[href="${href}"]`).first().click();
      await page.waitForURL(`**${href}`);
      await page.waitForFunction((t) => document.title === t, titles[href][0], { timeout: 5000 }).catch(() => {});
      seen.push([href, await page.title()]);
    }
    const bad = seen.filter(([h, t]) => t !== titles[h][0]);
    check("F4 client-side navigation sets each route's own title", bad.length === 0, JSON.stringify(bad));
    await context.close();
  });
}

// =====================================================================================
// F5: computed text contrast ≥ 4.5:1 (3:1 for large text); /checklist checkbox border ≥ 3:1
// =====================================================================================
const CONTRAST_FN = () => {
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
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x, y) => {
    const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
    return (a + 0.05) / (b + 0.05);
  };
  /** Background layers behind `el` (root first), or null when an ancestor paints an image or gradient. */
  const backgrounds = (el) => {
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      if (Number(cs.opacity) < 1) return null;
      chain.unshift(cs.backgroundColor);
    }
    return chain.filter((c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent");
  };
  return { paint, ratio, backgrounds };
};
async function textContrast(page) {
  return page.evaluate((fnSrc) => {
    const { paint, ratio, backgrounds } = new Function(`return (${fnSrc})()`)();
    const out = { checked: 0, skipped: 0, fails: [] };
    for (const el of document.querySelectorAll("body *")) {
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 0);
      if (!own) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [hidden], svg")) continue;
      if (el.closest(":disabled") || el.matches(":disabled")) continue;
      if (cs.webkitTextFillColor && /rgba\(0, 0, 0, 0\)|transparent/.test(cs.webkitTextFillColor)) {
        out.skipped += 1;
        continue;
      }
      const bg = backgrounds(el);
      if (!bg) {
        out.skipped += 1;
        continue;
      }
      const back = paint(bg);
      const fore = paint([...bg, cs.color]);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(fore, back);
      out.checked += 1;
      if (got < need) out.fails.push({ text: el.textContent.trim().slice(0, 40), ratio: Math.round(got * 100) / 100, need, color: cs.color, cls: String(el.className).slice(0, 60) });
    }
    return out;
  }, CONTRAST_FN.toString());
}
if (want("F5")) {
  await step("F5 computed text contrast on every main page", async () => {
    const { page, context } = await newPage();
    for (const r of ROUTES_MAIN) {
      await page.goto(`${ORIGIN}${r}`, { waitUntil: "networkidle" });
      if (r === "/lab") await page.locator("input[name=response-source][value=live]").check();
      const res = await textContrast(page);
      check(`F5 ${r}: every measured text element is at least 4.5:1 (3:1 if large) (${res.checked} measured, ${res.skipped} over images/gradients skipped)`, res.checked > 20 && res.fails.length === 0, JSON.stringify(res.fails.slice(0, 4)));
    }
    await context.close();
  });
}

// =====================================================================================
// F6: /checklist items are checkboxes
// =====================================================================================
if (want("F6")) {
  await step("F6 /checklist checkboxes: role, state, name, description, groups, click and Space, border contrast", async () => {
    const { page, context } = await newPage();
    await page.goto(`${ORIGIN}/checklist`, { waitUntil: "networkidle" });
    // D44: the checklist items moved from app/checklist/page.tsx to lib/checklist.ts.
    const src = readFileSync(new URL("../../lib/checklist.ts", import.meta.url), "utf8");
    const itemCount = [...src.matchAll(/^\s+id: "[a-z0-9-]+",\s*$/gm)].length;
    const boxes = page.locator("[role=checkbox]");
    const n = await boxes.count();
    check(`F6 one checkbox per checklist item (${itemCount} items in the source)`, itemCount > 10 && n === itemCount, `${n}`);
    const states = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked")));
    check("F6 every checkbox starts unchecked (aria-checked=false)", states.every((x) => x === "false"), JSON.stringify(states.slice(0, 5)));
    const groups = await page.evaluate(() =>
      [...document.querySelectorAll("[role=group]")].map((g) => ({
        name: document.getElementById(g.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() ?? "",
        boxes: g.querySelectorAll("[role=checkbox]").length,
      })),
    );
    check("F6 checkboxes sit in groups named by their section heading", groups.length >= 4 && groups.every((g) => g.name.length > 3 && g.boxes > 0) && groups.reduce((a, g) => a + g.boxes, 0) === n, JSON.stringify(groups));
    // Accessible name and description from the browser's accessibility tree.
    const cdp = await context.newCDPSession(page);
    const ax = (await cdp.send("Accessibility.getFullAXTree")).nodes.filter((x) => x.role?.value === "checkbox");
    const first = await boxes.first().evaluate((el) => ({
      label: document.getElementById(el.getAttribute("aria-labelledby"))?.textContent?.trim(),
      detail: document.getElementById(el.getAttribute("aria-describedby"))?.textContent?.trim(),
    }));
    const axFirst = ax[0];
    check("F6 accessibility tree: checkbox role, name = item label, description = item detail, not checked", ax.length === n && axFirst?.name?.value === first.label && axFirst?.description?.value === first.detail && axFirst?.properties?.find((p) => p.name === "checked")?.value?.value === "false", JSON.stringify({ name: axFirst?.name?.value, desc: (axFirst?.description?.value ?? "").slice(0, 40) }));
    await boxes.nth(0).click();
    check("F6 a click checks it (aria-checked=true)", (await boxes.nth(0).getAttribute("aria-checked")) === "true");
    await boxes.nth(1).focus();
    await page.keyboard.press("Space");
    check("F6 Space checks the focused checkbox", (await boxes.nth(1).getAttribute("aria-checked")) === "true");
    await page.keyboard.press("Space");
    check("F6 Space again unchecks it", (await boxes.nth(1).getAttribute("aria-checked")) === "false");
    const counter = await page.locator("text=/\\d+\\/\\d+ checks/").first().innerText();
    check("F6 the progress counter follows the checkbox state", counter.startsWith("1/"), counter);
    // Box border (unchecked) and fill (checked) against what surrounds them: ≥ 3:1 (WCAG 1.4.11).
    const box = await page.evaluate((fnSrc) => {
      const { paint, ratio, backgrounds } = new Function(`return (${fnSrc})()`)();
      const measure = (cb) => {
        const ind = cb.querySelector("[aria-hidden=true]");
        const bg = backgrounds(cb) ?? [];
        const around = paint(bg);
        const cs = getComputedStyle(ind);
        return { checked: cb.getAttribute("aria-checked"), border: Math.round(ratio(paint([...bg, cs.borderTopColor]), around) * 100) / 100, fill: Math.round(ratio(paint([...bg, cs.backgroundColor]), around) * 100) / 100 };
      };
      const cbs = [...document.querySelectorAll("[role=checkbox]")];
      return { unchecked: measure(cbs.find((c) => c.getAttribute("aria-checked") === "false")), checked: measure(cbs.find((c) => c.getAttribute("aria-checked") === "true")) };
    }, CONTRAST_FN.toString());
    check("F6 the unchecked box border is at least 3:1 against its background", box.unchecked.border >= 3, JSON.stringify(box.unchecked));
    check("F6 the checked box is at least 3:1 against its background", Math.max(box.checked.border, box.checked.fill) >= 3, JSON.stringify(box.checked));
    await context.close();
  });
}

// =====================================================================================
// F7: no horizontal scroll at 320 px on the home page
// =====================================================================================
if (want("F7")) {
  await step("F7 the home page has no horizontal scroll at 320 px (and other pages are reported)", async () => {
    const { page, context } = await newPage(browser, { width: 320, height: 800 });
    for (const r of ROUTES_MAIN) {
      await page.goto(`${ORIGIN}${r}`, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));
      const ok = m.doc <= m.inner && m.body <= m.inner;
      if (r === "/") check("F7 / at 320 px: no horizontal scroll", ok, JSON.stringify(m));
      else if (!ok) observe(`320 px: ${r} scrolls horizontally ${JSON.stringify(m)}`);
      else check(`320 px: ${r} has no horizontal scroll`, true, JSON.stringify(m));
    }
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const link = await page.locator('a[href="https://github.com/InclusiveCode/inclusive-ai"]').first().evaluate((el) => ({ right: el.getBoundingClientRect().right, inner: window.innerWidth, text: el.textContent }));
    check("F7 the GitHub link fits inside 320 px (it wraps)", link.right <= link.inner, JSON.stringify(link));
    await context.close();
  });
}

// =====================================================================================
// F8: the mobile menu is a disclosure
// =====================================================================================
if (want("F8")) {
  await step("F8 mobile menu: aria-expanded/aria-controls, constant name, Escape returns focus, closes on navigation", async () => {
    const { page, context } = await newPage(browser, { width: 375, height: 800 });
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const toggle = page.locator("body > nav button[aria-controls]");
    const info = async () =>
      toggle.evaluate((b) => {
        const menu = document.getElementById(b.getAttribute("aria-controls") ?? "");
        const r = menu?.getBoundingClientRect();
        return {
          name: b.getAttribute("aria-label") ?? b.textContent?.trim(),
          expanded: b.getAttribute("aria-expanded"),
          controls: b.getAttribute("aria-controls"),
          menuExists: !!menu,
          menuVisible: !!menu && !menu.hidden && getComputedStyle(menu).display !== "none" && (r?.height ?? 0) > 0,
          focusOnToggle: document.activeElement === b,
        };
      });
    let st = await info();
    check("F8 closed: aria-expanded=false, aria-controls points at the menu, menu hidden", st.expanded === "false" && st.menuExists && !st.menuVisible && !!st.controls, JSON.stringify(st));
    const closedName = st.name;
    await toggle.focus();
    await page.keyboard.press("Enter");
    st = await info();
    check("F8 Enter opens it: aria-expanded=true, menu visible", st.expanded === "true" && st.menuVisible, JSON.stringify(st));
    check("F8 the toggle keeps one name open and closed", st.name === closedName && closedName === "Menu", `${closedName} / ${st.name}`);
    await page.keyboard.press("Tab");
    const inMenu = await page.evaluate(() => !!document.activeElement?.closest("#" + document.querySelector("body > nav button[aria-controls]").getAttribute("aria-controls")));
    check("F8 Tab from the open toggle moves into the menu", inMenu);
    await page.keyboard.press("Escape");
    st = await info();
    check("F8 Escape closes it and returns focus to the toggle", st.expanded === "false" && !st.menuVisible && st.focusOnToggle, JSON.stringify(st));
    // Escape pressed while focus is elsewhere (not on the toggle or in the menu) leaves focus alone.
    await toggle.click();
    await page.locator("main a").first().evaluate((el) => el.focus());
    const elsewhere = await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30));
    await page.keyboard.press("Escape");
    const afterEsc = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim().slice(0, 30), onToggle: document.activeElement === document.querySelector("body > nav button[aria-controls]") }));
    check("F8 Escape pressed with focus elsewhere does not move focus to the toggle", !afterEsc.onToggle && afterEsc.text === elsewhere, JSON.stringify({ elsewhere, afterEsc }));
    observe(`F8 after Escape from elsewhere the menu is ${(await info()).expanded === "true" ? "still open" : "closed"}`);
    if ((await info()).expanded !== "true") await toggle.click();
    await page.locator(`#${st.controls} a[href="/tools"]`).click();
    await page.waitForURL("**/tools");
    st = await info();
    check("F8 choosing a link navigates and closes the menu", st.expanded === "false" && !st.menuVisible, JSON.stringify(st));
    await toggle.click();
    check("F8 (control) reopened on /tools", (await info()).expanded === "true");
    await page.goBack();
    await page.waitForURL(`${ORIGIN}/`);
    await sleep(300);
    st = await info();
    check("F8 browser Back closes the menu", st.expanded === "false" && !st.menuVisible, JSON.stringify(st));
    // On /lab: Escape while typing in the instruction must not pull focus to the menu toggle.
    await page.goto(LAB, { waitUntil: "networkidle" });
    await toggle.click();
    await page.locator("#lab-instruction").evaluate((el) => el.focus());
    await page.keyboard.press("Escape");
    const labFocus = await page.evaluate(() => document.activeElement?.id);
    check("F8 on /lab, Escape in the instruction textarea leaves focus in the textarea", labFocus === "lab-instruction", labFocus);
    await context.close();
  });
}

// =====================================================================================
// F9: /tools code blocks are keyboard-reachable, scrollable regions
// =====================================================================================
if (want("F9")) {
  await step("F9 /tools code blocks: Tab reaches each, visible focus, arrow keys scroll", async () => {
    const { page, context } = await newPage(browser, { width: 320, height: 800 });
    await page.goto(`${ORIGIN}/tools`, { waitUntil: "networkidle" });
    const blocks = await page.evaluate(() =>
      [...document.querySelectorAll("main pre")].map((p) => ({ role: p.getAttribute("role"), tabindex: p.getAttribute("tabindex"), label: p.getAttribute("aria-label") ?? "", overflow: p.scrollWidth > p.clientWidth })),
    );
    check(`F9 every code block (${blocks.length}) is a labelled region with tabindex=0`, blocks.length >= 6 && blocks.every((b) => b.role === "region" && b.tabindex === "0" && b.label.length > 5), JSON.stringify(blocks.filter((b) => b.role !== "region" || b.tabindex !== "0").slice(0, 3)));
    check("F9 the code-block labels are unique", new Set(blocks.map((b) => b.label)).size === blocks.length, JSON.stringify(blocks.map((b) => b.label)));
    observe(`F9 at 320 px ${blocks.filter((b) => b.overflow).length} of ${blocks.length} code blocks overflow horizontally`);
    // Tab through the page from the top: every block is reached in order, focus is visible, overflowing ones scroll.
    await page.locator("body > nav a").first().focus();
    const reached = new Set();
    const problems = [];
    for (let i = 0; i < 200 && reached.size < blocks.length; i++) {
      await page.keyboard.press("Tab");
      const st = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el.tagName !== "PRE") return null;
        const cs = getComputedStyle(el);
        return { label: el.getAttribute("aria-label"), visible: el.matches(":focus-visible") && cs.outlineStyle !== "none" && cs.outlineWidth !== "0px", overflow: el.scrollWidth > el.clientWidth };
      });
      if (!st || reached.has(st.label)) continue;
      reached.add(st.label);
      if (!st.visible) problems.push(`${st.label}: no visible focus`);
      if (st.overflow) {
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await sleep(100);
        const left = await page.evaluate(() => document.activeElement.scrollLeft);
        if (!(left > 0)) problems.push(`${st.label}: ArrowRight did not scroll`);
      }
    }
    check(`F9 Tab reaches all ${blocks.length} code blocks; each shows visible focus; each overflowing one scrolls with ArrowRight`, reached.size === blocks.length && problems.length === 0, JSON.stringify({ reached: reached.size, problems }));
    await context.close();
  });
}

// =====================================================================================
// axe: 0 violations on six pages at 1280 and 320 px (WCAG 2.0/2.1/2.2 A+AA and best practice)
// =====================================================================================
if (want("AXE")) {
  await step("axe on /, /lab, /checklist, /patterns, /registry, /tools at 1280 and 320 px", async () => {
    if (!axeSource) {
      observe("AXE_PATH not set: axe scans skipped");
      return;
    }
    for (const width of [1280, 320]) {
      const { page, context } = await newPage(browser, { width, height: 900 });
      for (const r of ["/", "/lab", "/checklist", "/patterns", "/registry", "/tools"]) {
        await page.goto(`${ORIGIN}${r}`, { waitUntil: "networkidle" });
        await page.addScriptTag({ content: axeSource });
        const v = await page.evaluate(async () => {
          // eslint-disable-next-line no-undef
          const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
          return res.violations.map((x) => `${x.id}×${x.nodes.length} [${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}]`);
        });
        check(`AXE ${r} at ${width} px: 0 violations`, v.length === 0, v.join("; "));
      }
      // /lab in live mode and with the mobile menu open.
      await page.goto(LAB, { waitUntil: "networkidle" });
      await page.locator("input[name=response-source][value=live]").check();
      if (width === 320) await page.locator("body > nav button[aria-controls]").click();
      await page.addScriptTag({ content: axeSource });
      const v = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
        return res.violations.map((x) => `${x.id}×${x.nodes.length}`);
      });
      check(`AXE /lab live mode${width === 320 ? " with the mobile menu open" : ""} at ${width} px: 0 violations`, v.length === 0, v.join("; "));
      await context.close();
    }
  });
}

// =====================================================================================
// F10–F12 and site-wide: every sitemap page at 320 and 1280 px
// (axe 0, no horizontal page scroll at 320 px, every horizontally scrolling block reachable and
// scrollable by keyboard; /research report tables: every column reachable)
// =====================================================================================
async function sitemapPaths() {
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
/** Elements that scroll horizontally, with whether the keyboard can reach them. */
const scrollersFn = () =>
  [...document.querySelectorAll("body *")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().height > 0;
    })
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      label: el.getAttribute("aria-label") ?? "",
      role: el.getAttribute("role"),
      focusable: el.tabIndex >= 0,
      containsFocusable: !!el.querySelector("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])"),
    }));

if (want("ALLPAGES")) {
  await step("ALLPAGES every sitemap page: axe 0 at 1280 and 320 px; no horizontal scroll at 320 px; scrolling blocks keyboard-reachable", async () => {
    const paths = await sitemapPaths();
    check(`ALLPAGES the sitemap lists ${paths.length} pages`, paths.length >= 50, paths.length);
    for (const width of [1280, 375, 320]) {
      const { page, context } = await newPage(browser, { width, height: 900 });
      const axeFails = [];
      const overflow = [];
      const unreachable = [];
      const clipped = [];
      for (const path of paths) {
        await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
        if (axeSource) {
          await page.addScriptTag({ content: axeSource });
          const v = await page.evaluate(async (tags) => {
            // eslint-disable-next-line no-undef
            const res = await axe.run(document, { runOnly: { type: "tag", values: tags } });
            return res.violations.map((x) => `${x.id}×${x.nodes.length}`);
          }, AXE_TAGS);
          if (v.length) axeFails.push(`${path}: ${v.join(", ")}`);
        }
        if (width !== 1280) {
          const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));
          if (m.doc > m.inner || m.body > m.inner) overflow.push(`${path}: ${m.doc}/${m.inner}`);
          const sc = await page.evaluate(scrollersFn);
          for (const x of sc) if (!x.focusable && !x.containsFocusable) unreachable.push(`${path}: <${x.tag}> ${x.label}`);
          // Clipped content: text inside an element that hides its horizontal overflow (no scrolling to reach it).
          const cl = await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .filter((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return /(hidden|clip)/.test(cs.overflowX) && r.width > 2 && r.height > 2 && el.scrollWidth > el.clientWidth + 1 && (el.innerText ?? "").trim().length > 0;
              })
              .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 50)}"> ${(el.innerText ?? "").trim().slice(0, 40)}`),
          );
          for (const c of cl) clipped.push(`${path}: ${c}`);
        }
      }
      if (axeSource) check(`ALLPAGES axe (WCAG 2.x A/AA + best practice) at ${width} px: 0 violations on all ${paths.length} pages`, axeFails.length === 0, axeFails.slice(0, 8).join(" | "));
      if (width !== 1280) {
        check(`ALLPAGES (F12) no horizontal page scroll at ${width} px on any of the ${paths.length} pages`, overflow.length === 0, overflow.join(" | "));
        check(`ALLPAGES (F10, F11) every horizontally scrolling block at ${width} px is keyboard-reachable`, unreachable.length === 0, unreachable.slice(0, 8).join(" | "));
        check(`ALLPAGES (F11) no text is clipped by a hidden overflow at ${width} px on any page`, clipped.length === 0, clipped.slice(0, 8).join(" | "));
      }
      await context.close();
    }
  });

  await step("F10 /patterns/<slug> code blocks: labelled regions, Tab reaches each, visible focus, arrow keys scroll (320 px)", async () => {
    const paths = (await sitemapPaths()).filter((p) => p.startsWith("/patterns/"));
    const { page, context } = await newPage(browser, { width: 320, height: 800 });
    let pagesWithCode = 0;
    let blocks = 0;
    const problems = [];
    for (const path of paths) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      const all = await page.evaluate(() =>
        [...document.querySelectorAll("main pre")].map((p) => ({ role: p.getAttribute("role"), tabindex: p.getAttribute("tabindex"), label: p.getAttribute("aria-label") ?? "", overflow: p.scrollWidth > p.clientWidth })),
      );
      if (all.length === 0) continue;
      // WCAG 2.1.1: a block that scrolls must be a labelled, focusable region; any block made a region must be labelled too.
      for (const p of all) if ((p.overflow || p.role === "region") && (p.role !== "region" || p.tabindex !== "0" || p.label.length < 3)) problems.push(`${path}: ${JSON.stringify(p)}`);
      const pres = all.filter((p) => p.role === "region");
      if (all.some((p) => p.overflow)) pagesWithCode += 1;
      blocks += pres.length;
      if (new Set(pres.map((p) => p.label)).size !== pres.length) problems.push(`${path}: duplicate code-block labels`);
      // Keyboard: Tab from the top reaches every block; overflowing ones scroll with ArrowRight.
      await page.locator("body > nav a").first().focus();
      let reached = 0;
      for (let i = 0; i < 300 && reached < pres.length; i++) {
        await page.keyboard.press("Tab");
        const st = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el.tagName !== "PRE") return null;
          const cs = getComputedStyle(el);
          return { visible: el.matches(":focus-visible") && cs.outlineStyle !== "none", overflow: el.scrollWidth > el.clientWidth };
        });
        if (!st) continue;
        reached += 1;
        if (!st.visible) problems.push(`${path}: block ${reached} has no visible focus`);
        if (st.overflow) {
          await page.keyboard.press("ArrowRight");
          await page.keyboard.press("ArrowRight");
          await sleep(80);
          if (!((await page.evaluate(() => document.activeElement.scrollLeft)) > 0)) problems.push(`${path}: block ${reached} does not scroll with ArrowRight`);
        }
      }
      if (reached !== pres.length) problems.push(`${path}: Tab reached ${reached} of ${pres.length} code blocks`);
    }
    check(`F10 pattern pages: every code block that scrolls at 320 px (on ${pagesWithCode} pages; ${blocks} region blocks in all) is a labelled focusable region, reached by Tab, visibly focused, and arrow-scrollable`, pagesWithCode >= 10 && problems.length === 0, problems.slice(0, 6).join(" | "));
    await context.close();
  });

  await step("F11 /research report tables: a focusable region; every column reachable by keyboard at 320 px", async () => {
    const paths = (await sitemapPaths()).filter((p) => p.startsWith("/research/"));
    const { page, context } = await newPage(browser, { width: 320, height: 800 });
    const problems = [];
    let tables = 0;
    for (const path of paths) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      const regions = await page.evaluate(() =>
        [...document.querySelectorAll("main table")].map((t) => {
          let r = t.parentElement;
          while (r && r !== document.body && !(r.tabIndex >= 0 && /(auto|scroll)/.test(getComputedStyle(r).overflowX))) r = r.parentElement;
          return { found: !!r && r !== document.body, role: r?.getAttribute("role") ?? null, label: r?.getAttribute("aria-label") ?? "", columns: t.querySelectorAll("thead th, tr:first-child th").length };
        }),
      );
      tables += regions.length;
      for (const [i, r] of regions.entries()) {
        if (!r.found || r.role !== "region" || r.label.length < 3) {
          problems.push(`${path}: table ${i + 1} is not inside a labelled, focusable scroll region ${JSON.stringify(r)}`);
          continue;
        }
        // Focus the region by Tab, scroll to the end with the keyboard, and check the last column comes into view.
        await page.locator("body > nav a").first().focus();
        let found = false;
        for (let k = 0; k < 300; k++) {
          await page.keyboard.press("Tab");
          const hit = await page.evaluate((idx) => {
            const t = document.querySelectorAll("main table")[idx];
            return !!t && document.activeElement?.contains(t) && document.activeElement.tabIndex >= 0;
          }, i);
          if (hit) {
            found = true;
            break;
          }
        }
        if (!found) {
          problems.push(`${path}: Tab never reached table ${i + 1}'s region`);
          continue;
        }
        const before = await page.evaluate(() => ({ overflow: document.activeElement.scrollWidth > document.activeElement.clientWidth, left: document.activeElement.scrollLeft }));
        for (let k = 0; k < 60; k++) await page.keyboard.press("ArrowRight");
        await sleep(150);
        const after = await page.evaluate((idx) => {
          const region = document.activeElement;
          const t = document.querySelectorAll("main table")[idx];
          const ths = [...t.querySelectorAll("tr")[0].children];
          const last = ths[ths.length - 1].getBoundingClientRect();
          const box = region.getBoundingClientRect();
          return { left: region.scrollLeft, lastVisible: last.left >= box.left - 1 && last.right <= box.right + 1, focusVisible: region.matches(":focus-visible") };
        }, i);
        if (before.overflow && !(after.left > before.left)) problems.push(`${path}: table ${i + 1} does not scroll with the arrow keys`);
        if (!after.lastVisible) problems.push(`${path}: table ${i + 1}'s last column is not reachable by keyboard scrolling`);
        if (!after.focusVisible) problems.push(`${path}: table ${i + 1}'s region has no visible focus`);
      }
    }
    check(`F11 ${tables} report tables on ${paths.length} report pages: focusable labelled regions; arrow keys bring every column into view at 320 px`, paths.length >= 3 && tables >= paths.length && problems.length === 0, problems.slice(0, 6).join(" | "));
    await context.close();
  });
}

if (want("N1")) {
  await step("N1 /research reports at 320 px with every 'Results by Domain' section expanded: nothing is wider than its container", async () => {
    const paths = (await sitemapPaths()).filter((p) => p.startsWith("/research/"));
    const { page, context } = await newPage(browser, { width: 320, height: 800 });
    const problems = [];
    let opened = 0;
    let measured = 0;
    for (const path of paths) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
      const res = await page.evaluate(() => {
        const h = [...document.querySelectorAll("main h2")].find((x) => /Results by Domain/.test(x.textContent ?? ""));
        const section = h?.closest("section") ?? h?.parentElement;
        const details = section ? [...section.querySelectorAll("details")] : [];
        for (const d of details) d.open = true;
        return { details: details.length };
      });
      opened += res.details;
      await sleep(200);
      const out = await page.evaluate(() => {
        const h = [...document.querySelectorAll("main h2")].find((x) => /Results by Domain/.test(x.textContent ?? ""));
        const section = h?.closest("section") ?? h?.parentElement;
        const bad = [];
        let n = 0;
        for (const el of section ? section.querySelectorAll("*") : []) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          n += 1;
          const parent = el.parentElement;
          const pr = parent.getBoundingClientRect();
          const scrolls = /(auto|scroll)/.test(getComputedStyle(parent).overflowX);
          // Wider than its container (or past the viewport), unless the container deliberately scrolls.
          if (!scrolls && (r.right > pr.right + 1 || r.left < pr.left - 1 || r.right > window.innerWidth + 0.5)) {
            bad.push(`<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 40)}" right ${Math.round(r.right)} > ${Math.round(pr.right)}`);
          }
          if (el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(getComputedStyle(el).overflowX) && (el.innerText ?? "").trim()) {
            bad.push(`<${el.tagName.toLowerCase()}> clips its text: "${(el.innerText ?? "").trim().slice(0, 40)}"`);
          }
        }
        return { n, bad, failureCards: section ? section.querySelectorAll("details li, details > div > div").length : 0 };
      });
      measured += out.n;
      for (const b of out.bad) problems.push(`${path}: ${b}`);
    }
    check(`N1 ${paths.length} report pages, ${opened} 'Results by Domain' sections expanded, ${measured} elements measured at 320 px: none wider than its container or clipped`, paths.length >= 3 && opened >= 3 && measured > 200 && problems.length === 0, problems.slice(0, 6).join(" | "));
    await context.close();
  });

}

// ---------- wrap-up ----------
await browser.close();
if (bfBrowser) await bfBrowser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} checks passed; ${failed.length} failed.`);
for (const f of failed) console.log(`  FAILED: ${f.name}  [${String(f.detail).slice(0, 300)}]`);
for (const o of observations) console.log(`  NOTE: ${o}`);
process.exit(failed.length > 0 ? 1 : 0);
