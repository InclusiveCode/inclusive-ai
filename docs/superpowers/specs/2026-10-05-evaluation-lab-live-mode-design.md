# Evaluation Lab — Live Mode Design (v0.2)

Status: **Approved by product owner (v0.2, 2026-10-05).** Revised after independent design review (v0.1 verdict: block, 5 blockers — all resolved here).
Builds on the lab spec (D1–D24). Fixed PO decisions: D21 bring-your-own-key (BYOK), D22 Anthropic + OpenAI with a server-owned allowlist, D24 provider names allowed.

## 0. Prerequisite (resolves blocker B5)

Upgrade `next` in `site/` from 16.1.6 to a patched 16.x (≥ 16.3.3; `npm audit` suggests 16.3.8) **before** any route handles user keys. This is the queued follow-up, pulled forward as step 1 of this work, in its own PR with build, tests, and a smoke test. *(PO decision Q1.)*

## 1. User journey

1. **Response source:** Simulated (default) or **Live model**.
2. The **live panel** contains:
   - a provider and model select, filled from the allowlist;
   - an **API key** input: password type, uncontrolled, outside any `<form>`, `autocomplete="off"`, with a show/hide toggle and a **Clear key** button;
   - this notice: *"Your key goes from this page to this site's server (hosted on Vercel) and on to {provider}, for this run only. It is never stored, logged, or shown again. Use a low-limit key you can revoke. Each run makes 2 billed calls (Version A and B). Your instruction and the fictional scenario text are sent to {provider}; do not enter personal data."*
3. **Run baseline live** runs the scenario's unedited baseline instruction. **Rerun** runs the edited one. If no key is entered, the button stays enabled, and clicking it shows an inline error and moves focus to the key field. No request is sent.
4. **Compare** uses as its baseline the most recent **fully-ok** run of the **unedited baseline instruction** that is compatible with the latest run (§4).
   - Empty states: "No live run yet", "Live baseline only — edit and rerun", "Live baseline had errors — run it again".
5. **The banner, badges, and alerts follow the run being displayed, not the radio button.** A live run shows:
   - a **Live** badge;
   - the provider;
   - the **model the provider actually used** (returned model id);
   - the settings;
   - timestamp and duration.

   Its banner reads: *"Live run: responses from {provider} {returned model}. One sample per run; differences between runs can be nondeterministic. A pass means only that the displayed checks passed."* Simulated runs keep their existing labels. The static "Live (unavailable)" text, the `LIVE_ALERT` alert, and the Limitations section are reworded.
6. The key is cleared on **Clear key**, on `pagehide` (the browser's back/forward cache keeps the DOM), and on unmount. A run is blocked if the instruction text contains the key.

## 2. Allowlist and per-model parameters (resolves B1 and B2)

The allowlist is server-owned in `site/lib/lab/models.ts`. Each entry is `{ id, provider, label, sampling: boolean, params, maxTokens }`. Ship these four models *(PO decision Q2)*:

| Provider | Model id | Temperature | Thinking / reasoning | max_tokens |
|---|---|---|---|---|
| Anthropic | `claude-haiku-4-5` | `0` (accepted) | none by default | 1024 |
| Anthropic | `claude-sonnet-5-5` | **omitted** (non-default values return a 400) | `thinking: { type: "between_tools" }` (turns thinking off; valid at default effort) | 1024 |
| OpenAI | `gpt-4o-mini` | `0` | none | 1024 |
| OpenAI | `gpt-4.1-mini` | `0` | none | 1024 |

- **Deferred:** `claude-opus-5-5`, whose thinking can't be disabled, so its token budget must also cover thinking. Also `gpt-5-mini` and other reasoning models.
- `config.temperature` is `null` where omitted. The UI never implies determinism.
- `responderVersion = "live-adapter-v1"`, bumped whenever per-model parameters change.
- No automatic fallback to another model on refusal. It would silently change the model being evaluated.

## 3. Server route (`site/app/api/lab/run/route.ts`, Node runtime, `maxDuration = 60`) (resolves B4)

**Request checks before any outbound call:**

| Check | Response on failure |
|---|---|
| Method is POST | 405 |
| `content-type` is `application/json` | 415 |
| Body ≤ 16 KB, by `content-length` and by measured length | 413 |
| Schema: `scenarioId` known; `scenarioVersion` matches the server's | 409 on version skew |
| Schema: `variant` is `a` or `b` | 400 |
| Schema: `instruction` is 0–4000 characters | 400 |
| Schema: `provider` and `model` are in the allowlist | 400 |
| Key header `authorization: Bearer <key>` matches `^[A-Za-z0-9_-]{20,256}$`, so the key never reaches a library call that might quote it in an error | 400 |

- Every error returns fixed JSON.

**Inputs:** the scenario input is rendered on the server from `scenarioId` and `variant`. The client never sends input text.

**Provider calls:**
- Use the official SDKs, `@anthropic-ai/sdk` and `openai`, as server-only dependencies of `site`.
- Construct each client per request with the user's key, `maxRetries: 0`, and `timeout: 30_000`.
- Pass the incoming request's abort signal through.
- The system role carries the instruction; the user role carries the rendered input.
- Read the response:
  - **Anthropic:** concatenate the `text` blocks; check `stop_reason`.
  - **OpenAI:** read `choices[0].message.content` (may be null) and `finish_reason`; detect a `refusal` field.

**Result mapping**, using typed SDK error classes and error `type`/`code`, never error message text:

| Condition | Status | Fixed message |
|---|---|---|
| Normal completion | `ok` | — |
| `max_tokens` / `length` | `model_error` | "Response cut off at the token limit — not evaluated" |
| Anthropic `stop_reason: refusal`, or OpenAI `refusal` | `provider_refused` (new) | "The provider declined to answer (safety system) — not evaluated" |
| Authentication or permission error | `credentials_unavailable` | "The provider rejected the API key" |
| Rate limit | `model_error` | "Rate limited by the provider" |
| OpenAI `insufficient_quota` | `model_error` | "The provider account has no remaining quota" |
| Model not found or bad request | `model_error` | "The provider rejected the model or request" |
| Timeout or abort | `timeout` | — |
| Anything else | `model_error` | "Provider unavailable" |

**Route-wide guarantees:**
- A top-level `try/catch` wraps the whole handler. There is no `console.*` anywhere in the route.
- Responses carry `Cache-Control: no-store`.
- The handler is exported as `createHandler(deps)` so tests can inject fake SDK clients. There is no environment-configured base URL.

**Response body:** `{ status, text?, error?, returnedModel (validated, ≤ 100 chars), durationMs }`. The `inputSent`/fingerprint echo from v0.1 is dropped; the request-side `scenarioVersion` check replaces it.

**Client:**
- Waits **45 s** per call, longer than the server's 30 s, so the UI never gives up on a call that is still being billed.
- Runs both variants concurrently.
- Has a **Cancel** button that aborts both calls.

**Abuse:** the route is a key-validity oracle and an open proxy limited to two fixed hosts. Defenses:
- a **Vercel Firewall rate-limit rule** on `/api/lab/run`, configured by the PO *(Q3)*;
- no CORS headers;
- a custom header plus the JSON content-type, which forces a CORS preflight;
- a `Content-Security-Policy: connect-src 'self'` header on `/lab`.

## 4. Run history and comparison (resolves B3)

- **Run history:** keep `runs[]` per scenario; today only `latest` is kept.
- **`ResponseRecord` additions:** `returnedModel` and `stopReason`. `normalizeResponse` keeps them, after validation.
- **Compatibility** adds:
  - the returned model id for each side, with both A and B in a run required to match;
  - mode, provider, requested model, and parameters.
  - If A and B in one run return different model ids, the run is marked **not comparable** and the reason is shown.
- **Baseline selection:** the most recent run that has the unedited baseline instruction, is fully ok, and is compatible with the latest run.
- **Same instruction twice:** when both compared runs used the same instruction, rows are labeled *"run-to-run variation (same instruction)"*. That makes nondeterminism visible.

## 5. Evaluation

The evaluator is unchanged. Live text is untrusted data and is rendered as text.

New Limitations line: *"The checks were designed against scripted text. Real model output may phrase refusals and relationship terms in ways the word lists miss, so expect more 'inconclusive' results and occasional false findings."*

## 6. Testing (L4 and L7 corrected)

- **Route unit tests** (injected fake SDK clients):
  - every row of the request-check and result-mapping tables;
  - parameters per model: no `temperature` for Sonnet 5.5, `between_tools` sent;
  - the key never appears in the response, in an error, or in any thrown message;
  - client-sent input is ignored;
  - the request's abort signal is honored.
- **Client unit tests:**
  - the key is sent only in the `Authorization` header;
  - the key is absent from run objects, the review-log JSON, and state snapshots;
  - `pagehide` clears the key;
  - a run is blocked when the instruction contains the key;
  - the 45 s client timeout.
- **Deliberately replaced stub tests:** `route.test.ts`, the `makeLiveResponder` and `LIVE_CONFIG` tests in `run.test.ts`, and `liveAlertText` in `ui.test.tsx`. The hygiene tests stay, with a scoped allowance for provider names in `models.ts` and the route.
- **E2E** (Playwright, with `/api/lab/run` intercepted by test doubles):
  - live baseline, then rerun, then compare;
  - every error state;
  - the banner follows the displayed run;
  - the key field is empty after reload and after `pagehide`;
  - Cancel works;
  - keyboard-only operation.
- **Real-provider smoke test:** run by the PO in the browser with their own keys, after deployment, from a short checklist. Optional: a "Download run JSON" button (key never included) so real outputs can become test fixtures later.

## 7. Acceptance criteria (revised)

- **L1** — No key: inline error, focus moves to the key field, no network call.
- **L2** — Live baseline plus rerun produce a comparable pair. Live and simulated runs never compare. Mismatched returned model ids are not comparable.
- **L3** — The instruction reaches the provider unchanged as the system prompt. Variants differ only in the slot. Settings are identical for A and B.
- **L4** — The key never appears in the DOM after submission, in storage or cookies, in exports, in the console, in the `next start` server output, or in responses. It is cleared on `pagehide`.
- **L5** — Each request-check failure (405/413/415/409/400) and each result-mapping row has a distinct non-pass state with a fixed message.
- **L6** — The banner, badges, and alerts follow the displayed run, and show the returned model and the single-sample disclaimer.
- **L7** — Simulated behavior is unchanged. The stub tests are replaced deliberately, as listed in §6. Accessibility parity holds.
- **L8** — The client timeout is longer than the server timeout, and Cancel aborts both calls.

## 8. Out of scope

- Opus 5.5 and OpenAI reasoning models.
- A server-owned key.
- Re-importing recorded runs.
- Multiple samples per run.
- An LLM judge.
- User-configurable base URLs.
