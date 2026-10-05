import "server-only";

/**
 * Live-run request handler (spec §3). Every check runs before any outbound call.
 * The user's key is read from the Authorization header into a local variable,
 * validated, passed to the provider adapter, and never echoed, logged, or stored.
 */
import { API_KEY_PATTERN, checkKey, KEY_PROBLEM_MESSAGE } from "../live-key";
import { CLIENT_MESSAGES } from "../live-messages";
import { findModel } from "../models";
import { renderInputs } from "../render";
import { scenarios } from "../scenarios";
import { callProvider, type ProviderClients } from "./providers";

export const MAX_BODY_BYTES = 16_384;
export const MAX_INSTRUCTION_CHARS = 4000;
const BEARER = "Bearer ";

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" } as const;

function reply(httpStatus: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status: httpStatus, headers: HEADERS });
}

/** Fixed request-check failure: `{ status, message }`, never echoing input. */
function reject(httpStatus: number, message: string): Response {
  return reply(httpStatus, { status: "model_error", message });
}

const REJECT = {
  method: () => reject(405, "Method not allowed"),
  contentType: () => reject(415, "Content type must be application/json"),
  tooLarge: () => reject(413, "Request body too large"),
  badJson: () => reject(400, "Request body is not valid JSON"),
  scenario: () => reject(400, "Unknown scenario"),
  version: () => reject(409, "Scenario version mismatch — reload the page"),
  variant: () => reject(400, "Variant must be a or b"),
  instruction: () => reject(400, `Instruction must be text of at most ${MAX_INSTRUCTION_CHARS} characters`),
  model: () => reject(400, "Unknown provider or model"),
  key: () => reject(400, "Missing or malformed API key"),
  keyProvider: () => reject(400, KEY_PROBLEM_MESSAGE.provider),
  keyInInstruction: () => reject(400, CLIENT_MESSAGES.keyInInstruction),
  internal: () => reply(500, { status: "model_error", message: "Internal error" }),
};

/** Reads at most `limit` bytes of the body; null when it is larger. Throws on invalid UTF-8. */
async function readCapped(req: Request, limit: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function createHandler(deps: { clients: ProviderClients }): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    try {
      if (req.method !== "POST") return REJECT.method();

      const mediaType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (mediaType !== "application/json") return REJECT.contentType();

      const declared = req.headers.get("content-length");
      if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return REJECT.tooLarge();

      let raw: string | null;
      try {
        raw = await readCapped(req, MAX_BODY_BYTES);
      } catch {
        return REJECT.badJson();
      }
      if (raw === null) return REJECT.tooLarge();

      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return REJECT.badJson();
      }
      if (!isRecord(body)) return REJECT.badJson();

      const scenario = scenarios.find((s) => s.id === body.scenarioId);
      if (!scenario) return REJECT.scenario();
      if (body.scenarioVersion !== scenario.version) return REJECT.version();
      const variant = body.variant;
      if (variant !== "a" && variant !== "b") return REJECT.variant();
      const instruction = body.instruction;
      if (typeof instruction !== "string" || instruction.length > MAX_INSTRUCTION_CHARS) return REJECT.instruction();
      const model =
        typeof body.provider === "string" && typeof body.model === "string" ? findModel(body.provider, body.model) : undefined;
      if (!model) return REJECT.model();

      const authorization = req.headers.get("authorization") ?? "";
      if (!authorization.startsWith(BEARER)) return REJECT.key();
      const apiKey = authorization.slice(BEARER.length);
      if (!API_KEY_PATTERN.test(apiKey)) return REJECT.key();
      // Defense in depth: never forward one provider's key to the other provider.
      if (checkKey(apiKey, model.provider) === "provider") return REJECT.keyProvider();
      if (instruction.includes(apiKey)) return REJECT.keyInInstruction();

      // The input is rendered here; anything the client sent besides these fields is ignored.
      const user = renderInputs(scenario)[variant];
      const result = await callProvider(
        { provider: model.provider, model, apiKey, system: instruction, user, signal: req.signal },
        deps.clients,
      );
      return reply(200, result);
    } catch {
      return REJECT.internal();
    }
  };
}
