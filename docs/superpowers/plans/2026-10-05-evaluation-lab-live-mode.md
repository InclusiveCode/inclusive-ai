# Evaluation Lab — Live Mode Implementation Plan

> **For agentic workers:** One implementation agent executes Tasks 1–7 in order using TDD. An independent verifier and an independent code reviewer gate the branch. Steps use checkbox syntax.

**Goal:** Let `/lab` run the paired scenarios against a real model using the visitor's own Anthropic or OpenAI key (bring-your-own-key, BYOK). Scoring, comparison, and human review stay honest.

**Architecture:**
- **Server:** a server-only provider module and a validated route handler (`createHandler(deps)`) that calls the official SDKs with the user's key, per request.
- **Client:** a live `Responder`, run history, a stricter baseline and comparison rule, and a live panel in the UI.
- The deterministic evaluator is unchanged.

**Tech stack:** Next.js 16.3.8 (after #3), React 19.2.3, TypeScript 5, Vitest 3.2.7, `@anthropic-ai/sdk` (latest 0.x at install time, exact pin), `openai` (latest 5.x/6.x at install time, exact pin).

**Spec:** `docs/superpowers/specs/2026-10-05-evaluation-lab-live-mode-design.md` (v0.2, approved). The base lab spec defines D1–D28. Read both.

## Global Constraints

- **Paths:** touch only `site/`, `docs/`, and `README.md`. No changes to `core/`, `domains/`, `packages/`, or the root lockfile. Install only inside `site/`.
- **Key handling:**
  - The user's key appears only in: the uncontrolled input element, a module-level/ref variable in the client, the `Authorization: Bearer` request header, and the server handler's local variable passed to the SDK constructor.
  - Never in React state, props, a run object, the review log, URL/query, `localStorage`/`sessionStorage`/cookies, any `console.*`, any thrown or returned message, or any test snapshot.
  - **Exception:** a placeholder key such as `sk-test-PLACEHOLDER-0000000000` may appear in tests.
- **No `console.*`** in `site/lib/lab/**` or `site/app/api/lab/**`, including the new server module.
- **Provider names** (Anthropic, OpenAI, model ids) are allowed per D24 only in:
  - `site/lib/lab/models.ts`
  - `site/lib/lab/server/**`
  - `site/app/api/lab/run/route.ts`
  - live-panel UI copy
  - docs

  Update the hygiene tests to allow exactly these files. Do not delete the hygiene tests.
- **Stub tests to replace deliberately:** the route stub tests, the `LIVE_CONFIG` / `makeLiveResponder` stub tests, and `liveAlertText`. List each replaced test in the final report.
- **Commits:** conventional prefix; end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- **Every task ends green:** `cd site && npx vitest run && npx tsc --noEmit`. Task 6 also runs `npm run build`.

## Review Focus

1. A key with whitespace or non-ASCII characters is rejected with 400 before any SDK call. Error text never quotes it.
2. A provider SDK throws an error whose message contains the key → the response body still has only the fixed message.
3. Version A returns `claude-haiku-4-5-xxxx` and Version B returns a different model id → the run is "not comparable".
4. A user reloads the page, or navigates away and back via the back/forward cache → the key field is empty.
5. A slow provider (more than 30 s) → the server times out first. The client shows "Timed out — not evaluated" and Rerun is re-enabled.

---

### Task 1: Model allowlist and type extensions

**Files:**
- Create `site/lib/lab/models.ts`.
- Modify `site/lib/lab/types.ts` and `run.ts` (`normalizeResponse`).
- Test: `__tests__/models.test.ts`, plus additions in `run.test.ts`.

**Produces:**
```ts
export type Provider = "anthropic" | "openai";
export interface LiveModel { id: string; provider: Provider; label: string; sampling: boolean; maxTokens: number; anthropicThinking?: { type: "between_tools" } }
export const LIVE_MODELS: LiveModel[]; // exactly: claude-haiku-4-5 (sampling true), claude-sonnet-5-5 (sampling false, anthropicThinking between_tools), gpt-4o-mini (true), gpt-4.1-mini (true); maxTokens 1024 each
export function findModel(provider: string, id: string): LiveModel | undefined;
export const LIVE_RESPONDER_VERSION = "live-adapter-v1";
// types.ts additions
ResponseStatus adds "provider_refused";
ResponseRecord adds returnedModel?: string; stopReason?: string;
```
- `normalizeResponse` keeps `returnedModel` and `stopReason` only when each is a string of at most 100 characters.
- `evaluate()` treats `provider_refused` like any other non-ok status: `not_evaluated`.
- Add a status label "Provider declined (safety system) — not evaluated".

**Tests:** the allowlist contents and flags; `findModel` rejects unknown provider and model combinations; `normalizeResponse` keeps or drops the new fields; `provider_refused` gives `not_evaluated` and never the headline "All displayed checks passed".

Commit: `feat(lab): add live model allowlist and response metadata`.

### Task 2: Provider adapters (server-only)

**Files:**
- Create `site/lib/lab/server/providers.ts`. Its first line is `import "server-only";`. Add the `server-only` package if it is missing.
- Add dependencies: `cd site && npm install -E @anthropic-ai/sdk@<latest> openai@<latest>`.
- Test: `__tests__/providers.test.ts`. Mock the `server-only` import in Vitest, either with an alias in a minimal `vitest.config.ts` or with `vi.mock`.

**Produces:**
```ts
export interface ProviderCall { provider: Provider; model: LiveModel; apiKey: string; system: string; user: string; signal: AbortSignal }
export interface ProviderResult { status: ResponseStatus; text?: string; error?: string; returnedModel?: string; stopReason?: string; durationMs: number }
export interface ProviderClients { anthropic(apiKey: string): AnthropicLike; openai(apiKey: string): OpenAILike } // minimal structural interfaces for injection
export const realClients: ProviderClients; // new Anthropic({ apiKey, maxRetries: 0, timeout: 30_000 }) / new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 })
export async function callProvider(call: ProviderCall, clients: ProviderClients): Promise<ProviderResult>
```

**Anthropic request:**
- Body: `{ model: id, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }`.
- Add `temperature: 0` only if `sampling` is true.
- Add `thinking: { type: "between_tools" }` only if the model sets `anthropicThinking`.
- Pass the signal through.
- Text is the concatenation of the `text` blocks.
- `stop_reason`: `max_tokens` → `model_error` "Response cut off at the token limit — not evaluated"; `refusal` → `provider_refused`.

**OpenAI request:**
- Body: `chat.completions.create({ model: id, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens })`.
- Add `temperature: 0` only if `sampling` is true.
- Content is `choices[0].message.content`, which may be null. A non-empty `message.refusal` → `provider_refused`. `finish_reason: "length"` → token-limit `model_error`.

**Error mapping:** use `instanceof` the SDK error classes plus `status`/`code`. Never use `error.message`.

| Condition | Status | Fixed message |
|---|---|---|
| 401 / 403 | `credentials_unavailable` | "The provider rejected the API key" |
| 429 with `code: "insufficient_quota"` | `model_error` | "The provider account has no remaining quota" |
| Other 429 | `model_error` | "Rate limited by the provider" |
| 400 / 404 | `model_error` | "The provider rejected the model or request" |
| Abort or timeout error | `timeout` | — |
| Anything else | `model_error` | "Provider unavailable" |

`returnedModel` is `response.model`.

**Tests**, with fake clients that record their arguments:
- The exact request bodies per model: no `temperature` for Sonnet 5.5, `between_tools` sent, `max_tokens` 1024.
- The system/user split.
- Every row of the mapping table.
- A thrown error whose message contains the placeholder key → the result contains no part of the key.
- Abort.

Commit: `feat(lab): add server-only provider adapters for live runs`.

### Task 3: Route handler

**Files:**
- Replace `site/app/api/lab/run/route.ts`. Export `POST = createHandler({ clients: realClients })`, `export const runtime = "nodejs"`, and `export const maxDuration = 60`. Do not export `GET`, so Next returns 405.
- Create `site/lib/lab/server/handler.ts`, which exports `createHandler`.
- Test: `__tests__/route.test.ts` (replaces the stub tests).

**Request checks, in order. Each failure returns the fixed JSON `{ status, message }` with `Cache-Control: no-store`:**
1. The content type is not `application/json` → 415.
2. `content-length` is over 16 384, or the measured body is over 16 384 → 413.
3. The JSON does not parse → 400.
4. Schema:
   - `scenarioId` is known; `scenarioVersion` equals the server's, otherwise 409.
   - `variant` is `a` or `b`.
   - `instruction` is a string of at most 4000 characters.
   - `provider` and `model` are in the allowlist.
5. The `authorization` header matches `^Bearer ([A-Za-z0-9_-]{20,256})$` → otherwise 400 "Missing or malformed API key". The header value is never echoed.

**Then:**
- Render the input on the server: `renderInputs(scenario)[variant]`.
- Call `callProvider` with the request's abort signal.
- Return 200 with the `ProviderResult` JSON.
- A top-level `try/catch` returns 500 `{ status: "model_error", message: "Internal error" }`.
- No logging anywhere.

**Tests:**
- Every check (415, 413 by header and by size, 400 for bad JSON, schema, and key, 409).
- A valid request reaches fake clients with the server-rendered input; a client-sent `input` field is ignored.
- `Cache-Control: no-store` is present on every response.
- No response body contains the key or the env names.
- The hygiene test for no `console.*` covers `site/lib/lab/server/**`.

Commit: `feat(lab): validate live requests and forward them with the user's key`.

### Task 4: Client live responder

**Files:** modify `site/lib/lab/run.ts`, replacing the stub `makeLiveResponder` and `LIVE_CONFIG`. Test: `run.test.ts`.

**Produces:**
```ts
export interface LiveKeyRef { get(): string | null }
export function makeLiveResponder(opts: { scenario: Scenario; provider: Provider; model: LiveModel; key: LiveKeyRef; fetchImpl?: typeof fetch; timeoutMs?: number /* default 45_000 */; signal?: AbortSignal }): Responder
export function liveConfig(model: LiveModel): RunConfig // { provider, model: id, temperature: sampling ? 0 : null, maxTokens }
```

**Behavior:**
- Derives the variant by comparing `req.input` with `renderInputs(scenario)`. A mismatch → `error` with "Input does not match the scenario".
- Sends `POST /api/lab/run` with the JSON body `{ scenarioId, scenarioVersion, variant, instruction, provider, model: id }` and the header `Authorization: Bearer <key>`.
- The client timeout is 45 s and is combined with the external cancel signal.
- **Response mapping:**
  - 200 → the normalized `ProviderResult` as a `ResponseRecord`, with `rulesMatched` undefined.
  - 4xx with JSON → `model_error`, carrying a fixed message chosen by status code. Never show the server's message to the user, except the allowlisted fixed strings.
  - Network error → `model_error` "Could not reach the lab server".
  - Abort by the user → `not_run` "Cancelled".
  - Timeout → `timeout`.
- No key → `credentials_unavailable` "Enter your API key to run live", and no fetch happens.
- The instruction contains the key → `error` "Your instruction contains your API key — remove it before running", and no fetch happens.

**Tests:**
- The header is set; the key is not in the body.
- Variant derivation.
- Each mapping.
- No fetch without a key.
- Blocked when the instruction contains the key.
- The timeout default is longer than the server's 30 s.
- Cancel works.

Commit: `feat(lab): add the client responder for live runs`.

### Task 5: Run history, baseline selection, comparison

**Files:** modify `site/lib/lab/compare.ts` and `types.ts`. Add `site/lib/lab/history.ts`. Test: `compare.test.ts`, `history.test.ts`.

**Produces:**
```ts
export function returnedModels(run: Run): { a?: string; b?: string; consistent: boolean } // both ok & equal → consistent
export function selectBaseline(runs: Run[], latest: Run, baselineInstruction: string): Run | null // most recent run (excluding latest) with instruction === baselineInstruction, every response ok, compatible with latest per compareRuns; null otherwise
export function emptyCompareState(runs: Run[], latest: Run | null, baselineInstruction: string): "no_live_run" | "baseline_only" | "baseline_errors" | null
```

**Rules:**
- `compareRuns` additionally refuses when either run has inconsistent returned models ("Versions A and B were answered by different model versions"), or when the two runs' returned models differ ("Different model versions answered the two runs").
- When the two runs' instruction fingerprints are equal, every row also carries `variation: true`. The UI labels it "run-to-run variation (same instruction)".
- Simulated runs keep their existing behavior. The simulated baseline is still the precomputed run.

**Tests:** each rule, including a live baseline with errors (not selected), an edited-instruction run (not selected as baseline), mismatched returned models (refused), and the same-instruction variation flag.

Commit: `feat(lab): keep run history and select comparable live baselines`.

### Task 6: Live panel UI

**Files:** modify `site/app/lab/lab-client.tsx` and `components/*`. Create `components/live-panel.tsx`. Test: `ui.test.tsx` (replacing `liveAlertText`), plus the e2e smoke extension in `site/tests/e2e/` by the verifier, not the implementer.

**Copy and behavior:**
- **Response source radio:** "Simulated (scripted demo)" and "Live model (your API key)".
- **Live panel:**
  - Provider select, and a model select filtered by provider, both from `LIVE_MODELS`.
  - A key `<input type="password" autoComplete="off" spellCheck={false}>`. It is uncontrolled (a ref only), not inside a `<form>`, and labelled "Your {provider} API key".
  - Show/hide toggle; "Clear key" button.
  - Notice copy exactly as in spec §1.
- **Buttons:**
  - "Run baseline live" runs the scenario's baseline instruction, not the editor text.
  - "Rerun" runs the editor text.
  - "Cancel" is visible while a run is in flight.
  - Without a key: an inline error with `role="alert"` and focus moved to the key field.
- **Run history:** `runs` becomes `Record<scenarioId, Run[]>`. "Show run" lists the runs.
- **Labels follow the displayed run:**
  - **Live run:** a "Live" badge, the provider, the returned model ids (A/B), the settings, and the live banner text from spec §1.
  - **Simulated run:** the existing banner.
  - Remove the old "Live (unavailable)" copy.
- **Alerts** come from the statuses, adding `provider_refused`.
- **Comparison:** uses `selectBaseline` for live runs. Shows the empty states from spec §1.
- **Key clearing:** a `pagehide` listener and unmount clear the key input value and the ref.
- **Limitations:** add the real-output line from spec §5. Update the "live mode is not configured" line.
- **Headers:** in `next.config.ts`, add `headers()` for `/lab` with `Content-Security-Policy: connect-src 'self'`. Check that existing pages are unaffected; `npm run build` must succeed.

**Tests:** `renderToStaticMarkup` of `LivePanel` (labels, notice, no key in markup), banner selection by run mode, and alert text per status.

Commit: `feat(lab): add the live model panel`.

### Task 7: Docs

- Update `docs/eval-lab/README.md`: live mode section, key handling, the model table, and the limitations.
- Update the README lab section: live mode exists, bring your own key.
- Add `docs/eval-lab/vercel-firewall.md` with the PO's steps for a rate-limit rule on `POST /api/lab/run` (for example 30 requests per minute per IP, returning 429), plus a real-provider smoke checklist for the PO.

Commit: `docs(lab): document live mode`.

## Self-review

- **Spec coverage:** §0 → PR #3. §1 → T6. §2 → T1–T2. §3 → T2–T3. §4 → T5. §5 → T6. §6 → all tasks plus the verifier. §7 L1–L8 → T3–T6 tests plus the verifier's e2e.
- **Type consistency:** `Provider`, `LiveModel`, `ProviderResult`, and `ResponseStatus.provider_refused` are used consistently. `liveConfig` replaces `LIVE_CONFIG`.
