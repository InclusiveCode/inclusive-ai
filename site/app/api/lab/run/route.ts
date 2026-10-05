/**
 * Live-run route (spec §3). Validates each request, then forwards it to the
 * allowlisted Anthropic or OpenAI model with the user's own API key, for this
 * request only. No GET export, so Next.js answers other methods with 405.
 */
import { createHandler } from "../../../../lib/lab/server/handler";
import { realClients } from "../../../../lib/lab/server/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = createHandler({ clients: realClients });
