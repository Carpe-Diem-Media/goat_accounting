# PR 2 / PR 3 persistence contract (V1)

This note records the DTO-to-database boundary agreed with Agent C for PR 3. It does not mean the schema has been applied to production or that production pricing is active.

## Pricing model

| Public DTO field | Persistence mapping |
| --- | --- |
| `id` (`string`, 1–100 characters) | Stored as a UUID. The persistence boundary rejects non-UUID IDs; `test-only-*` fixture IDs are never persisted. |
| `version` (`string`, 1–80 characters) | The pure domain retains its bounded string contract. The persistence boundary enforces SemVer, as required by the SQL schema. |
| `engineVersion` | Stored in `engine_contract_version` without changing the public DTO name. |
| `currency: 'ZAR'` | Stored in a currency column constrained to `ZAR`. |
| `confidenceThresholds` | Stored in integer high/good threshold columns, constrained to nonnegative values and `high <= good`. V1 validation further fixes `highMaxPoints` at 0 and caps `goodMaxPoints` at 1. |
| `rules` | Stored as ordered typed rows; see below. |

The database `name` is administrative metadata and is not part of `PricingModel`. The server computes the model checksum from canonical executable fields and ordered rules. Test fixture rule codes, including uppercase and hyphenated codes, remain test-only; persisted production codes use lowercase snake case.

## Typed pricing rules

Persist each rule’s `type`, `scope`, `category`, `code`, `label`, `explanation`, and applicable `inputKey` in typed columns. Store only the optional `when` or `condition` object in the rule’s `conditions` JSONB column. Store the rest of the discriminated rule’s type-specific fields in `parameters` JSONB. Store explanation separately because it is emitted in estimate line items. Preserve `rules[]` order with deterministic `sort_order` so decoding reconstructs the original typed union without evaluating arbitrary expressions.

On read, rebuild the strict discriminated union from those columns and JSONB values, then pass the result through `validatePricingModel()`. Reject missing required fields, extra fields, or type-incompatible values rather than silently dropping them. Preserve the schema’s existing optional/default behavior, including the `CONFIDENCE_WEIGHT` defaults for `pointsByValue` and `missingPoints`.

## Estimate calculation

`calculation_snapshot` stores the complete `EstimateCalculation` as the authoritative historical result, including confidence points, complexity scores, review flags/reasons, line-item branch, quantity ranges, and source answers. Relational estimate columns are projections for the main display, lifecycle, and filtering fields. Confidence points and complexity scores need not be duplicated as columns. Review flag codes remain separately queryable, and line-item `branch` remains a column for combined estimates.
