# Goat Accounting Estimator — TOON Execution Prompt Pack

**Execution revision:** v0.1.1 (approved 2026-11-03 parallelism amendment). **Product Spec and Tech Spec remain approved v0.1.0; no domain/architecture scope changes.**

**Repository authority paths:** `docs/product/goat-accounting-estimator-product-spec-v0.1.0.md`; `docs/architecture/goat-accounting-estimator-tech-spec-v0.1.0.md`; `docs/superpowers/plans/2026-11-03-goat-accounting-estimator.md`; `docs/superpowers/plans/2026-11-03-goat-accounting-estimator-parallel-roadmap.md`; this file. For PR 0, source the two accepted v0.1.0 specs and these revised plan/prompt/roadmap files from the supplied authority attachments; they are not in the repo until PR 0 merges.

## Execution controller (human or orchestrator; not a coding-agent task)

**Start** only PR 0. Verify exact spec bytes and merge before launching code work. Then dispatch at most **three** independent agents per wave, using separate clean Git worktrees and the *current accepted main SHA*. A PR may begin only after every prerequisite named in its Note is already merged. **Waves are staffing groups, not all-or-nothing barriers:** a newly eligible PR can start even if an unrelated earlier-wave PR is pending. Development can overlap; merges, rebases, database migrations, dependency manifest integration and production cutovers are serialised at their authority gates.

| Wave | Agent A | Agent B | Agent C | Convergence gate |
|---|---|---|---|---|
| 0 — serial | PR 0 Authority | — | — | docs + `AGENTS.md` merged |
| 1 — parallel | PR 1 Runtime | PR 2 Pure pricing | PR 3 Supabase/RLS | 1+2+3 merged, runtime/domain/DB interfaces reconciled |
| 2 — serial | PR 4 Estimate API | — | — | persisted immutable estimate proven |
| 3 — parallel | PR 5 Business UI | PR 8 PDF | PR 10 Admin Auth | all merged separately; PR 8/10 lockfile serialised |
| 4 — parallel | PR 6 Personal/both | PR 7 Contact | PR 12 Pricing admin | branch/lead/pricing tests merged |
| 5 — parallel | PR 9 Emails | PR 11 Lead admin | PR 13 Analytics | full integrated staging regression |
| 6 — serial | PR 14 Calibration + release | — | — | production release gate |

**Global requirements for every prompt:** Before edits, `git status --short`, `git rev-parse HEAD`, compare accepted base; read both specs and the relevant master-plan task. Only own named paths. Write minimal typed code and narrow tests, not generic frameworks. Explain architectural impacts (auth, lifecycle, DB invariants, transaction, concurrency, idempotency, caching, production, privacy, performance), and justify N/A entries. At end report PR number, base/head SHAs, changed paths, exact tests/CI, unverified assumptions and STOP flags. **Never merge or deploy on an agent's own authority.** Reviewer independently checks exact diff + CI + specs before recommending merge. Stop instead of guessing on a missing prerequisite, file/contract collision, unknown DB identity, failed negative test, stale CI after rebase, or secret/PII leakage. No production DDL, pricing activation or cutover until separately authorised.

## Scaffolding Prompt

| Field | Content |
|---|---|
| Task | Establish the Goat Accounting estimator implementation programme and common boundaries according to the approved v0.1.0 Product/Tech Specs; do not implement product code in this scaffolding task. |
| Objective | Ensure one coherent SvelteKit 3 / Cloudflare Workers + Supabase estimator evolves through safe parallel workstreams, with transparent ranges, immutable estimates, lead conversion, PDF/email, admin and pricing versions. |
| Output | Repo-local Product/Tech Specs, updated `AGENTS.md`, implementation plan, TOON prompts, approved parallel roadmap and PR 0–14 dependency/ownership gates; feature outputs only in their respective PRs. |
| Note | First publish PR 0, then develop PR 1/2/3 concurrently in separate clean worktrees (maximum 3). PR 4 begins only after the first three merge. Wave 2: PR 5/8/10; Wave 3: PR 6/7/12; Wave 4: PR 9/11/13; PR 14 is serial launch. Separate development from merge authority: current CI must match head SHA after every rebase. Preserve existing booking, risk-appetite and marketing features. No client price authority, no non-verified Supabase mutations, no production Rand guesses, no generic CMS. All meaningful lifecycles require explicit states, transitions, guards, side effects and terminal states. Required tool set: Git + task-specific Bun/Wrangler/Supabase/Playwright, no unnecessary tools. STOP on authority, file ownership, security, pricing, DB identity, or test conflicts. |

## Prompt 0 — Authority Publication

| Field | Content |
|---|---|
| Task | Publish the accepted estimator Product Spec v0.1.0, Tech Spec v0.1.0, updated implementation plan, revised TOON pack and parallel roadmap into the Goat repository and correct the stale `AGENTS.md` architecture rule. |
| Objective | Ensure every implementation/review agent works from repository-local accepted authority rather than chat history. |
| Output | `docs/product/goat-accounting-estimator-product-spec-v0.1.0.md`, `docs/architecture/goat-accounting-estimator-tech-spec-v0.1.0.md`, `docs/superpowers/plans/2026-11-03-goat-accounting-estimator.md`, `docs/superpowers/plans/2026-11-03-goat-accounting-estimator-parallel-roadmap.md`, `docs/superpowers/prompts/2026-11-03-goat-accounting-estimator-toon-prompts.md`, corrected `AGENTS.md`; docs-only commit/PR. |
| Note | Verify clean worktree/base SHA first. Preserve spec bytes. `AGENTS.md` must say Cloudflare Workers + Supabase are accepted and KV is not authoritative estimator storage. No runtime code. Run `git diff --check`. STOP on spec drift, unrelated changes or baseline uncertainty. **Parallel gate:** Serial Gate 0; accepted v0.1.0 authority attachments only; no implementation branch may begin before this merges. **File ownership:** `docs/product/goat-accounting-estimator-product-spec-v0.1.0.md`, `docs/architecture/goat-accounting-estimator-tech-spec-v0.1.0.md`, `docs/superpowers/plans/2026-11-03-goat-accounting-estimator.md`, `docs/superpowers/plans/2026-11-03-goat-accounting-estimator-parallel-roadmap.md`, `docs/superpowers/prompts/2026-11-03-goat-accounting-estimator-toon-prompts.md`, `AGENTS.md` only. **Minimal tools:** `git status --short`, `git rev-parse HEAD`, `git diff --check`, content hashes/diff; verify CI for exact PR head. **Exit/STOP:** Spec bytes unchanged; docs-only diff reviewed/merged. STOP if bytes drift, wrong base, or any runtime edit. |

## Prompt 1 — SvelteKit 3 / Cloudflare Migration

| Field | Content |
|---|---|
| Task | Migrate the existing Goat site from SvelteKit 2 to current SvelteKit 3 and make `wrangler.toml` the authoritative Cloudflare Worker/static-assets configuration while preserving all current behaviour. |
| Objective | Provide a current, typed, deployable platform before estimator code depends on it. |
| Output | Updated dependencies/lockfile; `vite.config.ts`; obsolete `svelte.config.js` removed after proof; SvelteKit 3 `tsconfig`; `wrangler.toml`; generated Worker types; current Worker env access; regression tests/smokes. |
| Note | Use official `sv migrate sveltekit-3`; review generated changes. Verify homepage, `/booking`, `/contact`, `/tools/risk-appetite`, existing Supabase lead save and Resend behaviour. Do not guess adapter output paths—derive from build. Do not expose secrets. Prefer current publishable/secret Supabase key naming for new code. STOP on regression or unknown production-secret migration. Tools: `git`, `bun`, `sv`, `wrangler`, browser smoke/Playwright only as needed. **Parallel gate:** Wave 1 Agent A; **PR 0 merged**; parallel with PR 2 and PR 3. **File ownership:** Root package/build/Cloudflare files: `package.json`, `bun.lock`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `wrangler.toml`, `src/app.d.ts`, `.dev.vars.example`, `.env.example`, generated Worker types, only existing server handlers needing Worker-binding migration. No estimator/domain or `supabase/**` edits. **Minimal tools:** `git`, `bun`, official `sv` migrate command, `wrangler types`, `wrangler dev`, route smoke/Playwright, build/check. **Exit/STOP:** Existing booking, `/contact`, marketing and `/tools/risk-appetite` work at staging; reviewer merges through Gate 1. STOP on regression, wrong generated Worker output, or production-secret changes. |

## Prompt 2 — Pure Estimator/Pricing Domain

| Field | Content |
|---|---|
| Task | Implement the typed V1 question/answer contracts and pure deterministic pricing engine using test-only pricing fixtures. |
| Objective | Prove business/personal/both calculation semantics, confidence, review flags, money arithmetic and lifecycle guards without DB/UI coupling. |
| Output | `src/lib/domain/estimator/*`, `src/lib/domain/pricing/*`, Bun tests, canonical pricing test corpus. |
| Note | Encode B1–B8, complexity, urgency, P1–P5 exactly. Allowed rule types only: FIXED_RANGE, BAND_RANGE, PER_UNIT_RANGE, PER_PERIOD_RANGE, SERVICE_ADDON_RANGE, COMPLEXITY_SCORE, CONFIDENCE_WEIGHT, REVIEW_TRIGGER. Integer cents only. No arbitrary expressions or opaque generic multipliers. Free text is not an engine input. Test min<=max, nonnegative totals, unknown values, monotonic workload bands, review triggers and allowed/forbidden lifecycle transitions. STOP if a required rule cannot fit the approved bounded model. **Parallel gate:** Wave 1 Agent B; **PR 0 merged**; parallel with PR 1/3. Domain compilation may be tested on old SvelteKit before PR 1 merges, but no integration until Gate 1. **File ownership:** `src/lib/domain/estimator/questions.ts`, `answer-schema.ts`, `estimate.ts`, `lifecycle.ts`, `confidence.ts`, `review-flags.ts`; `src/lib/domain/pricing/rule-schema.ts`, `model.ts`, `lifecycle.ts`, `engine.ts`, `test-corpus.ts`, adjacent `*.test.ts` only. Never modify root dependencies, `supabase/**`, API/UI routes. **Minimal tools:** `git`, `bun test` on owned domain dirs, `bun run check` if available. No Wrangler/Supabase calls. **Exit/STOP:** Publish `calculateEstimate(answers, model)` and canonical DTO names needed by PR 3/4. STOP on schema conflict, unexplained rule type, or need for real Rand values. |

## Prompt 3 — Supabase Schema / RLS / DB Invariants

| Field | Content |
|---|---|
| Task | Create the estimator Supabase schema, RLS posture, staff model and database invariants on the positively identified Goat development/staging project. |
| Objective | Make Postgres the durable integrity barrier for pricing models, immutable estimates, leads, notifications and staff authority. |
| Output | Version-controlled Supabase migrations; generated DB types; narrow server clients/repository skeletons; advisor results; integration tests. |
| Note | First positively identify the Goat project. Never mutate the unrelated discovered project. Create migration names via `supabase migration new`; do not invent timestamp filenames. Enforce one ACTIVE model, nonnegative/min<=max ranges, immutability, append-only events, safe FKs. Public browser gets no direct authoritative writes. RLS default deny. Do not use `user_metadata`. Any privileged DB function must have fixed search_path and explicit privilege revokes. Concurrency-test activation. STOP on unresolved security/performance advisor findings or inability to guarantee ACTIVE uniqueness. **Parallel gate:** Wave 1 Agent C; **PR 0 merged**; local-only schema work may start immediately, but remote DDL requires positively identified dedicated Goat dev/staging project and explicit target check. **File ownership:** `supabase/**` migrations/config, generated `src/lib/server/supabase/database.types.ts`, DB-only tests/evidence. No root package/lock, no UI/API, no unrelated Supabase project. **Minimal tools:** `git`, `supabase --help`, `supabase migration new`, local test runner, security/performance advisors against verified Goat target. **Exit/STOP:** Reconcile column names/JSON DTOs with approved spec and PR 2 interface before Gate 1; negative RLS/immutability, activation race tests. STOP on unknown project identity, broadened privilege or schema mismatch. |

## Prompt 4 — Estimate Creation Service/API

| Field | Content |
|---|---|
| Task | Implement authoritative server-side estimate creation and immutable public estimate retrieval. |
| Objective | Ensure the browser cannot forge totals/model versions and historic results remain unchanged after future pricing changes. |
| Output | Pricing/estimate repositories; `create-estimate.ts`; `get-public-estimate.ts`; `POST /api/estimates`; public result load; transaction/integration tests. |
| Note | Resolve exactly one ACTIVE model server-side, validate it, run pure engine, generate high-entropy public ref, persist estimate + line items transactionally, return sanitised public DTO. Do not expose internal rule parameters. No shared caching. Add bounded duplicate-submit idempotency. Test historic estimate after pricing replacement. STOP if reads require recalculation or persistence is non-atomic. **Parallel gate:** Serial Gate 1->2; PR 1, PR 2 **and** PR 3 must be individually reviewed and merged before branch start. **File ownership:** `src/lib/server/supabase/repositories/pricing.ts`, `estimates.ts`, `src/lib/server/estimator/create-estimate.ts`, `get-public-estimate.ts`, `src/routes/api/estimates/+server.ts`, `src/routes/estimate/[publicRef]/+page.server.ts` and targeted tests. No form/admin/PDF files. **Minimal tools:** `git`, Bun unit/integration tests, approved Goat staging DB/RLS test, Wrangler smoke of public API. **Exit/STOP:** DB transaction + line items atomic; immutable historic values; browser cannot forge pricing; no public RLS bypass. Gate 2 must pass before UI/PDF/Admin wave. |

## Prompt 5 — Business Estimator UI

| Field | Content |
|---|---|
| Task | Build the full-page distraction-free business estimator flow and result presentation. |
| Objective | Give typical business prospects a fast 8-core-question path with only material conditional follow-ups and transparent result-before-contact. |
| Output | `/estimate` shell/page, estimator components, business E2E tests, `/estimate/[publicRef]` result UI. |
| Note | Mobile-first, keyboard accessible, explicit choice cards/radios/multi-select; use sliders only where semantically better. Implement B1–B8, complexity, urgency, optional 2,000-char free text. Urgency does not change price. Free text excluded from calculation. Use sessionStorage only for in-progress non-contact answers and clear on completion/reset. Result shows separate catch-up/ongoing ranges before contact fields. STOP on question-contract drift or client-side pricing authority. **Parallel gate:** Wave 2 Agent A; PR 4 merged; parallel with PR 8 and PR 10; sole shared business form/result UI owner until merged. **File ownership:** `src/routes/estimate/+layout.svelte`, `+page.svelte`, `src/routes/estimate/[publicRef]/+page.svelte`, `src/lib/components/estimator/{progress,choice-card,multi-choice,step-shell,result-summary}.svelte` only as needed, `tests/e2e/estimate-business.spec.ts`. Do not edit contact panel, PDF endpoint, admin or price engine. **Minimal tools:** `git`, Bun build/check, Playwright mobile/keyboard/business regression. **Exit/STOP:** Must merge before PR 6/7. Show result before contact, no untrusted totals, no free-text price changes. STOP on form branching drift. |

## Prompt 6 — Personal and Combined Branches

| Field | Content |
|---|---|
| Task | Add personal-tax and combined (`both`) estimator branches on the shared typed engine. |
| Objective | Complete V1 calculator coverage without forcing business workload questions into personal-tax pricing. |
| Output | P1–P5 UI/schema/branch logic, combined flow, corpus/E2E additions. |
| Note | Keep branch-specific answers explicit. `both` composes business and personal answers/line items. Add personal SARS/manual-review fixtures. Use non-production test pricing until approved values exist. STOP if launch values are required; do not invent them. **Parallel gate:** Wave 3 Agent A; PR 5 merged; parallel with PR 7/12 only if shared estimator UI paths remain disjoint. **File ownership:** Personal/both typed branch extension under `src/lib/domain/estimator/**`, existing `src/routes/estimate/+page.svelte` and needed `src/lib/components/estimator/**`, `tests/e2e/estimate-personal.spec.ts`, associated corpus tests. No contact/result panel edits. **Minimal tools:** `git`, Bun domain tests, Playwright personal/both E2E. **Exit/STOP:** Full personal/both flow and risk cases tested; cannot begin before PR 5 merge. STOP on public UI collision or invented personal-tax price. |

## Prompt 7 — Contact Conversion / Turnstile / Lead Durability

| Field | Content |
|---|---|
| Task | Implement post-result contact capture, server-side Turnstile verification, durable lead creation and lead lifecycle foundations. |
| Objective | Convert prospects without hiding the estimate and ensure provider failures cannot lose the lead. |
| Output | Estimator lead schema/lifecycle, Turnstile adapter, lead repository/service, contact endpoint/panel, conversion tests. |
| Note | Contact after result only. Persist lead before notification provider work. Consent timestamp server-generated. Marketing consent never inferred. One primary lead per estimate. Turnstile token verified server-side and not reused. No PII in analytics. Test duplicate submit and terminal lifecycle guards. STOP if provider call precedes persistence or browser controls consent timestamp. **Parallel gate:** Wave 3 Agent B; PR 4 and PR 5 merged; parallel with PR 6/12; do not edit shared questionnaire routes. **File ownership:** `src/lib/domain/leads/{schema,lifecycle}.ts`, `src/lib/server/leads/create-lead.ts`, `src/lib/server/supabase/repositories/leads.ts`, `src/lib/server/turnstile/verify.ts`, `src/routes/api/estimates/[publicRef]/contact/+server.ts`, `src/lib/components/estimator/contact-panel.svelte`, result-page integration only after one-owner coordination, conversion tests. **Minimal tools:** `git`, Bun tests, authorised staging DB tests, Turnstile negative verification, Playwright conversion. **Exit/STOP:** One primary lead, consent proof, persist before email, idempotent retries. STOP if implementation must modify PR 6-owned questionnaire file or provider failure loses saved lead. |

## Prompt 8 — Worker-Safe PDF

| Field | Content |
|---|---|
| Task | Prove `pdf-lib` Worker compatibility, then implement deterministic estimate PDF generation from saved snapshot data. |
| Objective | Give customers a branded downloadable estimate that cannot drift from the stored/on-screen result. |
| Output | Compatibility proof, `estimate-pdf.ts`, PDF endpoint, layout/value tests. |
| Note | Spike first under actual Wrangler Worker runtime. No Puppeteer/headless browser in V1 without authority amendment. PDF never invokes pricing engine or active model. Escape/bound user strings and free text. Private/no-shared-cache headers. STOP and remove dependency if Worker compatibility fails. **Parallel gate:** Wave 2 Agent B; PR 4 merged; parallel with PR 5/10 **for coding only**. `package.json`/`bun.lock` integration must be serialised with PR 10. **File ownership:** `src/lib/server/pdf/estimate-pdf.ts`, `src/routes/api/estimates/[publicRef]/pdf/+server.ts`, PDF compatibility spike/tests, dependency additions only after agreed merge owner/order. No auth/admin changes. **Minimal tools:** `git`, minimal Bun check, real Wrangler Worker PDF smoke; no headless browsers. **Exit/STOP:** Worker compatibility spike must pass before full implementation; PDF uses snapshot not pricing. STOP on Node-only dependency, lockfile merge conflict or layout overflow. |

## Prompt 9 — Resend Estimator Emails

| Field | Content |
|---|---|
| Task | Add estimator-specific internal/customer Resend notifications and durable delivery-state handling while preserving booking mail behaviour. |
| Objective | Notify Rossouw and the customer from the saved snapshot without coupling estimator data to booking `LeadSchema`. |
| Output | `estimate-mailer.ts`, customer/internal templates, notification repository/service, retry/error tests. |
| Note | Reuse transport/timeout patterns only. No appointment/ICS assumptions. Email totals/versions come from saved estimate. Persist lead before send. Track provider ID and delivery lifecycle with safe error metadata. Do not log PII/raw provider payloads. STOP on booking regression or recalculation path. **Parallel gate:** Wave 4 Agent A; PR 7 + PR 8 merged, so contact/notification and PDF URL contracts are stable; parallel with PR 11/13. **File ownership:** `src/lib/server/email/estimate-mailer.ts`, `src/lib/server/supabase/repositories/notifications.ts`, `src/lib/domain/notifications/lifecycle.ts` plus email template/tests; carefully scoped shared transport extraction if separately approved; existing booking mail behaviour untouched. **Minimal tools:** `git`, Bun mail/retry tests, Resend mocked HTTP, existing booking notification regression. **Exit/STOP:** Saved snapshot-only totals, durable delivery attempts, no PII logs. STOP if PR 11 shares a required file or booking mail breaks. |

## Prompt 10 — Admin Auth + Read-Only Backend

| Field | Content |
|---|---|
| Task | Implement Supabase SSR staff authentication, TOTP/AAL2 guard and read-only estimates/leads admin pages. |
| Objective | Establish the security boundary before enabling admin mutations. |
| Output | SSR Supabase session client, staff guard, `/admin/login`, protected layout, estimates/leads list/detail pages, negative auth tests. |
| Note | No public self-registration. Authorisation uses `staff_users`, not `user_metadata`. Verify ACTIVE state, role and AAL2 server-side on every protected route/action. Viewer read-only. Direct URL access tests for unauthenticated/inactive/AAL1/viewer/advisor/admin. STOP if security depends on client hiding or broad secret-key reads. **Parallel gate:** Wave 2 Agent C; PR 1 + PR 3 + PR 4 merged; parallel with PR 5/8; manifest/lock integration serialised with PDF lane. **File ownership:** `src/lib/server/supabase/session-client.ts`, `src/lib/server/auth/staff-guard.ts`, `src/routes/admin/login/**`, `src/routes/admin/+layout.*`, `src/routes/admin/estimates/**`, `src/routes/admin/leads/**` read-only, auth/RLS tests; minimal `@supabase/ssr` manifest change only through coordinated merge. **Minimal tools:** `git`, Bun tests, Playwright admin/login, staging Supabase Auth/AAL2/RLS negative tests. **Exit/STOP:** Default-deny staff guard, AAL2, read-only viewer; no direct public access. STOP if SSR key/session boundary unclear or shared lockfile stale. |

## Prompt 11 — Lead Lifecycle Admin

| Field | Content |
|---|---|
| Task | Add authorised lead lifecycle transitions with append-only event audit. |
| Objective | Let Goat operate prospects from NEW through closure without mutating historical truth. |
| Output | Transactional lead transition service, admin actions/UI, event history, transition/concurrency tests. |
| Note | States/transitions exactly as Product Spec. Every state change + event append is atomic. Terminal states cannot reopen. Advisor/admin mutate; viewer cannot. Closure reasons where configured. Concurrency-test duplicate/conflicting transitions. STOP if state can change without event or event can exist without matching state. **Parallel gate:** Wave 4 Agent B; PR 7 and PR 10 merged; parallel with PR 9/13. **File ownership:** Lead transition service + `src/lib/server/supabase/repositories/leads.ts` updates; `src/routes/admin/leads/[id]/+page.server.ts`/`+page.svelte` action/detail changes; lead event tests. Do not modify dashboard or notification repository. **Minimal tools:** `git`, Bun lifecycle tests, staging transaction/contention tests, Playwright role denial. **Exit/STOP:** Lead state and append-only event atomic; no terminal reopen. STOP on conflict with PR 13 admin/dashboard ownership. |

## Prompt 12 — Pricing Admin + Atomic Activation

| Field | Content |
|---|---|
| Task | Implement pricing model clone/edit/validate/test/activate administration. |
| Objective | Let Goat change commercial amounts without deploys while preserving immutable active/history models and deterministic historical estimates. |
| Output | Pricing admin pages/services, typed draft editor, test-corpus validation, checksum, atomic activation path, concurrency tests. |
| Note | Only DRAFT editable. Clone creates new DRAFT. UI exposes only typed rule fields; no arbitrary expression/code. Activation is one DB transaction/function, retires previous ACTIVE and activates target atomically, admin+AAL2 only. Corpus must pass and checksum persist. Test competing activations and old estimate/PDF invariance. STOP if activation can commit zero/multiple ACTIVE models or corpus can be bypassed. **Parallel gate:** Wave 3 Agent C; PR 2+3+4+10 merged; parallel with PR 6/7. Pricing activation migration exclusively owned by this PR. **File ownership:** `src/lib/server/pricing/activate-pricing-model.ts`, pricing repository extensions, `src/routes/admin/pricing/**`, additional `supabase/migrations/*pricing_activation*` via CLI, tests. No lead/contact edits. **Minimal tools:** `git`, Bun pricing corpus, Supabase local/staging transaction+race test, AAL2/admin negative test. **Exit/STOP:** One ACTIVE model after atomic transaction, corpus validated, historic snapshots unchanged; no production activation. STOP on ambiguous DB locks/permissions or privilege escalation. |

## Prompt 13 — Analytics / Dashboard / Observability

| Field | Content |
|---|---|
| Task | Add privacy-safe funnel analytics, structured operational logging and an aggregate admin dashboard. |
| Objective | Measure estimator usage/conversion and operational health without leaking customer financial details. |
| Output | Analytics allowlist/events, structured log helper, dashboard queries/UI, required query indexes, tests. |
| Note | Analytics only coarse events/bands; never names/emails/phones/free text/raw accounting answers. Logs exclude secrets and routine detailed answers. Add indexes from proven query shapes, not speculation. Use Cloudflare static/CDN caching only for public static assets; personalised/admin data no shared cache. STOP on PII leakage or unbounded dashboard scans. **Parallel gate:** Wave 4 Agent C; PR 5+7+10 merged; parallel with PR 9/11. Avoid lead detail pages and mail files. **File ownership:** `src/lib/analytics.ts` bounded allowlist changes, estimator analytics helper, `src/routes/admin/+page.server.ts` and `+page.svelte` overview dashboard, operational logs/tests; required DB indexes only with explicit query evidence. **Minimal tools:** `git`, Bun analytics tests, bounded query/explain on approved staging, Playwright overview smoke. **Exit/STOP:** No PII/raw answers or shared-cache leaks; dashboard bounded/indexed. STOP on PR 11 route conflict or query scan at representative size. |

## Prompt 14 — Calibration / Hardening / Launch

| Field | Content |
|---|---|
| Task | Load approved pricing/content, run full staging security/accessibility/calibration proof, and prepare/execute the controlled production launch. |
| Objective | Move from structurally complete software to a commercially credible and safe live estimator. |
| Output | Approved initial pricing model, signed-off benchmark results, final copy/contact/privacy settings, staging proof, production migration/deploy record and smoke evidence. |
| Note | Requires owner-approved Rand values, personal ranges, review thresholds, disclaimer, Rossouw titles/contact, consent/privacy, retention and PDF email decision. No invented values. Test tampering, RLS, auth/AAL2, Turnstile, XSS/free-text, PDF overflow, duplicate submits, activation race, analytics/log PII, accessibility/mobile/keyboard. Record exact candidate SHA + pricing/engine/migration versions. STOP on any missing owner input, unknown production DB identity, high-severity security/accessibility issue or unsigned benchmark output. **Parallel gate:** Wave 6 serial release; **every** PR 0–13 merged and relevant CI green on integrated main. No concurrent production DDL, activation or deployment. **File ownership:** Approval records, tested pricing fixtures/approved Rand activation, staging smoke/security/a11y/privacy/retention results and production deployment evidence; edit only files explicitly approved for launch. **Minimal tools:** `git`, full Bun check/test/build, Playwright, Wrangler staging/production release, Supabase migration/advisors on verified Goat targets, independent CI and manual review. **Exit/STOP:** Signed pricing/thresholds/contact/privacy/consent, exact SHA and data-plane/env identity, all acceptance gates passed. STOP on any missing approval, stale CI, high-risk auth/PII bug or unverified production target. |
