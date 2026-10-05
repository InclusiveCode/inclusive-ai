import { PROVIDER_LABEL } from "../../../lib/lab/models";
import type { Run } from "../../../lib/lab/types";

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

/** The page banner follows the run being displayed, not the response-source radio. */
export function RunBanner({ run }: { run: Run }) {
  if (run.mode === "live") {
    return (
      <div role="note" className="mb-8 rounded-xl border-2 border-sky-300/70 bg-sky-950/40 p-4 text-sky-100">
        <p className="min-w-0">
          Live run: responses from {providerLabel(run.config.provider)} <span className="break-all">{returnedModelText(run)}</span>. One sample
          per run; differences between runs can be nondeterministic. A pass means only that the displayed checks passed.
        </p>
      </div>
    );
  }
  return (
    <div role="note" className="mb-8 rounded-xl border-2 border-amber-300/70 bg-amber-950/40 p-4 text-amber-100">
      <p>
        <strong>Simulated demo — no AI model is called.</strong> Responses come from a scripted simulator (lab-simulator-rules-v1) built to
        show known failure modes. An improvement here demonstrates the workflow, not real model behavior. All people, organizations, and
        data are fictional.
      </p>
    </div>
  );
}
