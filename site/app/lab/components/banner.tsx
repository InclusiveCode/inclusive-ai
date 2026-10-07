import Link from "next/link";
import { PROVIDER_LABEL } from "../../../lib/lab/models";
import type { Run, RunMode } from "../../../lib/lab/types";

/** The model ids the provider reported, as one readable string. */
export function returnedModelText(run: Run): string {
  const a = run.responses.a.returnedModel;
  const b = run.responses.b.returnedModel;
  if (a && b) return a === b ? a : `${a} (Version A) / ${b} (Version B)`;
  if (a) return `${a} (Version A only)`;
  if (b) return `${b} (Version B only)`;
  return "(model not reported)";
}

export function providerLabel(provider: string): string {
  return (PROVIDER_LABEL as Record<string, string>)[provider] ?? provider;
}

const LINK =
  "underline decoration-amber-300/60 underline-offset-4 hover:decoration-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";

/**
 * The page banner follows the run being displayed, not the response-source radio. The radio only
 * decides whether the simulated banner still points to live mode (it doesn't once Live is selected).
 */
export function RunBanner({ run, source = "simulated" }: { run: Run; source?: RunMode }) {
  if (run.mode === "live") {
    return (
      <div role="note" className="mb-8 rounded-xl border-2 border-sky-300/70 bg-sky-950/40 p-4 text-sky-100">
        {/* wrap-anywhere breaks only a word too long for the line (a long returned-model id at 320px). */}
        <p className="min-w-0 wrap-anywhere">
          Live run: responses from {providerLabel(run.config.provider)} {returnedModelText(run)}. One sample
          per run; differences between runs can be nondeterministic. A pass means only that the displayed checks passed.
        </p>
      </div>
    );
  }
  return (
    <div role="note" className="mb-8 rounded-xl border-2 border-amber-300/70 bg-amber-950/40 p-4 text-amber-100">
      <p>
        <strong>Showing a simulated run — no AI model was called.</strong> These responses come from a scripted simulator
        (lab-simulator-rules-v1) built to show known failure modes, so an improvement here demonstrates the workflow, not real model
        behavior. All people, organizations, and data are fictional.
      </p>
      {source === "live" ? (
        // Live is already selected (the note below says so), so only the prompt-test pointer remains.
        <p className="mt-2">
          You can also{" "}
          <Link href="/lab/prompt-test" className={LINK}>
            test your own system prompt
          </Link>{" "}
          against scenarios written for your product.
        </p>
      ) : (
        <p className="mt-2">
          <strong>Live mode is available.</strong> Choose “Live model (your API key)” in{" "}
          <a href="#edit" className={LINK}>
            4. Edit the instruction and rerun
          </a>{" "}
          to get real responses from a model with your own API key, or{" "}
          <Link href="/lab/prompt-test" className={LINK}>
            test your own system prompt
          </Link>{" "}
          against scenarios written for your product.
        </p>
      )}
    </div>
  );
}

export const LIVE_SELECTED_SIMULATED_NOTE = "Live mode is selected — the results below are from a simulated run until you run live.";

/**
 * U1: while Live is selected but the displayed run is simulated, a static line under the banner
 * says so. The banner itself keeps describing the displayed run. Not a live region.
 */
export function LiveSelectedNote({ source, run }: { source: RunMode; run: Run | undefined }) {
  if (source !== "live" || !run || run.mode !== "simulated") return null;
  return <p className="-mt-6 mb-8 text-sm text-zinc-300">{LIVE_SELECTED_SIMULATED_NOTE}</p>;
}
