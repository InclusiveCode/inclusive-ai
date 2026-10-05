import { useEffect, useState, type RefObject } from "react";
import { LIVE_MODELS, PROVIDER_LABEL, type Provider } from "../../../lib/lab/models";
import { BUTTON, FOCUS } from "./status";

/** Notice copy: every sentence describes what the site actually does. */
export function LIVE_NOTICE(provider: string): string[] {
  return [
    `This site doesn't store or log your key. It's sent over HTTPS to this site's server and to ${provider} for each run, and isn't kept after the request.`,
    `${provider}'s own data-retention policies apply to the instruction and scenario text you send.`,
    "Your key stays in this field until you clear it, switch to simulated mode, reload, or leave the page.",
    "Each run makes 2 billed calls. Cancelling stops waiting but may not stop calls already sent.",
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
}: {
  provider: Provider;
  modelId: string;
  onProviderChange: (p: Provider) => void;
  onModelChange: (id: string) => void;
  keyInputRef: RefObject<HTMLInputElement | null>;
  keyError: boolean;
  onKeyErrorClear: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="lab-live-provider" className="block text-sm font-medium text-zinc-100">
            Provider
          </label>
          <select
            id="lab-live-provider"
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as Provider)}
            className={`mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 ${FOCUS}`}
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
            onChange={(e) => onModelChange(e.target.value)}
            className={`mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 ${FOCUS}`}
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
            aria-invalid={keyError || undefined}
            aria-describedby={keyError ? "lab-live-key-error lab-live-notice" : "lab-live-notice"}
            onInput={() => {
              if (keyError) onKeyErrorClear();
            }}
            className={`min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 p-2 font-mono text-sm text-zinc-100 ${FOCUS}`}
          />
          <button type="button" aria-pressed={showKey} className={BUTTON} onClick={() => setShowKey((v) => !v)}>
            {showKey ? "Hide key" : "Show key"}
          </button>
          <button type="button" className={BUTTON} onClick={clearKey}>
            Clear key
          </button>
        </div>
        {keyError && (
          <p id="lab-live-key-error" role="alert" className="mt-2 text-sm text-rose-300">
            Enter your API key to run live.
          </p>
        )}
      </div>
      <div id="lab-live-notice" className="space-y-1 text-sm text-zinc-300">
        {LIVE_NOTICE(label).map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>
    </div>
  );
}
