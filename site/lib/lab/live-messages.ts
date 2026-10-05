/**
 * Fixed, provider-neutral messages for live results. The server sends only these
 * strings; the client shows only these strings (anything else is replaced).
 */
export const PROVIDER_MESSAGES = {
  tokenLimit: "Response cut off at the token limit — not evaluated",
  refused: "The provider declined to answer (safety system) — not evaluated",
  badKey: "The provider rejected the API key",
  rateLimited: "Rate limited by the provider",
  noQuota: "The provider account has no remaining quota",
  rejected: "The provider rejected the model or request",
  unavailable: "Provider unavailable",
} as const;

export const ALLOWED_PROVIDER_MESSAGES: ReadonlySet<string> = new Set(Object.values(PROVIDER_MESSAGES));

/** Fixed messages the client responder produces itself. */
export const CLIENT_MESSAGES = {
  noKey: "Enter your API key to run live",
  keyInInstruction: "Your instruction contains your API key — remove it before running",
  inputMismatch: "Input does not match the scenario",
  unreachable: "Could not reach the lab server",
  serverFailed: "The lab server failed to handle the request",
  cancelled: "Cancelled",
  timedOut: "The live request timed out",
  rejected: "The lab server rejected the request",
} as const;

/** Fixed messages for non-200 replies from the lab server, chosen by status code only. */
export const HTTP_MESSAGES: Readonly<Record<number, string>> = {
  400: "The lab server rejected the request (check the API key format)",
  409: "This page is out of date — reload it and try again",
  413: "The request was too large",
  429: "Too many live requests — wait a minute and try again",
};

/** Every message a live result may carry; the UI shows nothing else. */
export const ALLOWED_LIVE_MESSAGES: ReadonlySet<string> = new Set([
  ...Object.values(PROVIDER_MESSAGES),
  ...Object.values(CLIENT_MESSAGES),
  ...Object.values(HTTP_MESSAGES),
]);
