# Task 9 operator workflow and verification

Notification sending is disabled by default. This change supplies no activation values and authorizes no real mail, hosted database access or deployment. Test content is labelled TEST-ONLY.

## Manual execution

Use the repository's pinned Bun 1.3.10 in a controlled server environment. The command imports server modules directly and does not import `cloudflare:workers`. It does not load secrets from shell arguments or print environment values. Provision the existing Goat Supabase server environment through the approved environment manager. Do not substitute another project's database.

Hosted execution is blocked until an operator positively verifies the approved Goat project identity against independent owner-controlled records, checks its endpoint and credential scope, and records that verification. The command trusts its configured endpoint; a configured URL alone is not project verification. No hosted execution was performed in Task 9.

Read-only discovery and inspection:

```sh
bun scripts/retry-estimator-notification.ts --list
bun scripts/retry-estimator-notification.ts --list --after <last-delivery-uuid>
bun scripts/retry-estimator-notification.ts --inspect --delivery-id <delivery-uuid>
```

Discovery returns up to 50 nonterminal delivery IDs per page with safe status, claim count, eligibility time and expiry. It excludes contact details, parent IDs, links and recipient metadata. Effective expiry can precede a stored terminal state. No scheduled job changes or retries these rows.

One authorized invocation handles at most one existing delivery:

```sh
bun scripts/retry-estimator-notification.ts --delivery-id <delivery-uuid>
```

Claims two through five are manual only. After a transient failure, inspect the next eligible time and invoke again after that time. The command does not wait, loop or refund claims. It exits nonzero unless the requested operation succeeds or sending is disabled. A database claim can be consumed without a provider request.

Write execution additionally requires `ESTIMATE_NOTIFICATION_OPERATOR_UID` to equal the process UID. Access to the controlled account and server credentials is the authorization boundary. This is not a public endpoint. Do not run privileged retry commands in an untrusted shell or expose their credentials to client code.

Unknown outcomes require provider reconciliation first. Establish whether the provider accepted the previous key and whether a cooldown still applies. Use an approved internal case reference without PII. If the result or cooldown cannot be established, leave the record held.

```sh
bun scripts/retry-estimator-notification.ts --delivery-id <delivery-uuid> \
  --confirm-provider-reconciled --reconciliation-ref <case-reference>
```

`ESTIMATE_NOTIFICATION_AUDIT_PATH` must name an absolute path on a trusted local filesystem. The command rejects symlinks, nonregular files, different owners and permissions other than 0600. It verifies that the complete UTF-8 record was written and fsyncs the reconciliation decision before dispatch can claim. A short write, write error or sync failure denies dispatch. An incomplete record may remain after a failed write and needs operator inspection before journal reuse. The journal contains a unique audit ID, timestamp, UID, delivery ID, claim count, safe prior code and case reference. Protect and retain this journal through the operator's existing access and backup policy. It is an audit record, not a tamper-proof external ledger. Failed journal writes prevent retry. The reconciliation permission is tied to the exact inspected attempt count, timestamp and outcome metadata. A changed token requires fresh inspection and a new audit decision. An unnecessary reconciliation flag is rejected without an audit write. Reconciliation cannot bypass backoff, expiry, attempt limits or provider payload conflicts.

## Activation dependencies

Real sending requires a separate explicit owner authorization. All of the following must then be provisioned through approved server configuration:

- `ESTIMATE_NOTIFICATIONS_ENABLED=true`.
- `RESEND_API_KEY`, a verified `ESTIMATE_EMAIL_FROM` address and `ESTIMATE_EMAIL_INTERNAL_TO` address.
- `ESTIMATE_EMAIL_CONTENT`, a JSON object validated by `content.ts`, containing approved `disclaimer`, `contactName`, `contactEmail`, `approvalReference` and HTTPS `publicOrigin`. Optional `contactPhone` and `title` have no defaults.
- `ESTIMATE_EMAIL_CONTENT_SHA256`, the digest of the normalized approved content. The read-only `--content-digest` command computes it without printing the copy.
- An authorized operator account, UID binding, protected audit path and responsibility for inspecting failed records.

Missing or invalid content, digest, addresses or credentials prevents claims and HTTP. TEST-ONLY copy is rejected outside injected-mock test mode. Configuration failures have safe operational codes and cannot undo a saved contact. A digest confirms configured bytes match approved bytes; the operator must establish the actual business approval.

Customer result and PDF links use the existing opaque 128-bit public reference and HTTPS origin. They inherit the existing bearer-link contract and do not expose database IDs. The PDF endpoint applies its existing private/no-store and saved-estimate checks. Internal admin links require the existing staff authorization.

## Delivery limitations

`SENT` means Resend accepted the message. It does not confirm inbox delivery. There is no automatic retry or delivery guarantee. Disabled sending, a delayed operator or an intent older than 23 hours can prevent every provider request. Terminal records cannot be reset by this tool.

Resend retains idempotency keys for 24 hours. Every claim uses `goat-estimate/<delivery-uuid>`, with deterministic rendering from saved snapshots and current approved configuration. Do not edit templates, recipients or configuration while retrying a pending payload. A changed payload under the same key is rejected permanently; the command never rotates a key to bypass that conflict. The existing schema stores no immutable rendered payload. Arbitrary process suspension or delayed network execution remains outside an unconditional exactly-once guarantee.

Discovery uses the primary-key cursor and a two-second query timeout. Its output bound does not bound database scanning when most rows are terminal. No index or migration was added. Parent lookups use existing indexes and bounded duplicate detection.

## Local evidence

The concurrency suite runs only with `GOAT_TASK9_LOCAL_TESTS=1`. It verifies the disposable project/workdir labels, pinned cluster identity, exact local API endpoint, accepted migration versions and migration bytes before any writes. It refreshes a per-run authorization nonce in the existing test marker. Run it serially against the identified disposable Goat Supabase instance, never an unidentified DevCore database. The fixture data is synthetic and immutable notification rows remain in that disposable instance.

```sh
GOAT_TASK9_LOCAL_TESTS=1 bun test supabase/concurrency/task9-notifications.test.ts
```

Eight real PostgREST cases passed with 97 assertions on the existing schema. They cover immediate initial claims, competing PENDING and FAILED_RETRYABLE claims, microsecond token preservation, stale finalization, active/backoff/provider-delay exclusion, reconciled stale-claim recovery, lost claim responses, lost SENT finalization responses, expiry before first HTTP five-claim exhaustion, terminal immutability and competing expiry/finalization. No provider HTTP request is made by this suite. Concurrent contact creation was also checked with the existing Task 7 local SQL script and its four assertions passed.

The implementation's focused and full verification results are recorded in the final Task 9 review evidence. No migration, hosted write, real message, activation, deployment or merge forms part of this work.
