# Task 13 verification notes

## Privacy and event semantics

Estimator events are built from a fixed event and metadata allowlist. Unknown keys and values are dropped. The estimator pages do not load the existing GTM container. Navigation into or out of the estimator reloads the document so that a container loaded on a marketing page cannot remain in the estimator document. Events are placed in the in-memory data layer and sent best-effort to a same-origin relay with credentials and referrer omitted. The relay route is hard-disabled and does not forward events. **No analytics provider receives them.** The validated relay boundary is tested with a mock destination only. A privacy-reviewed destination, identifiers, retention, limits and separate authorization are required before any forwarding is implemented or activated.

A start event is emitted once per mounted questionnaire, and each valid forward step emits an event. A completed event follows a successful estimate response and is emitted at most once per mounted questionnaire. A result view is emitted on each result-page mount. Opening the contact panel emits one start event per mount; a submitted event follows a successful saved response and is emitted at most once per mount. Reloads and separate sessions can repeat events. The database, not event counts, is authoritative for contact conversion. A booking action is not present in the current estimator. The PDF event follows a successful, non-empty PDF response and can repeat for repeated downloads; failed requests emit no download event.

## Dashboard definitions

The selected window is a rolling 7, 30, or 90 days. Completed counts include all saved estimates created during the window. Opportunity sums include only valid estimates. Today uses South African time. Contact conversion is the proportion of those estimates with a saved lead before the end of the window. The unique lead-per-estimate constraint prevents duplicate contacts in the numerator. New leads and failed notifications are counted by creation date in the window; failed notifications are currently retryable or exhausted deliveries and are returned only to admins. Manual review counts flagged valid estimates created in the window. Opportunity ranges are sums of indicative estimate ranges, not revenue or forecasts.

The function uses invoker rights and the authenticated client; database RLS and the active-staff AAL2 check both apply. It never returns answers, calculations, names, contact information or full records. There is no shared cache.

## Local query evidence

On the local Supabase PostgreSQL instance, temporary synthetic tables with 200,000 estimates and 20,000 leads were populated inside a rolled-back transaction. For a seven-day window, the initial join produced a sequential scan of all leads. Rewriting the join as a lateral lookup with `OFFSET 0` produced an index scan on the estimate date and an index scan on the unique lead estimate ID. This is a representative synthetic plan, not a hosted production plan, and should be repeated with representative distributions and RLS before activation.

A separate temporary table with 200,000 notification rows and 1% exhausted records produced a sequential scan for a one-day failure count without an index. A partial index on creation time for retryable/exhausted states produced an index-only scan. The migration adds that index. Local security and aggregate assertions were run transactionally and rolled back; no hosted migration was applied.

Cloudflare observability is already enabled in `wrangler.toml`. The repository does not establish an approved retention policy. Operational logs use a fixed field/value allowlist and do not write request bodies or provider responses. Contact request and Turnstile timing events share a generated correlation ID. Notification-provider timing and a sampling/retention decision remain outstanding.

## Visual verification gap

Static Hallmark lint of the dashboard page, its error page, and the shared admin layout reported no FAIL or REFLEX findings after correction. The render tier ran against the actual dashboard component with synthetic empty data in a temporary local preview that approximated the existing admin shell. It reported no FAIL, one REFLEX and two WARN findings. REFLEX 79 is waived: the checker treats an operational dashboard header as a landing-page hero, while the existing admin shell places the metric grid immediately below it. WARN 58 reported 88 words; WARN 77 classed the single dashboard as a landing page. The preview did not exercise authenticated routing or the exact admin shell, so authenticated responsive, keyboard, contrast and rendered checks remain required.

## Migration-first rollout gate

Before exposing the dashboard on an approved hosted target, verify the exact Goat project identity and current migration history. Review and authorize `20261110170000_dashboard_aggregates.sql`, its grants and rollback or forward-fix plan. Apply the migration before application exposure, then verify the RPC, invoker rights, RLS and AAL2 role-denial cases against synthetic fixtures. Deploy the application only after these checks. If the RPC is missing or fails, the page returns 503 and never falls back to a privileged client. The index creation is not concurrent and can take a write lock, so assess table size and schedule before execution. If rollout fails after migration, first keep the dashboard inaccessible or revert the application, then prefer a reviewed forward-fix migration. If removal is approved, verify that no callers or dependencies remain and use a separate reviewed migration to drop `estimator.dashboard_metrics(timestamptz,timestamptz)` and `estimator.notification_deliveries_failed_created_at_idx`; never rewrite applied migration history. No hosted action is authorized by this document.

## Proposed operational policy

For owner review, retain allowlisted error events for a short, explicitly approved period and sample routine success events; choose the sampling rate and retention duration after confirming Cloudflare plan capabilities and privacy policy. The current configuration enables observability but does not establish approved retention or sampling. Never log request bodies, exceptions, referrers, customer details, answers or provider responses. The relay must remain hard-disabled until an approved destination and a fail-closed global and per-source rate limiter are added and independently tested.
