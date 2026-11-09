# Task 9 implementation evidence

Branch: `task9/estimator-notifications`.
Original accepted base: `c9fff68d52b5113a529d6d63589cf04765fb2fd2`.
Rebased integration base after PR #14: `8a7caa01cdd468d22e9c55aeed4ebbc439a148c2`.
Verification date: 2026-11-09. Bun: 1.3.10 through the installed mise binary. The workstation's default Bun differs, so all reported commands explicitly selected the pinned binary.

## Observed local results

- `bun run test`: 223 passed, 8 skipped, 0 failed; 1,550 assertions across 41 files. The eight opt-in database cases were run separately below.
- `GOAT_TASK9_LOCAL_TESTS=1 bun test supabase/concurrency/task9-notifications.test.ts`: 8 passed, 0 failed; 97 assertions against actual local PostgREST/PostgreSQL.
- `bun run check`: 0 errors and 0 warnings.
- `bun run build`: exit 0, including the Cloudflare adapter and Wrangler type check.
- `bun run check:worker-types`: exit 0, generated types current.
- `git diff --check` and the staged equivalent: exit 0.
- Hallmark `sloplint.mjs tests/notifications-email-preview.html --scope component --render`: 0 FAIL, 0 REFLEX, 0 WARN; five rendered viewports.
- Notification lifecycle: 12 tests cover all 16 state pairs plus guards, clocks, attempt caps, backoff, expiry and provider classification.
- Delivery integration: 14 tests cover selected intents, concurrent claims, parallel internal/customer requests, saved historic amounts, uncertain outcomes, stale finalization, configuration, audit-token binding, deadline races and aborts.
- Booking notification regressions: 2 tests preserve consultation ICS, appointment time conversion and validation-before-HTTP. The booking mailer implementation is unchanged.
- Local workerd notification smoke: 3 tests cover mocked acceptance, response-body timeout and disabled configuration. Existing contact and PDF Worker tests also passed in the full suite.
- Existing Task 7 local SQL concurrency script: all four assertions passed for one lead, one initial event and two selected intents under competing contact transactions.

The database target was the positively identified disposable `goat-task7-contract-isolated` project at `/tmp/goat-task7-contract`, local API port 57321 and database port 57322. Cluster identity, Docker labels, accepted migration versions, migration bytes and per-run test authorization were verified before test writes. No unidentified DevCore database or hosted Supabase project was used. The current accepted migrations were sufficient; no migration or generated database type change was needed.

A serial final full-suite run passed. One overlapping agent run failed contact Worker limiter tests while another run used the same local Wrangler state; the serial run passed. Two pre-existing estimate repository tests used November 5 snapshots with the wall clock and failed once those fixtures aged beyond 24 hours. PR #14 now owns the stronger deterministic clocks and exact 24-hour boundary tests. After rebase, this branch matches main exactly for estimates.test.ts and has no Task 9 modifications to that file. Production estimate behavior is unchanged.

## Review and impact

Independent specification/security and code-quality reviews found no remaining blocking defect. The specification review's audit observation was corrected: unnecessary reconciliation flags are rejected before journal writes. Root review added exact-attempt reconciliation binding, a public `{ saved: true }` regression after notification lookup failure, and a parallel-send saved-price check.

Product Spec section 26 now agrees with PostgreSQL's same-state retry claims. The application adds stricter five-claim, backoff, clock and expiry policy without changing the SQL states. Notification work is a bounded post-commit phase, and the RPC's existing lead UUID propagates internally. No contact response fields, booking behavior, pricing calculation or saved snapshot is changed.

All provider HTTP requests in verification used injected mocks. No real email was sent. Notification sending remains disabled by default and no activation configuration was added. No hosted database write, deployment, activation or merge occurred.

## Remaining activation dependencies and limitations

Approved business content, matching content digest, verified sender/provider configuration, explicit owner activation authority and an assigned operator workflow remain required. The operator runbook is `task9-notifications-operations.md`. The internal admin link uses the approved Task 10 route contract; staff authorization and that route must be available before activation.

Retries are manual only. Claims can be consumed before HTTP. An unknown outcome requires an fsynced operator audit decision tied to the exact inspected attempt. The audit file needs controlled access, retention and backup. `SENT` means provider acceptance. No delivery guarantee or unconditional exactly-once guarantee is claimed.

The existing schema does not freeze rendered payloads. A template/configuration change under the same key can strand the notification through a permanent provider payload conflict. The 23-hour intent-age deadline can prevent even a first request. Discovery pagination bounds output, not total database scanning. These accepted V1 limitations require no new infrastructure or migration.

## PR #15 review corrections

The focused audit/status/template and preserved PR #14 idempotency tests passed: 26 tests, 140 assertions. The added regressions failed against the prior implementation before the fixes. Audit append now encodes the JSONL record as UTF-8 bytes and checks the exact returned byte count before fsync. Short writes, write errors and sync errors return failure and never invoke the retry dispatcher. File-owner, mode and symlink guards remain in place.

Inspection now reports reconciliation required for consumed nonterminal claims with no outcome code, and for malformed scheduling metadata or invalid/inconsistent claim timestamps. Terminal records have no next retry time or reconciliation action. Both email formats append /month to the recurring range without changing saved amounts or rounding. The TEST-ONLY preview was regenerated and passed rendered Hallmark checks.

Only the expected estimates.test.ts rebase collision occurred. It was resolved by retaining main's exact file, including both exact 24-hour rejection tests. No production idempotency, claim, repository, migration or database assumption changed; the prior eight-case local PostgREST evidence remains applicable and was not rerun for these CLI/template corrections.

Hosted operator execution remains an activation gate. The runbook requires independent verification of the owner-approved project identity, endpoint and credential scope before hosted access. Merely configuring a Supabase URL is insufficient. No hosted command, real email, activation or deployment was performed for these corrections. The owner explicitly permits the existing GitHub Actions and automatic Pages preview checks after push.
