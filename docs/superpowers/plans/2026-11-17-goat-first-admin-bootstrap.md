# Goat first-administrator bootstrap implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a private, auditable CLI and guarded database procedures for provisioning an existing Auth identity as the first invited administrator and activating that same identity only after verified TOTP.

**Architecture:** A versioned Supabase migration owns the one-time lifecycle, append-only audit evidence, transaction lock, Auth checks, and write guard. A local owner-run Bun CLI calls only the two service-role RPCs, checks the exact GOAT URL, defaults to database preflight, and requires an owner reference plus a target-bound typed confirmation before execution. No public route, user creation, email delivery, hosted operation, or general staff-management feature is added.

**Tech Stack:** PostgreSQL 17, Supabase Auth/PostgREST, Supabase migrations and pgTAP, Bun 1.3.10, TypeScript, `@supabase/supabase-js`.

---

## File map

- Create `supabase/migrations/20261117120000_first_admin_bootstrap.sql` for the private audit/context tables, lifecycle guard, and provision/activate procedures.
- Create `supabase/migrations/20261117130000_first_admin_activation_guards.sql` to require a distinct activation authorization reference and hold Auth identity/MFA locks through activation.
- Create `supabase/migrations/20261117140000_first_admin_write_guard.sql` to preserve trusted direct fixture setup by the local database owner while continuing to reject Data API role writes without procedure context.
- Create `supabase/migrations/20261117150000_first_admin_state_guard.sql` to require procedure context for every staff-state change by Data API roles.
- Create `supabase/tests/first_admin_bootstrap_test.sql` for positive, negative, rollback, privilege, and lifecycle coverage.
- Modify `supabase/tests/estimator_security_test.sql` to include the two new protected tables in existing all-table RLS and grant assertions.
- Create `scripts/bootstrap-first-admin.ts` for argument parsing, exact target validation, safe preflight output, explicit execution gates, and RPC calls.
- Create `scripts/bootstrap-first-admin.test.ts` for CLI argument, target, and injected-RPC behavior tests.
- Modify `src/lib/server/supabase/database.types.ts` to type the two RPC contracts.
- Modify `package.json` with the explicit `staff:first-admin` command.
- Modify `docs/architecture/staff-onboarding.md` with the private procedure and owner-run activation steps.

## Task 1: Define the CLI contract with failing tests

**Files:** Create `scripts/bootstrap-first-admin.test.ts`; create `scripts/bootstrap-first-admin.ts` only after the tests fail.

- [x] **Step 1: Write argument and target tests.** Cover `provision` and `activate`; reject duplicate, unknown, missing, malformed, and mismatched flags; require `--owner-authorization-ref`; require `--identity-verification-ref` only for provisioning; require `--confirm-user-id` only with `--execute`; accept only the exact configured hosted origin; allow a loopback URL only when the unit-test helper explicitly receives `allowLocalTestTarget: true`. Assert no test includes a real email or token.
- [x] **Step 2: Run the focused test and confirm the missing-module failure.**

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- mise exec bun@1.3.10 -- bun test scripts/bootstrap-first-admin.test.ts`

  Expected: FAIL because the tested parser and target validator do not exist.
- [x] **Step 3: Add the minimal exported contracts.** Export `parseBootstrapArguments(args: string[])`, `validateBootstrapTarget(url: string, allowLocalTestTarget?: boolean)`, and `runBootstrapCommand(args, env, dependencies)`. Model commands as a discriminated union: `{ operation: 'provision' | 'activate'; userId: string; ownerAuthorizationRef: string; identityVerificationRef?: string; execute: boolean; confirmedUserId?: string }`. Validate UUID and reference formats before any client construction.
- [x] **Step 4: Re-run the focused test and confirm it passes.**

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- mise exec bun@1.3.10 -- bun test scripts/bootstrap-first-admin.test.ts`

  Expected: PASS for parsing and URL-boundary cases. No network request occurs in these tests.

## Task 2: Add the private database lifecycle and prove its guards

**Files:** Create `supabase/tests/first_admin_bootstrap_test.sql`; create `supabase/migrations/20261117120000_first_admin_bootstrap.sql`, `supabase/migrations/20261117130000_first_admin_activation_guards.sql`, `supabase/migrations/20261117140000_first_admin_write_guard.sql`, and `supabase/migrations/20261117150000_first_admin_state_guard.sql`; modify `supabase/tests/estimator_security_test.sql`.

- [x] **Step 1: Write SQL assertions before the migration.** The pgTAP suite must cover: provision of one existing Auth identity into exactly one `admin/INVITED` row; preflight without writes; activation denied before TOTP; activation succeeds only after `email_confirmed_at` and a verified `totp` factor; duplicate/prior-event/existing-admin rejection; direct `service_role` admin insert and `INVITED → ACTIVE` update rejection; `anon` and `authenticated` RPC denial; audit update/delete denial and no audit/context table privileges for API roles; rollback when audit insertion fails; preservation of the terminal `DEACTIVATED` guard and last-active-admin guard. Use only synthetic `.invalid` identities and fixed test UUIDs.
- [x] **Step 2: Run the new pgTAP file before implementation and confirm it fails because the target objects are absent.**

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- supabase test db supabase/tests/first_admin_bootstrap_test.sql --local`

  Expected: FAIL on missing `estimator.staff_admin_audit` and RPC objects. Do not run `supabase db reset`.
- [x] **Step 3: Add the migration.** Create `estimator.staff_admin_audit` with target UUID, operation, previous/new state, authorization reference, optional identity-verification reference, and timestamp. Add a private transaction context table keyed by transaction ID, backend PID, target UUID, and operation. Enable and force RLS on both tables; grant no table access to `PUBLIC`, `anon`, `authenticated`, or `service_role`.
- [x] **Step 4: Add an append-only audit trigger and the staff write guard.** Use fixed `search_path` values and `SECURITY DEFINER`. The guard permits an admin invitation insert only when the matching private provision context exists, and permits activation only when the matching private activation context exists. It rejects every direct active-row insert and every direct transition into `ACTIVE`. Keep the existing `estimator.guard_staff_user()` terminal and last-active-admin checks intact.
- [x] **Step 5: Add `estimator.provision_first_admin(uuid,text,text,boolean)` and `estimator.activate_first_admin(uuid,text,boolean)`.** Both take `pg_advisory_xact_lock(20261103, 17)`. Provision requires the Auth user to exist, zero active administrators, no admin staff row, and no prior provision/activation audit event. Activation requires the same user from the single provision event, an `INVITED` admin row, zero active administrators, confirmed Auth email, verified TOTP, and a distinct authorization reference. With `p_execute = false`, return a ready result without writing. With `p_execute = true`, create private transaction context, perform the guarded staff mutation, delete context, and append audit evidence in the same transaction. Raise on any failed check so all writes roll back.
- [x] **Step 6: Add the authorization and identity-lock hardening migration.** Replace the activation function so it rejects an authorization reference already used for provisioning and locks the invited staff row, confirmed `auth.users` row, and verified TOTP factor until the activation transaction commits. Keep the same RPC signature and grants.
- [x] **Step 7: Preserve trusted local fixture setup.** Keep the guard strict for Supabase Data API sessions. Permit direct fixture setup only when the PostgreSQL session itself is `postgres` and no role switch is active; a PostgREST `service_role` request does not satisfy that condition. Add this as a versioned follow-up migration so the existing local migration history remains intact.
- [x] **Step 8: Require procedure context for every Data API state change.** Permit only the initial activation transition under its matching private context. Reject direct service-role changes to other staff states, and keep the existing terminal and last-active-admin guard for trusted database-owner operations.
- [x] **Step 9: Restrict procedure execution.** Revoke default execute from `PUBLIC`, `anon`, `authenticated`, and `service_role`, then grant only the two public lifecycle RPCs to `service_role`. Revoke all direct grants on audit/context tables. Pin every security-definer search path. Add a single-use uniqueness guard for each first-admin operation.
- [x] **Step 10: Update the existing all-table security assertions.** Change only the expected estimator table count from eight to ten and keep all existing RLS, privilege, and non-grant-option checks. Add explicit assertions that no API role can select or mutate the new audit/context tables.
- [x] **Step 11: Apply only the pending migration to the identified local Goat Supabase database after read-only checks.** Run `devcore-project doctor` first. Inspect `supabase status --output json`, `supabase migration list --local`, `supabase migration up --help`, and the exact configured project ID. Capture status internally and never print API keys. Stop if the local project ID, loopback database URL, port, or pending migration set differs from this plan. The initial migrations `20261117120000` through `20261117140000` have already been applied to the verified local database during the red/green cycle, so `20261117150000` must be the only pending version before `supabase migration up --local`.
- [x] **Step 12: Run the focused database security and lifecycle suites.**

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- supabase test db supabase/tests/first_admin_bootstrap_test.sql --local`

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- supabase test db supabase/tests/first_admin_bootstrap_test.sql supabase/tests/estimator_security_test.sql supabase/tests/estimator_behavior_test.sql --local`

  Expected: PASS with no test errors. If the local DB is not already available, stop and report that local environment blocker; do not create a replacement stack or reset data.

## Task 3: Connect the CLI to the guarded RPCs

**Files:** Modify `scripts/bootstrap-first-admin.ts`; modify `src/lib/server/supabase/database.types.ts`; modify `package.json`; extend `scripts/bootstrap-first-admin.test.ts`.

- [x] **Step 1: Add failing runner tests.** Inject a narrow RPC client and assert that dry-run calls the matching RPC with `p_execute: false`; execution calls it only when `--execute` and an exact `--confirm-user-id` match are present; URL mismatch or missing `SUPABASE_SECRET_KEY` prevents client creation; only status and audit-event UUID appear in output; thrown Supabase errors never expose raw details.
- [x] **Step 2: Run the focused runner tests and confirm the intended failures.**

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- mise exec bun@1.3.10 -- bun test scripts/bootstrap-first-admin.test.ts`

  Expected: FAIL because RPC execution has not been implemented.
- [x] **Step 3: Add typed RPC definitions.** Add function types for `provision_first_admin` and `activate_first_admin`, each returning JSON. Use the repository's existing `EstimatorServerEnv` names: `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- [x] **Step 4: Implement the CLI runner.** Validate arguments and URL before creating `createEstimatorServiceClient`. Call the selected RPC with the user ID, owner authorization reference, optional identity-verification reference, and `p_execute`. Require exact typed UUID confirmation before an execution call. The CLI must not call Auth admin APIs, create users, send messages, print secret values, print email addresses, or log raw Supabase errors. Emit stable, allow-listed status codes and non-personal audit event IDs only.
- [x] **Step 5: Add the package script.** Set `staff:first-admin` to `bun scripts/bootstrap-first-admin.ts`; do not add an application route or deployment binding.
- [x] **Step 6: Run focused unit tests and TypeScript checks.**

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- mise exec bun@1.3.10 -- bun test scripts/bootstrap-first-admin.test.ts`

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- mise exec bun@1.3.10 -- bun run check`

  Expected: PASS with no TypeScript errors.

## Task 4: Document the owner-run procedure and verify the final candidate

**Files:** Modify `docs/architecture/staff-onboarding.md`; review all changed files.

- [x] **Step 1: Document the local command forms.** Show dry-run and explicit execution examples for both commands. State that the operator must verify the existing Auth identity independently, record authorization and identity-verification references, complete MFA while the row remains `INVITED`, and obtain a separate authorization before activation. State that the CLI never creates an identity or sends invitation email. Do not include personal data or secret values.
- [x] **Step 2: Run targeted and repository checks.**

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- mise exec bun@1.3.10 -- bun test scripts/bootstrap-first-admin.test.ts src/lib/server/auth/staff-guard.test.ts src/routes/admin/login/mfa/onboarding.test.ts`

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- mise exec bun@1.3.10 -- bun run check`

  Run: `DEVCORE_PROJECT_CONF=/home/jcschoeman96/projects/current/goat_accounting/.devcore/project.conf devcore-project run test -- supabase test db supabase/tests/first_admin_bootstrap_test.sql supabase/tests/estimator_security_test.sql supabase/tests/estimator_behavior_test.sql --local`

- [x] **Step 3: Review the complete diff and safety boundary.** Confirm the migration chain is the only schema change; all new functions are service-role-only; RLS and the existing last-admin guard remain; no hosted Auth identity, invitation, email, database write, secret, flag, or deployment operation occurred; `.devcore` remains untracked and unstaged.
- [ ] **Step 4: Commit the implementation and open a reviewable PR.** Include the plan and implementation files, target the current `main`, and report exact test outcomes. Do not merge or run hosted operations. Link the PR in T3 after it exists.

## Spec coverage review

- Existing Auth identity only, with independent identity verification: Tasks 1, 3, and 4.
- Separate provision and activation authorization: Tasks 1, 3, and 4.
- `INVITED` remains pending through TOTP setup; activation requires confirmed email and verified TOTP: Task 2.
- One-time bootstrap, zero-admin check, shared advisory lock, duplicate/concurrent rejection: Task 2.
- Append-only audit, rollback on audit failure, service-only functions, denied direct activation: Task 2.
- Existing RLS, terminal `DEACTIVATED`, last-admin invariant, and current AAL2 guard: Tasks 2 and 4.
- Exact project ref, dry-run default, typed target confirmation, safe output, no user creation/email: Tasks 1, 3, and 4.
- Local synthetic-only tests, no hosted changes: Tasks 2 through 4.

No design requirement is left without an implementation task. Tests must establish each database security property before the migration code is written.
