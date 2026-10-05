/**
 * Key-format rules shared by the client (checked before any request) and the
 * server (checked before any SDK call). Messages never include the key.
 */
import { keyMatchesProvider, type Provider } from "./models";

/** The only key shape the lab forwards: no whitespace, ASCII only, 20–256 characters. */
export const API_KEY_PATTERN = /^[A-Za-z0-9_-]{20,256}$/;

export type KeyProblem = "format" | "provider";

/** What the format rule allows, phrased as a correction hint (WCAG 3.3.3). */
export const KEY_FORMAT_HINT = "keys are 20–256 characters long and contain only letters, numbers, hyphens and underscores, with no spaces";

export const KEY_PROBLEM_MESSAGE: Record<KeyProblem, string> = {
  format: `The API key format is not valid — ${KEY_FORMAT_HINT}`,
  provider: "This key does not match the selected provider — check the provider or paste that provider's key",
};

/** null when the key is well formed and matches the provider. */
export function checkKey(key: string, provider: Provider): KeyProblem | null {
  if (!API_KEY_PATTERN.test(key)) return "format";
  return keyMatchesProvider(key, provider) ? null : "provider";
}
