// Releases of the @inclusive-ai packages come from
// MichaelVacirca/inclusive-eval-lab through npm trusted publishing (no npm
// token). These tests keep a token-based publish workflow from coming back
// here, and keep CONTRIBUTING.md pointing at where releases actually happen.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, allSteps, fileExists, loadYaml, workflowFiles } from "./harness";

const RELEASE_REPO = "MichaelVacirca/inclusive-eval-lab";

describe("publishing from this repository", () => {
  const files = workflowFiles();

  it("finds the workflows", () => {
    expect(files).toContain(".github/workflows/ci.yml");
  });

  it("has no publish workflow", () => {
    expect(fileExists(".github/workflows/publish-eval.yml")).toBe(false);
  });

  it.each(files)("%s never publishes to npm", (file) => {
    for (const step of allSteps(loadYaml(file))) {
      expect(step.run ?? "", `${file}: ${step.name ?? step.run ?? step.uses}`).not.toMatch(/\bnpm\s+(publish|dist-tag)\b/);
    }
  });

  it.each(files)("%s uses no npm token", (file) => {
    const text = readFileSync(join(REPO_ROOT, file), "utf8");
    expect(text).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/);
  });

  it("does not set up a registry login in the composite action either", () => {
    const action = readFileSync(join(REPO_ROOT, "action/action.yml"), "utf8");
    expect(action).not.toMatch(/registry-url|NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|npm\s+publish/);
  });
});

describe("CONTRIBUTING.md", () => {
  const guide = readFileSync(join(REPO_ROOT, "CONTRIBUTING.md"), "utf8");
  const section = /## Releases\n([\s\S]*?)\n## /.exec(guide)?.[1] ?? "";

  it("has a Releases section", () => {
    expect(section).not.toBe("");
  });

  it("says releases come from the lab repository, by trusted publishing", () => {
    expect(section).toContain(`https://github.com/${RELEASE_REPO}`);
    expect(section).toContain(`https://github.com/${RELEASE_REPO}/blob/main/docs/releasing.md`);
    expect(section).toContain("trusted publishing");
    expect(section).toContain("This repository has no publish workflow");
  });
});
