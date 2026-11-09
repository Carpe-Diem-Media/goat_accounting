# Staff invitation and MFA setup

There is no public staff registration. An authorized administrator provisions an `INVITED` row in `estimator.staff_users` with the role the new staff member will receive. That invitation identifies the account and intended role, but does not grant access to admin records.

An invited user may read only their own staff row so the server can route them through authenticator setup. They may enroll and verify a TOTP factor. They cannot read estimates, leads, pricing data, other staff rows, or staff audit events while `INVITED`, at either AAL1 or AAL2. They cannot change their own staff state.

After TOTP verification, an invited account remains `INVITED` and sees a pending-activation message. Task 10 does not activate staff or add staff-state mutations or an audit-log table. End-to-end invited-staff onboarding is not implemented.

Only `ACTIVE` staff with a verified AAL2 session and an authorized database role can read estimates and leads. The application guard and RLS both deny `INVITED`, `SUSPENDED`, and `DEACTIVATED` accounts access to those records. `DEACTIVATED` remains terminal.

The approved lifecycle remains `INVITED -> ACTIVE -> SUSPENDED`, authorized `SUSPENDED -> ACTIVE` reactivation, and authorized transitions from `INVITED`, `ACTIVE`, or `SUSPENDED` to terminal `DEACTIVATED`.

The `INVITED -> ACTIVE` transition is deferred to a separately approved administrator operation. That work must verify the acting administrator, write an audit event with the state transition, enforce lifecycle guards, and preserve the last-active-administrator invariant. Until that work is approved and implemented, MFA completion alone never activates an invitation.
