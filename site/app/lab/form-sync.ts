/**
 * Keeps the lab's form controls equal to the state the lab acts on (D41, F1).
 *
 * Two things can change a control without React knowing:
 * - the browser restoring form state on history navigation (Back after leaving /lab);
 * - a click before hydration.
 * React 19 keeps such DOM values when it hydrates, so a radio could show one scenario or mode
 * while the lab ran another. The controls set autocomplete="off", which stops restoration where
 * the browser honours it. These helpers cover the rest:
 * - after mount, choices clicked before hydration are adopted (radios and selects only);
 * - after mount and on every `pageshow`, the DOM is forced to match the state.
 */

/** What the lab's controls must show. */
export interface LabControlState {
  scenarioId: string;
  source: "simulated" | "live";
  fault: string;
  instruction: string;
  /** The "Show run" radio that is checked, or null while those radios are not shown. */
  viewRun: string | null;
  /** Live panel selects (present only in live mode). */
  provider: string;
  modelId: string;
}

/** A form control as far as these helpers are concerned. */
interface Control {
  value: string;
  checked: boolean;
}

function radios(root: ParentNode, name: string): Control[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`));
}

function one(root: ParentNode, selector: string): Control | null {
  return root.querySelector<HTMLInputElement>(selector);
}

/**
 * Choices the user made before hydration: a checked radio or a select value that differs from the
 * initial state and is a valid choice. Restoration is off, so on mount a difference can only come
 * from this visit. The instruction text is never adopted. React overwrites it on hydration, and
 * the textarea is read-only until then.
 */
export function readPreHydrationChoices(
  root: ParentNode,
  state: LabControlState,
  valid: { scenarioIds: readonly string[]; faults: readonly string[] },
): { scenarioId?: string; source?: "simulated" | "live"; fault?: string } {
  const out: { scenarioId?: string; source?: "simulated" | "live"; fault?: string } = {};
  const scenario = radios(root, "scenario").find((r) => r.checked)?.value;
  if (scenario && scenario !== state.scenarioId && valid.scenarioIds.includes(scenario)) out.scenarioId = scenario;
  const source = radios(root, "response-source").find((r) => r.checked)?.value;
  if ((source === "simulated" || source === "live") && source !== state.source) out.source = source;
  const fault = one(root, "#lab-fault")?.value;
  if (fault && fault !== state.fault && valid.faults.includes(fault)) out.fault = fault;
  return out;
}

/** Forces every lab control under `root` to show `state`. Returns how many controls were corrected. */
export function forceLabControls(root: ParentNode, state: LabControlState): number {
  let corrected = 0;
  const groups: Array<[string, string | null]> = [
    ["scenario", state.scenarioId],
    ["response-source", state.source],
    ["view-run", state.viewRun],
  ];
  for (const [name, want] of groups) {
    if (want === null) continue;
    for (const r of radios(root, name)) {
      const checked = r.value === want;
      if (r.checked !== checked) {
        r.checked = checked;
        corrected += 1;
      }
    }
  }
  const values: Array<[string, string]> = [
    ["#lab-fault", state.fault],
    ["#lab-instruction", state.instruction],
    ["#lab-live-provider", state.provider],
    ["#lab-live-model", state.modelId],
  ];
  for (const [selector, want] of values) {
    const el = one(root, selector);
    if (el && el.value !== want) {
      el.value = want;
      corrected += 1;
    }
  }
  return corrected;
}
