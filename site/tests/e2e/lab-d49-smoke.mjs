// D49 lab workbench checks in a real browser (independent verification; not run in CI).
//
// Usage:
//   cd site && npm run build && npx next start -p 3921 &
//   LAB_URL=http://localhost:3921/lab AXE_PATH=/path/to/axe.min.js node tests/e2e/lab-d49-smoke.mjs
//
// Live mode never reaches a provider: every /api/lab/run request is answered by a test double.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const base of [import.meta.url, "/opt/node-tools/node_modules/"]) {
    try {
      return createRequire(base)("playwright");
    } catch {}
  }
  return require("playwright");
}
const { chromium } = loadPlaywright();
const LAB = process.env.LAB_URL ?? "http://localhost:3921/lab";
const AXE = process.env.AXE_PATH && existsSync(process.env.AXE_PATH) ? readFileSync(process.env.AXE_PATH, "utf8") : null;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  [${detail}]` : ""}`);
}
const observe = (s) => console.log(`  NOTE: ${s}`);

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });

async function open(width, height, opts = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await context.newPage();
  await page.route("**/api/lab/run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", text: "Happy to help. Please bring a photo ID for each of you to any branch.", returnedModel: "claude-haiku-4-5-20251001", durationMs: 420 }),
    }),
  );
  await page.goto(LAB, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector("#lab-instruction")?.readOnly);
  return { page, context };
}
async function rerun(page, n) {
  await page.getByRole("button", { name: "Rerun", exact: true }).click();
  await page.waitForFunction((k) => (document.querySelector("[role=status]")?.textContent ?? "").includes(`Run ${k} complete`), n, { timeout: 30000 });
}
const rectOf = (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; });
const navBottom = (page) => page.evaluate(() => document.querySelector("body > nav").getBoundingClientRect().bottom);

// 1. Desktop workbench: the editor stays on screen next to the findings, and the result shows there.
for (const [w, h] of [[1024, 768], [1280, 900], [1440, 900]]) {
  const { page, context } = await open(w, h);
  const pos = await page.locator("section[aria-labelledby=edit]").evaluate((e) => getComputedStyle(e).position);
  check(`D49 ${w}×${h}: the edit section is sticky`, pos === "sticky", pos);
  await page.locator("#findings").evaluate((e) => e.scrollIntoView());
  await page.waitForTimeout(100);
  const nb = await navBottom(page);
  const rr = await rectOf(page, "section[aria-labelledby=edit] button:text-is('Rerun')");
  const fr = await rectOf(page, "section[aria-labelledby=findings] p.text-xl");
  check(`D49 ${w}×${h}: with the findings at the top, Rerun is fully on screen below the site bar`, rr.top >= nb && rr.bottom <= h, JSON.stringify({ rr, nb }));
  check(`D49 ${w}×${h}: … and so is the findings verdict`, fr.top >= nb - 1 && fr.bottom <= h, JSON.stringify(fr));
  await page.getByRole("button", { name: /FIX-VERIFY/ }).click();
  await page.locator("section[aria-labelledby=edit] button:text-is('Rerun')").evaluate((b) => b.focus());
  // What the reader sees, not scrollY: the "Show run" list above the findings grows by a row, and
  // the browser's scroll anchoring changes scrollY to keep the findings where they were.
  const verdictBefore = (await rectOf(page, "section[aria-labelledby=findings] p.text-xl")).top;
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => (document.querySelector("[role=status]")?.textContent ?? "").includes("Run 1 complete"), null, { timeout: 30000 });
  await page.waitForTimeout(200);
  const verdictAfter = (await rectOf(page, "section[aria-labelledby=findings] p.text-xl")).top;
  check(`D49 ${w}×${h}: a Rerun doesn't move the findings you are reading (only the editor column scrolls)`, Math.abs(verdictAfter - verdictBefore) <= 1, `verdict top ${verdictBefore} -> ${verdictAfter}`);
  const card = await rectOf(page, "#lab-result");
  const aside = await rectOf(page, "section[aria-labelledby=edit]");
  check(`D49 ${w}×${h}: after Rerun, the result card is fully visible inside the editor column`, card.top >= Math.max(nb, aside.top) - 1 && card.bottom <= Math.min(h, aside.bottom) + 1, JSON.stringify({ card, aside }));
  const cardText = await page.locator("#lab-result").innerText();
  const verdict = await page.locator("section[aria-labelledby=findings] p.text-xl").innerText();
  const summary = (await page.locator("section[aria-labelledby=compare]").innerText()).match(/(\d+) improved · (\d+) regressed · (\d+) unchanged/);
  const cardSummary = cardText.match(/(\d+) improved, (\d+) regressed, (\d+) unchanged/);
  check(`D49 ${w}×${h}: the card shows the same verdict as the findings and the same counts as the comparison`, cardText.includes(verdict) && !!summary && !!cardSummary && summary.slice(1).join() === cardSummary.slice(1).join(), JSON.stringify({ verdict, summary: summary?.[0], cardSummary: cardSummary?.[0] }));
  const focusedTag = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check(`D49 ${w}×${h}: revealing the card leaves focus on Rerun`, focusedTag === "Rerun", focusedTag);
  const bar = await page.locator("#lab-run-bar").evaluate((e) => getComputedStyle(e).display);
  check(`D49 ${w}×${h}: no phone run bar`, bar === "none", bar);
  await context.close();
}

// 2. Phones and tablets: the run bar, and focus that never hides behind it.
for (const [w, h] of [[320, 640], [375, 812], [768, 1024]]) {
  const { page, context } = await open(w, h);
  const pos = await page.locator("section[aria-labelledby=edit]").evaluate((e) => getComputedStyle(e).position);
  check(`D49 ${w}×${h}: the edit section is in the page flow (not sticky)`, pos === "static", pos);
  const bar = await rectOf(page, "#lab-run-bar");
  check(`D49 ${w}×${h}: the run bar sits at the bottom edge`, Math.abs(bar.bottom - h) <= 1 && bar.height <= 72, JSON.stringify(bar));
  check(`D49 ${w}×${h}: the bar links to the editor first`, (await page.locator("#lab-run-bar a").getAttribute("href")) === "#edit");
  await page.locator("#lab-run-bar a").click();
  await page.waitForTimeout(250);
  const nb = await navBottom(page);
  const head = await rectOf(page, "#edit");
  check(`D49 ${w}×${h}: "Edit and run" lands on the editor heading, clear of the site bar`, head.top >= nb - 1 && head.bottom <= h, JSON.stringify({ head, nb }));
  check(`D49 ${w}×${h}: with the editor on screen, the bar links back to the findings`, (await page.locator("#lab-run-bar a").getAttribute("href")) === "#findings");
  await rerun(page, 1);
  const barText = await page.locator("#lab-run-bar").innerText();
  check(`D49 ${w}×${h}: after a run, the bar names it and shows its verdict`, /^Run 1\n/.test(barText), barText.replace(/\n/g, " | "));
  const scroll = await page.evaluate(() => [getComputedStyle(document.documentElement).scrollPaddingBottom, getComputedStyle(document.body).paddingBottom]);
  check(`D49 ${w}×${h}: scroll padding and body padding keep content above the bar`, parseFloat(scroll[0]) >= 72 && parseFloat(scroll[1]) >= 68, scroll.join(" / "));
  // Tab through everything; no focused element may be covered at all by the bar, or entirely by the site bar.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  let stops = 0;
  const underBar = [];
  const hiddenByNav = [];
  for (let i = 0; i < 260; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const bar = document.getElementById("lab-run-bar");
      const navB = document.querySelector("body > nav").getBoundingClientRect().bottom;
      const inBar = bar?.contains(el);
      const inNav = el.closest("body > nav");
      return { inBar, inNav: !!inNav, top: r.top, bottom: r.bottom, height: r.height, barTop: bar?.getBoundingClientRect().top ?? innerHeight, navB, name: (el.textContent || el.id || el.tagName).trim().slice(0, 30) };
    });
    if (!info) continue;
    stops += 1;
    // A control up to 120 px tall must be fully clear of the bar. A taller one that still fits between the
    // bars (the instruction box) must show its start, where focus and the caret are. One taller than the
    // space between the bars (a scrollable table) cannot fit; SC 2.4.11 then asks only that it is not
    // entirely hidden.
    const space = info.barTop - info.navB;
    const covered =
      info.height <= 120
        ? info.bottom > info.barTop + 0.5
        : info.height <= space
          ? !(info.top >= info.navB - 1 && info.top + 44 <= info.barTop)
          : !(info.top < info.barTop - 44 && info.bottom > info.navB + 44);
    if (!info.inBar && !info.inNav && covered) underBar.push(`${info.name} (${Math.round(info.top)}–${Math.round(info.bottom)} vs bar ${Math.round(info.barTop)})`);
    if (!info.inNav && !info.inBar && info.bottom <= info.navB) hiddenByNav.push(info.name);
  }
  check(`D49 ${w}×${h}: across ${stops} Tab stops, no focused control is covered by the run bar (small ones fully clear, tall ones with their start clear; WCAG 2.4.11)`, stops > 60 && underBar.length === 0, underBar.slice(0, 4).join(" | "));
  check(`D49 ${w}×${h}: … and none is entirely under the site bar`, hiddenByNav.length === 0, hiddenByNav.slice(0, 4).join(" | "));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  const lastLink = await page.evaluate(() => {
    const links = [...document.querySelectorAll("footer a")];
    const l = links[links.length - 1];
    return { bottom: l.getBoundingClientRect().bottom, barTop: document.getElementById("lab-run-bar").getBoundingClientRect().top };
  });
  check(`D49 ${w}×${h}: scrolled to the end, the last footer link sits above the bar`, lastLink.bottom <= lastLink.barTop, JSON.stringify(lastLink));
  await context.close();
}

// 3. Reflow, axe, and layout shift, simulated and live.
for (const [w, h] of [[320, 640], [375, 812], [768, 1024], [1024, 768], [1280, 900], [1440, 900]]) {
  const { page, context } = await open(w, h);
  for (const mode of ["simulated", "live"]) {
    if (mode === "live") {
      await page.locator("input[name=response-source][value=live]").check();
      await page.locator("#lab-live-key").fill("sk-ant-test-not-a-real-key-000000");
      await page.getByRole("button", { name: "Run baseline live" }).click();
      await page.waitForFunction(() => (document.querySelector("[role=status]")?.textContent ?? "").includes("complete"), null, { timeout: 30000 });
    }
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`D49 ${w}×${h} ${mode}: no horizontal page scroll`, ov <= 0, String(ov));
    if (AXE && (w === 320 || w === 1280)) {
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id}(${x.nodes.length})`));
      check(`D49 ${w}×${h} ${mode}: axe finds no violations`, v.length === 0, v.join(", "));
    }
  }
  await context.close();
}
for (const [w, h] of [[375, 812], [1280, 900]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(LAB, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const cls = await page.evaluate(() => window.__cls);
  check(`D49 ${w}×${h}: no layout shift on load`, cls < 0.01, cls.toFixed(4));
  await context.close();
}

// 4. Reduced motion, the one primary button, and the at-a-glance links.
for (const rm of ["reduce", "no-preference"]) {
  const { page, context } = await open(1280, 900, { reducedMotion: rm });
  await rerun(page, 1);
  const anim = await page.locator("#lab-result").evaluate((e) => getComputedStyle(e).animationName);
  check(`D49 reduced motion "${rm}": the result card ${rm === "reduce" ? "does not animate" : "outlines itself once"}`, rm === "reduce" ? anim === "none" : anim === "lab-flash", anim);
  if (rm === "no-preference") {
    const solid = await page.evaluate(() =>
      [...document.querySelectorAll("a[href], button")].filter((el) => !el.closest("body > nav") && el.getClientRects().length && /(^|\s)bg-zinc-50(\s|$)/.test(el.className) && !/^skip to/i.test(el.textContent.trim())).map((el) => el.textContent.trim()),
    );
    // The skip link is off-screen until focused; the D44 rule (one solid primary per view) excludes it the same way.
    check("D49: Rerun is the only solid primary button on the page", solid.length === 1 && solid[0] === "Rerun", solid.join(" | "));
    const links = page.locator("nav[aria-label='Checks at a glance'] a");
    const n = await links.count();
    const rows = await page.locator("section[aria-labelledby=findings] li[id^='finding-']").count();
    check("D49: Checks at a glance has one link per finding row", n === rows && n > 0, `${n} links, ${rows} rows`);
    await links.last().focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const href = await links.last().getAttribute("href");
    const target = await rectOf(page, href);
    const nb = await navBottom(page);
    check("D49: following a glance link brings its row into view below the site bar", (await page.evaluate(() => location.hash)) === href && target.top >= nb - 1 && target.top < 900, JSON.stringify({ href, top: target.top, nb }));
  }
  await context.close();
}

// 5. The run row pinned to the bottom of the editor column: always visible, never covering a focused control.
for (const mode of ["simulated", "live"]) {
  const { page, context } = await open(1280, 640);
  if (mode === "live") await page.locator("input[name=response-source][value=live]").check();
  await page.locator("#findings").evaluate((e) => e.scrollIntoView());
  await page.waitForTimeout(100);
  const row = await page.locator("section[aria-labelledby=edit] button:text-is('Rerun')").evaluate((b) => {
    const r = b.parentElement.getBoundingClientRect();
    const a = b.closest("section").getBoundingClientRect();
    return { rowTop: r.top, rowBottom: r.bottom, asideBottom: a.bottom, pos: getComputedStyle(b.parentElement).position };
  });
  check(`D49 1280×640 ${mode}: the run row is pinned to the bottom of the editor column and on screen`, row.pos === "sticky" && Math.abs(row.rowBottom - row.asideBottom) <= 2 && row.rowBottom <= 640, JSON.stringify(row));
  await page.locator("#lab-instruction").focus();
  const covered = [];
  let n = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      const aside = document.querySelector("section[aria-labelledby=edit]");
      if (!el || !aside.contains(el)) return null;
      const rerun = [...aside.querySelectorAll("button")].find((b) => b.textContent.trim() === "Rerun");
      const rowEl = rerun.parentElement;
      if (rowEl.contains(el)) return { inRow: true };
      const r = el.getBoundingClientRect();
      return { inRow: false, bottom: r.bottom, rowTop: rowEl.getBoundingClientRect().top, name: (el.textContent || el.id).trim().slice(0, 30) };
    });
    if (!info) break;
    n += 1;
    if (!info.inRow && info.bottom > info.rowTop + 0.5) covered.push(`${info.name} (${Math.round(info.bottom)} > ${Math.round(info.rowTop)})`);
  }
  check(`D49 1280×640 ${mode}: tabbing through the editor column (${n} stops), no control is under the pinned run row`, n >= 6 && covered.length === 0, covered.join(" | "));
  await context.close();
}

// 6. Live mode in a short desktop window: the editor column scrolls, and the key field stays reachable and visible.
{
  const { page, context } = await open(1280, 640);
  await page.locator("input[name=response-source][value=live]").check();
  const scrolls = await page.locator("section[aria-labelledby=edit]").evaluate((e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY === "auto");
  check("D49 1280×640 live: the editor column scrolls on its own", scrolls);
  await page.locator("#lab-fault").focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.id === "lab-live-key")) break;
  }
  const key = await rectOf(page, "#lab-live-key");
  const aside = await rectOf(page, "section[aria-labelledby=edit]");
  check("D49 1280×640 live: Tab reaches the key field and it is visible inside the editor column", (await page.evaluate(() => document.activeElement?.id)) === "lab-live-key" && key.top >= aside.top && key.bottom <= aside.bottom && key.bottom <= 640, JSON.stringify({ key, aside }));
  await context.close();
}

// 7. Live run from the findings: focus moves to Cancel and back to Rerun without moving the page or
// jumping the editor column (a plain focus() in the pinned row scrolls to the row's in-flow position).
{
  const { page, context } = await open(1280, 900);
  await page.route("**/api/lab/run", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", text: "Happy to help.", returnedModel: "claude-haiku-4-5-20251001", durationMs: 800 }) });
  });
  await page.locator("input[name=response-source][value=live]").check();
  await page.locator("#lab-live-key").fill("sk-ant-test-not-a-real-key-000000");
  await page.locator("#findings").evaluate((e) => e.scrollIntoView());
  await page.waitForTimeout(100);
  const state = () =>
    page.evaluate(() => ({
      y: scrollY,
      col: document.querySelector("section[aria-labelledby=edit]").scrollTop,
      verdict: Math.round(document.querySelector("section[aria-labelledby=findings] p.text-xl").getBoundingClientRect().top),
      focused: document.activeElement?.textContent?.trim(),
    }));
  await page.locator("section[aria-labelledby=edit] button:text-is('Run baseline live')").evaluate((b) => b.focus({ preventScroll: true }));
  const before = await state();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Cancel", null, { timeout: 5000 });
  const during = await state();
  check("D49 1280×900 live: focus moves to Cancel without scrolling the page or the editor column", during.y === before.y && during.col === before.col, JSON.stringify({ before, during }));
  await page.waitForFunction(() => (document.querySelector("[role=status]")?.textContent ?? "").includes("Run 1 complete"), null, { timeout: 30000 });
  await page.waitForTimeout(200);
  const after = await state();
  check("D49 1280×900 live: after the run, focus is back on Run baseline live and the findings have not moved", after.focused === "Run baseline live" && Math.abs(after.verdict - before.verdict) <= 1, JSON.stringify({ before, after }));
  await context.close();
}

await browser.close();
console.log(`SUMMARY: ${pass}/${pass + fail} checks passed; ${fail} failed.`);
process.exit(fail ? 1 : 0);
