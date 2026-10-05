# Live mode: Vercel Firewall rule and real-provider smoke checklist

Both steps are for the product owner (decision D27). The site has no server-owned key, so these steps need your own low-limit provider keys and access to the Vercel project.

## 1. Rate-limit `POST /api/lab/run`

`/api/lab/run` forwards a visitor's own key to Anthropic or OpenAI, so it can be used to check whether a key is valid. An in-memory limit is unreliable on serverless, so the limit lives in the Vercel Firewall.

1. In the Vercel dashboard, open the project that serves the site, then **Firewall**.
2. Add a **custom rule**, named for example `lab-live-rate-limit`.
3. Conditions (all must match):
   - **Request path** equals `/api/lab/run`
   - **Method** equals `POST`
4. Action: **Rate limit**, a fixed window of **60 seconds** with **30 requests**, keyed by **IP address**. When the limit is exceeded, deny the request with status **429**.
5. Save, then publish or deploy the firewall change. Vercel's menu labels may differ slightly from these; keep the conditions and limits the same.

The lab already handles a 429. It shows "Too many live requests — wait a minute and try again" and marks the run not evaluated.

Verify the rule from a terminal. Each run makes two calls, so 30 requests is 15 runs per minute per IP. Requests without a valid key are rejected by the route before any provider call, but they still count against the limit:

```bash
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<your-domain>/api/lab/run" \
    -H "content-type: application/json" -d '{}'
done | sort | uniq -c   # expect mostly 400s, then 429s once the limit is reached
```

## 2. Environment variables

Never set `ANTHROPIC_CUSTOM_HEADERS` or `OPENAI_CUSTOM_HEADERS` on the Vercel project. Both SDKs would add those headers to every provider request, so while either is set, live mode refuses every run and shows "Provider unavailable".

## 3. Real-provider smoke checklist (after each deployment)

Use a low-limit key for each provider that you can revoke afterwards. Open the deployed `/lab` in a private window with DevTools open.

1. **Simulated mode still works.** Load `/lab`. The banner reads "Simulated demo — no AI model is called". Rerun with a preset and check that the comparison table appears.
2. **No key.** Select **Live model (your API key)** and click **Rerun** without a key. An inline error appears, focus moves to the key field, and the Network tab shows no request to `/api/lab/run`.
3. **Each model.** For each of `claude-haiku-4-5`, `claude-sonnet-5-5`, `gpt-4o-mini`, and `gpt-4.1-mini`:
   - Enter the key and click **Run baseline live**. Check that two requests go to `/api/lab/run` with the key only in the `Authorization` header, never in the request body or URL.
   - The banner reads "Live run: responses from {provider} {returned model}…", and the run metadata shows the returned model, the settings, and the durations.
   - Edit the instruction (or add a preset), then click **Rerun**. The comparison table appears. Click **Run baseline live** again and check that the rows are labelled "run-to-run variation (same instruction)".
4. **Wrong key.** Change one character of the key and rerun. The alert reads "Credentials unavailable — not evaluated (The provider rejected the API key)". Then select OpenAI and paste the Anthropic key: an inline error ("This key does not match the selected provider — check the provider or paste that provider's key") appears, focus moves to the key field, and the Network tab shows no request.

   If a run with a valid key fails, the alert names the account-side cause (D40). None of these is a lab fault:
   - "This model isn't available to the account behind this key" means the provider returned 404. Check which models the key's organization or workspace can use.
   - "The provider reports a billing problem on this account — check credits or payment" means a 402. Add credits or fix payment.
   - "The provider denied this key access — check the account's permissions or region" means a 403.
   - "The provider rejected the request" means a 400. For Anthropic this is often an account without credits. Check the account in the provider's console.
5. **Cancel.** Start a run and click **Cancel**. The alert reads "Live request cancelled — not evaluated". Remember that the provider may still bill calls already sent.
6. **Key clearing.** Click **Clear key**, then check the field is empty. Enter the key and switch provider: the field is empty and the page announces "Key cleared — enter your … key". Enter the key again and reload: the field is empty. Enter it again, navigate away, then use Back: the field is empty.
7. **No key at rest.** In DevTools → Application, Local Storage, Session Storage, and Cookies contain no key. Download the review log (JSON) and check it does not contain the key.
8. **Server logs.** In the Vercel project's logs for these requests, search for a distinctive part of your key; it must not appear.
9. **Headers.** Run `curl -si -X OPTIONS https://<your-domain>/api/lab/run`: 204 with `Allow: POST, OPTIONS` and no `Access-Control-*` headers. Run `curl -sI` on `https://<your-domain>/`, `/lab`, and `/checklist`. Each shows exactly one `Content-Security-Policy`, ending in `connect-src 'self'`, plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and `Permissions-Policy`, and no `X-Powered-By`.
10. **Clean up.** Revoke both keys.
