/**
 * Live-run route (spec §3). Validates each request, then forwards it to the
 * allowlisted Anthropic or OpenAI model with the user's own API key, for this
 * request only. OPTIONS answers 204 with Allow: POST, OPTIONS and no CORS
 * headers; other methods get the same fixed 405 JSON with Allow: POST, OPTIONS.
 */
import { createHandler, methodNotAllowed, options } from "../../../../lib/lab/server/handler";
import { realClients } from "../../../../lib/lab/server/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = createHandler({ clients: realClients });
export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = options;
