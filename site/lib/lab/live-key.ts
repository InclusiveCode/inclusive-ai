/**
 * Key-format rules shared by the client (checked before any request) and the
 * server (checked before any SDK call). Messages never include the key.
 */
import { keyMatchesProvider, type Provider } from "./models";

/** The only key shape the lab forwards: no whitespace, ASCII only, 20–256 characters. */
export const API_KEY_PATTERN = /^[A-Za-z0-9_-]{20,256}$/;

export type KeyProblem = "format" | "provider";

export const KEY_PROBLEM_MESSAGE: Record<KeyProblem, string> = {
  format: "The API key format is not valid",
  provider: "This key does not match the selected provider",
};

/** null when the key is well formed and matches the provider. */
export function checkKey(key: string, provider: Provider): KeyProblem | null {
  if (!API_KEY_PATTERN.test(key)) return "format";
  return keyMatchesProvider(key, provider) ? null : "provider";
}
