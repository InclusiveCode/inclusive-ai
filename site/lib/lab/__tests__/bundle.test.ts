import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Checks the built client bundle (`npm run build` output). Skips when there is no build,
 * except under LAB_BUNDLE_CHECK=1 (set by CI after the build), where a missing build fails.
 */
const SITE = resolve(__dirname, "../../..");

describe("built client bundle (after `npm run build`)", () => {
  const STATIC = join(SITE, ".next", "static");
  // CI sets LAB_BUNDLE_CHECK=1 after the build: then a missing build output is a failure, not a skip.
  const REQUIRED = process.env.LAB_BUNDLE_CHECK === "1";
  function all(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? all(p) : [p];
    });
  }
  it.skipIf(!REQUIRED && !existsSync(STATIC))("contains no provider API hosts, placeholder keys, or bearer tokens", () => {
    expect(existsSync(STATIC), "LAB_BUNDLE_CHECK=1 but .next/static is missing; run `npm run build` first").toBe(true);
    const files = all(STATIC).filter((f) => /\.(js|mjs|css|json|txt|map|html)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toContain("api.anthropic.com");
      expect(src, f).not.toContain("api.openai.com");
      expect(src, f).not.toMatch(/PLACEHOLDER|Bearer [A-Za-z0-9]/);
    }
  });
});
