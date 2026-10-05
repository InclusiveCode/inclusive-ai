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
