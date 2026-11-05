# Staff invitation and MFA onboarding

There is no public staff registration. An authorized administrator provisions an `INVITED` row in `estimator.staff_users` with the role the new staff member will receive. That invitation pre-authorizes only the invited account and role.

An invited user may read their own staff row so the server can route them through authenticator setup. They cannot read estimates, leads, pricing data, other staff rows, or onboarding audit events while `INVITED`. Direct writes to staff state remain unavailable to authenticated users.

After the invited user enrolls and verifies a TOTP factor, the server checks the current Supabase AAL and calls `estimator.activate_invited_staff_after_mfa()` through the request-scoped client. The database function accepts no target-user argument: it requires the caller's signed-in subject, an AAL2 claim, a verified TOTP factor for that subject, and that subject's current state to be `INVITED`. It changes only that row to `ACTIVE` and inserts the corresponding `INVITED` to `ACTIVE` event in the same transaction. Active administrators can read the append-only onboarding events through RLS.

The protected page guard still rejects `INVITED` users, and estimate/lead RLS still requires an `ACTIVE` staff row and AAL2. Suspension and deactivation do not use this onboarding path; `DEACTIVATED` remains terminal. The flow does not change staff roles or activate another user's account.
