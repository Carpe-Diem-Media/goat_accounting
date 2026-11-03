# Goat Accounting Estimator Implementation Plan

**Execution revision:** 0.1.1 — approved parallel scheduling amendment (2026-11-03). **Product and Tech Spec authority remains v0.1.0 unchanged.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Goat Accounting estimator that gives transparent catch-up and ongoing accounting/tax cost ranges, persists immutable estimates, converts willing prospects into leads, generates a branded PDF/email result, and gives authorised staff a secure backend for leads and versioned pricing administration.

**Architecture:** One Svelte 5 / SvelteKit 3 application deployed to Cloudflare Workers with static assets. The estimator domain is pure TypeScript; Supabase Postgres/Auth owns durable data and staff identity; Resend owns email delivery; Cloudflare Turnstile protects PII/contact side effects; completed estimates are immutable snapshots linked to an immutable pricing-model version. Public questionnaire logic remains typed in code while commercial amounts/bands/weights are versioned data.

**Tech Stack:** Svelte 5, SvelteKit 3, TypeScript, Tailwind CSS 4, Bun, Zod, Cloudflare Workers/Wrangler 4, Supabase Postgres/Auth, `@supabase/supabase-js`, `@supabase/ssr`, Resend HTTP API, Cloudflare Turnstile, `pdf-lib` only if Worker compatibility spike passes, Playwright for critical browser journeys, Bun test for domain tests.

**Specs:**
- `docs/product/goat-accounting-estimator-product-spec-v0.1.0.md`
- `docs/architecture/goat-accounting-estimator-tech-spec-v0.1.0.md`

## Global Constraints

- Accepted design authority is Product Spec v0.1.0 + Tech Spec v0.1.0; do not silently reinterpret or overwrite locked decisions.
- Baseline reviewed by the specs is `6b07d4b7340cf833aa14cfc356efa32e1988a48a`; implementation may start from a newer accepted `main` only if it descends from that baseline and authority drift is reviewed.
- Migrate SvelteKit 2 -> 3 before **integration of estimator runtime/UI/API features**. After PR 0 merges, the pure, runtime-independent PR 2 and isolated database PR 3 may be developed in parallel with PR 1. PR 4 and later runtime features must wait for PR 1+2+3 merge/integration acceptance. Preserve current marketing, booking/contact redirect, Supabase booking lead flow, and `/tools/risk-appetite` behaviour.
- `wrangler.toml` is the deployment-config authority by explicit project decision. Secrets never live in TOML or committed env examples.
- Use current Supabase publishable/secret keys for new estimator code. Do not introduce new `anon`/`service_role` key naming.
- Do not apply schema changes to any Supabase project until the dedicated Goat development/staging/production target is positively identified. The unrelated project observed during discovery is explicitly out of scope.
- Money is integer minor units (`*_cents`). No floating-point money arithmetic.
- Public clients never authoritatively set totals, pricing versions, confidence, line items, or review flags.
- Free text is optional, max 2,000 chars, stored for human review, escaped at output boundaries, and excluded from automated pricing.
- Business and personal calculator branches remain distinct; `both` composes the two branches rather than flattening their questions.
- Business target is 8 core questions, normally 2–4 conditional questions, generally <= 15 total.
- Catch-up and ongoing estimates are always separate ranges. No false precision and no cents displayed publicly.
- Result is visible before contact capture.
- Urgency does not automatically increase price in V1.
- Active/retired pricing models are immutable; completed estimates are immutable snapshots.
- PDF and email read the saved estimate snapshot. They must not recalculate using current pricing.
- Admin access requires Supabase Auth, active staff authorisation, and AAL2/TOTP MFA for protected admin operations.
- RLS is enabled on exposed application tables; browser/public roles receive no broad direct read/write access to estimator, pricing, lead, or admin data.
- Use existing Tailwind design system/components where they fit; do not build a second component library.
- Keep the public estimator distraction-free and mobile-first. Sliders are used only where they genuinely improve selection; discrete accounting bands stay explicit selectable controls.
- Do not build a generic CMS/rules engine/form builder in V1.
- No Cloudflare KV is authoritative for pricing, estimates, leads, or staff state.
- The VoelgoedEvents-specific Redis/GenServer/Cachex mandate is not transplanted into this SvelteKit project; apply the equivalent principles instead: CDN/static caching, bounded server work, DB constraints as durable integrity barriers, no shared caching of personalised results, route-splitting, and measured query performance.
- TDD for domain and state-transition work: failing test -> observe failure -> minimal implementation -> passing test -> commit.
- Parallelism limit: at most three coding agents in active worktrees by default. Each task must start from a recorded accepted base SHA, work in a dedicated worktree/branch, and avoid concurrent edits to another lane's files. Parallel PRs are **not** automatically independently mergeable.
- Dependency manifest/lockfile changes are **serialised at integration**: when PR 8 (PDF) and PR 10 (admin SSR) both need `package.json`/`bun.lock`, integrate one first, rebase the other, regenerate the lockfile with `bun install`, and rerun verification. Do not hand-merge lockfile hunks or accept stale CI.
- Each PR/task must include an architectural impact check for authorisation, lifecycle, DB invariants, transactions, concurrency, idempotency, caching, production impact, privacy, and performance. Every `N/A` requires a reason.

## Mandatory STOP Conditions

An implementation agent must stop and report instead of guessing when any of the following is true:

1. Current `main` is not an accepted descendant of the authority baseline, or the exact working-tree/base SHA is unclear.
2. Product and technical specs conflict with repository reality or with each other.
3. The SvelteKit 3 migration cannot preserve current route/build/runtime behaviour.
4. A dedicated Goat Supabase target is not positively identified before any remote DDL/data mutation.
5. A task requires initial production pricing, Rossouw titles/contact details, retention periods, privacy wording, or manual-review thresholds that have not yet been approved; use test fixtures only and stop before production activation/launch.
6. A proposed implementation would make browser-controlled values authoritative for price/result state.
7. Pricing activation cannot be made atomic with a database-enforced single-ACTIVE invariant.
8. A lifecycle state or transition required by the task is undefined.
9. RLS/admin permissions cannot be explained and negatively tested.
10. PDF generation requires a headless browser or Node-only dependency in Worker runtime without an approved architecture amendment.
11. Email/provider failure would risk rolling back or losing a persisted estimate/lead.
12. Free text or PII would be sent to analytics or routine logs.
13. A retryable operation has undefined idempotency semantics.
14. A database change is proposed without migration + rollback/compatibility sequencing.
15. A parallel agent needs edits outside its assigned ownership, introduces an unapproved shared interface change, targets an unverified branch/environment, or relies on stale CI after rebase.
16. Any task expands into a generic form builder, arbitrary expression engine, CRM, client portal, document upload system, or online proposal/acceptance system without a spec amendment.

## Review Focus

These are the five failure classes most likely to produce a deceptively green build:

1. **Historic estimate drift:** after pricing v2 activates, an estimate created under v1 must keep its original totals, line items, PDF and email view.
2. **Client tampering:** edited request payloads/pricing IDs/totals must never override server-resolved active pricing and server calculation.
3. **Pricing activation race:** two concurrent activation attempts must not commit zero or multiple ACTIVE models.
4. **Lead durability vs notification failure:** a persisted contact request must survive Resend/Turnstile/provider-side failures according to the defined boundary.
5. **Authorisation/RLS bypass:** unauthenticated, inactive, low-assurance, viewer, and advisor users must be denied operations outside their role even if they navigate directly to server routes.

---

# File Structure Map

## Authority / project configuration

- Create: `docs/product/goat-accounting-estimator-product-spec-v0.1.0.md`
- Create: `docs/architecture/goat-accounting-estimator-tech-spec-v0.1.0.md`
- Create: `docs/superpowers/plans/2026-11-03-goat-accounting-estimator.md`
- Create: `docs/superpowers/plans/2026-11-03-goat-accounting-estimator-parallel-roadmap.md`
- Create: `docs/superpowers/prompts/2026-11-03-goat-accounting-estimator-toon-prompts.md`
- Modify: `AGENTS.md` — remove stale KV-only/no-Postgres authority and encode accepted estimator architecture.
- Modify: `package.json`, `bun.lock` — framework migration, checks/tests, SSR auth, PDF/E2E dependencies only when needed.
- Replace: `vite.config.js` -> `vite.config.ts` — SvelteKit 3 configuration and Cloudflare adapter.
- Delete after migration passes: `svelte.config.js`.
- Modify: `tsconfig.json` — SvelteKit 3 `$app/tsconfig` pattern.
- Create: `wrangler.toml` — Worker/static asset authority; exact generated paths verified, not copied blindly.
- Generate: `worker-configuration.d.ts` (or the exact Wrangler-generated type file current tooling uses).
- Modify: `.dev.vars.example`, `.env.example` — non-secret names only; new key model; no real values.
- Modify: `src/app.d.ts` — remove obsolete hand-maintained `App.Platform.env` pattern after migration.

## Estimator domain

- Create: `src/lib/domain/estimator/questions.ts` — typed question IDs/options/branch metadata.
- Create: `src/lib/domain/estimator/answer-schema.ts` — Zod public answer contracts + canonicalisation.
- Create: `src/lib/domain/estimator/estimate.ts` — public/domain estimate types and invariants.
- Create: `src/lib/domain/estimator/lifecycle.ts` — `VALID -> SUPERSEDED|VOIDED` guards.
- Create: `src/lib/domain/estimator/confidence.ts` — deterministic confidence classification.
- Create: `src/lib/domain/estimator/review-flags.ts` — deterministic manual-review triggers.
- Create: `src/lib/domain/pricing/rule-schema.ts` — discriminated union for allowed rule types.
- Create: `src/lib/domain/pricing/model.ts` — pricing model DTO/checksum-ready canonical shape.
- Create: `src/lib/domain/pricing/lifecycle.ts` — DRAFT/ACTIVE/RETIRED transition rules.
- Create: `src/lib/domain/pricing/engine.ts` — pure deterministic calculation.
- Create: `src/lib/domain/pricing/test-corpus.ts` — canonical scenario fixtures/assertions used by tests and activation validation.
- Create tests beside domain modules using `*.test.ts` and `bun:test`.

## Lead / notification domains

- Create: `src/lib/domain/leads/schema.ts` — estimator lead/contact data contract, separate from booking `LeadSchema`.
- Create: `src/lib/domain/leads/lifecycle.ts` — lead states/transitions/guards.
- Create: `src/lib/domain/notifications/lifecycle.ts` — notification states/transitions/retry classification.
- Create matching `*.test.ts` files.

## Server adapters/services

- Create: `src/lib/server/supabase/admin-client.ts` — server-secret client only.
- Create: `src/lib/server/supabase/session-client.ts` — SSR authenticated staff client.
- Generate: `src/lib/server/supabase/database.types.ts` — dedicated Goat schema types.
- Create: `src/lib/server/supabase/repositories/pricing.ts`.
- Create: `src/lib/server/supabase/repositories/estimates.ts`.
- Create: `src/lib/server/supabase/repositories/leads.ts`.
- Create: `src/lib/server/supabase/repositories/notifications.ts`.
- Create: `src/lib/server/estimator/create-estimate.ts`.
- Create: `src/lib/server/estimator/get-public-estimate.ts`.
- Create: `src/lib/server/leads/create-lead.ts`.
- Create: `src/lib/server/pricing/activate-pricing-model.ts`.
- Create: `src/lib/server/auth/staff-guard.ts`.
- Create: `src/lib/server/turnstile/verify.ts`.
- Create: `src/lib/server/email/estimate-mailer.ts`.
- Create: `src/lib/server/pdf/estimate-pdf.ts` only after compatibility spike passes.

## Public routes/components

- Create: `src/routes/estimate/+layout.svelte` — distraction-free estimator shell.
- Create: `src/routes/estimate/+page.svelte` — branch entry + step flow.
- Create: `src/routes/estimate/[publicRef]/+page.server.ts`.
- Create: `src/routes/estimate/[publicRef]/+page.svelte`.
- Create: `src/routes/api/estimates/+server.ts`.
- Create: `src/routes/api/estimates/[publicRef]/contact/+server.ts`.
- Create: `src/routes/api/estimates/[publicRef]/pdf/+server.ts`.
- Create focused components under `src/lib/components/estimator/`: `progress.svelte`, `choice-card.svelte`, `multi-choice.svelte`, `step-shell.svelte`, `result-summary.svelte`, `contact-panel.svelte` as proven necessary; do not create abstractions before two call sites justify them.

## Admin routes/components

- Create: `src/routes/admin/login/+page.svelte` and server action/load required by current SSR auth pattern.
- Create: `src/routes/admin/+layout.server.ts`, `+layout.svelte`.
- Create: `src/routes/admin/+page.server.ts`, `+page.svelte`.
- Create: `src/routes/admin/estimates/+page.server.ts`, `+page.svelte`.
- Create: `src/routes/admin/estimates/[id]/+page.server.ts`, `+page.svelte`.
- Create: `src/routes/admin/leads/+page.server.ts`, `+page.svelte`.
- Create: `src/routes/admin/leads/[id]/+page.server.ts`, `+page.svelte`.
- Create: `src/routes/admin/pricing/+page.server.ts`, `+page.svelte`.
- Create: `src/routes/admin/pricing/[id]/+page.server.ts`, `+page.svelte`.

## Supabase

- Initialise local Supabase project metadata only when dedicated Goat project identity is known.
- Create migration files using `supabase migration new <name>`; never invent timestamp filenames.
- Required logical migrations: `estimator_core`, `estimator_rls`, `pricing_activation`, `staff_auth` (may be combined only if review clarity improves).
- Generate and commit DB types after migration verification.

## Browser tests

- Create: `tests/e2e/estimate-business.spec.ts`
- Create: `tests/e2e/estimate-personal.spec.ts`
- Create: `tests/e2e/estimate-conversion.spec.ts`
- Create: `tests/e2e/admin-estimator.spec.ts`

---

# Approved Parallel Execution Roadmap — Revision 0.1.1

**Authority boundary:** This revision changes *work scheduling and file ownership only*. It does not change Product Spec v0.1.0, Tech Spec v0.1.0, question/cost rules, state machines, security model, or the 15 numbered PRs. All agents must read this section and the standalone `docs/superpowers/plans/2026-11-03-goat-accounting-estimator-parallel-roadmap.md` before work.

## Dependency graph and execution waves

```text
GATE 0: merge PR 0 (accepted specs + plan + prompts + roadmap + AGENTS.md)
  |
  +-- Wave 1 (3 isolated worktrees): PR 1 Runtime  || PR 2 Pure domain || PR 3 DB/RLS
  |       PR 3: no remote mutation until Goat project positively verified
  |       Review/merge each individually; rebase later lanes on final accepted main
  +-- GATE 1: PR 1, PR 2 and PR 3 merged + cross-contract verification
  |
  +-- PR 4 Estimate API + atomic snapshot persistence (serial integration bridge)
  +-- GATE 2: PR 4 merged; production-like Worker/API integration proven
  |
  +-- Wave 2 (3 isolated worktrees): PR 5 Business UI || PR 8 Worker PDF || PR 10 Admin Auth/read-only
  |       PR 8/10 may both need dependency files: merge sequentially + rebase + regenerate lock
  +-- CHECKPOINT 3: each merged prerequisite unlocks its own follow-on tasks; shared lockfile retested
  |
  +-- Wave 3 (3 isolated worktrees): PR 6 Personal/both || PR 7 Contact/Turnstile || PR 12 Pricing admin
  |       PR 6 -> PR 5; PR 7 -> PR 5+4; PR 12 -> PR 2+3+4+10
  +-- CHECKPOINT 4: merge each ready PR; rerun public/admin integration tests
  |
  +-- Wave 4 (3 isolated worktrees): PR 9 Emails || PR 11 Lead admin || PR 13 Analytics/dashboard
  |       PR 9 -> PR 7+8; PR 11 -> PR 7+10; PR 13 -> PR 5+7+10
  +-- CHECKPOINT 5: merge remaining PRs; full integrated staging regression
  |
  +-- PR 14 Calibration/security/accessibility + controlled launch (serial only)
```

`A -> B` means B requires A merged and revalidated; `||` means development may occur concurrently **after every prerequisite is met**, not that PRs may be blindly merged in any order. **Waves are recommended staffing groupings, not rigid all-tasks-complete barriers:** once a task's own prerequisites merge, its agent slot may be dispatched even if an unrelated PR from an earlier wave remains active. Hard convergence gates are PR 0; PR 1+2+3 before PR 4; PR 4 before API consumers; and all PR 0–13 before PR 14. Tasks are numbered by domain, not by chronological order. Keep IDs stable in all reports, branch names and references.

## Scheduling and integration contract

| PR | Earliest wave | Required merged inputs before start | Own files / work boundary | Integration condition |
|---|---|---|---|---|
| 0 | Gate 0 | accepted Product/Tech Specs | `docs/**` authority, `AGENTS.md` only | docs byte match and owner review; merge first |
| 1 | Wave 1 | PR 0 | Cloudflare/Svelte config, runtime handlers, package/lockfile | existing routes/booking/risk-tool + Worker preview pass |
| 2 | Wave 1 | PR 0 | `src/lib/domain/estimator/**`, `src/lib/domain/pricing/**`, own tests | pure API stable; no root config/DB edits |
| 3 | Wave 1 | PR 0 + verified Goat *staging* identity before DDL | `supabase/**`, generated DB types, DB constraint tests | RLS/invariants/advisors + interface reconciliation with PR 2 |
| 4 | Serial gate | PR 1+2+3 merged | estimator server adapters, `/api/estimates`, public result load | transaction, historical snapshot and Worker tests |
| 5 | Wave 2 | PR 4 | public business form, shared result UI and own E2E | business flow stable before PR 6/7 |
| 8 | Wave 2 | PR 4 | PDF adapter/endpoint/tests | prove Wrangler compatibility; serialise lockfile with PR 10 |
| 10 | Wave 2 | PR 1+3+4 | Supabase SSR auth, staff guard, read-only admin screens | AAL2/role/RLS tests; serialise lockfile with PR 8 |
| 6 | Wave 3 | PR 5 | business-form extension: personal/both; own E2E | do not overlap PR 5 branch while it is unmerged |
| 7 | Wave 3 | PR 4+5 | lead submission/Turnstile, result contact panel | persistence before notifications; no pricing changes |
| 12 | Wave 3 | PR 2+3+4+10 | pricing admin UI and activation service/DB migration | atomic activation race + old estimate tests |
| 9 | Wave 4 | PR 7+8 | estimator-specific Resend templates/notification adapter | booking regression; saved-snapshot rendering |
| 11 | Wave 4 | PR 7+10 | lead transition/admin detail/audit | concurrent transition + negative-role tests |
| 13 | Wave 4 | PR 5+7+10 | analytics allowlist, admin overview, bounded queries | no PII; avoid shared edits to lead/admin routes |
| 14 | Serial launch | PR 0–13 merged | calibration, staged acceptance, prod release records | explicit business sign-off + security/release gate |

## Parallel ownership and handoffs

- **Agent A / runtime:** PR 1 only; owns `package.json`, `bun.lock`, `vite.config.*`, `svelte.config.js`, `wrangler.toml`, `src/app.d.ts` and existing Worker-binding migrations. No `src/lib/domain/estimator/**`, `src/lib/domain/pricing/**`, or `supabase/**` edits.
- **Agent B / domain:** PR 2 only; owns `src/lib/domain/estimator/**`, `src/lib/domain/pricing/**` and adjacent tests. Use existing Bun/Zod; no manifest, router, database or Cloudflare changes. Publish public DTO/rule names for PR 3 review, not independent schema inventions.
- **Agent C / data:** PR 3 only; owns `supabase/**`, generated `src/lib/server/supabase/database.types.ts` and DB-only integration tests. No `package.json`, `bun.lock`, or production mutations. The repository must record the exact *dedicated Goat staging project* identity before remote DDL.
- **API bridge owner:** PR 4 alone joins these outputs after **all three merge**. Verify `CanonicalEstimatorAnswers`, `ValidatedPricingModel`, persisted JSON/ranges, DB types and returned `PublicEstimateView` match before implementing.
- **Wave 2:** PR 5 exclusively owns shared public business form/result components; PR 8 owns PDF paths; PR 10 owns auth/admin paths. PR 8 and PR 10 are *development-parallel, dependency-integration-serial* if both touch the dependency manifest.
- **Waves 3/4:** Each agent modifies only its assigned domain/routes. If two tasks discover the same target file, choose one integration owner and defer the other patch until the first PR is merged; do not quietly edit both or create duplicate modules.

## Required proof at every convergence gate

1. Record main/base/head SHAs and changed paths for every candidate PR.
2. Independently review each **exact** diff, current CI, and Product/Tech authority before recommending its merge. No green-CI-only approval.
3. Merge/rebase in the recorded order; re-run impacted tests and CI on the *new head*. Previous-branch CI does not prove rebased bytes.
4. After Gate 1: verify runtime + pure engine + DB contract agreement; after Gate 2: prove atomic persisted estimate and no public price tampering; after Gate 3: prove both dependencies and routes; after Gate 4: prove lead/pricing lifecycle and historical stability; after Gate 5: full cross-channel snapshot consistency and no PII leak.
5. No concurrent production migrations, pricing activations, secrets changes, or Cloudflare production cutover. Production changes remain serial and explicitly authorised.

## Workstream STOP conditions

Stop a single agent immediately upon another lane's file ownership being required, a common interface mismatch, an unapproved dependency edit, schema drift, a branch/base mismatch, or unverified database identity. Stop the *wave/integration* when cross-branch compatibility fails, a shared lockfile change is unresolved, tests have not rerun after rebase, or the required prior PR is not merged. Do not auto-resolve by expanding scope or mutating production.

---

# PR / Task Sequence

## Task 0 / PR 0: Publish authority and establish the implementation gate

**Scheduling:** Gate 0, **serial and first**. No implementation agents start until this authority PR merges.

**Objective:** Put the accepted specs and plan inside the repository so every later PR argues from the same immutable authority.

**Files:** Product/Tech authority, this plan, the parallel roadmap, the TOON prompt pack, and `AGENTS.md` only. No runtime files.

**Interfaces:** Produces repository-local authority documents. No runtime interface.

- [ ] Verify exact `origin/main`, working tree cleanliness, and that current main descends from `6b07d4b...`.
- [ ] Add the accepted Product Spec v0.1.0 byte-for-byte under `docs/product/...`.
- [ ] Add the accepted Tech Spec v0.1.0 byte-for-byte under `docs/architecture/...`.
- [ ] Add this implementation plan, the parallel execution roadmap, and the updated TOON prompt pack under their exact `docs/superpowers/...` paths.
- [ ] Update `AGENTS.md` only to remove the false “no Postgres / KV only” rule and record the accepted Cloudflare Workers + Supabase authority. Do not add implementation instructions that contradict the specs.
- [ ] Run `git diff --check` and verify docs paths and exact spec versions.
- [ ] Commit docs/authority only.

**STOP:** Any spec byte drift, unreviewed authority conflict, unrelated code change, or baseline uncertainty.

**Success:** A docs-only PR can be merged independently; later agents can read all approved authority locally.

---

## Task 1 / PR 1: Migrate the existing site to SvelteKit 3 + authoritative Cloudflare Worker configuration

**Scheduling:** Wave 1, Agent A. May develop alongside PR 2 and PR 3 after PR 0 merges. Merges through Gate 1; existing site migration proof is mandatory before PR 4.

**Objective:** Modernise the runtime without changing Goat product behaviour.

**Files:** `package.json`, `bun.lock`, `vite.config.ts`, `svelte.config.js` removal, `tsconfig.json`, `wrangler.toml`, generated Worker types, `src/app.d.ts`, `.dev.vars.example`, `.env.example`, existing server handlers that use `platform?.env`.

**Interfaces:** Produces current Worker env access and a stable build/runtime foundation used by all later tasks.

- [ ] On a clean worktree, record baseline build/tests and smoke the homepage, booking flow entry, `/contact` redirect, and `/tools/risk-appetite`.
- [ ] Upgrade to the latest compatible SvelteKit 2.x first if required by the official migration path; run deprecation checks.
- [ ] Run the official SvelteKit 3 migration tooling (`sv migrate sveltekit-3`) and review every generated change instead of accepting blindly.
- [ ] Move adapter/configuration into `vite.config.ts`; remove `svelte.config.js` only after the build proves it is obsolete.
- [ ] Update `tsconfig.json` to SvelteKit 3 requirements.
- [ ] Replace old `event.platform.env` access with current Cloudflare Worker env access in existing server-only adapters/handlers; preserve behaviour.
- [ ] Create `wrangler.toml`; obtain the exact Worker `main`/asset output paths from the current adapter build and lock them there.
- [ ] Run `wrangler types` and commit the generated binding types required by the current workflow.
- [ ] Migrate existing server env names away from `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_SECRET_KEY` only if the real existing Goat integration target supports the new key; otherwise isolate the legacy booking adapter behind a compatibility boundary and STOP before deleting a working secret contract.
- [ ] Add/normalise scripts for `check`, `test`, `build`, Worker type check, and browser smoke execution. Add lint/format tooling only once, using current Svelte ecosystem defaults; do not rewrite the whole codebase for style.
- [ ] Re-run baseline tests/build and browser smoke routes.
- [ ] Deploy to preview/staging only; confirm static assets, server routes and current booking/Supabase/Resend paths still work.

**Required tests:** existing `risk_appetite.test.ts`; new regression tests for env/config helper boundaries if introduced; Playwright smoke for current critical routes.

**STOP:** Current site regression, unsupported Bun/Node requirement, unknown Worker output path, broken existing Supabase/Resend flow, or need to touch production secrets without explicit authority.

**Success:** SvelteKit 3 Worker build/deploy is behaviourally equivalent for existing features and uses repository-authoritative `wrangler.toml`.

---

## Task 2 / PR 2: Build the pure estimator/pricing domain with test-only pricing fixtures

**Scheduling:** Wave 1, Agent B. May develop alongside PR 1 and PR 3 after PR 0 merges. Keep dependencies unchanged; merge/rebase through Gate 1.

**Objective:** Prove the question contract, typed pricing rules, deterministic engine, confidence and manual-review logic before any DB/UI dependency exists.

**Files:** `src/lib/domain/estimator/*`, `src/lib/domain/pricing/*`, tests and test corpus.

**Interfaces:**

```ts
export type CalculatorType = 'business' | 'personal' | 'both';

export type EstimateConfidence = 'high' | 'good' | 'preliminary';

export interface EstimateCalculation {
  engineVersion: string;
  pricingModelId: string;
  pricingModelVersion: string;
  catchup: { minCents: number; maxCents: number; lineItems: EstimateLineItem[] };
  ongoing: { minCents: number; maxCents: number; lineItems: EstimateLineItem[] };
  confidence: EstimateConfidence;
  confidenceReasons: string[];
  manualReviewRequired: boolean;
  reviewReasons: string[];
}

export function calculateEstimate(
  answers: CanonicalEstimatorAnswers,
  model: ValidatedPricingModel
): EstimateCalculation;
```

- [ ] Encode the exact V1 question IDs, options, branch requirements and `both` composition from Product Spec sections 7–11.
- [ ] Write Zod schemas that reject impossible cross-branch answer shapes and canonicalise stable answer codes.
- [ ] Encode typed pricing rule schemas for only: `FIXED_RANGE`, `BAND_RANGE`, `PER_UNIT_RANGE`, `PER_PERIOD_RANGE`, `SERVICE_ADDON_RANGE`, `COMPLEXITY_SCORE`, `CONFIDENCE_WEIGHT`, `REVIEW_TRIGGER`.
- [ ] Write failing tests proving money is integer cents, `min <= max`, totals never negative/NaN, free text is absent from calculation input, and unknown answers widen/reduce confidence rather than producing undefined money.
- [ ] Write the pricing test corpus from Tech Spec section 20 using test-only values clearly marked non-production.
- [ ] Implement the minimum deterministic rule evaluation to pass the corpus. No arbitrary expressions, callbacks, SQL or JS stored in rules.
- [ ] Write confidence/review tests for unknown volume, incomplete records, SARS dispute/audit, multiple entities without count, out-of-band volumes and major backlog.
- [ ] Write monotonicity/boundary tests: moving to a greater workload band must not reduce the applicable price unless an explicit rule fixture documents why.
- [ ] Encode pricing model DRAFT/ACTIVE/RETIRED transition guards and estimate VALID/SUPERSEDED/VOIDED guards as pure functions; test every allowed and forbidden transition.
- [ ] Run all Bun tests and existing risk appetite tests.

**STOP:** A pricing requirement cannot be represented by the approved bounded rule types; a business rule requires an opaque multiplier not authorised by spec; production Rand values are needed to make the engine work.

**Success:** A reviewer can feed canonical answers + a validated fixture model into one pure function and get deterministic, fully explained range output independent of Svelte/Supabase.

---

## Task 3 / PR 3: Establish the dedicated Goat Supabase environment and durable schema/security invariants

**Scheduling:** Wave 1, Agent C. May develop alongside PR 1 and PR 2 after PR 0 merges. **Remote DDL is separately gated on positive Goat staging identity**, not merely PR 0.

**Objective:** Create the durable model, RLS posture, staff authority model and database-level invariants without yet wiring the public UI.

**Prerequisite:** Dedicated Goat Supabase dev/staging target positively identified. Production may remain unmodified.

**Files:** Supabase config/migrations, generated `database.types.ts`, server clients/repositories skeletons.

**Interfaces:** Tables and repository method signatures used by Task 4+.

- [ ] Record the exact Goat Supabase project refs/environments in non-secret deployment documentation; verify the target is not the unrelated discovered project.
- [ ] Initialise Supabase project metadata/CLI workflow if absent. Discover CLI commands with `--help`; do not guess version-specific flags.
- [ ] Create migration via `supabase migration new estimator_core` for enums/tables: `pricing_models`, `pricing_rules`, `estimates`, `estimate_line_items`, `leads`, `lead_events`, `notification_deliveries`, `staff_users`.
- [ ] Add DB constraints for non-negative amount ranges, `min <= max`, unique `(pricing_model_id, code)`, immutable historical relationships, one lead per estimate, and FK delete behaviour that cannot cascade away commercial history accidentally.
- [ ] Add a partial unique index enforcing at most one `ACTIVE` pricing model. Pair it with an activation function/transaction strategy that also prevents normal committed zero-ACTIVE replacement states during activation.
- [ ] Add immutability enforcement for ACTIVE/RETIRED pricing rules and completed estimate/line-item commercial fields. Lifecycle metadata remains the only permitted estimate mutation.
- [ ] Create RLS policies with default-deny posture. Public roles receive no direct authoritative estimator/lead/pricing table writes.
- [ ] Create staff role/state policy helpers without using `user_metadata`; guard active state/role via application table.
- [ ] If a privileged database function is required for pricing activation, keep its privileges narrow: fixed `search_path`, explicit revokes, no generic PUBLIC execution, server-secret invocation only, and direct tests for unauthorised execution.
- [ ] Apply migrations only to dedicated dev/staging target; run Supabase security and performance advisors.
- [ ] Generate TypeScript database types and commit them.
- [ ] Add repository integration tests for constraints and negative access paths.

**Concurrency proof:** Run two concurrent pricing activation attempts in integration testing; prove the DB never commits multiple ACTIVE models.

**STOP:** Wrong/ambiguous project, advisor security finding unresolved, inability to enforce ACTIVE uniqueness/atomicity, or RLS policy that requires broad public table access.

**Success:** Invalid durable state is rejected by Postgres even if application code is buggy.

---

## Task 4 / PR 4: Implement authoritative estimate creation and public immutable result retrieval

**Scheduling:** Serial Gate 1->2 integration bridge. **Do not start** until PR 1, PR 2 and PR 3 are independently reviewed, merged and reconciled.

**Objective:** Connect the pure engine to the database through a narrow server service/API while keeping the browser untrusted.

**Files:** Supabase repositories for pricing/estimates, `create-estimate.ts`, `get-public-estimate.ts`, `src/routes/api/estimates/+server.ts`, result server load.

**Interfaces:**

```ts
export async function createEstimate(input: CreateEstimateInput): Promise<PublicEstimateResult>;
export async function getPublicEstimate(publicRef: string): Promise<PublicEstimateView | null>;
```

- [ ] Write failing service tests proving request totals/model IDs are ignored and the server resolves exactly one ACTIVE pricing model.
- [ ] Implement active model repository read + Zod rule validation before calculation.
- [ ] Generate a high-entropy non-PII `public_ref`; add duplicate-safe retry on unique collision only.
- [ ] Persist estimate snapshot + line items transactionally. If any line-item insert fails, no estimate shell remains.
- [ ] Return only the sanitised public result, not internal pricing-rule parameters/audit notes.
- [ ] Set `Cache-Control` to prevent shared caching of personalised estimate views.
- [ ] Add idempotency strategy for duplicate create submissions from browser retries. Keep it bounded; do not dedupe unrelated recalculations.
- [ ] Write historic-drift integration test: activate a replacement model, then assert old public result still equals its saved snapshot.

**STOP:** Persistence requires recalculation during read, public response leaks internal rule data, or transactionality cannot be demonstrated.

**Success:** `POST /api/estimates` is the sole public authority for completed estimate creation; old results remain historically stable.

---

## Task 5 / PR 5: Build the public business estimator flow

**Scheduling:** Wave 2, public UI lane. Start after PR 4 merges; owns shared business form/result UI until merged. May develop with PR 8 and PR 10.

**Objective:** Deliver the distraction-free, accessible business questionnaire and result page on top of the authoritative API.

**Files:** estimator layout/page/components; business E2E test.

**Interfaces:** Uses Task 2 question definitions and Task 4 API/public result.

- [ ] Create the estimator-only shell with Goat branding, minimal header, keyboard-visible focus and mobile-first layout.
- [ ] Implement B1–B8 core flow exactly from the product contract.
- [ ] Implement conditional questions only where required by current typed branch rules: multiple entities, backlog period detail, statement availability, compliance categories, and material complexity follow-ups.
- [ ] Implement complexity multi-select and urgency step; urgency sets operational/review metadata only and does not alter price in V1.
- [ ] Add optional 2,000-char free-text field with helper text explicitly stating it does not affect the estimate.
- [ ] Keep in-progress answers in `sessionStorage` only, namespaced/versioned and expiring within the tab/session; never store contact PII there. Clear on successful completion/reset.
- [ ] On valid completion, call the estimate API and navigate to `/estimate/[publicRef]`.
- [ ] Render catch-up and ongoing ranges, confidence, major factors, included services, review notice and disclaimer before any contact form.
- [ ] Add retake action that creates a new attempt; do not mutate the completed estimate.
- [ ] Write Playwright tests for simple-current business, catch-up conditional branch, keyboard navigation, result-before-contact, mobile viewport and refresh within active session.

**STOP:** Question count/branching drifts from spec, a UI field directly controls price, free text enters the engine payload, or result is gated behind contact details.

**Success:** A typical business prospect completes the flow in 8 core + only applicable follow-ups and gets an authoritative saved result.

---

## Task 6 / PR 6: Add personal-tax and combined estimator branches

**Scheduling:** Wave 3, public flow extension lane. Start only after PR 5 merges; may develop with PR 7 and PR 12 if their path ownership remains disjoint.

**Objective:** Complete the V1 public estimator without contaminating business pricing semantics.

**Files:** existing estimator question/schema/UI files; personal E2E test.

- [ ] Encode P1–P5 personal question flow exactly from Product Spec section 11.
- [ ] Make `both` run business then personal branch with one combined saved answer snapshot and separate explainable line items.
- [ ] Ensure business-only concepts (transaction/account/payroll bands) cannot be required for personal-only estimates.
- [ ] Add personal high-risk SARS/manual-review cases to the corpus.
- [ ] Test personal salaried taxpayer, rental/provisional-tax case, high-risk SARS issue and `both` branch.

**STOP:** Personal pricing needs unapproved production ranges to prove structure; use fixtures and stop before launch pricing activation.

**Success:** Business, personal and combined estimates share one engine contract while keeping branch-specific questions/pricing explicit.

---

## Task 7 / PR 7: Add post-result contact conversion with Turnstile and durable lead lifecycle

**Scheduling:** Wave 3, conversion lane. Start only after PR 4 and PR 5 merge; independent of PR 6 UI files. May develop with PR 6 and PR 12.

**Objective:** Convert willing prospects after the estimate while persisting the lead before any secondary notification side effect.

**Files:** lead domain, lead repository/service, Turnstile verifier, contact endpoint, contact panel, conversion E2E.

**Interfaces:**

```ts
export async function createLeadFromEstimate(input: CreateLeadInput): Promise<CreateLeadResult>;
export async function verifyTurnstile(token: string, remoteIp?: string): Promise<TurnstileResult>;
```

- [ ] Implement estimator-specific lead schema: full name, email, optional SA/international-safe phone policy as approved, business name where applicable, preferred contact method, contact consent, requested actions.
- [ ] Add Turnstile only at PII/contact/email action, not questionnaire steps.
- [ ] Verify Turnstile server-side and reject missing/replayed/failed tokens.
- [ ] Persist one primary lead per estimate transactionally with initial `NEW` state and append-only event where appropriate.
- [ ] Implement lead lifecycle pure guard tests for all allowed/forbidden transitions and terminal states.
- [ ] Ensure contact consent timestamp is server-generated and marketing consent is not inferred.
- [ ] Create notification-delivery records transactionally after/with lead creation; provider send comes after durable lead state.
- [ ] Test duplicate submission/retry semantics: no duplicate primary lead and no accidental duplicate state event.

**STOP:** Provider call occurs before durable lead persistence; Turnstile result is trusted from browser; contact data is sent to analytics.

**Success:** A failed downstream email cannot erase or hide a valid prospect contact request.

---

## Task 8 / PR 8: Prove Worker-compatible PDF generation and implement snapshot-based PDF download

**Scheduling:** Wave 2, document lane. Start after PR 4; may develop alongside PR 5 and PR 10. If PR 8 and PR 10 both edit `package.json`/`bun.lock`, **serialise integration and regenerate lockfile after rebase**.

**Objective:** Generate a deterministic branded estimate PDF without headless browser infrastructure.

**Files:** PDF spike test, `estimate-pdf.ts`, PDF endpoint, PDF tests.

- [ ] In an isolated branch/task, add the chosen current `pdf-lib` version and build a minimal Cloudflare Worker-compatible PDF generation spike.
- [ ] Run local Wrangler Worker execution and verify a valid PDF response under the actual target runtime.
- [ ] If compatibility fails, remove the dependency/change and STOP with evidence; do not switch to Puppeteer/headless Chromium without architecture approval.
- [ ] Define `EstimateDocumentModel` containing only saved snapshot/public/customer-safe fields.
- [ ] Render one/two-page Goat-branded PDF with Rossouw contact placeholders sourced from config until approved production copy exists.
- [ ] Escape/bound all user strings; truncate or wrap safely; free text must not cause layout overflow or PDF injection.
- [ ] Implement `GET /api/estimates/:publicRef/pdf` with private/no-shared-cache headers.
- [ ] Test minimum content, maximum supported content, valid PDF signature, exact snapshot amounts/reference/version and no recalculation.

**STOP:** Node-only runtime dependency, unbounded user text layout, or PDF value path differs from saved snapshot.

**Success:** PDF totals exactly equal the on-screen immutable result.

---

## Task 9 / PR 9: Refactor Resend into estimator notifications and customer/internal estimate email

**Scheduling:** Wave 4, notification lane. Start after PR 7 and PR 8 merge; may develop with PR 11 and PR 13 if their files do not overlap.

**Objective:** Reuse proven Resend infrastructure without overloading booking-specific lead/mail contracts.

**Files:** `estimate-mailer.ts`, notification repository/service, templates/tests; leave booking mail behaviour intact.

- [ ] Extract only reusable Resend HTTP/timeout/response handling from current mailer; do not force estimator data through `LeadSchema` or appointment ICS semantics.
- [ ] Implement internal lead email DTO/template with estimate summary, contact details, review flags and admin deep link.
- [ ] Implement customer estimate email with saved summary, public result link, PDF download link, Rossouw contact block and approved disclaimer placeholder.
- [ ] Record provider message ID/state transitions without storing verbose provider PII responses.
- [ ] Implement retry classification: transient -> `FAILED_RETRYABLE`; permanent/exhausted -> `EXHAUSTED`; successful -> `SENT`.
- [ ] Ensure API success semantics prioritise saved lead/estimate even when email fails; surface safe retry/user messaging.
- [ ] Test duplicate retry does not create duplicate lead/estimate; notification delivery attempts are auditable.

**STOP:** Booking notification regression; email recalculates price; raw provider response/PII is logged.

**Success:** Internal and customer emails always agree with the saved result and notification failures are visible without losing business data.

---

## Task 10 / PR 10: Implement Supabase SSR admin authentication, staff lifecycle and read-only estimator backend

**Scheduling:** Wave 2, staff auth/read-only lane. Start after PR 1, PR 3 and PR 4; may develop alongside PR 5/8. Dependency manifest/lockfile integration must be serialised with PR 8.

**Objective:** Establish a secure admin shell before adding mutation-heavy admin features.

**Prerequisite:** Initial admin account(s) identified for staging; MFA configuration available.

**Files:** SSR Supabase session client, `staff-guard.ts`, admin login/layout/dashboard shell, estimates/leads read-only pages.

- [ ] Add `@supabase/ssr` current compatible package and implement cookie/session handling per current official SvelteKit guidance.
- [ ] Require valid auth user + `staff_users` ACTIVE state for `/admin` server loads/actions.
- [ ] Require AAL2/TOTP for protected admin area; handle AAL1 by routing to MFA setup/challenge instead of silently authorising.
- [ ] Enforce roles server-side: viewer read-only, advisor read/manage leads later, admin pricing/user authority later.
- [ ] Implement estimates list/detail and leads list/detail as read-only first.
- [ ] Ensure public reference does not grant admin fields; admin queries use authenticated/RLS or narrow server authority as designed.
- [ ] Test direct URL access as unauthenticated, inactive, AAL1, viewer, advisor and admin actors.

**STOP:** Authorisation relies on client route hiding, `user_metadata`, or broad service-secret reads without a justified narrow adapter.

**Success:** An unauthorised user cannot retrieve admin estimate/lead data even with direct URLs/API calls.

---

## Task 11 / PR 11: Add lead lifecycle management with append-only audit history

**Scheduling:** Wave 4, lead-admin lane. Start after PR 7 and PR 10 merge; coordinate distinct `/admin/leads` files with PR 13.

**Objective:** Turn the admin backend into an operational lead manager without mutating historical truth.

**Files:** lead repository/service updates; lead detail admin actions/UI; tests.

- [ ] Implement server action `transitionLead(leadId, targetState, reason?, note?)` using pure lifecycle guard + DB transaction.
- [ ] Every valid transition updates current state and appends one `lead_events` row atomically.
- [ ] Closure states require configured reason/category according to product rules.
- [ ] Reject transitions out of terminal states.
- [ ] Authorisation: advisor/admin may manage leads; viewer cannot mutate.
- [ ] Test every allowed and forbidden transition, concurrent duplicate state-change attempts, and audit event count.

**STOP:** State can change without audit event, terminal lead can be reopened in place, or concurrent actions can create contradictory event history.

**Success:** Current lead state and append-only event history remain transactionally consistent.

---

## Task 12 / PR 12: Add versioned pricing draft/test/activation administration

**Scheduling:** Wave 3, pricing-admin lane. Start after PR 2, PR 3, PR 4 and PR 10 merge; no other agent may concurrently change activation migration files.

**Objective:** Let authorised admins change amounts/bands/weights safely without code deploys while preserving immutable active/history state.

**Files:** pricing service/repository, admin pricing pages, activation DB function/RPC adapter, corpus integration tests.

**Interfaces:**

```ts
export async function clonePricingModel(sourceModelId: string, newVersion: string): Promise<PricingModel>;
export async function validatePricingDraft(modelId: string): Promise<PricingDraftValidation>;
export async function activatePricingModel(modelId: string, actorUserId: string): Promise<void>;
```

- [ ] Implement clone ACTIVE/RETIRED -> new DRAFT; never edit source model/rules.
- [ ] Admin UI edits only schema-approved fields for the rule type: labels, enabled, ranges, bands, per-unit amounts, confidence/review thresholds.
- [ ] Validate each draft rule server-side with discriminated Zod schema.
- [ ] Run the full pricing corpus against the draft and present failures before activation.
- [ ] Compute deterministic checksum over canonical model/rules.
- [ ] Activation executes in one DB transaction/function: validate DRAFT, lock/serialise, retire current ACTIVE, activate target, persist actor/timestamps/checksum.
- [ ] Restrict activation to `admin` at AAL2.
- [ ] Run concurrency test with competing activation attempts.
- [ ] Run historical estimate/PDF regression after activation.

**STOP:** Admin can inject executable rule logic, ACTIVE/RETIRED rows can be edited, activation is multi-request/non-atomic, or corpus can be bypassed.

**Success:** Commercial prices can change without deployment while historic estimates remain unchanged and exactly one ACTIVE model survives every activation race.

---

## Task 13 / PR 13: Add safe analytics, admin dashboard, observability and privacy boundaries

**Scheduling:** Wave 4, analytics/dashboard lane. Start after PR 5, PR 7 and PR 10; own only analytics and dashboard files, not lead/admin detail files.

**Objective:** Measure the funnel and operational state without leaking financial detail or PII.

**Files:** `src/lib/analytics.ts`, estimator events, admin dashboard queries/UI, logging helper/config, tests.

- [ ] Add only coarse funnel events: `estimate_started`, `estimate_step_completed`, `estimate_completed`, `estimate_result_viewed`, `estimate_contact_started`, `estimate_contact_submitted`, `estimate_pdf_downloaded`, `estimate_booking_clicked`.
- [ ] Explicit allowlist analytics payload fields; reject names, emails, phones, free text, detailed answers and raw SARS/accounting state.
- [ ] Add structured server logs with request correlation ID, route/action, safe event, pricing version, engine version, outcome/error code, provider latency and manual-review boolean.
- [ ] Add admin dashboard aggregate queries for counts/conversion/estimate bands without large row scans or loading answer JSON unnecessarily.
- [ ] Add indexes proven by actual admin query shapes; run `EXPLAIN` on representative staging data before adding speculative indexes.
- [ ] Enable Cloudflare observability in Wrangler config and verify logs contain no secret/PII samples.

**STOP:** Any analytics/log payload contains PII/detailed answers; dashboard requires unbounded table scans at expected scale.

**Success:** Goat can understand usage/conversion while customer financial details remain in the application DB, not marketing analytics/log streams.

---

## Task 14 / PR 14: Calibration, security/accessibility hardening and production launch gate

**Scheduling:** Serial launch gate, after every PR 0–13 is merged and staged. No parallel production migration/activation/cutover.

**Objective:** Replace fixtures/placeholders with approved business content, prove staging, then release without pretending the calculator is a final quote.

**Required owner inputs before this task can complete:**

- Initial Rand amounts for every pricing component/band.
- Personal-tax ranges.
- Manual-review thresholds.
- Exact disclaimer wording.
- Exact Rossouw professional titles/contact details.
- Contact consent/privacy notice.
- Retention periods.
- Weekly payroll pricing decision.
- PDF email attachment vs link decision.

- [ ] Create initial DRAFT pricing model with owner-approved values through the same admin/data path that will be used operationally; do not hard-code production prices in source.
- [ ] Rossouw reviews benchmark corpus outputs and signs off representative scenarios.
- [ ] Activate the approved model in staging; rerun full corpus + E2E.
- [ ] Perform accessibility review: keyboard-only, focus order/restoration, labels/fieldset semantics, screen reader spot checks, contrast, mobile touch targets and error announcements.
- [ ] Perform security review: request tampering, direct admin access, RLS, Turnstile server verification, XSS/free-text, PDF layout abuse, public-ref entropy, duplicate submissions, secret bundle scan, pricing activation race.
- [ ] Verify retention/anonymisation design with approved policy; do not delete commercial audit data blindly.
- [ ] Verify staging Resend, Turnstile, Supabase Auth/MFA and PDF under actual Cloudflare Worker deployment.
- [ ] Run production build and deploy staging from the exact candidate SHA; record SHA/pricing model/engine version/migration state.
- [ ] Prepare production migration/deploy order and rollback/forward-fix plan.
- [ ] Apply production schema only to confirmed Goat project, deploy app, create/activate production pricing model, then run public smoke checks.
- [ ] Monitor initial error/notification rates and manually inspect first real estimates for reasonableness.

**STOP:** Any owner content above is missing; staging differs materially from production topology; security/accessibility blocker; pricing scenario not signed off; production Supabase identity uncertain.

**Success:** Production result, admin record, customer email and PDF all show the same saved estimate; staff can manage leads/pricing securely; no known high-severity issue remains.

---

# CI / Verification Gate After Phase 0

The exact scripts should be normalised in `package.json`, but the minimum semantics are:

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run check
bun test
bun run test:e2e
bun run wrangler:types:check
bun run build
```

For DB-changing PRs additionally:

```bash
supabase --version
supabase migration list --local
# Apply/verify only against the authorised local/dedicated staging target.
# Run Supabase security and performance advisors after DDL.
```

For deploy-sensitive PRs additionally:

```bash
wrangler --version
wrangler types
wrangler dev
# staging deploy/smoke according to repository scripts
```

Do not add tools merely to satisfy a checklist if an existing deterministic script already proves the same condition.

---

# PR Review Gate

Before any merge recommendation (including a *parallel* lane PR):

1. Independently fetch/inspect the exact PR diff and changed filenames.
2. Verify the exact head SHA and current CI/run status.
3. Re-read the relevant Product/Tech Spec sections and this task's interfaces/STOP conditions.
4. Confirm no undeclared architectural decision entered through the diff.
5. Check lifecycle transitions, guards, side effects and terminal states for every affected stateful concept.
6. Check negative auth/RLS paths, not just happy paths.
7. Check DB constraints/transactions for durable invariants where persistence changed.
8. Check retries/idempotency where network/provider/browser resubmission exists.
9. Check old-estimate immutability whenever pricing/result/PDF/email code changes.
10. Check client bundles/logging/analytics for secret/PII leakage.
11. Verify migration/deploy ordering for schema/runtime changes.
12. Only recommend merge when exact diff + CI + authority all agree.

---

# Backward Plan from Ultimate Goal

**Ultimate goal:** Goat Accounting operates a transparent, trusted estimator that can evolve commercially without code deployments, while every historic estimate remains explainable and staff can convert/manage leads safely.

Working backwards:

1. Production launch needs calibrated prices, approved wording, secure admin, reliable conversion, and identical result/email/PDF snapshots.
2. Admin pricing requires atomic version activation and immutable historical models.
3. Conversion requires durable lead state, Turnstile and notification delivery semantics.
4. Public UX requires authoritative estimate creation and immutable public retrieval.
5. Estimate persistence requires DB schema/RLS/invariants.
6. Persistence requires a proven pure pricing engine and stable question contract.
7. Runtime/API integration requires the SvelteKit 3/Cloudflare/Supabase platform migration to be stable first, **but the pure engine and isolated DB design may be implemented concurrently with that migration** after common authority is published.

**MVP slice:** business estimator + immutable estimate persistence + result-before-contact + basic contact conversion + internal notification, with admin read-only visibility and pricing adjusted through approved data. Personal branch, PDF and pricing-admin UI remain V1 requirements but should not be allowed to destabilise the first end-to-end business slice.

---

# Self-Review Result

- Product spec locked decisions are covered by Tasks 2, 5–9, 12 and 14.
- Technical migration/security/data requirements are covered by Tasks 1, 3, 4, 10, 12 and 14.
- All meaningful lifecycles have an owning task and transition tests: pricing (2/12), estimate (2/4), lead (7/11), notification (7/9), staff (3/10), calculator session (5/6).
- Historic snapshot drift is explicitly tested in Tasks 4 and 12.
- Concurrency is explicitly tested for pricing activation and lead transitions.
- Free text is explicitly excluded from pricing and bounded in UI/PDF.
- Remaining business-content decisions are intentionally deferred to Task 14 and are STOP conditions for production, not blockers for domain/platform implementation.
- Approved v0.1.1 scheduling changes only start/merge ordering, not Product/Tech v0.1.0 scope or source-of-truth rules.
- Parallel lane prerequisites, shared dependency files, staging identity and post-rebase CI are explicitly gated.
- No task authorises code implementation beyond the accepted v0.1.0 scope.
