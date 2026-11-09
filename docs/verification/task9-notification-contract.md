# Task 9 notification contract revision

Status: approved for technical implementation by the owner on 2026-11-09. Business-copy approval blocks activation and launch only. Real sending remains disabled; all provider tests use mocks.

Accepted implementation base: `c9fff68d52b5113a529d6d63589cf04765fb2fd2`. Proposal commit before this revision: `d2bd8f262d934a71737c02b22738de3272569409`. Branch: `task9/estimator-notifications`. Task 7 and Task 8 dependencies are merged.

## 1. Scope and decisions

Retain the four SQL states, conditional claims, five total claims, 60-second minimum reclaim interval, five-second provider deadline and 23-hour intent-age deadline. No migration is proposed. The real local PostgreSQL and PostgREST acceptance tests passed without a migration. See task9-notifications-operations.md for evidence and run instructions.

Use best-effort initial sending with manual-only retries. There is no automatic retry, scheduler, queue, global runner or delivery guarantee. A retryable record can remain untouched indefinitely without operator action. The public response promises only that the contact request was saved.

The owner authorized this contract, the operator command and the Product Spec correction. This authorization does not permit real delivery, hosted database changes, deployment or merge.

## 2. Authority conflict and proposed correction

Product Spec v0.1.0 section 26 permits `FAILED_RETRYABLE -> PENDING` for authorized/system retry. `guard_notification_delivery()` in `20261103183011_estimator_core.sql` prohibits that transition. A0 resolves this authority conflict by correcting section 26 without changing SQL.

The approved correction retains SQL and records this behavior in section 26:

> Authorized retries claim a FAILED_RETRYABLE delivery through a conditional same-state update. The claim increments attempt_count and records last_attempt_at. It does not transition back to PENDING. A successful provider acceptance permits FAILED_RETRYABLE -> SENT. Permanent failure, attempt exhaustion or retry-window expiry permits FAILED_RETRYABLE -> EXHAUSTED. PENDING also permits SENT, FAILED_RETRYABLE or EXHAUSTED. SENT and EXHAUSTED are immutable terminal states. Identical terminal-row updates have no effect.

The owner authorized A0, and section 26 now records the SQL-aligned lifecycle. No unrelated product decisions change.

The complete SQL state matrix is:

- PENDING permits PENDING, SENT, FAILED_RETRYABLE and EXHAUSTED.
- FAILED_RETRYABLE permits FAILED_RETRYABLE, SENT and EXHAUSTED. It forbids PENDING.
- SENT permits only an identical SENT row. Every other state and every field mutation are forbidden.
- EXHAUSTED permits only an identical EXHAUSTED row. Every other state and every field mutation are forbidden.

Inserts require PENDING, zero attempts, null last_attempt_at and null sent_at. Deletes and identity changes are forbidden. Identity includes parent IDs, type, provider, recipient metadata and created_at. Updates may preserve attempt_count or increment it by one, never decrease it or skip counts. An increment requires a timestamp. SQL does not itself enforce increasing timestamps, a five-claim cap or an increment for each state change. The application adds those restrictions. The table requires sent_at exactly for SENT and bounds safe error metadata. Test the SQL rules independently from the stricter execution policy.

## 3. What executes each attempt

The initial trigger is a successful contact transaction. Its post-commit hook may claim each selected persisted intent only when attempt_count is zero. Matching public contact retries may pick up an intent still at zero; they never execute claims two through five. Concurrent submissions compete for the same initial claim. They do not insert replacement intents.

Claims two through five require an authorized operator invocation of the server-side tool:

`bun scripts/retry-estimator-notification.ts --delivery-id <uuid>`

The owner approved this command and operator workflow for technical implementation. Its presence is not authorization to send real mail. It uses the same repository, renderer, transport, configuration gates and claim rules as initial delivery. One invocation can claim at most one existing delivery once. It never loops, sleeps until eligible, creates an intent or resets a terminal row. A record skipped because sending was disabled may receive its first claim through this tool.

Authorize operators through access to the controlled server execution environment and its existing server-only Goat Supabase credentials. Do not expose a public retry endpoint or depend on the unmerged admin UI. Do not accept recipient, payload, idempotency-key, attempt-reset or arbitrary database-target overrides. Credentials come from approved environment configuration, never command arguments or logs. Hosted execution and real delivery need separate explicit owner authorization.

Before each invocation, the operator checks persisted status and eligibility using the tool's read-only `--inspect` mode. Inspection shows only delivery ID, type, state, claim count, safe code, next eligible time and expiry. It never displays recipient addresses, estimate links, contact details or raw provider responses. The command returns a distinct safe outcome for accepted, deferred, exhausted, disabled, configuration failure, uncertain and persistence unavailable.

After a transient failure, the record and command outcome identify the next eligible time. An operator must invoke the command again at or after that time. No invocation means no next attempt. Document this manual responsibility in the operational runbook. No current automated process is assumed to monitor or retry the records.

## 4. Claims, timestamps and finalization

A database claim and a provider request are different events. attempt_count counts successful database claims, including a claim whose worker crashes before HTTP. Five claims therefore allow at most five provider requests, and possibly fewer. The schema cannot prove the exact number of external requests. No operator may refund a claim.

Read the existing row, then issue one conditional UPDATE matching its full token `(id, state, attempt_count, last_attempt_at)`. Match null timestamps with IS NULL and preserve the database timestamp's full precision. The update preserves PENDING or FAILED_RETRYABLE, increments the count by exactly one, writes a database-evaluated attempt timestamp and marks the outcome unknown. Request the updated row. Only a successful response containing that row authorizes HTTP. Zero returned rows mean a lost race. A timeout, error or lost claim response authorizes no HTTP, even if the database committed the claim.

Also match the observed last_error_code and last_error_safe_message in the claim predicate. A concurrent outcome update must invalidate eligibility calculated from older retry metadata, even when the state stays FAILED_RETRYABLE. Finalization requires the claimed ATTEMPT_OUTCOME_UNKNOWN marker so a second outcome writer cannot overwrite a completed outcome for the same claim.

Use PostgreSQL's timestamptz input `now` for the timestamp write and the returned timestamp for subsequent comparisons. Prove that this works through the actual local PostgREST adapter and existing column grants before adopting it. Do not substitute a guessed Worker timestamp if it fails. No new time RPC is authorized by this proposal.

Application guards require a nonterminal state, count below five, valid parent/type, valid timestamps, approved configuration, valid saved snapshot and sufficient remaining time. Claim timestamps must strictly advance. Reject negative ages, inconsistent count/timestamp pairs, clock anomalies and corrupt safe metadata without HTTP. A same-state claim is ownership bookkeeping, not successful delivery.

Use a five-second Worker/database clock tolerance and allow at most two seconds of claim round-trip uncertainty, giving a conservative seven-second comparison margin. Bracket the claim request with Worker wall-clock readings and require the returned database timestamp to lie within that interval expanded by five seconds. A claim round trip longer than two seconds, a backwards Worker clock or a failed clock check permits no HTTP. Before claiming, require `WorkerNow - 7 seconds` to be at or beyond the reclaim/backoff time. Before HTTP, require `WorkerNow + 7 seconds + 5 seconds` to precede `created_at + 23 hours`. Recheck after every awaited preparation step. Use monotonic elapsed time for execution deadlines.

The five-second tolerance is a proposed operational assumption that must pass local tests and be accepted for the deployed environment. Unexpected drift fails closed and produces a safe operational error. It does not justify a schema change or silently widening the tolerance.

Each claim writes the safe code ATTEMPT_OUTCOME_UNKNOWN and clears previous retry scheduling metadata. Finalization matches the exact claimed token and changes no identity fields or claim count. Stale finalization updates zero rows. Record SENT and a database-evaluated sent_at only after a validated Resend acceptance response with a bounded, allowlisted provider ID. SENT means provider acceptance, never confirmed inbox delivery.

If finalization times out or its response is lost, re-read for operational diagnosis when the request budget allows. Never infer SENT from a claimed row, an HTTP timeout or a failed database write. A successfully committed SENT row is authoritative even if its acknowledgement was lost. Otherwise leave the outcome uncertain for manual handling. A crash or missing finalization may leave PENDING or FAILED_RETRYABLE with ATTEMPT_OUTCOME_UNKNOWN.

## 5. Backoff, Retry-After and recovery

After claims one through four, the minimum delay before the next claim is respectively 60, 120, 240 and 480 seconds from last_attempt_at. These delays include the 60-second active-claim exclusion. Never reclaim while that exclusion or a longer provider delay applies.

For a valid Retry-After header, accept nonnegative delta-seconds or an HTTP date. Convert it conservatively to an absolute UTC deadline using response-receipt time and the clock tolerance. The next eligible time is the later of that deadline and exponential backoff. Never shorten a valid provider delay to fit the application window. If it exceeds expiry, no further send is eligible. A malformed, overflowing or uninterpretable Retry-After causes a manual hold, not an immediate retry.

Persist the computed deadline with the outcome update in last_error_safe_message using exactly `Retry not before <UTC ISO timestamp>.` Store only that generated text and an allowlisted reason code. Parse the format strictly on later invocations. This reuses the existing bounded safe metadata fields; it stores no raw provider header or payload. A known transient failure becomes FAILED_RETRYABLE. Unknown or malformed scheduling metadata prevents another request until reconciled, or until expiry exhausts the record.

A crash, lost claim response or failed outcome write can lose Retry-After information. After the active interval, these records are inspectable but are not blindly resent. The operator must reconcile provider acceptance and applicable cooldown through authorized provider inspection. The proposed `--confirm-provider-reconciled` flag must represent a documented determination that retry is safe. It cannot override the cap, expiry, stable key or any persisted delay, and it cannot itself mark a delivery SENT. If the operator cannot establish a safe cooldown and retry outcome, leave the record held and make no HTTP request. At expiry, an operator invocation may conditionally mark it EXHAUSTED without sending. This favors missed mail over ignoring an unknown provider restriction.

For a durably recorded timeout or network failure without a usable provider response, apply the same reconciliation requirement. A normal durably recorded transient response with a valid schedule requires no extra reconciliation step beyond checking eligibility.

After a failed or uncertain fifth claim, finalize EXHAUSTED when possible. If its worker disappeared, a later operator invocation may mark it EXHAUSTED after the active exclusion, without a sixth claim or provider request. EXHAUSTED can represent an uncertain prior acceptance. It never proves that no mail was sent. Terminal records cannot be retried or reset through this tool.

## 6. Expiry and provider semantics

Resend's documented contract retains idempotency keys for 24 hours. The existing proposal cites:

- https://resend.com/changelog/idempotency-keys
- https://resend.com/blog/engineering-idempotency-keys

Use one stable key derived from the delivery UUID. Never change it per attempt. An identical replay returns the original acceptance within retention. A `409 concurrent_idempotent_requests` is transient. A `409 invalid_idempotent_request` is a permanent payload conflict. Transport classification follows those official provider documents and is exercised with mocked responses.

At 23 hours from immutable intent creation, stop dispatch eligibility, including for an intent that has never reached HTTP. A later operator invocation may conditionally exhaust an expired idle record without incrementing its count. Respect the active exclusion before terminal maintenance. No process automatically changes expired records merely because time passed. Inspection reports effective expiry even if the stored state still says PENDING or FAILED_RETRYABLE.

The cost is that disabled sending, slow manual response or long provider delays can prevent delivery entirely. Do not claim automatic or guaranteed delivery. Never create a fresh intent or key to bypass expiry. Recovery beyond this contract requires a separate owner decision and provider reconciliation.

The one-hour retention margin assumes combined clock/execution/network delays cannot consume it. Recheck eligibility immediately before HTTP and abort at the provider deadline. Database claims cannot fence a paused process's external request. This design does not promise unconditional exactly-once behavior across arbitrary suspension or delivery delays.

The table does not freeze rendered payload or configuration. Identical keys must retain identical payloads. Template/configuration changes can produce a permanent conflict and strand a delivery. Do not rotate its key to recover. A future immutable payload/version design requires separate approval.

## 7. Safe outcomes and operational visibility

- Validated acceptance permits SENT through conditional finalization.
- 429, 5xx and concurrent-idempotency conflicts permit FAILED_RETRYABLE within the cap and window, subject to backoff and Retry-After.
- Permanent validation, authorization and payload-conflict responses permit EXHAUSTED with allowlisted codes.
- Network failures, timeouts, malformed successful responses and oversized responses are uncertain. They never imply success and follow manual reconciliation rules.
- Missing activation or approved configuration performs no claim and no HTTP. Retain the existing intent and expose a safe operational result. Missing disclaimer/contact approval is an activation blocker.
- Provider authorization/configuration rejection records a specific operational failure code and requires operator correction. EXHAUSTED remains terminal after correction; no silent reset or replacement intent is permitted.
- Lookup, claim or finalization failure produces a safe operational code. If the database cannot record it, emit only a fixed code and delivery ID when known through the existing server error channel. Do not claim a durable error was saved when its write failed. The operator inspection/runbook is the explicit follow-up mechanism; no alerting service is assumed.

Never log credentials, full recipient addresses, public-reference links, rendered bodies or provider payloads. Provider IDs and error metadata use bounded allowlists. Public contact responses contain no provider diagnostics or internal notification identifiers.

## 8. Contact commit boundary and response latency

The existing RPC already returns the lead UUID. Change the repository to propagate it internally instead of discarding it. The service returns saved context containing leadId and the estimateId already resolved before the RPC. Do not add another insert or change the RPC's transaction semantics.

Separate commit acknowledgement from notification-context validation. If the RPC returns success but its UUID is missing or malformed, record saved success with unusable notification context and a safe operational error. Do not throw a save failure after an acknowledged commit. Skip dispatch. A lost RPC response is a different, genuinely uncertain persistence outcome; retain the matching-retry behavior rather than inventing a confirmed save.

After successful persistence, run the entire notification phase within a separate failure boundary. That boundary includes context validation, lookups, rendering, configuration, claim, transport, finalization and operational reporting. No exception from it, including a failing logger, may reach the contact-save error mapper. The public result remains HTTP 200 with exactly `{ saved: true }`. This applies to matching submissions too. Process termination or a disconnected client can still lose a response; the contract does not claim control over those events.

Resolve the persisted lead by the returned leadId and verify its estimateId and saved selections. Locate internal_lead only by that leadId and customer_estimate only by its estimateId, with the opposite parent null. Check the saved selection for each type. Missing or duplicate intents are operational errors; never create replacements. A failure for one intent does not authorize the other type or roll back business data.

Use the existing lead/estimate parent indexes for these bounded lookups and the primary key for claims/finalization. Detect duplicate intents with a bounded two-row lookup per selected type. There is no automatic global retry scan or proposed new index. Manual discovery uses primary-key cursor pagination and a 50-row output cap, with a two-second query deadline. Filtering nonterminal states while ordering by ID can inspect many rows when most rows are terminal; the output cap does not bound PostgreSQL work. This is a documented small-application limitation. The existing partial retry index is available for state/time operational queries; its existence does not execute retries.

Use a seven-second total post-commit budget. Use at most two concurrent delivery operations so two five-second HTTP deadlines do not add to ten seconds. Each provider deadline covers headers and at most 16 KiB of response bytes. All notification database calls share the remaining budget and have deadlines of at most two seconds. Skip HTTP if less than five seconds remain. Stop new operations at budget expiry, abort active requests, and return saved success. Late claim results authorize no new HTTP. An aborted finalization may still commit; later inspection determines the durable outcome.

Await bounded execution in the request. Do not launch background sends or rely on unawaited promises or unverified Worker waitUntil behavior. A deadline race must also cancel underlying fetches and guard every continuation against starting a late send. The seven seconds bound only notification overhead, not pre-commit validation, Turnstile or persistence. This bounded latency tradeoff requires approval with the rest of the contract.

## 9. Saved data and rendering

Use authoritative saved calculation and answer snapshots, including their saved pricing-model and engine versions. No pricing recalculation or booking LeadSchema, appointment or ICS imports. Internal email includes bounded contact details, saved summary, review flags, structured answers, free text and a protected admin link. Customer email omits internal notes and unnecessary financial/PII details.

Use `/estimate/[publicRef]` and `/api/estimates/[publicRef]/pdf` for customer links. Never expose database UUIDs in customer links. An internal admin link grants no authorization. Verify its exact route contract before implementing it.

Escape every HTML interpolation and URL attribute, bound free text and collections, and provide plain-text equivalents. Approved contact/disclaimer settings are required before activation. Existing PDF fallbacks do not establish email-copy approval. Apply the required Hallmark workflow before template implementation. Keep booking and public-estimator behavior intact.

## 10. Acceptance evidence before no-migration approval

Database acceptance tests use the existing positively identified local Goat Supabase setup, its accepted migrations, actual service-role privileges and real PostgREST adapter. Follow the instance/cluster authorization precautions in `supabase/concurrency/README.md`. Verify container/workdir labels, local endpoint, database identity and migration bytes before writes. Do not reuse historical instance names as proof that an instance is currently disposable. Do not use an unidentified DevCore database or any hosted database. If DevCore environment configuration applies, follow it without substituting its generic database for the identified Goat Supabase test target. Stop if these requirements cannot be satisfied safely.

Required real-database cases are:

1. Two connections claim the same token concurrently. Exactly one receives a row, and the count increments once. Repeat for both nonterminal states.
2. A worker cannot reclaim during the exclusion, exponential backoff or persisted provider delay. An eligible manual invocation can reclaim afterward.
3. A stale worker cannot finalize after another claim. A valid owner can finalize, and terminal updates reject every mutation.
4. Commit a claim but discard its response. Its worker makes no HTTP request. Re-read preserves the consumed claim; recovery requires the documented manual checks.
5. Crash after claim before HTTP and after mocked provider acceptance before finalization. Neither path fabricates SENT; recovery preserves the key and cap.
6. Commit finalization but discard its response. Re-read finds SENT. A rolled-back finalization leaves uncertainty and no invented acceptance record.
7. Exercise PostgreSQL `now` through PostgREST, null and microsecond timestamps, role grants, clock-skew boundaries and competing expiry/finalization updates.
8. Five consumed claims prevent a sixth request. Expiry before the first request prevents sending. Initial public submissions cannot execute manual retries.
9. Concurrent matching contacts still create one lead and only selected intents. Internal/customer parent constraints and unselected-type exclusions hold.

Focused application tests must cover the entire state matrix, cap/backoff boundaries, Retry-After dates and delta-seconds, malformed headers, ambiguous outcomes, changed-payload conflicts and operator authorization/configuration gates. Dedicated integration regressions must inject every post-commit failure, especially notification lookup failure, and still observe `{ saved: true }`. Also test acknowledged persistence with malformed returned context, parallel sends within the shared budget, aborted/late operations, historic-price consistency, HTML escaping and booking behavior.

Run the originally requested Bun checks, build, Worker-type validation, booking regressions, affected local Worker smoke, Hallmark checks and full exact-head diff review after approved implementation. Mocked HTTP is mandatory. Mocked database tests alone cannot certify concurrency. A failed acceptance case blocks no-migration approval; propose the smallest necessary amendment before any schema change.

## 11. Implementation authority and activation dependencies

The SQL-aligned Product Spec correction, manual-only retry tool, operator responsibility, reconciliation holds, timestamp/skew policy, bounded response strategy and existing-schema metadata encoding are approved for implementation. The no-migration choice still requires the local acceptance evidence above.

Templates use typed configurable business-content fields. Automated tests and mocked previews must label placeholder wording TEST-ONLY. No unapproved copy, titles, phone numbers or business claims become production defaults. Missing approved disclaimer/contact configuration prevents sending and preserves the lead and intent. Customer mail uses a secure PDF download link.

The owner authorizes technical implementation and local verification, followed by a draft PR only after all gates pass. No hosted database changes, real mail, activation, deployment or merge are authorized. Stop on unsafe real-database claims, duplicate sends, invalid transitions, booking regressions, invalid saved-price behavior or a need for an unapproved migration.
