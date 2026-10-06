import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LivePanel } from "../../../app/lab/components/live-panel";
import { forceLabControls, readPreHydrationChoices, type LabControlState } from "../../../app/lab/form-sync";
import { LabClient } from "../../../app/lab/lab-client";
import { runScenario } from "../run";
import { scenarios } from "../scenarios";
import { SIMULATED_CONFIG, SIMULATOR_VERSION, simulatedResponder } from "../simulator";

const SITE = resolve(__dirname, "../../..");

/** A tiny DOM: radios (a checked radio unchecks the rest of its group) and value controls by id. */
function fakeRoot(spec: { radios: Array<[name: string, value: string, checked: boolean]>; values: Record<string, string> }) {
  const radios = spec.radios.map(([name, value, checked]) => ({ name, value, _checked: checked }));
  const radioEls = radios.map((r) => ({
    get value() {
      return r.value;
    },
    get checked() {
      return r._checked;
    },
    set checked(v: boolean) {
      if (v) for (const o of radios) if (o.name === r.name) o._checked = false;
      r._checked = v;
    },
    name: r.name,
  }));
  const values = Object.fromEntries(Object.entries(spec.values).map(([id, value]) => [id, { value, checked: false }]));
  const root = {
    querySelectorAll(selector: string) {
      const m = selector.match(/^input\[type="radio"\]\[name="([^"]+)"\]$/);
      if (!m) throw new Error(`unexpected selector ${selector}`);
      return radioEls.filter((r) => r.name === m[1]);
    },
    querySelector(selector: string) {
      const m = selector.match(/^#([\w-]+)$/);
      if (!m) throw new Error(`unexpected selector ${selector}`);
      return values[m[1]] ?? null;
    },
  };
  const shown = () => ({
    radios: Object.fromEntries([...new Set(radios.map((r) => r.name))].map((n) => [n, radios.find((r) => r.name === n && r._checked)?.value ?? null])),
    values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.value])),
  });
  return { root: root as unknown as ParentNode, shown };
}

const [S1, S2, S3] = scenarios;
const STATE: LabControlState = {
  scenarioId: S1.id,
  source: "simulated",
  fault: "none",
  instruction: S1.baselineInstruction,
  viewRun: null,
  provider: "anthropic",
  modelId: "claude-haiku-4-5",
};
const scenarioRadios = (checked: string): Array<[string, string, boolean]> => scenarios.map((s) => ["scenario", s.id, s.id === checked]);
const sourceRadios = (checked: string): Array<[string, string, boolean]> => [
  ["response-source", "simulated", checked === "simulated"],
  ["response-source", "live", checked === "live"],
];

describe("F1: forceLabControls (state wins)", () => {
  it("undoes restored form state: scenario, source, fault, and another scenario's instruction text", () => {
    const { root, shown } = fakeRoot({
      radios: [...scenarioRadios(S2.id), ...sourceRadios("live")],
      values: { "lab-fault": "timeout", "lab-instruction": S3.baselineInstruction + " EDITED ON AN EARLIER VISIT" },
    });
    // One radio per group (checking it unchecks the rest of its group), the fault, and the instruction.
    expect(forceLabControls(root, STATE)).toBe(4);
    expect(shown()).toEqual({
      radios: { scenario: S1.id, "response-source": "simulated" },
      values: { "lab-fault": "none", "lab-instruction": S1.baselineInstruction },
    });
    expect(forceLabControls(root, STATE)).toBe(0); // idempotent
  });

  it("forces the Show run radios and the live panel selects when they are present", () => {
    const { root, shown } = fakeRoot({
      radios: [...scenarioRadios(S1.id), ...sourceRadios("live"), ["view-run", "baseline", true], ["view-run", "latest", false], ["view-run", "run-1", false]],
      values: { "lab-fault": "none", "lab-instruction": S1.baselineInstruction, "lab-live-provider": "openai", "lab-live-model": "gpt-4o-mini" },
    });
    const live = { ...STATE, source: "live" as const, viewRun: "latest" };
    expect(forceLabControls(root, live)).toBe(4);
    expect(shown().radios["view-run"]).toBe("latest");
    expect(shown().values).toMatchObject({ "lab-live-provider": "anthropic", "lab-live-model": "claude-haiku-4-5" });
  });

  it("leaves the Show run radios alone while they are not shown (viewRun null) and skips missing controls", () => {
    const { root } = fakeRoot({ radios: [...scenarioRadios(S1.id), ...sourceRadios("simulated")], values: {} });
    expect(forceLabControls(root, STATE)).toBe(0);
  });
});

describe("F1: readPreHydrationChoices (a click before hydration becomes state)", () => {
  const valid = { scenarioIds: scenarios.map((s) => s.id), faults: ["none", "model_error", "timeout", "credentials_unavailable", "malformed_result"] };

  it("adopts a scenario, source, and fault picked before hydration", () => {
    const { root } = fakeRoot({
      radios: [...scenarioRadios(S3.id), ...sourceRadios("live")],
      values: { "lab-fault": "model_error", "lab-instruction": S1.baselineInstruction + " TYPED" },
    });
    expect(readPreHydrationChoices(root, STATE, valid)).toEqual({ scenarioId: S3.id, source: "live", fault: "model_error" });
  });

  it("adopts nothing when the controls match, and never the instruction text", () => {
    const { root } = fakeRoot({
      radios: [...scenarioRadios(S1.id), ...sourceRadios("simulated")],
      values: { "lab-fault": "none", "lab-instruction": "something else entirely" },
    });
    expect(readPreHydrationChoices(root, STATE, valid)).toEqual({});
  });

  it("ignores values that are not valid choices", () => {
    const { root } = fakeRoot({
      radios: [["scenario", "not-a-scenario", true], ["response-source", "remote", true]],
      values: { "lab-fault": "explode" },
    });
    expect(readPreHydrationChoices(root, STATE, valid)).toEqual({});
  });
});

describe("F1: the lab's controls do not take part in browser form restoration", () => {
  async function baselines() {
    return Promise.all(
      scenarios.map((s) =>
        runScenario(s, s.baselineInstruction, simulatedResponder, SIMULATED_CONFIG, {
          id: `${s.id}-baseline`,
          createdAt: "2026-10-05T00:00:00.000Z",
          mode: "simulated",
          responderVersion: SIMULATOR_VERSION,
        }),
      ),
    );
  }

  it("every radio, select, and textarea in the server-rendered lab has autocomplete=off", async () => {
    const html = renderToStaticMarkup(createElement(LabClient, { baselineRuns: await baselines() }));
    const controls = html.match(/<(input(?=[^>]*type="radio")|select|textarea)\b[^>]*>/g) ?? [];
    expect(controls.length).toBe(scenarios.length + 2 + 1 + 1); // scenario radios, source radios, fault select, textarea
    for (const c of controls) expect(c, c).toMatch(/\bautocomplete="off"/i); // React 19 keeps the camel case; HTML ignores case
  });

  it("the instruction textarea is read-only until hydrated (server markup), so no typing is silently discarded", async () => {
    const html = renderToStaticMarkup(createElement(LabClient, { baselineRuns: await baselines() }));
    expect(html).toMatch(/<textarea(?=[^>]*id="lab-instruction")(?=[^>]*readonly="")[^>]*>/i);
  });

  it("the live panel selects have autocomplete=off, and the key input is in no form", () => {
    const html = renderToStaticMarkup(
      createElement(LivePanel, {
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        onProviderChange: () => {},
        onModelChange: () => {},
        keyInputRef: { current: null },
        keyError: null,
        onKeyErrorClear: () => {},
      }),
    );
    const selects = html.match(/<select\b[^>]*>/g) ?? [];
    expect(selects).toHaveLength(2);
    for (const s of selects) expect(s).toMatch(/\bautocomplete="off"/i);
    expect(html).not.toContain("<form");
    expect(readFileSync(join(SITE, "app/lab/lab-client.tsx"), "utf8")).not.toContain("<form");
  });

  it("the human review form's radios and textarea have autocomplete=off", () => {
    const src = readFileSync(join(SITE, "app/lab/components/findings.tsx"), "utf8");
    const form = src.slice(src.indexOf("<form"), src.indexOf("</form>"));
    const controls = form.match(/<(input|textarea|select)\b[\s\S]*?\/>/g) ?? [];
    expect(controls.length).toBe(2);
    for (const c of controls) expect(c).toContain('autoComplete="off"');
  });
});

describe("F1: the lab adopts pre-hydration clicks on mount and forces the DOM on mount and pageshow", () => {
  const src = readFileSync(join(SITE, "app/lab/lab-client.tsx"), "utf8");

  it("adopts choices once after hydration, then marks the lab hydrated", () => {
    const mount = src.slice(src.indexOf("const picked = readPreHydrationChoices("), src.indexOf("setHydrated(true);"));
    expect(mount).toContain("if (picked.scenarioId) chooseScenario(picked.scenarioId);");
    expect(mount).toContain("if (picked.source) setSource(picked.source);");
    expect(mount).toContain("if (picked.fault) setFault(picked.fault as FaultKind);");
    expect(mount).not.toMatch(/setInstruction|setInstructions/);
  });

  it("forces every control to the state after hydration and on every pageshow", () => {
    expect(src).toMatch(/if \(!hydrated\) return;\s*const sync = \(\) => \{\s*if \(rootRef\.current\) forceLabControls\(rootRef\.current, controlStateRef\.current\);\s*\};\s*sync\(\);\s*window\.addEventListener\("pageshow", sync\);\s*return \(\) => window\.removeEventListener\("pageshow", sync\);/);
    expect(src).toContain('<div ref={rootRef} className="mx-auto max-w-6xl');
    expect(src).toContain("readOnly={!hydrated}");
  });

  it("the Show run radios use the same checked value that the reconcile forces", () => {
    expect(src).toContain("checked={o.value === viewRun}");
    expect(src).toContain("viewRun: latestRun ? viewRun : null,");
  });
});
