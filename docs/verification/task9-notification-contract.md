# Task 9 notification contract proposal

Status: proposed design, awaiting owner review before implementation.

Verified base: `c9fff68d52b5113a529d6d63589cf04765fb2fd2`, fetched from `origin/main` on 2026-11-06. Task 7 and Task 8 are merged as GitHub PRs 11/12 and 7 respectively. Worktree branch: `task9/estimator-notifications`.

## Existing authority and behavior

The product specification section 19 defines separate internal and customer emails. Technical specification section 25 requires persisted business data and notification intents before any provider request. Task 9 and Prompt 9 preserve booking behavior and prohibit recalculation.

`20261103183011_estimator_core.sql` defines the four notification states and `guard_notification_delivery()`. `20261105090000_contact_lead_transaction.sql` creates selected intents in the contact transaction. Matching contact retries return the existing lead without inserting notification records. Internal notifications have a lead parent only. Customer notifications have an estimate parent only.

The current service validates contact details and Turnstile before calling the transaction. The route also checks origin, request bounds and rate limits. It currently sends no email. Keep those checks and the successful `{ saved: true }` response.

## Database lifecycle, unchanged

The full state transition matrix is:

- PENDING permits PENDING, SENT, FAILED_RETRYABLE and EXHAUSTED.
- FAILED_RETRYABLE permits FAILED_RETRYABLE, SENT and EXHAUSTED. It forbids PENDING.
- SENT permits only an identical SENT row. It forbids PENDING, FAILED_RETRYABLE, EXHAUSTED and every field mutation, including an attempt increment.
- EXHAUSTED permits only an identical EXHAUSTED row. It forbids PENDING, SENT, FAILED_RETRYABLE and every field mutation.

An insert must have PENDING, zero attempts, no last-attempt timestamp and no sent timestamp. Deletes are forbidden. Identity fields are immutable, including both recipient metadata fields and creation time.

Updates may preserve the attempt count or increment it by one. They may never decrement it or skip counts. An increment requires a non-null last-attempt timestamp. The trigger does not require a strictly increasing timestamp, an increment for each state change, a positive attempt count for SENT, or a maximum attempt count. The application must distinguish these database permissions from its stricter dispatch rules.

The table requires `sent_at` exactly when the state is SENT. It bounds error codes to 100 characters and safe messages to 500 characters. A non-null recipient hash must be 64 lowercase hexadecimal characters.

Implement lifecycle tests for all 16 state pairs. Test identical terminal no-ops separately from terminal mutations, every immutable field, insert/delete guards, attempt boundaries and table constraints. No fifth state or changes to the trigger are proposed.

## Proposed claim contract without a migration

Treat `(id, state, attempt_count, last_attempt_at)` as the optimistic concurrency token. A claim is one conditional UPDATE that matches every observed token field, increments the count by exactly one, and writes its attempt timestamp. Handle a null previous timestamp with `IS NULL`. Request the updated row. Only one returned row authorizes dispatch; zero rows means another worker won or the row changed. A read followed by an unconditional update never authorizes dispatch.

Claiming preserves PENDING or FAILED_RETRYABLE. Do not use a transition back to PENDING to represent retry ownership. Finalization must match the claimed token, including the attempt number and timestamp. A stale worker cannot finalize a newer attempt. A failed or ambiguous claim response authorizes no provider request.

Proposed application limits are five total claims, a 60-second minimum interval between claims, and a five-second provider deadline covering both response headers and bounded body consumption. These are new execution policy choices, not existing SQL guarantees.

Reclaim a stale attempt only after its interval expires. The previous worker might have reached Resend before disappearing, so a reclaim must use the same provider idempotency key. Database fencing cannot cancel an external HTTP request or prove exactly-once delivery.

Use existing parent indexes to fetch at most the selected internal/customer intents for one contact transaction. The existing partial `(state, last_attempt_at)` index supports retry eligibility. Claims and finalizations address the primary key. No global queue scan, new index, scheduler or infrastructure is proposed.

## Provider contract and unresolved boundary

Resend documents idempotency on `POST /emails`, with keys retained for 24 hours:

- https://resend.com/changelog/idempotency-keys
- https://resend.com/blog/engineering-idempotency-keys

Use a stable key derived only from the notification delivery UUID, never the attempt number or recipient. Never rotate it after an uncertain outcome. Resend returns the original accepted response for an identical replay. A changed payload returns `409 invalid_idempotent_request`; a concurrent request can return `409 concurrent_idempotent_requests`.

Proposed dispatch eligibility ends 23 hours after the database intent's immutable creation time. This conservative deadline avoids needing an unpersisted first-send timestamp. It also means an intent first processed after that deadline is not sent. Check the deadline immediately before HTTP dispatch. Never retry an ambiguous outcome outside this window.

This is a bounded retry policy, not an unconditional exactly-once guarantee. It assumes execution and clock delays cannot consume the one-hour margin between the application deadline and provider retention. A worker delayed beyond the provider retention window cannot safely resume a previously authorized send. Before implementation, approve this operational bound or require a stronger dispatch contract. Adding lease fields alone does not extend Resend's retention or fence an external request.

The existing table does not persist rendered payloads or a configuration version. During the provider retention window, changed template/contact configuration can cause an idempotency conflict rather than a second send. Treat that conflict as terminal and require manual reconciliation. Do not invent an alternate key to bypass it. Reliable replay across template/configuration changes would require a separately approved immutable payload/version contract.

## Proposed transport classification

- Accepted response with a validated bounded provider ID becomes SENT. This records provider acceptance, not confirmed inbox delivery.
- Rate limiting, server failures and concurrent-idempotency conflicts are retryable within the attempt/deadline limits.
- Validation, authorization and payload-idempotency conflicts become EXHAUSTED.
- Timeouts, network failures, malformed successful responses and oversized responses are uncertain. Retry only under the same idempotency key within the approved window.
- The fifth failed/uncertain attempt, or an expired retry window, becomes EXHAUSTED with a fixed safe code. EXHAUSTED does not imply the provider never accepted an earlier uncertain request.
- Missing activation or approved configuration makes no provider call. Preserve the saved lead and intent. Do not consume an attempt before configuration and rendering validation succeed.

Never persist raw response bodies, request payloads, provider error messages or cleartext recipient addresses in delivery metadata or logs. Allowlist safe error codes and provider-ID syntax. Return no provider diagnostic detail to the public contact endpoint.

## Rendering and execution design

Render separate internal/customer DTOs from the saved immutable estimate. Reuse validated snapshot projection rather than the pricing engine. Include saved pricing-model and engine versions in tests for historic estimates. Internal mail includes bounded contact details, answers, review flags and notes. Customer mail omits internal notes and financial scoring details.

Use the established public URLs `/estimate/[publicRef]` and `/api/estimates/[publicRef]/pdf`. Customer links contain the 32-character public reference, never a database UUID. The internal link points to the protected admin estimate path and grants no authorization itself.

Escape every HTML interpolation and URL attribute, bound text and collection sizes, and provide equivalent plain text. Require approved contact/disclaimer copy through explicit estimator configuration. Existing PDF fallback wording does not establish owner approval for email activation. Apply Hallmark before implementing the participant-facing templates.

After a successful contact transaction, resolve only its existing selected delivery records. Await bounded execution in the request instead of launching untracked promises. Catch notification failures after persistence so they cannot turn a saved request into a save failure. Do not send an unselected notification. Disabled sending remains the default; no real activation, staging mutation or production changes are authorized.

## Implementation and verification after design approval

1. Implement the SQL-equivalent pure lifecycle and matrix tests, then application claim/retry guards and tests.
2. Implement separate safe templates with saved-price, escaping, omission and link tests.
3. Implement the typed repository with conditional claims/finalization and tests for duplicate workers, stale finalizers and ambiguous database responses. Prove affected PostgreSQL behavior only on a positively identified DevCore local environment. Mock-only tests do not prove PostgreSQL concurrency.
4. Implement Worker-compatible Resend fetch with mocked responses for each classification and full-request timeout/body limits.
5. Integrate after the existing contact transaction. Test duplicate/parallel submissions, failure after persistence, missing configuration and selected intents only.
6. Run focused tests, booking regression tests, all requested Bun gates, local Worker smoke, Hallmark template checks, full diff inspection and exact-head verification before considering a draft PR.

No source implementation, migration, provider request or activation has been performed. No Plane project mapping was found in the inspected repository authority. No new tracker identifier has been invented.

## Decision requested

Approve or amend the proposed no-migration claim contract and bounded retry policy, especially the five-attempt cap, 60-second reclaim interval, 23-hour intent-age deadline and operational delay bound. If unconditional retry safety beyond Resend's retention is required, stop dispatch implementation and review a different provider/dispatch contract. Do not authorize a migration merely to add lease columns without resolving that external idempotency boundary.
