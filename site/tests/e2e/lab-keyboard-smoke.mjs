// Keyboard-only smoke test for /lab (independent verification; not run in CI).
//
// Usage:
//   cd site && npm run build && npx next start -p 3921 &
//   LAB_URL=http://localhost:3921/lab EVIDENCE_DIR=/path/to/screenshots node tests/e2e/lab-keyboard-smoke.mjs
//
// Requires Playwright 1.56.1 (global install is fine) and a Chromium in PLAYWRIGHT_BROWSERS_PATH.
// Every interaction uses the keyboard only (Tab, Shift+Tab, Space, Enter, arrows, Escape, typing).
// Live mode (section 8) never reaches a provider: every /api/lab/run request is answered by a test double,
// and the key is an obviously fake placeholder. Detailed live-mode checks are in lab-live-smoke.mjs.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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

const URL = process.env.LAB_URL ?? "http://localhost:3921/lab";
const EVIDENCE = process.env.EVIDENCE_DIR ?? "/tmp/lab-evidence";
mkdirSync(EVIDENCE, { recursive: true });

const results = [];
const observations = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}
function observe(msg) {
  observations.push(msg);
  console.log(`NOTE  ${msg}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
const dialogs = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("dialog", async (d) => {
  dialogs.push(`${d.type()}: ${d.message()}`);
  await d.dismiss();
});

// ---------- helpers ----------
const focusLog = [];
async function focusInfo() {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "body" };
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      value: el.value ?? null,
      id: el.id,
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
      checked: el.checked ?? null,
      focusVisible: el.matches(":focus-visible"),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
    };
  });
}

/** Press Tab (or Shift+Tab) until the predicate holds for document.activeElement. */
async function tabUntil(desc, pred, arg, { back = false, max = 250 } = {}) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    const hit = await page.evaluate(pred, arg);
    if (hit) {
      const info = await focusInfo();
      focusLog.push({ desc, ...info });
      return info;
    }
  }
  throw new Error(`Could not reach "${desc}" with ${back ? "Shift+Tab" : "Tab"}`);
}
const isButtonWithText = (t) => {
  const el = document.activeElement;
  return !!el && el.tagName === "BUTTON" && (el.textContent ?? "").includes(t);
};
const isLinkWithText = (t) => {
  const el = document.activeElement;
  return !!el && el.tagName === "A" && (el.textContent ?? "").includes(t);
};
const isRadio = (name) => {
  const el = document.activeElement;
  return !!el && el.tagName === "INPUT" && el.getAttribute("type") === "radio" && el.getAttribute("name") === name;
};
const isId = (id) => document.activeElement?.id === id;
const isSummary = (t) => {
  const el = document.activeElement;
  return !!el && el.tagName === "SUMMARY" && (el.textContent ?? "").includes(t);
};

const text = (sel) => page.locator(sel).first().innerText();
const headline = () => text("section[aria-labelledby=findings] p.text-xl");
const statusText = () => page.locator("[role=status]").first().innerText();
const compareText = () => page.locator("section[aria-labelledby=compare]").innerText();
async function waitStatus(n) {
  await page.waitForFunction((k) => (document.querySelector("[role=status]")?.textContent ?? "").includes(`Run ${k} complete`), n, {
    timeout: 30000,
  });
  return statusText();
}
function parseSummary(t) {
  const m = /(\d+) improved · (\d+) regressed · (\d+) unchanged · (\d+)\s+inconclusive/.exec(t);
  return m ? { improved: +m[1], regressed: +m[2], unchanged: +m[3], inconclusive: +m[4] } : null;
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(`${name} (step completed without exception)`, false, String(e).slice(0, 300));
  }
}

let runN = 0;
async function rerunViaKeyboard() {
  await tabUntil("Rerun button", isButtonWithText, "Rerun");
  await page.keyboard.press("Enter");
  runN += 1;
  return waitStatus(runN);
}

// ---------- 0. Load ----------
await step("load", async () => {
  const res = await page.goto(URL, { waitUntil: "networkidle" });
  check("REQ1 /lab returns 200 with no login", res?.status() === 200 && (await page.locator("input[type=password]").count()) === 0);
  const body = await page.locator("body").innerText();
  check("REQ1 demo banner 'Simulated demo — no AI model is called' visible", await page.getByText("Simulated demo — no AI model is called").isVisible());
  check("REQ1 'Fictional data' label visible", body.includes("Fictional data"));
  check("REQ1 responses labeled 'Simulated response'", (await page.getByText("Simulated response", { exact: true }).count()) === 2);
  check("REQ1 mode badge 'Simulated' shown, no live badge", body.includes("Simulated") && !body.includes("Live (unavailable)"));
  check("REQ14 limitations section present", body.includes("Limitations") && body.includes("single sample"));
  check("REQ14 'A pass means only that the displayed checks passed' shown", body.includes("A pass means only that the displayed checks passed"));
  const statusRegion = await page.evaluate(() => {
    const el = document.querySelector("[role=status]");
    return el ? { live: el.getAttribute("aria-live"), text: el.textContent } : null;
  });
  check("REQ13 polite status region exists before any run", statusRegion?.live === "polite" && statusRegion.text === "", JSON.stringify(statusRegion));
  const positiveTabindex = await page.evaluate(() => [...document.querySelectorAll("[tabindex]")].filter((e) => +e.getAttribute("tabindex") > 0).length);
  check("REQ13 no tabindex > 0", positiveTabindex === 0, String(positiveTabindex));
  await page.screenshot({ path: join(EVIDENCE, "01-initial-load.png") });
});

// ---------- 1. Choose a scenario (radio group, arrow keys) ----------
await step("choose scenario", async () => {
  const f = await tabUntil("scenario radio", isRadio, "scenario");
  check("REQ2 Tab reaches the checked scenario radio", f.checked === true && f.value === "spouse-parity", JSON.stringify(f));
  await page.keyboard.press("ArrowRight");
  const f2 = await focusInfo();
  const inspect2 = await page.locator("section[aria-labelledby=inspect]").innerText();
  check("REQ2 ArrowRight selects the second scenario", f2.value === "stated-identity" && f2.checked && inspect2.includes("they/them"), f2.value);
  await page.keyboard.press("ArrowRight");
  const inspect3 = await page.locator("section[aria-labelledby=inspect]").innerText();
  check("REQ3 third scenario is the HR disclosure boundary", inspect3.includes("Employee chat transcript") && inspect3.includes("because I'm trans"));
  await page.keyboard.press("ArrowRight"); // wraps to first
  const f4 = await focusInfo();
  check("REQ2 arrow keys wrap back to spouse scenario", f4.value === "spouse-parity" && f4.checked, f4.value);
});

// ---------- 2. Inspect paired inputs and responses ----------
await step("inspect", async () => {
  await tabUntil("step link 2", isLinkWithText, "2. Inspect", { back: true });
  await page.keyboard.press("Enter");
  check("REQ2 Shift+Tab + Enter on the in-page step link navigates to #inspect", (await page.evaluate(() => location.hash)) === "#inspect");
  const inspect = await page.locator("section[aria-labelledby=inspect]").innerText();
  check("REQ2/REQ14 Version A input (wife) and Version B input (husband) shown", inspect.includes("my wife, Jordan Lee") && inspect.includes("my husband, Jordan Lee"));
  const marks = await page.locator("section[aria-labelledby=inspect] mark").allInnerTexts();
  check("REQ4 variable highlighted in inputs", marks.includes("wife") && marks.includes("husband"), marks.slice(0, 6).join("|"));
  check(
    "REQ14 run metadata shown (provider, model, fingerprint, created at)",
    ["Provider", "lab-simulator-rules-v1", "Instruction fingerprint", "Created at", "Temperature"].every((s) => inspect.includes(s)),
  );
  check("REQ2 baseline responses shown (B asks for marriage certificate)", inspect.includes("marriage certificate"));
});

// ---------- 3. Review findings ----------
await step("findings", async () => {
  const hl = await headline();
  check("REQ2 baseline headline is 'Checks failed'", hl === "Checks failed", hl);
  await tabUntil("first Rubric summary", isSummary, "Rubric");
  await page.keyboard.press("Enter");
  const open = await page.evaluate(() => document.activeElement?.parentElement?.hasAttribute("open"));
  const rubric = await page.evaluate(() => document.activeElement?.parentElement?.innerText ?? "");
  check("REQ2 Enter opens the rubric <details>", open === true);
  check("REQ2/REQ14 rubric shows criterion, method, lexicon, limitations", ["Criterion", "Method", "Lexicon", "Limitations"].every((s) => rubric.includes(s)));
  await page.keyboard.press("Space");
  const closed = await page.evaluate(() => !document.activeElement?.parentElement?.hasAttribute("open"));
  check("REQ13 Space toggles the rubric closed", closed === true);
  const findings = await page.locator("section[aria-labelledby=findings]").innerText();
  check("REQ2 findings cite excerpts with character offsets", /Version B, characters \d+–\d+/.test(findings));
  check("REQ3 system-introduced relabeling is flagged", findings.includes("system introduced (not the user's word)"));
  check("REQ3 user's own term tagged user provided", findings.includes("user provided (the user's own word)"));
  check("REQ10 automated and after-review counts shown separately", findings.includes("Automated") && findings.includes("After human review"));
});

// ---------- 4. Disagree with an automated judgment ----------
await step("override", async () => {
  await tabUntil("first Disagree button", isButtonWithText, "Disagree with this result");
  await page.keyboard.press("Enter");
  let f = await focusInfo();
  check("REQ2 Enter opens the override form and focuses the first verdict radio", f.tag === "input" && f.type === "radio" && f.value === "pass", JSON.stringify(f));
  await page.keyboard.press("Escape");
  f = await focusInfo();
  const formCount = await page.locator("section[aria-labelledby=findings] form").count();
  check("REQ13 Escape closes the form and returns focus to the trigger", formCount === 0 && f.text.includes("Disagree"), JSON.stringify(f));
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space"); // check "Pass"
  f = await focusInfo();
  check("REQ2 Space selects the human verdict", f.value === "pass" && f.checked === true);
  await page.keyboard.press("Tab"); // -> reason
  f = await focusInfo();
  check("REQ13 Tab moves from verdict to reason textarea", f.tag === "textarea", f.tag);
  await page.keyboard.press("Tab"); // -> Save
  await page.keyboard.press("Enter"); // save with empty reason
  const err = await page.locator("section[aria-labelledby=findings] form [role=alert]").innerText().catch(() => "");
  check("REQ10/REQ13 saving without a reason shows an error alert", err.includes("reason is required"), err);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Both requests are standard identity checks <b>in my view</b>.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  f = await focusInfo();
  check("REQ13 after saving, focus returns to the Disagree button", f.text.includes("Disagree"), JSON.stringify(f));
  const findings = await page.locator("section[aria-labelledby=findings]").innerText();
  check("REQ10 both human and automated verdicts shown", findings.includes("Human review: Pass — automated result: Fail"));
  const firstRow = await page.locator("section[aria-labelledby=findings] ol > li").first().innerText();
  check("REQ10 the automated badge for the row still reads Fail", /✗\s*Fail/.test(firstRow), firstRow.slice(0, 120));
  check("REQ10 headline unchanged by the override", (await headline()) === "Checks failed");
  const counts = await page.locator("section[aria-labelledby=findings] .grid h3").allInnerTexts();
  const autoBox = await page.locator("section[aria-labelledby=findings] .grid > div").nth(0).innerText();
  const reviewBox = await page.locator("section[aria-labelledby=findings] .grid > div").nth(1).innerText();
  check("REQ10 automated vs after-review counts differ after override", autoBox.replace("Automated", "") !== reviewBox.replace("After human review", ""), `${counts} | ${autoBox} | ${reviewBox}`.replace(/\n/g, " "));
  const log = await page.locator("section[aria-labelledby=review-log]").innerText();
  check("REQ10 review log records human and automated verdicts and the reason", log.includes("human Pass") && log.includes("automated Fail") && log.includes("<b>in my view</b>"));
  check("REQ11 HTML in the reason renders as text", (await page.locator("section[aria-labelledby=review-log] b").count()) === 0);
  await page.screenshot({ path: join(EVIDENCE, "02-override-human-vs-automated.png"), fullPage: false });
});

// ---------- 5. Edit the instruction (presets) and rerun ----------
await step("edit and rerun", async () => {
  const before = await page.locator("#lab-instruction").inputValue();
  await tabUntil("FIX-VERIFY preset", isButtonWithText, "FIX-VERIFY");
  await page.keyboard.press("Enter");
  await tabUntil("FIX-TERMS preset", isButtonWithText, "FIX-TERMS");
  await page.keyboard.press("Enter");
  const after = await page.locator("#lab-instruction").inputValue();
  check("REQ2 presets append documented snippets to the instruction", after.startsWith(before) && after.includes("Apply identical verification") && after.includes("exact relationship terms"));
  const st = await rerunViaKeyboard();
  check("REQ13 status region announces run completion", st.startsWith("Run 1 complete"), st);
  const used = await page.locator("section[aria-labelledby=inspect]").innerText();
  check("REQ5 the run used the edited instruction (shown under 'Instruction used')", used.includes("Apply identical verification requirements") && used.includes("Refer to people using the exact relationship terms"));
  check("REQ2 fixed instruction: headline is all-pass", (await headline()) === "All displayed checks passed");
  const cmp = parseSummary(await compareText());
  check("REQ2 compare shows improvements and no regressions", !!cmp && cmp.improved > 0 && cmp.regressed === 0, JSON.stringify(cmp));
  const caption = await page.locator("section[aria-labelledby=compare] table caption").count();
  check("REQ14 comparison is a captioned table", caption === 1);

  // Over-correction preset -> regression.
  await tabUntil("OVER-NEUTRAL preset", isButtonWithText, "OVER-NEUTRAL", { back: true });
  await page.keyboard.press("Enter");
  const st2 = await rerunViaKeyboard();
  const cmp2 = parseSummary(await compareText());
  check("REQ2 OVER-NEUTRAL produces a regression", !!cmp2 && cmp2.regressed > 0, `${st2} ${JSON.stringify(cmp2)}`);

  // Switch the shown run with arrow keys.
  await tabUntil("show-run radio", isRadio, "view-run", { back: true });
  await page.keyboard.press("ArrowLeft");
  const hlBase = await headline();
  const f = await page.locator("section[aria-labelledby=findings]").innerText();
  check("REQ10 baseline view still shows the earlier override alongside the automated result", hlBase === "Checks failed" && f.includes("Human review: Pass — automated result: Fail"), hlBase);
  await page.keyboard.press("ArrowRight");
  const fl = await focusInfo();
  const usedLatest = await page.locator("section[aria-labelledby=inspect]").innerText();
  check(
    "REQ2 arrow keys switch back to the latest run",
    fl.value === "latest" && fl.checked === true && usedLatest.includes("Always use gender-neutral terms for family members"),
    JSON.stringify(fl),
  );

  // Override draft must reset when the displayed run changes (baseline <-> latest).
  const drafts = () =>
    page.evaluate(() => ({
      forms: document.querySelectorAll("section[aria-labelledby=findings] form").length,
      reasons: [...document.querySelectorAll("section[aria-labelledby=findings] form textarea")].map((t) => t.value),
      checked: [...document.querySelectorAll("section[aria-labelledby=findings] form input[type=radio]:checked")].map((r) => r.value),
    }));
  await tabUntil("first Disagree button (latest run)", isButtonWithText, "Disagree with this result");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await page.keyboard.type("DRAFT-CANARY unsaved reason");
  const d0 = await drafts();
  check("DRAFT control: an unsaved override draft is open on the latest run", d0.forms === 1 && d0.reasons[0]?.includes("DRAFT-CANARY") && d0.checked[0] === "pass", JSON.stringify(d0));
  await tabUntil("show-run radio", isRadio, "view-run", { back: true });
  await page.keyboard.press("ArrowLeft");
  const d1 = await drafts();
  const v1 = await focusInfo();
  check("DRAFT switching to baseline discards the latest run's draft", v1.value === "baseline" && d1.forms === 0 && !JSON.stringify(d1).includes("DRAFT-CANARY"), JSON.stringify(d1));
  await page.keyboard.press("ArrowRight");
  const d2 = await drafts();
  check("DRAFT switching back to latest does not restore the draft", d2.forms === 0 && !JSON.stringify(d2).includes("DRAFT-CANARY"), JSON.stringify(d2));
  const log = await page.locator("section[aria-labelledby=review-log]").innerText();
  check("DRAFT unsaved draft never reaches the review log", !log.includes("DRAFT-CANARY"));
});

// ---------- 6. Inert HTML in the instruction ----------
await step("xss", async () => {
  await tabUntil("instruction textarea", isId, "lab-instruction");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n<img src=x onerror=alert(1)>");
  const st = await rerunViaKeyboard();
  await page.waitForTimeout(500);
  const used = await page.locator("section[aria-labelledby=inspect] p.whitespace-pre-wrap").first().innerText();
  check("REQ11 typed <img onerror> shows as literal text under 'Instruction used'", used.includes("<img src=x onerror=alert(1)>"), st);
  check("REQ11 no <img src=x> element created", (await page.locator('img[src="x"]').count()) === 0);
  check("REQ11 no dialog fired", dialogs.length === 0, dialogs.join("; "));
});

// ---------- 7. Fault injection ----------
await step("fault injection", async () => {
  await tabUntil("Reset button", isButtonWithText, "Reset to the baseline instruction", { back: true });
  await page.keyboard.press("Enter");
  check("REQ2 Reset restores the baseline instruction", (await page.locator("#lab-instruction").inputValue()).startsWith("You are the customer support assistant") && !(await page.locator("#lab-instruction").inputValue()).includes("onerror"));
  await tabUntil("FIX-VERIFY preset", isButtonWithText, "FIX-VERIFY", { back: true });
  await page.keyboard.press("Enter");
  await tabUntil("FIX-TERMS preset", isButtonWithText, "FIX-TERMS");
  await page.keyboard.press("Enter");
  await rerunViaKeyboard();
  check("REQ9 control: fixed instruction without faults is all-pass", (await headline()) === "All displayed checks passed");

  const expected = [
    ["model_error", "Model error — not evaluated"],
    ["timeout", "Timed out — not evaluated"],
    ["credentials_unavailable", "Credentials unavailable — not evaluated"],
    ["malformed_result", "Evaluator error (malformed) — not evaluated"],
  ];
  for (const [kind, label] of expected) {
    await tabUntil("fault select", isId, "lab-fault", { back: true });
    await page.keyboard.press("ArrowDown");
    const v = await page.locator("#lab-fault").inputValue();
    const st = await rerunViaKeyboard();
    const hl = await headline();
    const body = await page.locator("section[aria-labelledby=inspect]").innerText();
    const fnd = await page.locator("section[aria-labelledby=findings]").innerText();
    check(`REQ8 fault ${kind} selected by keyboard`, v === kind, v);
    check(`REQ8/REQ9 fault ${kind} shows '${label}'`, body.includes(label) || fnd.includes(label));
    check(`REQ9 fault ${kind}: headline is not a pass`, hl !== "All displayed checks passed" && /not a pass|incomplete/i.test(hl), hl);
    check(`REQ9 fault ${kind}: announcement is not a pass`, !st.includes("All displayed checks passed"), st);
    const disabled = await page.locator("section[aria-labelledby=findings] button:disabled", { hasText: "Disagree" }).count();
    check(`REQ10 fault ${kind}: override disabled for not-evaluated/error rows`, disabled > 0, String(disabled));
    if (kind === "timeout") await page.screenshot({ path: join(EVIDENCE, "03-fault-timeout-not-evaluated.png") });
  }
  await tabUntil("fault select", isId, "lab-fault", { back: true });
  await page.keyboard.press("Home");
  check("REQ13 Home key resets the fault select to None", (await page.locator("#lab-fault").inputValue()) === "none");
});

// ---------- 8. Live mode with a test double (replaces the stub-era "live mode -> unavailable" section) ----------
const FAKE_KEY = "sk-ant-test-VerifierFakeKeyNotRealAbcdefghij";
await step("live mode", async () => {
  const api = [];
  let reply = null;
  const okReply = (body) => {
    const fixed = String(body?.instruction ?? "").includes("Apply identical verification requirements");
    const b = fixed
      ? "Happy to help! To add your husband, Jordan Lee, as an authorized user, sign in and open Authorized users."
      : "To add your partner, Jordan Lee, as an authorized user, please send a marriage certificate and a government-issued photo ID.";
    const a = "Happy to help! To add your wife, Jordan Lee, as an authorized user, sign in and open Authorized users.";
    return { status: "ok", text: body?.variant === "b" ? b : a, returnedModel: "claude-haiku-4-5-20251001", stopReason: "end_turn", durationMs: 900 };
  };
  await page.route("**/api/lab/run", async (route) => {
    let body = null;
    try {
      body = JSON.parse(route.request().postData() ?? "");
    } catch {}
    api.push({ body, auth: route.request().headers().authorization ?? null });
    const r = reply ? reply(body) : { delay: 100, json: okReply(body) };
    if (r.hang) return;
    if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
    if (r.abort) return route.abort("failed").catch(() => {});
    await route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.json) }).catch(() => {});
  });
  const labAlerts = () => page.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=edit] [role=alert]")].map((a) => a.textContent.trim()));

  await tabUntil("response source radio", isRadio, "response-source", { back: true });
  await page.keyboard.press("ArrowDown");
  const f = await focusInfo();
  check("REQ2 ArrowDown selects Live", f.value === "live" && f.checked === true, JSON.stringify(f));

  // L1: no key -> inline error, focus to the key field, no request.
  await tabUntil("Run baseline live button", isButtonWithText, "Run baseline live");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  let fk = await focusInfo();
  const keyErr = await page.locator("#lab-live-key-error").innerText().catch(() => "");
  check("L1 keyboard: no key -> inline alert", keyErr === "Enter your API key to run live.", keyErr);
  check("L1 keyboard: focus moves to the key field", fk.id === "lab-live-key", JSON.stringify(fk));
  check("L1 keyboard: no request sent", api.length === 0, String(api.length));

  // Type the key (focus is already in the field) and run the baseline live.
  await page.keyboard.type(FAKE_KEY);
  check("L1 typing clears the inline error", (await page.locator("#lab-live-key-error").count()) === 0);
  await tabUntil("Run baseline live button", isButtonWithText, "Run baseline live");
  await page.keyboard.press("Enter");
  runN += 1;
  await waitStatus(runN);
  check("L3 two requests, key only in the Authorization header", api.length === 2 && api.every((r) => r.auth === `Bearer ${FAKE_KEY}` && !JSON.stringify(r.body).includes(FAKE_KEY)), String(api.length));
  check("L3 'Run baseline live' sends the unedited baseline instruction", api.every((r) => String(r.body?.instruction).startsWith("You are the customer support assistant") && !String(r.body?.instruction).includes("Apply identical verification")));
  const banner = await page.locator("[role=note]").first().innerText();
  check("L6 live banner names the provider and the returned model, with the single-sample disclaimer", banner.startsWith("Live run: responses from Anthropic claude-haiku-4-5-20251001.") && banner.includes("One sample per run"), banner);
  const inspect = await page.locator("section[aria-labelledby=inspect]").innerText();
  check("REQ1/L6 live run labeled Live and not 'Simulated response'", /Mode\s+Live/.test(inspect) && !inspect.includes("Simulated response"));
  check("L2 live baseline only -> 'Live baseline only — edit and rerun'", (await compareText()).includes("Live baseline only — edit and rerun"));

  // Rerun with the edited instruction (FIX-VERIFY and FIX-TERMS are still in the editor) -> comparable pair.
  api.length = 0;
  await tabUntil("Rerun button", isButtonWithText, "Rerun", { back: true });
  await page.keyboard.press("Enter");
  runN += 1;
  const st = await waitStatus(runN);
  check("L3 Rerun sends the edited instruction", api.length === 2 && api.every((r) => String(r.body?.instruction).includes("Apply identical verification")), String(api.length));
  const cmp = parseSummary(await compareText());
  check("L2 live baseline + live rerun compare (improvements, no regressions)", !!cmp && cmp.improved > 0 && cmp.regressed === 0, JSON.stringify(cmp));
  check("L2 the comparison uses a live baseline, never the simulated one", !/Mode\s+Simulated/.test(await compareText()));
  check("REQ13 status announces live completion", st.includes("complete"), st);
  await page.locator("section[aria-labelledby=compare]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(EVIDENCE, "04-live-double-comparison.png") });

  // D2: loading state during a slow live response; focus moves to Cancel and comes back.
  reply = (body) => ({ delay: 2500, json: okReply(body) });
  await tabUntil("Rerun button", isButtonWithText, "Rerun", { back: true });
  await page.keyboard.press("Enter");
  runN += 1;
  await page.waitForTimeout(400);
  const snap = () =>
    page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Rerun");
      return {
        disabled: btn?.disabled ?? null,
        sectionBusy: document.querySelector("section[aria-labelledby=edit]")?.getAttribute("aria-busy") ?? null,
        anyBusy: document.querySelectorAll("[aria-busy=true]").length,
        status: [...document.querySelectorAll("[role=status]")].map((s) => s.textContent ?? "").join("|"),
        alerts: [...document.querySelectorAll("section[aria-labelledby=edit] [role=alert]")].map((a) => a.textContent),
        active: (document.activeElement?.textContent ?? "").trim(),
        activeIsRerun: document.activeElement === btn,
      };
    });
  const during = await snap();
  check("D2 Rerun is disabled while the live run is in flight", during.disabled === true, JSON.stringify(during));
  check("D2 aria-busy=true is set while in flight", during.sectionBusy === "true" && during.anyBusy > 0, JSON.stringify(during));
  check("D2 'Running…' is announced in the polite status region", during.status.includes("Running…"), during.status);
  check("D2 no stale alert while in flight", during.alerts.length === 0, JSON.stringify(during.alerts));
  check("FIX keyboard focus is on Cancel while the live run is in flight", during.active === "Cancel", during.active);
  await waitStatus(runN);
  await page.waitForTimeout(300);
  const after = await snap();
  check("D2 Rerun is re-enabled afterwards", after.disabled === false, JSON.stringify(after));
  check("D2 aria-busy is removed afterwards", after.sectionBusy === null && after.anyBusy === 0, JSON.stringify(after));
  check("FIX keyboard focus returns to Rerun (the control that started the run)", after.activeIsRerun === true, after.active);

  // Cancel by keyboard: focus is on Cancel during the run; Enter cancels both calls.
  reply = () => ({ hang: true });
  await page.keyboard.press("Enter"); // focus is on Rerun
  runN += 1;
  await page.waitForFunction(() => (document.activeElement?.textContent ?? "").trim() === "Cancel", null, { timeout: 5000 });
  await page.keyboard.press("Enter");
  await waitStatus(runN);
  check("L8 keyboard Cancel -> 'Live request cancelled — not evaluated'", (await labAlerts()).join("|") === "Live request cancelled — not evaluated", JSON.stringify(await labAlerts()));
  check("L8 keyboard focus returns to Rerun after Cancel", (await focusInfo()).text === "Rerun", JSON.stringify(await focusInfo()));

  // Network failure -> model error (distinct from credentials).
  reply = () => ({ abort: true });
  await page.keyboard.press("Enter");
  runN += 1;
  await waitStatus(runN);
  const inspect2 = await page.locator("section[aria-labelledby=inspect]").innerText();
  check("REQ8 live network failure shows 'Model error — not evaluated'", inspect2.includes("Model error — not evaluated"));
  check("ALERT network error text", (await labAlerts()).join("|") === "Live request failed — not evaluated (Could not reach the lab server)", JSON.stringify(await labAlerts()));

  // Provider timeout (server side) -> timed out.
  reply = () => ({ json: { status: "timeout", durationMs: 30000 } });
  await page.keyboard.press("Enter");
  runN += 1;
  await waitStatus(runN);
  const inspect3 = await page.locator("section[aria-labelledby=inspect]").innerText();
  check("REQ8 live timeout shows 'Timed out — not evaluated'", inspect3.includes("Timed out — not evaluated"));
  check("ALERT timeout text", (await labAlerts()).join("|") === "Live request timed out — not evaluated", JSON.stringify(await labAlerts()));
  check("REQ9 live timeout: headline is not a pass", (await headline()) !== "All displayed checks passed", await headline());

  // Provider rejected the key -> credentials unavailable.
  reply = () => ({ json: { status: "credentials_unavailable", error: "The provider rejected the API key", durationMs: 5 } });
  await page.keyboard.press("Enter");
  runN += 1;
  await waitStatus(runN);
  check("ALERT credentials text", (await labAlerts()).join("|") === "Credentials unavailable — not evaluated (The provider rejected the API key)", JSON.stringify(await labAlerts()));
  check("REQ8 live: both versions show 'Credentials unavailable — not evaluated'", ((await page.locator("section[aria-labelledby=inspect]").innerText()).match(/Credentials unavailable — not evaluated/g) ?? []).length >= 2);
  await page.unroute("**/api/lab/run");

  // Back to simulated: the live alert is cleared and the key is gone.
  await tabUntil("response source radio", isRadio, "response-source", { back: true });
  await page.keyboard.press("ArrowUp");
  check("L4 switching to simulated removes the key field", (await page.locator("#lab-live-key").count()) === 0);
  await rerunViaKeyboard();
  // Scope to the lab (Playwright locators also pierce the framework's shadow-DOM route announcer, which has role=alert).
  const remaining = await page.evaluate(() => ({
    lab: [...document.querySelectorAll("section[aria-labelledby=edit] [role=alert]")].map((a) => a.textContent),
    docWide: [...document.querySelectorAll("[role=alert]")].map((a) => a.textContent),
  }));
  check("ALERT cleared after a simulated run", remaining.lab.length === 0 && remaining.docWide.length === 0, JSON.stringify(remaining));
  check("L6 simulated run -> simulated banner again", (await page.locator("[role=note]").first().innerText()).startsWith("Simulated demo — no AI model is called"));
});

// ---------- 9. Download review log ----------
await step("download log", async () => {
  await tabUntil("Download review log", isButtonWithText, "Download review log");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.keyboard.press("Enter")]);
  const p = await dl.path();
  const json = JSON.parse(readFileSync(p, "utf8"));
  const o = json.overrides?.[0];
  check("REQ10 downloaded log keeps human and automated verdicts separate", o?.automatedStatus === "fail" && o?.humanStatus === "pass", JSON.stringify(o));
});

// ---------- focus visibility ----------
const notVisible = focusLog.filter((f) => f.tag !== "body" && (!f.focusVisible || f.outlineStyle === "none" || f.outlineWidth === "0px"));
check(
  `REQ13 visible focus outline on every keyboard-focused control (${focusLog.length} sampled)`,
  notVisible.length === 0,
  notVisible.map((f) => `${f.desc}:${f.tag}:${f.outlineStyle}/${f.outlineWidth}`).join(", "),
);
const kinds = [...new Set(focusLog.map((f) => `${f.tag}${f.type ? `[${f.type}]` : ""}`))];
observe(`Focused control kinds sampled: ${kinds.join(", ")}`);

// ---------- errors ----------
const resourceErrors = consoleErrors.filter((m) => /Failed to load resource|net::ERR_/i.test(m));
const jsConsoleErrors = consoleErrors.filter((m) => !resourceErrors.includes(m));
check("REQ13 no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
check("REQ13 no JS console errors (network aborts from the test double excluded)", jsConsoleErrors.length === 0, jsConsoleErrors.join(" | "));
observe(`Network console errors (expected from injected aborts): ${resourceErrors.length}`);
check("REQ11 no dialogs during the whole session", dialogs.length === 0, dialogs.join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} checks passed; ${failed.length} failed.`);
for (const f of failed) console.log(`  FAILED: ${f.name}  [${f.detail}]`);
for (const o of observations) console.log(`  NOTE: ${o}`);
process.exit(failed.length > 0 ? 1 : 0);
