# GOAT starter pricing V1 candidate

This directory holds a typed, validated `DRAFT` candidate for owner review. It is not imported by the public runtime, stored in a migration, or connected to hosted pricing. The fixture ID is reserved for this candidate. No Supabase records or other hosted settings were changed while preparing it.

All amounts are provisional South African rand values. The candidate stores integer cents and separates once-off catch-up amounts from monthly ongoing amounts.

## Pricing inputs

| Work | Candidate range | Billing basis |
| --- | ---: | --- |
| Bookkeeping below 50 transactions | R1,100–R1,700/month | Only when monthly bookkeeping is selected |
| Bookkeeping, 50–150 transactions | R2,000–R3,100/month | Only when monthly bookkeeping is selected |
| Bookkeeping, 151–300 transactions | R3,400–R5,000/month | Only when monthly bookkeeping is selected |
| Bookkeeping, 301–750 transactions | R5,900–R9,000/month | Only when monthly bookkeeping is selected |
| Bookkeeping above 750 transactions | R9,500–R15,000/month | Only when monthly bookkeeping is selected; manual review required |
| Unknown bookkeeping volume | R1,100–R15,000/month | Full known range; manual review required |
| Payroll, 1–5 employees | R450–R850/month | Only when payroll is selected |
| Payroll, 6–15 employees | R900–R1,750/month | Only when payroll is selected |
| Payroll, 16–30 employees | R1,900–R3,500/month | Only when payroll is selected |
| Payroll, more than 30 employees | R1,900–R3,500/month | Temporary top-band display to satisfy the current monotone-band validator; manual quote required. Owner review must confirm whether to show this placeholder or change the model contract to support an unpriced band. |
| VAT201 preparation | R450–R850/return | Ongoing amount assumes one return per month. Catch-up applies the range once per selected return type. Multiple outstanding periods require review because the questionnaire does not collect a return count. |
| Historical bookkeeping | R800–R1,400/outstanding month | Unknown duration spans 0–100 months and requires review. |
| Record cleanup | R0–R4,000 once | Applies once for non-clean records, not once per backlog month. |
| Annual financial statements | R3,500–R6,500/year | Ongoing amount is divided by 12 and rounded to cents. |
| Company income tax return | R1,700–R3,000/return | Ongoing amount is divided by 12 and rounded to cents. |
| Management reporting | R700–R1,500/month | Ongoing monthly service. |
| Financial advisory | R1,200–R2,600/month | Ongoing monthly service. |
| Standard personal tax return | R750–R1,400/return | Once-off return amount. Ongoing annual-return support is shown separately as a monthly equivalent over 12 months. |
| Rental/provisional tax complexity | R1,400–R2,700 when both source options are selected | The candidate divides the increment above the standard personal tier between `rental_property` and `provisional_tax` to avoid charging the full range twice. A single selected source adds R325–R650 to the base tier. This split is a provisional interpretation for owner review. |
| Foreign income/capital gains complexity | R2,500–R4,800 when both source options are selected | The candidate divides the increment above the standard personal tier between `foreign_income` and `capital_gains`. A single selected source adds R875–R1,700 to the base tier. Both cases require manual review. This split is a provisional interpretation for owner review. |
| Additional outstanding personal tax years | R750–R1,500/year | Unknown count spans the schema limit of 2–100 years and requires review. |
| CIPC assistance | R600–R1,200/engagement | Official statutory fees are excluded. No monthly equivalent is used; recurring CIPC scope requires manual review. |

No automatic amount is added for unsupported or unpriced selections. Review flags cover high-volume payroll, unknown values, multiple entities, incomplete records, SARS issues, and services that need a manual quotation. The existing confidence thresholds remain `highMaxPoints: 0` and `goodMaxPoints: 1`.

## Interpretation notes

- Monthly bookkeeping prices apply once, through the selected bookkeeping service. Financial account count, bank reconciliations, payroll and other selected services do not repeat that fee.
- The top payroll band is visible for 31+ employees only because the current schema requires workload bands to be monotone. The estimate also requires a manual quote. This assumption needs owner review before activation.
- VAT ongoing pricing assumes one VAT201 return each month. Annual financial statements and company income tax are divided by 12. Personal annual returns use one return per year; provisional tax uses two returns per year. Divided amounts round to the nearest cent.
- A selected outstanding compliance type adds one return range. The model flags `multiple_periods_outstanding` for review because it lacks the return count needed to multiply VAT or company tax fees safely.
- Personal complexity surcharges are additive to the standard return tier. Rental/provisional and foreign/capital-gains source splits match the proposed upper tiers when both named source options are selected, without charging the whole tier twice. Single-source results are lower and remain subject to review where specified.
- Business and personal current-return preparation appears in once-off catch-up. Any selected ongoing annual return support appears as a separate future monthly run rate. The public result keeps those totals separate.
- Urgency never changes a price. Urgent or missed deadlines add a manual-review flag only.
- The candidate includes no prices for SARS disputes, audits, trust distributions, crypto, unrelated personal income, payroll compliance arrears, or other work without an approved automatic range. Those choices require review.
- Expected cents in `pricing_candidate_v1_acceptance.test.ts` were calculated from the ranges above and recorded independently. The test reuses only the canonical scenario answer inputs, not their synthetic expected prices.

## Customer disclaimer

> This is an indicative estimate based on the information provided, not a binding quotation. Final scope, fees and applicable VAT will be confirmed in writing after reviewing your requirements and records. No work begins without your approval.

## Acceptance and activation boundary

The acceptance test validates this DRAFT with all 17 required named scenarios and one combined business-and-personal case. Passing locally does not authorize importing or activating it. Activation remains guarded by the repository workflow, checksum, audit, manifest and administrator requirements. Hosted administrator provisioning and the staff-grant correction are separate prerequisites. The candidate does not bypass them.
