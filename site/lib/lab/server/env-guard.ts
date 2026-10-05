import "server-only";

/**
 * The only lab module that reads the environment, and only for one check.
 * Both provider SDKs merge ANTHROPIC_CUSTOM_HEADERS / OPENAI_CUSTOM_HEADERS into
 * every request after their auth headers, which no constructor option can turn
 * off. Live mode therefore refuses to call any provider while either is set.
 */
export function customHeadersConfigured(): boolean {
  const env = process.env;
  return [env.ANTHROPIC_CUSTOM_HEADERS, env.OPENAI_CUSTOM_HEADERS].some((v) => typeof v === "string" && v.trim().length > 0);
}
