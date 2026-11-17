# Goat first-administrator bootstrap design

## Goal

Provide a private, auditable procedure for establishing the first active Goat Accounting administrator. The procedure starts with an existing Supabase Auth identity and separates staff invitation from activation. It does not create Auth users, send invitation emails, activate an administrator, or change hosted state as part of development or testing.

## Existing contracts

- `estimator.staff_users` is the authority for staff roles and states.
- The supported states include `INVITED`, `ACTIVE`, `SUSPENDED`, and terminal `DEACTIVATED`.
- Invited staff can complete TOTP setup but remain `INVITED`; the existing guard denies them protected staff access at both AAL1 and AAL2.
- Protected staff access requires the matching active staff row and current AAL2.
- `estimator.guard_staff_user()` already prevents deleting staff rows, changing a deactivated staff record, and removing the last active administrator. It serializes last-administrator changes with advisory lock `(20261103, 17)`.
- There is no staff audit table or authorized staff activation operation yet.

## Chosen approach

Add a local owner-run CLI with two separately confirmed commands and server-only database procedures. The CLI accepts an existing Auth user ID, connects only to the configured Goat Supabase project when run against a hosted URL, and never creates Auth identities or sends email. The database procedures remain unavailable to `anon` and `authenticated`; only `service_role` can execute them. The CLI is the repository's only caller.

The operator must independently verify that the Auth identity is the intended person. The CLI requires an explicit owner authorization reference and a typed confirmation bound to the target user ID for each command. The database records those references as audit evidence. It does not claim that PostgreSQL can independently authenticate the human owner or prove an out-of-band identity check.

## Lifecycle and data flow

1. **ABSENT → INVITED:** An existing Auth identity is selected and independently verified by the owner. The private `provision` command confirms the intended user ID and owner authorization. A guarded transaction obtains the existing staff advisory lock, requires zero active administrators and no previous administrator bootstrap row or event, inserts exactly one `admin/INVITED` row, and appends an audit event. It sends no email.
2. **MFA setup:** The invited user follows the existing sign-in and TOTP onboarding flow. MFA verification leaves the row `INVITED`; application access remains denied.
3. **INVITED → ACTIVE:** After separate owner authorization, the private `activate` command calls a second guarded transaction. It obtains the same advisory lock, verifies the same bootstrap candidate is still invited, verifies the Auth email is confirmed and at least one TOTP factor is verified, and requires zero active administrators. It appends the activation audit event and updates the staff row atomically.
4. **ACTIVE access:** The existing application guard and RLS continue to require an active matching staff record and current AAL2. No activation path grants access at AAL1.
5. **DEACTIVATED:** The existing terminal-state and last-active-administrator protections remain in force. The bootstrap procedures do not add deactivation, reactivation, or general staff-management operations.

The shared advisory lock serializes concurrent provision and activation attempts with each other and with the existing last-administrator guard. Any failed check or audit write aborts the whole transaction. A retry after an ambiguous result must inspect the audit row and current staff state; the command does not automatically retry or create a second candidate.

The activation authorization reference must differ from the provision authorization reference. Activation locks the invited staff row, confirmed Auth user row, and verified TOTP factor until the transaction commits so those checks cannot become stale during activation.

## Database changes

- Add an append-only staff audit table containing the target user ID, operation, previous and resulting state, owner authorization reference, identity-verification reference, and timestamp. Do not store the user's email or Auth tokens.
- Add narrowly scoped `SECURITY DEFINER` procedures for initial invitation-row provisioning and first-admin activation. Pin each search path, revoke execution from `PUBLIC`, `anon`, and `authenticated`, and grant execution only to `service_role`.
- Add a trigger guard so direct Data API writes cannot assign the `admin` role, insert an `ACTIVE` staff row, or change a staff state without the private procedure context. The first-admin procedures authorize only the initial invitation and its activation; other state transitions remain unavailable through the server role until a separate audited lifecycle operation is approved. Keep the existing last-admin lock/check and terminal `DEACTIVATED` behavior. No table write grants are broadened.
- The provision procedure is a one-time bootstrap: it refuses to run if an active administrator exists, any administrator staff row already exists, or a prior first-admin audit event exists. The activation procedure is also fail-closed and accepts only that same `INVITED` administrator while no active administrator exists.

## CLI and operational safety

- Commands are `provision` and `activate`; both default to preflight-only behavior and require an explicit execution option, an owner authorization reference, and a typed confirmation containing the target user ID before a write.
- Validate the hosted `SUPABASE_URL` against the exact Goat project ref before calling a procedure. Permit loopback URLs only for local tests.
- Read secrets only from the approved process environment. Never print secret values, Auth email addresses, or access tokens. Report only operation status and non-personal audit correlation identifiers.
- No public route, automatic activation, identity creation, invitation delivery, role-management UI, or hosted operation is introduced.

## Failure handling

Fail closed on a project URL mismatch, missing Auth identity, mismatched identity-verification confirmation, missing authorization reference, existing active administrator, an existing administrator candidate or bootstrap event, unconfirmed Auth email, missing verified TOTP factor, changed candidate state, or database/audit error. Do not attempt automatic cleanup or retry. The owner must inspect the recorded state and authorize any recovery separately.

## Verification

Local tests will cover:

- provision and activation success with an existing synthetic Auth identity;
- `INVITED` remaining pending after TOTP setup and activation requiring confirmed email plus verified TOTP;
- duplicate and concurrent provision/activation attempts;
- active-admin, existing-candidate, and prior-audit rejection;
- unauthenticated role denial and direct service-role insert/update bypass attempts;
- append-only audit records, atomic rollback on failure, terminal `DEACTIVATED`, and preservation of the last-active-administrator guard;
- CLI target-project validation, dry-run default, explicit owner authorization, typed confirmation, and safe output.

All database tests run against the isolated local Goat Supabase test environment through the repository-supported workflow. No hosted invitation, identity creation, state change, secret change, migration application, or deployment is part of this task.
