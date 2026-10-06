import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterNextPaint } from "../../../app/lab/yield";

const SITE = resolve(__dirname, "../../..");

describe("F3: afterNextPaint", () => {
  let frames: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      frames.push(cb);
      return frames.length;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves in a task after the next animation frame, not before", async () => {
    let done = false;
    void afterNextPaint().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    frames.shift()!(); // the frame is produced
    await Promise.resolve();
    expect(done).toBe(false); // still waiting for the task after the frame
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it("still resolves when no frame comes (hidden tab), via the fallback timer", async () => {
    let done = false;
    void afterNextPaint(50).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(49);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });

  it("resolves once even when both the frame and the fallback fire", async () => {
    const spy = vi.fn();
    void afterNextPaint(10).then(spy);
    frames.shift()!();
    await vi.advanceTimersByTimeAsync(20);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("F3: a run paints “Running…” before the evaluation work starts", () => {
  it("startRun awaits afterNextPaint after setting the running state and before calling runScenario", () => {
    const src = readFileSync(join(SITE, "app/lab/lab-client.tsx"), "utf8");
    const body = src.slice(src.indexOf("async function startRun("), src.indexOf("function compareContent("));
    const at = (needle: string) => {
      const i = body.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const running = at('setAnnouncement("Running…");');
    const paint = at("await afterNextPaint();");
    const run = at("await runScenario(");
    expect(running).toBeLessThan(paint);
    expect(paint).toBeLessThan(run);
    // The run's inputs are fixed before the wait.
    expect(at("const runInstruction =")).toBeLessThan(paint);
    expect(at("const n = (runCount[s.id] ?? 0) + 1;")).toBeLessThan(paint);
  });
});
