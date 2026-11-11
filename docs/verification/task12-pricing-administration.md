# Task 12 pricing administration verification

This report records author-side evidence for PR #18. The owner exception permits a draft PR for review with the authenticated Hallmark render unresolved. It does not pass that gate, authorize merge, or permit hosted migrations, pricing activation or deployment. The commercial manifest workflow and first-model bootstrap remain owner decisions. The existing `PRICING_ACTIVATION_INTEGRATION_BLOCKER` and denial of Data API execution of `estimator.activate_pricing_model` remain in place.

## Local test target

SQL checks used `goat-task12-disposable-20261110` at `/tmp/goat-task12-disposable-20261110`, PostgreSQL loopback port 58322. Before each destructive fixture setup or cleanup, `supabase/tests/task12-local.ts` confirms the local project ID, endpoint, cluster identity and the six canonical plus two Task 12 migration versions. The disposable database was reset from those version-controlled migrations after the revision migration changed. The new cluster identity was checked and recorded in its temporary marker. No hosted endpoint was used.

All fixtures use synthetic values and `example.invalid` users. The disposable project's email provider was enabled only in its local configuration for authenticated browser acceptance; global sign-up remained disabled, and an anonymous sign-up returned `signup_disabled`. Test users and pricing fixtures were removed. A final read-only check found no browser fixture models or test users remaining.

## Checks

All commands used Bun 1.3.10.

- `bun test`: **330 passed, 12 skipped, 0 failed** (342 tests, 1,869 assertions).
- `bun run check`: passed with 0 Svelte errors and 0 warnings.
- `bun run build`: passed, including Wrangler generated-type freshness check.
- `bun run check:worker-types`: passed.
- `bunx wrangler deploy --dry-run --outdir /tmp/goat-task12-wrangler-dry-run`: passed; this was a dry run, no deployment.
- Focused pricing unit tests for candidate corpus, draft update and form parsing: **9 passed, 0 failed**.
- `supabase test db --local --workdir /tmp/goat-task12-disposable-20261110` with `estimator_security_test.sql`, `estimator_invariants_test.sql` and `estimator_behavior_test.sql`: **115 pgTAP assertions passed**. The checks cover the new RPC grants, activation execute restrictions and preserved estimate snapshot behavior.
- `supabase/tests/clone_pricing_model_test.sql` against the identified disposable database: passed and rolled back. It checks clone values/order and source immutability, service-role-only RPC grants, rejected roles/states and duplicate versions, injected child-insert rollback, draft validation rollback, stale revisions and UUID duplication. It now also asserts that a no-op save does not advance revision, an effective multi-rule plus threshold save advances the aggregate exactly once, no-op direct writes do not advance it, and an effective direct rule write does.
- Revision behavior: the guarded save RPC uses transaction-local context to coalesce its rule-trigger notifications, skips unchanged row values, and performs one revision update for any effective aggregate change. Direct effective rule/model writes outside that RPC still advance the revision; no-op writes do not. The row lock and expected-revision comparison remain the lost-update guard.
- `GOAT_TASK12_LOCAL_TESTS=1 bun test supabase/tests/clone_concurrency.test.ts supabase/tests/draft_concurrency.test.ts supabase/tests/pricing_activation_race.test.ts`: **3 passed, 0 failed** (14 assertions). This explicitly ran duplicate clone, competing stale-revision saves and synthetic local activation races.
- `GOAT_TASK12_BROWSER_TESTS=1 bun test supabase/tests/pricing_browser.test.ts`: **1 passed, 0 failed** (16 assertions) against the built local Worker and disposable Supabase. It covers anonymous/AAL1/viewer/advisor denial, forged actor input, active admin AAL2 clone and edit, stale edit conflict, required full candidate corpus report, 320px overflow and keyboard focus. It uses synthetic expectations only.

The full-suite 12 skips are not counted as coverage. Eight inherited Task 9 PostgREST tests are: immediate claim and stale-unknown reconciliation; concurrent claims and stale finalization; metadata changes and expiry; fifth-claim exhaustion; retryable-claim races; lost claim responses; lost SENT finalization responses; terminal-row mutation and expiry/finalization races. Four opt-in Task 12 tests are clone concurrency, draft-save concurrency, synthetic activation concurrency and authenticated browser acceptance; all four were run separately as listed above.

The saved-estimate document/PDF path tests and SQL snapshot test passed. No byte-for-byte PDF comparison across activation was performed.

## Candidate acceptance coverage

The candidate runner requires all **17 named cases** in the current canonical corpus, including current and VAT cases, workforce boundary, multiple backlog and record states, risk, unknown volume, unknown volume with major backlog, multiple-entity count uncertainty and high-volume boundary. It also requires a combined-estimate scenario. Case identifiers and answer predicates enforce coverage; the manifest independently supplies each expected amount range, triggered rule code, confidence and review outcome. Candidate values are never used to derive expectations. Synthetic corpus goldens appear only in unit and browser tests. The result reports model ID, fingerprint, manifest revision, required-case count and per-scenario failures. Public estimate calculation remains ACTIVE-only.

## Visual and integration gates

**Authenticated Hallmark render: BLOCKED — NOT VERIFIED.** Earlier authenticated render attempts stalled after about 90 seconds or reported a detached frame. This follow-up did not retry the renderer. Static source lint `bun /home/jcschoeman96/.agents/skills/hallmark/scripts/sloplint.mjs src/routes/admin/pricing --scope app` reported 0 FAIL, 0 REFLEX and 0 WARN across two Svelte files; it does not render the interface. A prior partial snapshot run reported 320 FAIL and 6 REFLEX findings; there is no equivalent baseline render, so those findings are not classified as inherited or introduced. The snapshot run is not a clean Hallmark result. The actual authenticated admin shell, listing, editor, read-only view, action errors, desktop/mobile behavior, contrast and complete accessibility still need independent visual review, plus a working Hallmark render, before merge.

One earlier local AAL1 navigation returned HTTP 503 and failed closed. Later browser runs passed; the local availability interruption remains unexplained. The opt-in authenticated browser test verifies the listed functional and 320px/focus assertions, but it does not replace the blocked visual/accessibility gate.

The source keeps activation blocked. Local SQL inspection confirmed the clone and save RPCs are owned by `postgres`, are `SECURITY DEFINER`, and grant execution only to `service_role`; `anon` and `authenticated` cannot execute them. The activation RPC remains non-executable by `anon`, `authenticated` and `service_role`. No hosted migration, production pricing activation, deployment or feature-flag change occurred.

Before merge, complete the visual and accessibility review above, obtain exact-head CI success and independent review. The workflow for independent commercial-manifest approval and the procedure for creating the first approved DRAFT require owner decisions. Synthetic prices must not be seeded into the hosted project.
