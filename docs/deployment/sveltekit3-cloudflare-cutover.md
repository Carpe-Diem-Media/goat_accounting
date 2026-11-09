# SvelteKit 3 Cloudflare deployment and cutover

## Approved development workflow

On 2026-11-06 the owner confirmed that the site is not yet in use, the existing hosted Cloudflare/Supabase setup is the development deployment target, and local Supabase is available for development/testing. Use the existing local Supabase development environment as the primary environment for development and repeatable security tests. No separate staging environment is required. This decision supersedes earlier mandatory dedicated-staging requirements in the specifications and roadmaps for environment selection only. Keep all security acceptance, reviewed-migration, fixture and release gates.

The configured hosted Supabase project ref is `pxguvhxfvaqtdvqwgbyd`, endpoint `https://pxguvhxfvaqtdvqwgbyd.supabase.co`. Wrangler's preview and production labels share that project and `BOOKING_STATE` namespace `4d81337b6bda43608aec68ff115720e9`. These labels do not establish separate environments. Shared IDs alone are not a blocker under the owner's decision. Verify actual target identity and binding scope before each hosted operation; unrelated Supabase projects remain out of scope.

The owner permits development pushes and automatic Cloudflare builds. Enabled Pages automatic deployments are not a blanket reason to block merges; normal review and merge authorization still apply. Hosted database migrations, explicit Worker deployments, Worker route changes, resets, credential changes, pricing activation, irreversible operations and external messages require their own appropriate approvals. Test migrations locally first, review version-controlled SQL and plan rollback or forward fixes before authorized hosted application. Destructive or irreversible changes require separate approval. Do not provision a replacement environment automatically.

## Serving-target verification

The repository builds a Cloudflare Worker with static assets. A build does not migrate or replace the existing Pages site. Earlier read-only checks recorded Pages project `goat-accounting`, connected to `JCSchoeman96/goat_accounting`, with `main` as its production branch and automatic deployments enabled. Treat this as historical context, not proof of the current serving deployment.

Before deployment or cutover, record dated, read-only evidence of the current Pages project, canonical deployment/code SHA, domain/DNS mapping and any Worker routes or custom domains. Keep deployment IDs and SHAs in that verification record rather than treating them as permanent configuration. Stop if the serving target is uncertain.

Development pushes may trigger eligible Pages preview builds, and merges to `main` may trigger Pages production builds. The owner permits these automatic builds. A successful Pages build/deployment is evidence for Pages only; it does not prove that `goat-accounting-preview` or `goat-accounting-production` has been explicitly deployed or that the target Worker runtime passes acceptance.

Cloudflare treats Pages and Workers as separate deployment targets. The Workers migration guide uses `wrangler deploy` and the `assets` configuration, and recommends retaining Pages until Worker behavior and production traffic have been validated. See [Migrate from Pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) and [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/).

## Wrangler environments

Always pass an explicit `--env`. The top-level Worker has no application bindings, is named `goat-accounting-unconfigured`, and has `workers_dev = false`. It is not a deployment target. The repository-configured environments are listed below. This table does not certify remote routes or custom domains.

| Wrangler environment | Worker name | Bindings | Non-secret `vars` | Repository endpoint configuration |
| --- | --- | --- | --- | --- |
| default | `goat-accounting-unconfigured` | `ASSETS` | None | Disabled |
| `preview` | `goat-accounting-preview` | `ASSETS`, `BOOKING_STATE` | `CALENDAR_PROVIDER`, `GOOGLE_CALENDAR_ID`, `CALENDAR_EVENT_DURATION_MINUTES`, `RESEND_FROM_EMAIL`, `ADVISOR_EMAIL`, `SUPABASE_URL`, `SUPABASE_LEADS_TABLE` | Disabled |
| `production` | `goat-accounting-production` | `ASSETS`, `BOOKING_STATE` | `CALENDAR_PROVIDER`, `GOOGLE_CALENDAR_ID`, `CALENDAR_EVENT_DURATION_MINUTES`, `RESEND_FROM_EMAIL`, `ADVISOR_EMAIL`, `SUPABASE_URL`, `SUPABASE_LEADS_TABLE` | Disabled; no route or custom domain is configured |

The default environment has no application data bindings or `vars` and is not a deployment target. Preview and production share the approved hosted development resources. The older isolation warning in `wrangler.toml` is superseded by the owner decision above; configuration remains unchanged. Select the exact Worker environment explicitly and obtain deployment authorization before publishing it. All three environments have `workers_dev = false`, which disables their `workers.dev` endpoints. This does not disable the existing Pages site or its automatic builds, and does not by itself exclude Worker routes or custom domains configured remotely. KV bindings and `vars` are environment-specific and must be configured for each environment; they are not inherited. See [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/) and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

Server secrets include `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` where the legacy booking integration still requires it, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` and applicable calendar credentials such as `CALENDAR_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ACCESS_TOKEN` and `CALENDAR_API_KEY`. Configure secret values through Cloudflare secret bindings for the selected deployment target. Do not put secret values in `wrangler.toml`, generated types, `vars`, browser code or checked-in files.

Non-secret configuration includes `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_STAFF_AUTH_ENABLED`, `GOAT_STAFF_SUPABASE_PROJECT_REF` and applicable public integration settings such as `PUBLIC_TURNSTILE_SITE_KEY`. Non-secret configuration may still control security-sensitive behavior and must match the approved target. Listing a variable here does not mean it is configured on Cloudflare. Verification of actual bindings, their scope and required configuration remains a separate deployment gate.

`wrangler deploy --dry-run --env preview` and `wrangler deploy --dry-run --env production` compile and validate their selected environment without uploading a Worker. An actual deployment requires separate authorization.

## Staff-auth implementation and activation gate

The merged staff-auth implementation uses a request-scoped Supabase SSR client with `SUPABASE_PUBLISHABLE_KEY` and the `estimator` schema. It does not use a server secret for staff reads. The client requires a URL and publishable key. Supported local HTTP Supabase URLs can be used without the hosted enable flag. Hosted access requires HTTPS, `SUPABASE_STAFF_AUTH_ENABLED` equal to the literal string `true`, and a hostname matching `GOAT_STAFF_SUPABASE_PROJECT_REF` followed by `.supabase.co`. Missing or rejected configuration leaves the session client unavailable; protected admin access fails closed.

These checks are implemented in `src/hooks.server.ts` and `src/lib/server/supabase/session-client.ts`; they do not prove hosted bindings are present or that authentication is activated. `wrangler.toml` does not declare the staff enable flag, expected project ref or publishable key. This documentation does not set them or authorize activation. Verify hosted configuration and security acceptance before a separately approved activation.

The staff guard permits INVITED users to complete MFA onboarding without granting protected admin access. Protected admin access requires ACTIVE staff, an allowed database-backed role and verified AAL2/TOTP assurance. Keep invited onboarding, inactive denial and role/MFA negative tests in the acceptance evidence.

## Local security acceptance and hosted verification

Use the existing local Supabase development environment for development and repeatable authentication, AAL2/TOTP, role, RLS and RPC negative tests. Local results establish tested behavior against the local schema and configuration; they do not certify hosted state.

Before activating affected features on the hosted development target, verify the approved project's actual Auth/TOTP configuration, Data API exposure of `estimator`, public-key configuration, applied migration history, RLS policies, grants and RPC privileges. Do not treat local configuration or migration files as proof of hosted state. For Task 10, verify both `20261105170000_staff_self_read_and_admin_list_index.sql` and `20261105180000_staff_invited_self_read.sql` in order. Require exactly one final `staff_users_self_read` SELECT policy for `authenticated`, limited to the caller's INVITED/ACTIVE row, and account for the separate authorized admin-read policy. Stop on missing migrations or unexpected policies; obtain separate authorization to repair them.

Identify synthetic fixtures and their owner authorization before authentication or data tests. Define permitted Auth/MFA, staff-state and RPC changes plus cleanup boundaries. Retain unauthenticated, inactive, AAL1/AAL2 and viewer/advisor/admin negative tests. Do not use unrelated or real customer accounts. Validate secret presence/scope without reading or publishing values. Existing email and calendar integrations may be live; authorize external messages, calendar operations and other side effects separately.

For Worker acceptance, separately authorize an explicit Worker environment deployment and any endpoint change, then record the actual deployment ID, code SHA, bindings and migration versions. The repository config disables `workers.dev` endpoints; verify remote routes and custom domains separately. Do not enable `workers.dev`, attach a route or change a custom domain as an incidental test step. Pages automatic builds do not satisfy this Worker gate.

1. Request `/`, `/booking`, `/contact`, and `/tools/risk-appetite`; verify the expected HTML, route behavior, and referenced static assets. The current local smoke expects `/contact` to redirect to `/booking`.
2. Call `GET /api/availability?date=<future-test-date>` using an owner-authorized test calendar. Verify the response shape, notice-period filtering, and that busy calendar intervals are absent. This handler reads Google Calendar FreeBusy and writes a five-minute cache entry to `BOOKING_STATE`; the current cache key is `avail:<date>`, not a per-test key. Authorize that shared-cache write before calling the endpoint and avoid deleting any pre-existing entry. If the test cannot safely use the shared cache, run it locally instead.
3. Submit one valid synthetic lead to `POST /api/checkout` with a unique test marker and an owner-controlled test mailbox configured as `ADVISOR_EMAIL`. Verify the existing `201` response, the synthetic lead row in the approved hosted Supabase table, and a successful Resend message ID. Remove only that synthetic row after verification.
4. Confirm the Worker returns no secret values in HTML, static assets, or API responses. Confirm the service-role key and provider credentials are runtime secrets and are absent from browser requests.

Checkout currently saves the lead to Supabase and sends the notification email with an `.ics` attachment. It does not create a Google Calendar event. Do not add a calendar-event assertion to this migration test or create an event as part of it.

## Controlled Worker cutover and launch

Keep Pages serving the site until Worker runtime acceptance passes on the approved hosted development target. Normal development pushes and automatic Pages builds are permitted; an automatic Pages deployment does not switch the website to Workers. Normal review and merge authorization still apply. After separate approval, the owner can pause Pages production builds, authorize an explicit Worker deployment and switch the custom domain or route. Record the exact deployment and routing evidence, and keep Pages available as the rollback target until the rollback window closes.

The site's development status does not waive launch approval, owner-approved pricing/content/privacy inputs, security/accessibility acceptance or database compatibility checks. Reconfirm data ownership and environment policy before admitting real users. This documentation change records permission for normal development pushes and automatic builds. It authorizes no hosted database operation, explicit Worker deployment, route change, external message, feature-flag change or autonomous merge.
