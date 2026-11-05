# Task 7 contact application

This branch starts at `1b08a844b6d34ce1cfe1522cb211fb4a61b3dbeb`. It uses the accepted `estimator.create_contact_lead` transaction without changing migrations, RLS, pricing or staff authentication.

## Request contract

`POST /api/estimates/:publicRef/contact` accepts JSON up to 8 KiB. Required fields are `fullName`, `email`, `preferredContactMethod`, `contactConsent`, `requestedContact`, `requestedEstimateEmail` and `turnstileToken`. `phone` and `businessName` are optional. At least one requested action and literal contact consent are required. A phone preference requires a phone number. The validator rejects unknown fields, including marketing consent and browser-supplied timestamps.

The service validates input, redeems a fresh Turnstile token, resolves the estimate ID and calls the atomic RPC. The API checks origin, body bounds and rate limits before invoking that service. Only the database generates the consent timestamp, initial lead event and pending notification records. This implementation never invokes an email provider.

Every attempt, including an identical retry, requires a fresh security challenge. A successful Siteverify response is never cached as authorization. A network failure after a committed RPC can be retried with identical contact details and action selections plus a fresh token. PostgreSQL returns the existing lead without adding events or deliveries. A different first-submission payload returns a safe conflict. The RPC owns the estimate-state check and permits a matching historical retry after invalidation.

A successful HTTP response contains only `{ "saved": true }`. Errors use fixed messages. The application does not log contact input, tokens, credentials, network addresses or upstream error bodies. It does not write contact details into browser storage or analytics.

## Configuration boundary

Contact defaults to disabled. No production or preview configuration is changed. Enabling the implementation later requires an independently approved environment with:

- `ESTIMATE_CONTACT_ENABLED=true`.
- `TURNSTILE_SITE_KEY`, the public widget key.
- `TURNSTILE_SECRET_KEY`, a server-only secret.
- `TURNSTILE_HOSTNAME`, the exact expected frontend hostname, without protocol or path.
- `CONTACT_RATE_LIMITER`, a Cloudflare rate-limit binding. The route fails closed without it. It limits separate hashed source-address and estimate-reference keys before Siteverify or database calls.
- The existing server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, for the verified Goat environment.

The result page requires its existing read flag and returns only the public widget key. The contact panel appears after the result, only on valid estimates. Its action checkboxes start unchecked, contact consent is explicit, and it does not collect marketing consent. Consent copy still needs the product's release approval before production activation.

## Verification boundaries

Use Bun 1.3.10 and the locked dependencies. Application and Worker checks can run without DevCore under the owner's explicit environment exception:

```sh
mise exec bun@1.3.10 -- bun install --frozen-lockfile
mise exec bun@1.3.10 -- bunx svelte-kit sync
mise exec bun@1.3.10 -- bun run check
mise exec bun@1.3.10 -- bun test
mise exec bun@1.3.10 -- bun run build
CI=true mise exec bun@1.3.10 -- bunx playwright test
mise exec bun@1.3.10 -- bunx wrangler deploy --dry-run --env preview
```

Run builds and Playwright serially because both write `.svelte-kit`. The contact Worker test executes the real validator, service, verifier and HTTP handler in workerd. It injects a synthetic Siteverify response and an in-memory repository. Its native rate-limit binding is local. Browser tests run the built application Worker with the committed synthetic Supabase harness. Successful contact submissions in those tests use the real service and handler with simulated verification and persistence. They do not install a verification bypass in application code.

These tests do not prove PostgreSQL transaction, concurrency, privilege or RLS behavior. The accepted database tests remain in `supabase/tests/task7_contact_contract_test.sql`, `supabase/tests/estimator_security_test.sql` and `supabase/concurrency/task7_contact_concurrency.sql`. The contract and security files passed 49 pgTAP assertions, and the concurrency file passed all four assertions on this application branch. The instance was newly created with project ID `goat-task7-app-b-20261105-acceptance`, rooted in this worktree's ignored `.task7-local/` directory, with database port 56972. Its Docker project and workdir labels were checked before writes. Migration files were copied from this branch and compared byte-for-byte. The concurrency authorization marker was tied to the new PostgreSQL cluster and a fresh invocation token, as required by `supabase/concurrency/README.md`. No existing or remote database was used.

The external integration references are [Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc) and [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas). The repository's accepted grants remain authoritative. No broad grants from documentation examples were applied.


## Empty-submit regression diagnosis

The initial traced Playwright regression failed at `#contact-actions-error`: it expected `Select at least one request.` and received the default immutable-selections helper. Browser instrumentation recorded `noValidate=true`, native validity `false`, exactly one submit event, visible name/email/consent errors, and zero contact requests, token redemptions or lead writes. The action message was not hidden; the schema had not generated its issue.

A focused Bun reproduction showed that invalid literal consent caused Zod to skip the object-level refinement containing the action-selection rule. The correction moves that rule into a refinement with `when`, restricted to inputs whose two action fields are booleans. The same schema remains authoritative in client and server code. It adds no new acceptance rule and does not relax consent. Both action checkboxes and their fieldset point to the displayed error. The targeted traced regression and all 30 focused Bun tests passed after that single correction. See [Zod refinement scheduling](https://zod.dev/api#when).

The browser harness also now preserves the actual handler status/headers when fulfilling intercepted requests. Reloaded synthetic widgets generate distinct tokens. The pre-contact business test asserts zero visible contact inputs because the optional disclosure now exists in the result markup.

The full browser suite passed 29 tests with `CI=true HALLMARK_AUDIT=true`, including the rendered Hallmark check. The contact panel's rendered lint reported zero FAIL, REFLEX or WARN findings. Open-panel desktop/mobile captures and the diagnostic trace are local, ignored verification artifacts under `.hallmark/`.

The independent application review found no actionable defect. The Hallmark finish audit requested clearer pre-save helper copy. It now says "Once saved, these selections cannot be changed for this estimate." The group retains its accessible error description, with invalid states on the native checkbox controls. No redesign was performed.
