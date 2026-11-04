# SvelteKit 3 Cloudflare deployment and cutover

## Current state

The repository now builds a Cloudflare Worker with static assets. This does not migrate or replace the existing Pages production deployment.

The read-only Pages project check confirmed that `goat-accounting` is connected to `JCSchoeman96/goat_accounting`, its production branch is `main`, and automatic deployments are enabled. The migration branch is excluded from preview builds. A merge to `main` can therefore trigger a Pages production build; do not merge this change until the Pages build behavior and cutover are separately authorized.

Cloudflare treats Pages and Workers as separate deployment targets. The Workers migration guide uses `wrangler deploy` and the `assets` configuration, and recommends retaining Pages until Worker behavior and production traffic have been validated. See [Migrate from Pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) and [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/).

## Wrangler environments

Always pass an explicit `--env`. The top-level Worker has no application bindings, is named `goat-accounting-unconfigured`, and has `workers_dev = false`. It is not a deployment target. The configured environments are:

| Wrangler environment | Worker name | Bindings | Non-secret `vars` | Public endpoint |
| --- | --- | --- | --- | --- |
| default | `goat-accounting-unconfigured` | `ASSETS` | None | Disabled |
| `preview` | `goat-accounting-preview` | `ASSETS`, `BOOKING_STATE` | `CALENDAR_PROVIDER`, `GOOGLE_CALENDAR_ID`, `CALENDAR_EVENT_DURATION_MINUTES`, `RESEND_FROM_EMAIL`, `ADVISOR_EMAIL`, `SUPABASE_URL`, `SUPABASE_LEADS_TABLE` | Disabled |
| `production` | `goat-accounting-production` | `ASSETS`, `BOOKING_STATE` | `CALENDAR_PROVIDER`, `GOOGLE_CALENDAR_ID`, `CALENDAR_EVENT_DURATION_MINUTES`, `RESEND_FROM_EMAIL`, `ADVISOR_EMAIL`, `SUPABASE_URL`, `SUPABASE_LEADS_TABLE` | Disabled; no route or custom domain is configured |

The default environment has no application data bindings or `vars` and is not a deployment target. The preview KV namespace and Supabase project currently match production. Do not publish the preview Worker until it has isolated test resources and test credentials. All three environments have `workers_dev = false`, so an accidental deployment cannot expose them at a `workers.dev` address. KV bindings and `vars` are environment-specific and must be configured for each environment; they are not inherited. See [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/) and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

Secret names used by the server integrations are `CALENDAR_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ACCESS_TOKEN`, `CALENDAR_API_KEY`, `RESEND_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. These are not stored in `wrangler.toml` or the generated Worker types. Configure secret values per environment through Cloudflare's secret bindings. Do not put them in `vars`, browser code, or checked-in files.

`wrangler deploy --dry-run --env preview` and `wrangler deploy --dry-run --env production` compile and validate their selected environment without uploading a Worker. An actual deployment requires separate authorization.

## Minimum non-production runtime acceptance

The current configuration is not ready for a runtime acceptance deployment: preview still points to production KV and Supabase resources, and its public endpoint is disabled. First authorize and configure isolated test resources and credentials. No provider writes or external messages were made during this review.

After isolation is verified, enable a temporary `workers.dev` endpoint only for `preview`, then deploy it with the explicit environment. Do not attach a custom domain or route for this test.

1. Request `/`, `/booking`, `/contact`, and `/tools/risk-appetite`; verify the expected HTML, route behavior, and referenced static assets. The current local smoke expects `/contact` to redirect to `/booking`.
2. Call `GET /api/availability?date=<future-test-date>` using a dedicated test calendar. Verify the response shape, notice-period filtering, and that busy calendar intervals are absent. This handler reads Google Calendar FreeBusy and writes a five-minute cache entry to `BOOKING_STATE`; use only the isolated test namespace and remove the test key afterward.
3. Submit one valid synthetic lead to `POST /api/checkout` with a unique test marker and an owner-controlled test mailbox configured as `ADVISOR_EMAIL`. Verify the existing `201` response, the lead row in the isolated Supabase table, and a successful Resend message ID. Remove only that synthetic row after verification.
4. Confirm the Worker returns no secret values in HTML, static assets, or API responses. Confirm the service-role key and provider credentials are runtime secrets and are absent from browser requests.

Checkout currently saves the lead to Supabase and sends the notification email with an `.ics` attachment. It does not create a Google Calendar event. Do not add a calendar-event assertion to this migration test or create an event as part of it.

## Production cutover

Keep the Pages deployment serving the site while the isolated preview Worker is tested. Do not merge this PR to `main` while Pages automatic production deployments remain enabled. After a separate approval, the owner can pause Pages production builds, authorize an explicit production Worker deployment, and switch the custom domain or route to the Worker. Keep the Pages deployment available as the rollback target; retire it only after production traffic and the rollback window are verified. This PR changes no Pages settings, domain, route, or production deployment.
