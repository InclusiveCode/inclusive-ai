import { useEffect, useState, type RefObject } from "react";
import { CLIENT_MESSAGES } from "../../../lib/lab/live-messages";
import { LIVE_MODELS, PROVIDER_LABEL, type Provider } from "../../../lib/lab/models";
import { BUTTON, FOCUS } from "./status";

export const BASELINE_LIVE_HELP_ID = "lab-baseline-live-help";
export const BASELINE_LIVE_HELP =
  "Runs the scenario's original instruction (not your edits) to set the live baseline. Use Rerun to run your edited instruction.";

/** U2: describes the "Run baseline live" button, which references it with aria-describedby. */
export function BaselineLiveHelp() {
  return (
    <p id={BASELINE_LIVE_HELP_ID} className="text-sm text-zinc-400">
      {BASELINE_LIVE_HELP}
    </p>
  );
}

/** Notice copy: every sentence describes what the site actually does. */
export function LIVE_NOTICE(provider: string, billing = "Each run makes 2 billed calls.", simulatedMode = true): string[] {
  return [
    `This site doesn't store or log your key. It's sent over HTTPS to this site's server (hosted on Vercel) and on to ${provider} for each run, and isn't kept after the request.`,
    `Your instruction and the fictional scenario text also go through this site's server to ${provider}, and ${provider}'s own data-retention policies apply to them.`,
    `Your key stays in this field until you clear it, switch provider, ${simulatedMode ? "switch to simulated mode, " : ""}reload, or leave the page.`,
    `${billing} Cancelling stops waiting but may not stop calls already sent.`,
    "Use a low-limit key you can revoke. Do not enter personal data.",
  ];
}

/**
 * Clears the key input on `pagehide` (the back/forward cache keeps the DOM) and when
 * the returned cleanup runs (unmount). Returns the cleanup.
 */
export function installKeyClearing(target: EventTarget, input: { value: string } | null): () => void {
  const clear = () => {
    if (input) input.value = "";
  };
  target.addEventListener("pagehide", clear);
  return () => {
    target.removeEventListener("pagehide", clear);
    clear();
  };
}

/** Empties the key field when the provider changes; returns the polite announcement. */
export function clearKeyForProviderSwitch(input: { value: string } | null, provider: Provider): string {
  if (input) input.value = "";
  return `Key cleared — enter your ${PROVIDER_LABEL[provider]} key`;
}

const PROVIDERS: Provider[] = ["anthropic", "openai"];

/**
 * Live model controls. The key input is uncontrolled: its value lives only in the
 * DOM element (read through `keyInputRef` at run time), never in React state or props.
 */
export function LivePanel({
  provider,
  modelId,
  onProviderChange,
  onModelChange,
  keyInputRef,
  keyError,
  onKeyErrorClear,
  billing,
  simulatedMode = true,
}: {
  provider: Provider;
  modelId: string;
  onProviderChange: (p: Provider) => void;
  onModelChange: (id: string) => void;
  keyInputRef: RefObject<HTMLInputElement | null>;
  /** The fixed message for a missing or malformed key; `true` means the standard "no key" message. */
  keyError: string | boolean | null;
  onKeyErrorClear: () => void;
  /** The billing sentence of the notice; defaults to the lab's 2 calls per run. */
  billing?: string;
  /** False on pages with no simulated mode, so the notice doesn't mention switching to it. */
  simulatedMode?: boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const keyErrorText = keyError === true ? CLIENT_MESSAGES.noKey : keyError || null;
  const label = PROVIDER_LABEL[provider];

  useEffect(() => installKeyClearing(window, keyInputRef.current), [keyInputRef]);

  function clearKey() {
    if (keyInputRef.current) {
      keyInputRef.current.value = "";
      keyInputRef.current.focus();
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-sky-400/40 bg-sky-950/20 p-4">
      {/* D49: the panel sits in the narrow editor column on desktop, so it follows its container, not the viewport. */}
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <div>
          <label htmlFor="lab-live-provider" className="block text-sm font-medium text-zinc-100">
            Provider
          </label>
          <select
            id="lab-live-provider"
            value={provider}
            autoComplete="off"
            onChange={(e) => onProviderChange(e.target.value as Provider)}
            className={`mt-1 w-full rounded-md border border-zinc-500 bg-zinc-900 p-2 text-sm text-zinc-100 ${FOCUS}`}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lab-live-model" className="block text-sm font-medium text-zinc-100">
            Model
          </label>
          <select
            id="lab-live-model"
            value={modelId}
            autoComplete="off"
            onChange={(e) => onModelChange(e.target.value)}
            className={`mt-1 w-full rounded-md border border-zinc-500 bg-zinc-900 p-2 text-sm text-zinc-100 ${FOCUS}`}
          >
            {LIVE_MODELS.filter((m) => m.provider === provider).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.id})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="lab-live-key" className="block text-sm font-medium text-zinc-100">
          Your {label} API key
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            ref={keyInputRef}
            id="lab-live-key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={keyErrorText ? true : undefined}
            aria-describedby={keyErrorText ? "lab-live-key-error lab-live-notice" : "lab-live-notice"}
            onInput={() => {
              if (keyErrorText) onKeyErrorClear();
            }}
            className={`min-w-0 flex-1 rounded-md border border-zinc-500 bg-zinc-900 p-2 font-mono text-sm text-zinc-100 ${FOCUS}`}
          />
          <button type="button" aria-pressed={showKey} className={BUTTON} onClick={() => setShowKey((v) => !v)}>
            Show key
          </button>
          <button type="button" className={BUTTON} onClick={clearKey}>
            Clear key
          </button>
        </div>
        {keyErrorText && (
          <p id="lab-live-key-error" role="alert" className="mt-2 text-sm text-rose-300">
            {keyErrorText}.
          </p>
        )}
      </div>
      <div id="lab-live-notice" className="space-y-1 text-sm text-zinc-300">
        {LIVE_NOTICE(label, billing, simulatedMode).map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>
    </div>
  );
}
