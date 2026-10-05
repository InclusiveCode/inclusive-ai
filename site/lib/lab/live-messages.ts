import { KEY_FORMAT_HINT, KEY_PROBLEM_MESSAGE } from "./live-key";

/**
 * Fixed, provider-neutral messages for live results. The server sends only these
 * strings; the client shows only these strings (anything else is replaced).
 */
export const PROVIDER_MESSAGES = {
  tokenLimit: "Response cut off at the token limit — not evaluated",
  refused: "The provider declined to answer (safety system) — not evaluated",
  badKey: "The provider rejected the API key",
  keyDenied: "The provider denied this key access (check the account's permissions or region)",
  modelUnavailable: "This model isn't available to the account behind this key",
  billing: "The provider reports a billing problem on this account (check credits or payment)",
  rateLimited: "Rate limited by the provider",
  noQuota: "The provider account has no remaining quota",
  rejected: "The provider rejected the request",
  unavailable: "Provider unavailable",
} as const;

/**
 * Provider error types that may be named after the 400 message (decision D40). Only these
 * fixed identifiers are ever appended; the provider's own message text never is.
 */
export const NAMEABLE_ERROR_TYPES = ["invalid_request_error", "billing_error", "not_found_error", "permission_error"] as const;

/** The 400 message, naming the error type only when it is one of NAMEABLE_ERROR_TYPES. */
export function providerRejectedMessage(type: unknown): string {
  const named = NAMEABLE_ERROR_TYPES.find((t) => t === type);
  return named ? `${PROVIDER_MESSAGES.rejected} (${named})` : PROVIDER_MESSAGES.rejected;
}

export const ALLOWED_PROVIDER_MESSAGES: ReadonlySet<string> = new Set([
  ...Object.values(PROVIDER_MESSAGES),
  ...NAMEABLE_ERROR_TYPES.map(providerRejectedMessage),
]);

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

/**
 * The route's own fixed request-check messages (4xx). The server sends only these, and the
 * client shows one exactly when a reply carries it; any other text is never shown.
 */
export const ROUTE_MESSAGES = {
  method: "Method not allowed",
  contentType: "Content type must be application/json",
  tooLarge: "Request body too large",
  badJson: "Request body is not valid JSON",
  scenario: "Unknown scenario",
  version: "Scenario version mismatch — reload the page",
  variant: "Variant must be a or b",
  instruction: "Instruction must be text of at most 4000 characters",
  model: "Unknown provider or model",
  key: `Missing or malformed API key — ${KEY_FORMAT_HINT}`,
  keyProvider: KEY_PROBLEM_MESSAGE.provider,
  keyInInstruction: CLIENT_MESSAGES.keyInInstruction,
} as const;

export const ALLOWED_ROUTE_MESSAGES: ReadonlySet<string> = new Set(Object.values(ROUTE_MESSAGES));

/** Fixed fallbacks for non-200 replies without a usable route message, chosen by status code only. */
export const HTTP_MESSAGES: Readonly<Record<number, string>> = {
  400: "The lab server rejected the request",
  405: "The lab server only accepts POST requests",
  409: "This page is out of date — reload it and try again",
  413: "The request was too large",
  415: "The lab server only accepts JSON requests",
  429: "Too many live requests — wait a minute and try again",
};

/** Every message a live result may carry; the UI shows nothing else. */
export const ALLOWED_LIVE_MESSAGES: ReadonlySet<string> = new Set([
  ...Object.values(KEY_PROBLEM_MESSAGE),
  ...ALLOWED_PROVIDER_MESSAGES,
  ...Object.values(CLIENT_MESSAGES),
  ...Object.values(HTTP_MESSAGES),
  ...Object.values(ROUTE_MESSAGES),
]);
