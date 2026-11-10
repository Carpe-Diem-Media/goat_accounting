# Task 13 verification notes

## Privacy and event semantics

Estimator events are built from a fixed event and metadata allowlist. Unknown keys and values are dropped. The estimator pages do not load the existing GTM container. Navigation into or out of the estimator reloads the document so that a container loaded on a marketing page cannot remain in the estimator document. Events are currently placed in the in-memory data layer only. **No analytics provider receives them while this isolation is in place.** A privacy-reviewed delivery design and separate authorization are required before activating provider delivery.

A start event is emitted once per mounted questionnaire, and each valid forward step emits an event. A completed event follows a successful estimate response and is emitted at most once per mounted questionnaire. A result view is emitted on each result-page mount. Opening the contact panel emits one start event per mount; a submitted event follows a successful saved response and is emitted at most once per mount. Reloads and separate sessions can repeat events. The database, not event counts, is authoritative for contact conversion. A booking action is not present in the current estimator. The PDF event fires on each link activation, so it counts download attempts, not confirmed downloads; the existing link cannot report completion to the page.

## Dashboard definitions

The selected window is a rolling 7, 30, or 90 days. Completed counts include all saved estimates created during the window. Opportunity sums include only valid estimates. Today uses South African time. Contact conversion is the proportion of those estimates with a saved lead before the end of the window. The unique lead-per-estimate constraint prevents duplicate contacts in the numerator. New leads and failed notifications are counted by creation date in the window; failed notifications are currently retryable or exhausted deliveries and are returned only to admins. Manual review counts flagged valid estimates created in the window. Opportunity ranges are sums of indicative estimate ranges, not revenue or forecasts.

The function uses invoker rights and the authenticated client; database RLS and the active-staff AAL2 check both apply. It never returns answers, calculations, names, contact information or full records. There is no shared cache.

## Local query evidence

On the local Supabase PostgreSQL instance, temporary synthetic tables with 200,000 estimates and 20,000 leads were populated inside a rolled-back transaction. For a seven-day window, the initial join produced a sequential scan of all leads. Rewriting the join as a lateral lookup with `OFFSET 0` produced an index scan on the estimate date and an index scan on the unique lead estimate ID. This is a representative synthetic plan, not a hosted production plan, and should be repeated with representative distributions and RLS before activation.

A separate temporary table with 200,000 notification rows and 1% exhausted records produced a sequential scan for a one-day failure count without an index. A partial index on creation time for retryable/exhausted states produced an index-only scan. The migration adds that index. Local security and aggregate assertions were run transactionally and rolled back; no hosted migration was applied.

Cloudflare observability is already enabled in `wrangler.toml`. The repository does not establish an approved retention policy. Operational logs use a fixed field/value allowlist and do not write request bodies or provider responses. Contact request and Turnstile timing events share a generated correlation ID. Notification-provider timing and a sampling/retention decision remain outstanding.

## Visual verification gap

Static Hallmark lint of the dashboard page, its error page, and the shared admin layout reported no FAIL or REFLEX findings after correction. The render tier ran against the actual dashboard component with synthetic empty data in a temporary local preview that approximated the existing admin shell. It reported no FAIL, one REFLEX and two WARN findings. REFLEX 79 is waived: the checker treats an operational dashboard header as a landing-page hero, while the existing admin shell places the metric grid immediately below it. WARN 58 reported 88 words; WARN 77 classed the single dashboard as a landing page. The preview did not exercise authenticated routing or the exact admin shell, so authenticated responsive, keyboard, contrast and rendered checks remain required.
