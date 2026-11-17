# Staff invitation and MFA setup

There is no public staff registration. An authorized administrator provisions an `INVITED` row in `estimator.staff_users` with the role the new staff member will receive. That invitation identifies the account and intended role, but does not grant access to admin records.

An invited user may read only their own staff row so the server can route them through authenticator setup. They may enroll and verify a TOTP factor. They cannot read estimates, leads, pricing data, other staff rows, or staff audit events while `INVITED`, at either AAL1 or AAL2. They cannot change their own staff state.

After TOTP verification, an invited account remains `INVITED` and sees a pending-activation message. The one-time first-admin operation below can activate only the initial administrator after separate authorization, confirmed email, and verified TOTP. It does not provide general staff lifecycle operations.

Only `ACTIVE` staff with a verified AAL2 session and an authorized database role can read estimates and leads. The application guard and RLS both deny `INVITED`, `SUSPENDED`, and `DEACTIVATED` accounts access to those records. `DEACTIVATED` remains terminal.

The approved lifecycle remains `INVITED -> ACTIVE -> SUSPENDED`, authorized `SUSPENDED -> ACTIVE` reactivation, and authorized transitions from `INVITED`, `ACTIVE`, or `SUSPENDED` to terminal `DEACTIVATED`.

Ordinary `INVITED -> ACTIVE` staff transitions require a separately approved administrator operation. The one-time, owner-authorized first-admin procedure below is limited to the initial administrator. Both paths must write audit evidence and preserve lifecycle guards. MFA completion alone never activates an invitation.

The database guard rejects direct Data API changes to any staff state. The one-time procedures authorize only first-admin provisioning and activation. Suspension, reactivation, and deactivation require a separately approved audited operation before a server role can perform them.

## One-time first administrator bootstrap

The private `staff:first-admin` CLI supports only the initial administrator. It requires an Auth identity that already exists in the GOAT Supabase project. It does not create an Auth user, send an invitation, or send email. The owner must verify the intended identity out of band and record an identity-verification reference before provisioning.

Set `SUPABASE_URL` to `https://pxguvhxfvaqtdvqwgbyd.supabase.co` and inject `SUPABASE_SECRET_KEY` through the approved local secret environment. The CLI rejects any other hosted Supabase origin. Do not place the secret in source files, command arguments, shell history, or logs.

Provision starts with a database preflight. The command writes nothing unless `--execute` is present and `--confirm-user-id` exactly matches the supplied target UUID:

```sh
bun run staff:first-admin -- provision \
  --user-id "$AUTH_USER_ID" \
  --owner-authorization-ref "$PROVISION_APPROVAL_REF" \
  --identity-verification-ref "$IDENTITY_VERIFICATION_REF"

bun run staff:first-admin -- provision \
  --user-id "$AUTH_USER_ID" \
  --owner-authorization-ref "$PROVISION_APPROVAL_REF" \
  --identity-verification-ref "$IDENTITY_VERIFICATION_REF" \
  --execute \
  --confirm-user-id "$AUTH_USER_ID"
```

The provision procedure takes the staff lifecycle advisory lock, requires that no administrator row or bootstrap audit event exists, inserts one `admin/INVITED` row, and appends the authorization and identity-verification references to the private audit table. It never activates the account.

The invited person completes the existing TOTP enrollment and verification flow. The staff row remains `INVITED`; protected records stay unavailable. After verifying the same identity and obtaining separate owner authorization, run activation preflight and then the explicitly confirmed activation:

```sh
bun run staff:first-admin -- activate \
  --user-id "$AUTH_USER_ID" \
  --owner-authorization-ref "$ACTIVATION_APPROVAL_REF"

bun run staff:first-admin -- activate \
  --user-id "$AUTH_USER_ID" \
  --owner-authorization-ref "$ACTIVATION_APPROVAL_REF" \
  --execute \
  --confirm-user-id "$AUTH_USER_ID"
```

Activation requires a distinct authorization reference, confirmed Auth email, the same invited administrator, and a verified TOTP factor. The transaction locks those records, sets the row to `ACTIVE`, and appends the activation event atomically. The existing application guard still requires a current AAL2 session for protected access.

The CLI prints only operation status and the audit event UUID. It does not print the target identity, email, or secret. Stop on any error or ambiguous result. Do not retry an execution automatically; an authorized operator must inspect the staff row and private audit history before any separately approved recovery. `DEACTIVATED` remains terminal, and the last-active-administrator guard remains in force.
