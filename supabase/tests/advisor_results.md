# Local advisor results

DevCore project `goat_accounting` was activated and `devcore-project doctor` passed before database checks. Supabase commands ran through `devcore-project run test --` against the isolated Supabase CLI local project `goat-accounting-estimator-local` on database port `56522`; DevCore's separate TEST database was not used as the Supabase database. Other local Supabase projects were left untouched. No Goat-hosted project was linked or queried.

## Advisor outcomes

| Command | Observed result |
| --- | --- |
| `devcore-project run test -- supabase db advisors --local --type all --level warn --fail-on warn` | Exit 0; `No issues found`; no warning-level security or performance findings. |
| `devcore-project run test -- supabase db advisors --local --type all --level info --fail-on none` | Exit 0; `No issues found` after the clean reset and test suite. An earlier local statistics snapshot reported 16 informational `unused_index` findings; their workload review is retained below. |

The local database has no representative production volume or query history. An unused-index result here does not establish that an index is unnecessary. The indexes remain in place for the query, uniqueness, and foreign-key workloads listed below.

## Earlier `unused_index` findings review

The 16 findings below came from an earlier local statistics snapshot. The current clean-reset run reports none after the migration and tests exercised indexed paths. The local database is not representative of production query volume, so indexes remain based on their planned workload and integrity paths.

| Index | Planned query or integrity path |
| --- | --- |
| `pricing_models_created_by_idx` | Lists draft and historical models by creating administrator; supports the `created_by` foreign-key check. |
| `pricing_models_activated_by_idx` | Filters activation audit history by administrator; supports the `activated_by` foreign-key check. |
| `pricing_models_retired_by_idx` | Filters retirement audit history by administrator; supports the `retired_by` foreign-key check. |
| `estimates_pricing_model_version_idx` | Looks up historical estimates by model/version and supports the composite model-version foreign key. |
| `estimates_supersedes_idx` | Finds replacement estimates for an older estimate and supports the self-referential foreign-key check. |
| `estimates_superseded_by_idx` | Finds an estimate’s predecessor and supports the self-referential foreign-key check. |
| `estimates_voided_by_idx` | Filters void audit records by staff actor and supports the `voided_by` foreign-key check. |
| `estimates_created_at_idx` | Pages and sorts recent estimate records for staff history screens. |
| `estimates_manual_review_idx` | Serves the staff review queue ordered by creation time. |
| `estimates_review_flag_codes_gin_idx` | Filters estimate records by one or more queryable review flag codes. |
| `estimate_line_items_pricing_rule_idx` | Audits estimate usage of a pricing rule and supports the pricing-rule foreign-key check. |
| `leads_state_created_at_idx` | Pages lead work queues by lifecycle state and creation time. |
| `lead_events_actor_idx` | Filters lead-event audit history by staff actor and supports the actor foreign-key check. |
| `notification_deliveries_estimate_created_idx` | Reads notification history for an estimate and supports its foreign-key check. |
| `notification_deliveries_lead_created_idx` | Reads notification history for a lead and supports its foreign-key check. |
| `notification_deliveries_retry_idx` | Finds pending or retryable deliveries ordered by last attempt time. |

These workload choices follow the relational filters in the repository skeleton and the planned staff, lead, and notification workflows. Reassess with representative queries and production statistics before any later index-removal migration.

The duplicate non-unique `estimate_line_items_estimate_sort_idx` was removed after adding `UNIQUE (estimate_id, sort_order)`. That unique index supports ordered line-item reads and the left-prefix `estimate_id` foreign-key path, so keeping a second index would add write and storage cost without a separate access path.

## Validation evidence

Commands run after a clean local migration reset:

```text
devcore-project doctor
  Exit 0; DEV and TEST database endpoints and authentication passed.

mise exec bun@1.3.10 -- bun install --frozen-lockfile
  Exit 0; Checked 136 installs across 234 packages (no changes).

devcore-project run test -- supabase db reset --local
  Exit 0; applied 20261103183011_estimator_core.sql.

devcore-project run test -- supabase test db --local
  Exit 0; Files=3, Tests=80; Result: PASS. Includes exact comparison of SQL input keys with PR2's 22 keys and SERVICE_ADDON_RANGE persistence/reconstruction for business.ongoingServices.

devcore-project run test -- node supabase/tests/activation_race.mjs
  Exit 0; Activation race passed: both concurrent activations committed with exactly one active model.

devcore-project run test -- mise exec bun@1.3.10 -- bun test supabase/tests/repository_activation.test.ts
  Exit 0; 2 pass, 0 fail, 7 expect() calls. Activation fails closed before any draft read or RPC while PR2 validation/corpus integration is unavailable.

devcore-project run test -- mise exec bun@1.3.10 -- bun x tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck src/lib/server/supabase/client.server.ts src/lib/server/supabase/repository.server.ts src/lib/server/supabase/database.types.ts
  Exit 0; no diagnostics.

devcore-project run test -- sh -c 'supabase gen types typescript --local --schema estimator > src/lib/server/supabase/database.types.ts'
  Exit 0; generated Database types from the local estimator schema.

devcore-project run test -- supabase db advisors --local --type all --level warn --fail-on warn
  Exit 0; No issues found.

devcore-project run test -- supabase db advisors --local --type all --level info --fail-on none
  Exit 0; No issues found after the tests; the earlier 16 informational unused_index findings are listed above.
```

The migration is enclosed in a transaction. A failed migration leaves no partial DDL. After application, schema rollback must use a reviewed forward migration so saved estimate and lead history is not dropped. Repository activation currently rejects every attempt until PR2's validator and candidate corpus gate are integrated; the SQL race test only verifies transactional concurrency. No remote migration has been applied.

Remote security/performance advisors remain unrun because the dedicated Goat development/staging project has not been positively identified. The `SvelteSite` project was not used.

The worktree required a local `.devcore` contract to run commands through DevCore. That contract remains outside the PR 3 file scope, so a clean checkout still needs its repository-owned DevCore declaration before these wrapped commands can be repeated.
