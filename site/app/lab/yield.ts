/**
 * F3: resolves after the browser has had a chance to paint, so work that follows does not block
 * the interaction that started it (the "Running…" state paints first).
 *
 * A setTimeout queued from requestAnimationFrame runs after that frame. Hidden tabs never fire
 * requestAnimationFrame, so a fallback timer makes sure the work still starts.
 */
export function afterNextPaint(fallbackMs = 50): Promise<void> {
  return new Promise((resolve) => {
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      setTimeout(resolve, 0);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
    setTimeout(go, fallbackMs);
  });
}
