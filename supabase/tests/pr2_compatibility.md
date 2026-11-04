# PR 2 / PR 3 persistence and activation contract

This note compares the database schema with PR 2 without changing PR 2 files.

## Compared revisions

- PR 3 base and `origin/main`: `0cbd662f8996c42e3d75f948d3f9af2e4b16ad64`.
- PR 2 revision named in the review request: `bfb4f92fd27e1021df457fbdc81ec171d22bcfb8`.
- PR 2 head fetched for this review: `10983fb2d58aec48cabe892a096bd5eee0a63a88`.

The pinned PR 2 revision had only the broad nonnegative and `highMaxPoints <= goodMaxPoints` checks. The fetched head adds the V1 domain rule `highMaxPoints === 0` and `goodMaxPoints <= 1`; it preserves the public `confidenceThresholds` fields. The SQL storage constraint remains broad for DRAFT authoring, while activation rejects values outside the current V1 domain rule. PR 3 therefore follows the current PR 2 head and records the earlier-head difference here.

## Pricing model DTO mapping

| PR 2 public field | Database representation | Boundary rule |
| --- | --- | --- |
| `id` (`string`, 1–100 chars) | `pricing_models.id uuid` | Persistence accepts only a canonical UUID string. Synthetic test IDs stay in pure domain tests. |
| `version` (`string`, 1–80 chars) | `pricing_models.version text` | SQL requires SemVer. Pure domain validation keeps its broader bounded-string contract. |
| `engineVersion` | `pricing_models.engine_contract_version` | The public camelCase field remains unchanged. Estimate rows also retain the engine version used. |
| `currency: 'ZAR'` | `pricing_models.currency` | SQL constrains persisted V1 models to `ZAR`. |
| `confidenceThresholds` | `confidence_high_max_points`, `confidence_good_max_points` | DRAFT storage checks nonnegative safe integers and `high <= good`; server domain validation and the activation routine enforce V1 `high = 0`, `good <= 1`. |
| `state` | `pricing_models.state` enum | Only `DRAFT` can be edited. Activation and retirement are guarded transitions. |
| `rules` | Ordered rows in `pricing_rules` | See the strict rule mapping below. |

`name` and `notes` remain database-only administrative metadata. They are omitted from the public DTO query, activation projection, and checksum. The checksum is computed inside Postgres from version, engine version, currency, confidence thresholds, and enabled executable rules in `sort_order`. Lifecycle timestamps, actor IDs, `name`, `notes`, row IDs, disabled rules, and ordering numbers themselves are not checksum fields; rule order is represented by the order of the canonical array.

## Typed rule round-trip

PR 2’s strict discriminated rule union maps as follows:

- Common scalar columns: `rule_type` ↔ `type`, `scope`, `category`, `code`, `label`, and nullable `input_key` ↔ `inputKey`.
- `explanation` is its own required column on pricing rules and estimate line items because PR 2’s calculation emits it for every line.
- `conditions` JSONB stores only the optional `{ "when": ... }` or `{ "condition": ... }` wrapper; `{}` is used when neither applies.
- `parameters` JSONB stores the remaining rule-type fields, such as `range`, `bands`, `unitRange`, `periodsByValue`, `addOns`, and confidence weights.
- `sort_order` is unique per model and ranges from 0 through 127. Reads sort by it to reconstruct deterministic `rules[]` order.
- SQL-only row IDs, `pricing_model_id`, `enabled`, `created_at`, and `updated_at` do not appear in the public DTO. Reads include enabled rules only. Disabled draft rows are retained for authoring but do not enter the executable projection or checksum.

The server mapper merges only the two JSON wrapper objects into the common scalar fields and rejects duplicate keys. The SQL input-key set is checked against all 22 values in PR 2’s `PRICING_INPUT_KEYS`; the earlier omission of `business.ongoingServices` is fixed, and the pgTAP test rejects any missing or extra key. A `SERVICE_ADDON_RANGE` fixture persists and reconstructs this input key through the activation projection.

`CONFIDENCE_WEIGHT` optional/default fields retain PR 2’s parsed behavior. The current PR 3 branch does not contain PR 2’s domain modules, so it cannot yet call `validatePricingModel()` or rely on its parsed defaults.

## Estimate result mapping

`calculation_snapshot` stores the complete PR 2 `EstimateCalculation`, including engine/model identifiers and versions, catch-up and ongoing totals and line items, confidence reasons and points, complexity scores, review flags, manual-review state, and review reasons.

Relational columns are projections for lifecycle and staff queries: calculator type, model/version, engine version, totals, confidence, manual-review state, and `review_flag_codes`. An after-insert trigger materializes line rows atomically from the immutable `calculation_snapshot`; it maps PR 2 `code` to `item_code` and retains `ruleCode`, category, branch, amounts, quantity, unit, explanation, and deterministic sort order. `quantityRange` and `sourceAnswers` remain in the authoritative JSON snapshot. The service role cannot insert line rows directly, the line-table uniqueness constraint permits at most one row per estimate/order slot, and update/delete triggers protect saved lines.

## Activation and checksum path

The repository activation method currently fails closed with `PRICING_ACTIVATION_INTEGRATION_BLOCKER` before reading the draft or invoking the RPC. It accepts no validator callback. PR 2’s domain modules are absent from PR 3’s base, so there is no safe way in this branch to make the production path call the actual `validatePricingModel()`; a pass-through or caller-selected validator would not satisfy the contract. The repository test supplies a draft with no rules and proves the activation RPC remains unreachable while the gate is unavailable. It does not claim that PR 2 domain validation ran.

Activation acceptance is blocked pending PR 2 integration and an independently approved candidate manifest. Agent B confirmed that PR 2 exports `validatePricingModel()`, `calculateEstimate()`, and `CANONICAL_PRICING_TEST_CORPUS`, but no reusable candidate-model runner. The corpus's exact amounts and rule codes are goldens for the non-production `TEST_PRICING_MODEL`; those fixed values and fixture codes cannot be assumed for an independently edited candidate.

The accepted PR 2 contract is a separate pure candidate-acceptance runner. It must call `validatePricingModel()`, evaluate DRAFT candidates through a dedicated internal calculation path while preserving the public ACTIVE-only calculation guard, and reject missing, empty, or invalid manifests. The manifest must carry independently approved expected money ranges, rule codes, confidence, and review results; expectations must never be generated from the candidate being tested. The runner must return candidate identity, a model-definition fingerprint, manifest revision, and scenario-level failures. The synthetic canonical corpus remains test-only and is not an acceptance manifest. No approved candidate manifest or runner is integrated here, so activation remains closed. After PR 2 is merged and a manifest is approved, the server repository must load it, invoke the actual validator and runner internally, and refuse the RPC on any acceptance failure; it must not accept a caller-supplied `testCorpusPassed` flag. No PR 2 files are changed here.

After that server gate is integrated, the repository will send the validator’s normalized DTO as `p_validated_model`. In one database transaction, the security-definer activation routine:

1. serializes activation attempts with a transaction advisory lock;
2. checks the actor is an active administrator;
3. locks the target DRAFT and checks the V1 confidence thresholds;
4. compares the submitted validated DTO with the canonical projection rebuilt from the locked model and ordered enabled rules, rejecting payloads that differ from the rows being activated;
5. requires at least one enabled rule and computes the checksum in Postgres;
6. retires the old ACTIVE model and activates the target in the same transaction.

The partial unique index on ACTIVE state independently prevents more than one ACTIVE row. A service-role direct state update is rejected by the model trigger; only the guarded function may transition DRAFT to ACTIVE or ACTIVE to RETIRED. If the replacement update fails after retirement, the transaction rolls both state changes back. The pgTAP failure injection verifies that the prior model stays ACTIVE and the target stays DRAFT.

Postgres cannot execute the TypeScript domain validator or acceptance runner. The SQL routine verifies the submitted DTO against the locked projection but cannot prove that validation or acceptance ran. The RPC remains defined, but no Data API role—including `service_role`—has `EXECUTE` while the trusted server gate is unavailable. Direct service-role invocation is covered by a permission test and is denied. The database owner can invoke the routine in local transaction tests to verify its state-transition protections. After the server gate is integrated and independently verified, a separate reviewed permission change can grant the server path execution. Until then, the repository rejects activation before reading the draft or invoking the RPC.

## Data API exposure and role grants

The repository uses `supabase-js` with `db.schema = 'estimator'`, which sends requests through PostgREST. The custom schema must therefore be included in the project’s exposed Data API schemas as well as configured with SQL privileges. Local `supabase/config.toml` exposes `estimator`; the hosted Goat project’s API settings must do the same after its identity is verified. Exposure alone grants no table or function privilege. See Supabase’s [custom schema guide](https://supabase.com/docs/guides/api/using-custom-schemas).

| Role | Minimum estimator grants in this migration | RLS / function behavior |
| --- | --- | --- |
| `anon` | None: no schema or enum usage, table privilege, sequence privilege, or function execute. | Denied before row policies. |
| `authenticated` | Schema and enum `USAGE`; `SELECT` on all eight tables; `EXECUTE` only on `is_current_staff`. No direct write grants. | RLS allows active AAL2 staff to read estimator records; notifications and staff rows are admin-only. Missing, invited, suspended, deactivated, and below-AAL2 users see no protected rows. |
| `service_role` | Schema and enum `USAGE`; `SELECT` on all eight tables; model `INSERT, UPDATE`; rule `INSERT, UPDATE, DELETE`; estimate, lead, notification, and staff `INSERT`; estimate `UPDATE(state, superseded_by_estimate_id, void_reason, voided_by, voided_at)`; notification `UPDATE(state, provider_message_id, attempt_count, last_error_code, last_error_safe_message, last_attempt_at, sent_at)`; staff `UPDATE(role, state)`. No estimate-line-item `INSERT`, lead-event table writes, or recipient-identity updates. | Secret-key requests bypass RLS, so every secret-key use must remain in controlled server code with session, AAL2, and staff authorization checked there. It can execute `is_current_staff` and `transition_lead`; it cannot execute `activate_pricing_model` until the trusted server acceptance path is verified and a separate permission change is reviewed. Internal checksum/projection helpers are not executable by Data API roles. |

All estimator tables have RLS enabled and forced. No policy grants browser writes. The policy helper reads the verified staff table and JWT AAL claim, not `user_metadata`. The service secret maps to the elevated server role and bypasses RLS; it must never reach browser code or source control. See Supabase’s [API security](https://supabase.com/docs/guides/api/securing-your-api) and [API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

## Verification and remaining boundary

Local verification and the 16 individual information-level index findings are recorded in [`advisor_results.md`](./advisor_results.md). Local database tests cover deny paths for anonymous, non-staff, invited, suspended, deactivated, and below-AAL2 users; direct model-state bypass; snapshot and line immutability; append-only lead events; activation rollback; and the activation race. Repository activation tests prove the PR 2 integration blocker prevents an RPC call; actual validator and candidate corpus execution remain unverified and activation acceptance remains blocked.

The dedicated Goat development/staging Supabase project has not been positively identified. No remote project link, DDL, advisor run, or remote key was used. Do not apply this migration to the unrelated `SvelteSite` project. After target verification and a separate explicit migration authorization, run remote advisors and review the exact migration against that target before applying it.
