# Goat Accounting Estimator — Technical Specification

**Document:** GOAT_ACCOUNTING_ESTIMATOR_TECH_SPEC_v0.1.0.md<br>
**Version:** 0.1.0<br>
**Status:** Design draft for sign-off<br>
**Date:** 2026-11-03<br>
**Repository:** `JCSchoeman96/goat_accounting`<br>
**Accepted architecture:** Approach B — current SvelteKit on Cloudflare Workers, Supabase for Postgres/Auth, Resend for email, Cloudflare Turnstile for public PII submissions.

---

## 1. Repository baseline reviewed

The current `main` baseline reviewed for this spec is commit:

`6b07d4b7340cf833aa14cfc356efa32e1988a48a` — **Add risk appetite calculator**

Relevant current characteristics:

- Svelte 5 application;
- SvelteKit 2.50.2 at time of review;
- `@sveltejs/adapter-cloudflare` 7.2.6;
- Tailwind CSS 4;
- Bun package manager;
- Zod;
- `@supabase/supabase-js` already installed;
- existing Supabase lead persistence adapter;
- existing Resend email adapter;
- existing `/tools/risk-appetite` calculator;
- current Cloudflare configuration is adapter-based but no repository `wrangler.toml` was found;
- current `AGENTS.md` incorrectly says the project has no Postgres database and must use KV only;
- current code still models Cloudflare environment access through `event.platform.env` / manually declared `App.Platform` bindings.

These baseline facts are migration inputs, not target architecture.

---

## 2. Target architecture

```text
Browser
  |
  | HTTPS
  v
Cloudflare Worker / SvelteKit 3
  |
  |-- static Svelte assets
  |-- public estimator routes
  |-- server calculation endpoints/actions
  |-- admin SSR/routes
  |-- PDF endpoint
  |-- Turnstile verification
  |
  +--> Supabase Auth
  +--> Supabase Postgres
  +--> Resend API
  +--> GA4/GTM (client-side non-PII events only)
```

No separate custom Node server is introduced.

---

## 3. Target runtime/tooling decisions

### 3.1 Application framework

Target:

- Svelte 5
- **SvelteKit 3**
- TypeScript
- Tailwind CSS 4
- Zod for external/input/domain-schema validation
- Bun retained as package manager unless migration testing proves a blocker

### 3.2 Cloudflare

Target deployment:

- Cloudflare Workers with static assets;
- official `@sveltejs/adapter-cloudflare` compatible with SvelteKit 3;
- Wrangler 4 current stable at implementation time;
- `wrangler.toml` as the repository source of truth, because this is an explicit project choice.

Cloudflare currently recommends JSONC for new Wrangler projects, but TOML remains supported. The project intentionally chooses TOML and must monitor any future feature that becomes JSONC-only.

### 3.3 Supabase

Target:

- dedicated Goat Accounting Supabase project/environment;
- Postgres for persistent application data;
- Supabase Auth for staff/admin authentication;
- publishable key for browser/authenticated-user clients;
- secret key for tightly controlled server-only operations;
- RLS on all exposed-schema application tables.

Legacy `anon` and `service_role` key naming must not be introduced into new estimator code. Existing integration must be migrated to the 2026 publishable/secret key model.

### 3.4 Email

- Resend retained.
- Existing mail adapter concepts may be reused/refactored.
- Estimator email templates become separate domain-specific templates rather than overloading booking mail.

### 3.5 Bot protection

- Cloudflare Turnstile on public requests that submit PII or request email/contact action.
- Server-side Siteverify validation is mandatory.
- Do not place Turnstile friction on every calculator question.

### 3.6 PDF

V1 target:

- server-side deterministic PDF generation from saved estimate snapshot;
- use `pdf-lib` or an API-compatible maintained fork only after a Worker-compatibility spike passes;
- no headless-browser dependency in V1;
- PDF renderer behind an internal adapter/interface so the implementation can be replaced without changing estimate domain logic.

Reason: V1 PDF is a controlled one/two-page report and does not require arbitrary HTML-to-PDF fidelity.

---

## 4. Required SvelteKit 2 -> 3 migration

This is a real migration, not a dependency-only bump.

### 4.1 Configuration location

SvelteKit 3 no longer uses the pre-v3 `svelte.config.js` configuration pattern. The target configuration should live in `vite.config.ts` using the current SvelteKit Vite plugin configuration.

Current repository state:

- `svelte.config.js` contains adapter setup;
- `vite.config.js` contains Tailwind + SvelteKit plugin only.

Target:

- merge/migrate SvelteKit/adapter configuration into typed `vite.config.ts`;
- remove obsolete SvelteKit configuration once migration passes.

### 4.2 Cloudflare bindings/runtime access

SvelteKit 3 adapter-cloudflare no longer exposes Cloudflare-specific APIs through the old `platform` pattern for core Worker runtime APIs.

Target server-only code should use current Cloudflare Worker imports, for example conceptually:

```ts
import { env, waitUntil } from 'cloudflare:workers';
```

Do not expand the current manually maintained `App.Platform.env` declaration pattern.

### 4.3 Generated Worker types

Use Wrangler type generation:

```bash
wrangler types
```

and commit/reference the generated Worker environment types according to the chosen Wrangler/SvelteKit workflow.

The build/CI must fail when binding types are stale where supported.

---

## 5. Wrangler configuration policy

`wrangler.toml` becomes authoritative for deploy-time non-secret Worker configuration.

Conceptual target:

```toml
name = "goat-accounting"
main = ".svelte-kit/cloudflare/_worker.js"
compatibility_date = "<pinned implementation date>"
compatibility_flags = ["nodejs_compat"]
upload_source_maps = true

[assets]
directory = ".svelte-kit/cloudflare"

[observability]
enabled = true

[observability.issues]
enabled = true
```

The exact generated `main`/asset output paths must be verified against the SvelteKit 3 adapter output during migration and then locked by tests/CI; do not cargo-cult paths from documentation examples.

### 5.1 Secrets

Never commit secrets to TOML.

Server secrets include:

- `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`

Non-secret environment/config may include:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `ADVISOR_EMAIL`
- approved site/contact configuration where not stored in DB.

### 5.2 Environments

Required logical environments:

- local development;
- staging/preview;
- production.

Production data must not be used as a convenient development database.

A dedicated Goat Supabase target must be confirmed before any migration is applied. The Supabase project visible during discovery contained unrelated service/pricing data and must not be assumed to be Goat Accounting.

---

## 6. Proposed source layout

Conceptual target; exact names may be adapted to existing conventions:

```text
src/
  lib/
    domain/
      estimator/
        questions.ts
        answer-schema.ts
        pricing-model.ts
        pricing-engine.ts
        pricing-engine.test.ts
        confidence.ts
        review-flags.ts
        estimate.ts
      leads/
        lead.ts
        lifecycle.ts
      notifications/
        notification.ts
    server/
      supabase/
        admin-client.ts
        user-client.ts
        repositories/
          estimates.ts
          pricing.ts
          leads.ts
      estimator/
        create-estimate.ts
      pdf/
        estimate-pdf.ts
      email/
        estimate-mailer.ts
      turnstile/
        verify.ts
    components/
      estimator/
      admin/

  routes/
    (marketing)/
      estimate/
        +page.svelte
        +page.server.ts or server endpoints/actions as designed
    estimate/
      [publicRef]/
        ...
    admin/
      +layout.server.ts
      +layout.svelte
      estimates/
      pricing/
      leads/
      login/
    api/
      estimates/
      leads/
      pdf/
```

The calculation engine must remain a pure domain module with no direct Svelte, database or HTTP dependency.

---

## 7. Domain boundaries

### 7.1 Estimator domain

Owns:

- question/answer contract;
- branch decisions;
- pricing-model contract;
- deterministic calculation;
- line-item generation;
- estimate ranges;
- confidence;
- manual-review reasons;
- estimate invariants.

### 7.2 Lead domain

Owns:

- contact data contract;
- contact consent;
- lead lifecycle;
- lead events.

### 7.3 Pricing administration domain

Owns:

- draft creation;
- draft validation;
- activation;
- retirement;
- pricing audit metadata.

### 7.4 Notification domain

Owns:

- notification type;
- delivery state;
- provider result;
- retry state.

### 7.5 PDF domain/adapter

Owns presentation of an already-calculated estimate; it does **not** own pricing logic.

---

## 8. Pricing engine contract

### 8.1 Determinism

For a given:

- validated answer set;
- pricing model version;
- engine version;

the calculation must produce the same:

- line items;
- min amount;
- max amount;
- confidence category;
- review flags.

### 8.2 Money representation

Do not use JavaScript floating point for money.

Store/calculate ZAR in integer cents (`*_cents`) or another integer minor-unit representation.

Display formatting happens only at presentation boundaries.

### 8.3 Output shape

Conceptual result:

```ts
interface EstimateCalculation {
  engineVersion: string;
  pricingModelId: string;
  pricingModelVersion: string;
  catchup: {
    minCents: number;
    maxCents: number;
    lineItems: EstimateLineItem[];
  };
  ongoing: {
    minCents: number;
    maxCents: number;
    lineItems: EstimateLineItem[];
  };
  confidence: 'high' | 'good' | 'preliminary';
  confidenceReasons: string[];
  manualReviewRequired: boolean;
  reviewReasons: string[];
}
```

### 8.4 Line item contract

Each line item records at minimum:

- stable rule/component code;
- customer/admin label;
- category: catch-up or ongoing;
- min cents;
- max cents;
- unit/quantity where relevant;
- source answer(s);
- explanation suitable for admin audit;
- pricing-model rule reference.

### 8.5 Explicit workload model

V1 rule types should be constrained and typed, e.g.:

- `FIXED_RANGE`
- `BAND_RANGE`
- `PER_UNIT_RANGE`
- `PER_PERIOD_RANGE`
- `SERVICE_ADDON_RANGE`
- `COMPLEXITY_SCORE`
- `CONFIDENCE_WEIGHT`
- `REVIEW_TRIGGER`

No database rule may execute arbitrary JavaScript/SQL/expression code.

### 8.6 No generic price multipliers by default

The engine should model record cleanup, VAT catch-up, payroll catch-up, etc. as explicit line items rather than broad opaque multipliers.

If a future multiplier is introduced it requires:

- named business justification;
- bounded values;
- explicit admin label;
- unit tests;
- product-spec amendment if customer-facing behaviour changes materially.

---

## 9. Pricing data model

The target model should be data-driven enough for commercial adjustment but not a generic no-code programming system.

### 9.1 `pricing_models`

Fields conceptually:

- `id uuid primary key`
- `version text not null unique`
- `name text not null`
- `state pricing_model_state not null`
- `engine_contract_version text not null`
- `created_at timestamptz not null`
- `created_by uuid not null`
- `activated_at timestamptz null`
- `activated_by uuid null`
- `retired_at timestamptz null`
- `retired_by uuid null`
- `notes text null`
- `checksum text not null`

Constraints/invariants:

- one and only one ACTIVE model in production;
- ACTIVE/RETIRED immutable via database/application enforcement;
- SemVer format validated application-side and preferably DB-side where practical.

### 9.2 `pricing_rules`

Fields conceptually:

- `id uuid primary key`
- `pricing_model_id uuid not null`
- `code text not null`
- `label text not null`
- `scope text not null` (`business`, `personal`, `shared`)
- `category text not null` (`catchup`, `ongoing`, `score`, `review`)
- `rule_type text not null`
- `input_key text null`
- `conditions jsonb not null default '{}'`
- `parameters jsonb not null`
- `enabled boolean not null`
- `sort_order integer not null`
- timestamps

Unique:

- `(pricing_model_id, code)`

`conditions` and `parameters` are validated against a Zod discriminated union by `rule_type` before a draft can activate.

### 9.3 Why JSONB is constrained here

JSONB is used for compact typed rule parameters, not as an excuse to avoid a domain model. The application owns the allowed rule schemas and rejects unknown/unvalidated structures.

---

## 10. Estimate persistence model

### 10.1 `estimates`

Fields conceptually:

- `id uuid primary key`
- `public_ref text unique not null`
- `calculator_type text not null` (`business`, `personal`, `both`)
- `state estimate_state not null`
- `pricing_model_id uuid not null`
- `pricing_model_version text not null`
- `engine_version text not null`
- `answers_snapshot jsonb not null`
- `calculation_snapshot jsonb not null`
- `catchup_min_cents bigint not null default 0`
- `catchup_max_cents bigint not null default 0`
- `ongoing_min_cents bigint not null default 0`
- `ongoing_max_cents bigint not null default 0`
- `confidence text not null`
- `manual_review_required boolean not null`
- `review_reasons jsonb not null default '[]'`
- `free_text text null`
- `supersedes_estimate_id uuid null`
- `void_reason text null`
- `voided_by uuid null`
- `voided_at timestamptz null`
- `created_at timestamptz not null`

Optional denormalised query fields may be added for high-value admin filters, but `answers_snapshot` and `calculation_snapshot` remain authoritative for historical reconstruction.

### 10.2 `estimate_line_items`

Fields conceptually:

- `id uuid primary key`
- `estimate_id uuid not null`
- `rule_code text not null`
- `label text not null`
- `category text not null`
- `min_cents bigint not null`
- `max_cents bigint not null`
- `quantity numeric/text representation as appropriate`
- `unit text null`
- `explanation text null`
- `sort_order integer not null`

Line items are written once with the estimate snapshot and are immutable.

### 10.3 Public references

Do not expose raw sequential database identifiers.

Use a non-guessable public reference/token for public estimate retrieval, with sufficient entropy and no PII encoded in it.

Public retrieval must return only the intentionally public estimate view, never admin fields.

---

## 11. Lead persistence model

### 11.1 `leads`

Fields conceptually:

- `id uuid primary key`
- `estimate_id uuid not null`
- `state lead_state not null`
- `full_name text not null`
- `email text not null`
- `phone text null`
- `business_name text null`
- `preferred_contact_method text null`
- `contact_consent_at timestamptz not null`
- `marketing_consent_at timestamptz null` only if marketing opt-in is later added
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Recommended invariant for V1:

- one primary lead record per estimate; subsequent contact events belong to lead history.

### 11.2 `lead_events`

Fields:

- `id`
- `lead_id`
- `from_state`
- `to_state`
- `actor_user_id`
- `reason_code`
- `note`
- `created_at`

Append-only.

---

## 12. Notification model

### `notification_deliveries`

Fields conceptually:

- `id`
- `estimate_id nullable`
- `lead_id nullable`
- `type` (`internal_lead`, `customer_estimate`, etc.)
- `state`
- `provider` (`resend`)
- `provider_message_id null`
- `recipient_hash_or_masked_metadata` rather than unnecessary duplicate cleartext where possible
- `attempt_count`
- `last_error_code null`
- `last_error_safe_message null`
- `created_at`
- `last_attempt_at`
- `sent_at null`

Do not store provider secrets or raw verbose provider responses containing unnecessary PII.

---

## 13. Admin/auth model

### 13.1 Supabase Auth

Admin users authenticate through Supabase Auth.

Target sign-in:

- email + password;
- TOTP MFA required for authorised admin access (AAL2);
- no public self-registration.

### 13.2 Staff authorisation

Use an application table such as `staff_users` / `admin_users` linked to `auth.users.id`.

Do not use editable `user_metadata` for authorisation.

Conceptual fields:

- `user_id uuid primary key references auth.users`
- `role text not null`
- `state text not null`
- timestamps

Initial roles can remain small:

- `admin`
- `advisor`
- `viewer`

Avoid prematurely building a complex RBAC system.

### 13.3 Staff-user lifecycle

States:

- `INVITED`
- `ACTIVE`
- `SUSPENDED`
- `DEACTIVATED`

Transitions:

- `INVITED -> ACTIVE` after successful account/MFA setup;
- `ACTIVE -> SUSPENDED` admin/security action;
- `SUSPENDED -> ACTIVE` authorised reactivation;
- `ACTIVE|SUSPENDED|INVITED -> DEACTIVATED` authorised removal.

Terminal:

- `DEACTIVATED`.

Guards:

- only authorised admin can change another user’s staff state;
- protected last-admin invariant should prevent removing all administrators.

---

## 14. RLS/security model

### 14.1 General

Enable RLS on every estimator application table in an exposed schema.

### 14.2 Public calculator

The public browser should **not** directly insert authoritative estimates into Supabase using a public key.

Flow:

1. browser submits validated-shaped payload to SvelteKit server endpoint/action;
2. server validates with Zod;
3. server resolves active pricing model;
4. server calculates estimate;
5. server persists authoritative snapshot using server-only database access;
6. server returns a sanitised public result.

This prevents clients from forging totals/pricing-model references.

### 14.3 Admin

Admin SSR/routes use authenticated Supabase session/JWT and RLS wherever practical.

Sensitive mutations such as pricing activation should additionally be checked in the server/domain layer even when RLS permits the row operation.

### 14.4 Secret key

`SUPABASE_SECRET_KEY` bypasses RLS and must:

- exist only in server/Worker secret environment;
- never be prefixed/publicly exposed;
- never be bundled into client code;
- only be used by narrow server-only repository/adaptor code.

---

## 15. Supabase Data API exposure

As of late 2026, newly created tables are not automatically exposed to Data/GraphQL APIs by default in Supabase.

The implementation must deliberately decide which schemas/tables need Data API exposure.

Preferred posture:

- public estimator writes occur through the Worker server;
- internal tables are not exposed more broadly than required;
- RLS is defense in depth, not a substitute for explicit exposure decisions.

---

## 16. Public estimate creation API contract

Conceptual endpoint/action:

`POST /api/estimates`

Request:

```json
{
  "calculatorType": "business",
  "answers": {},
  "freeText": "optional"
}
```

Server steps:

1. enforce body-size limit;
2. parse JSON/form payload;
3. Zod validate;
4. normalise canonical answer codes;
5. load exactly one ACTIVE pricing model;
6. validate pricing model against engine contract;
7. calculate pure-domain result;
8. create estimate snapshot + line items transactionally;
9. return public result/reference.

Response contains no pricing-rule internals that would expose unnecessary proprietary detail.

No contact details are required here.

---

## 17. Contact submission API contract

Conceptual endpoint/action:

`POST /api/estimates/:publicRef/contact`

Request includes:

- contact data;
- consent;
- requested action(s);
- Turnstile token.

Server flow:

1. rate-limit/basic abuse checks;
2. server-side Turnstile Siteverify;
3. validate contact payload;
4. resolve valid/superseded public estimate according to policy;
5. create lead transactionally;
6. create notification-delivery records;
7. send/queue customer/internal messages;
8. return success even if a non-critical email send fails after the lead is safely persisted, with safe user messaging.

Turnstile tokens are single-use and short-lived; never cache them as reusable authentication.

---

## 18. PDF endpoint

Conceptual:

`GET /api/estimates/:publicRef/pdf`

Rules:

- resolve estimate snapshot;
- do not rerun pricing engine;
- generate PDF from stored result/answers;
- omit internal-only admin notes/rule metadata;
- correct content type and download filename;
- cache policy must not leak personalised PDFs through shared/public caches.

If contact details are included in the PDF, access to that PDF must use a sufficiently unguessable public reference and appropriate cache headers.

---

## 19. Pricing activation transaction

Activation is an authority-sensitive operation.

Required transaction semantics:

1. lock/serialise active-model selection as needed;
2. confirm target model is `DRAFT`;
3. validate full rule set and mandatory rule coverage;
4. execute pricing test corpus;
5. compute/store checksum;
6. transition current `ACTIVE` -> `RETIRED`;
7. transition target `DRAFT` -> `ACTIVE`;
8. commit as one atomic transaction.

If any step fails, no model state changes persist.

There must never be a normal committed state with zero or multiple active pricing models.

Database constraints/partial unique index should enforce this invariant in addition to application logic.

---

## 20. Pricing test corpus

Before activation, run deterministic scenario fixtures, for example:

- simple current sole proprietor;
- current small Pty Ltd with VAT;
- current SME with 10 employees;
- six months behind with clean records;
- 18 months behind with incomplete records;
- ecommerce + multiple gateways;
- multiple entities;
- personal salaried taxpayer;
- rental + provisional tax;
- high-risk SARS dispute/manual review;
- unknown transaction volume;
- extreme/high-volume boundary case.

Each fixture asserts:

- expected triggered rule codes;
- expected range bounds;
- expected confidence;
- expected manual-review state.

A pricing draft cannot activate when the corpus fails.

---

## 21. Estimate engine versioning

Pricing data and calculation code are separate versioned authorities.

Each estimate stores:

- pricing-model version;
- engine version.

If calculation semantics change in code, increment the engine contract/version even if prices do not change.

Historical estimates must remain interpretable without rerunning current code.

---

## 22. Server-side validation

Use Zod at every external boundary:

- estimate input;
- contact input;
- admin pricing edits;
- pricing activation;
- provider response parsing where useful.

Do not trust:

- disabled fields;
- client-computed totals;
- client-provided pricing-model IDs;
- hidden inputs;
- public-ref-to-internal-ID mapping supplied by browser;
- free text.

Client validation exists for UX only; server validation is authoritative.

---

## 23. Rate limiting / abuse

V1 must protect public mutation endpoints.

Minimum controls:

- Turnstile on PII/contact/email actions;
- Cloudflare/WAF rate limiting or Worker-side rate limiting where available/configured;
- payload/body-size limits;
- email-action throttling per estimate/reference;
- no unlimited PDF generation loops if rendering becomes expensive;
- safe handling of repeated submissions/idempotency.

The estimator itself can remain low-friction; protect expensive or abusive side effects rather than every click.

---

## 24. Idempotency

### Estimate creation

A deliberate retake may create a new estimate; an accidental network retry should not necessarily create duplicates.

Use a client-generated idempotency key per completion attempt or equivalent server strategy.

### Lead submission

Use a request/idempotency token so double-click/network retry does not create duplicate leads or multiple customer emails.

### Pricing activation

Activation request must be safe against double submission and guarded by target-state checks/transactional locking.

---

## 25. Email delivery semantics

Database truth wins over provider availability.

For a contact request:

1. persist lead;
2. persist notification intent/state;
3. attempt email;
4. update notification state.

Do not design a flow where a temporary Resend failure causes loss of the lead.

V1 can use direct Worker async/background execution where safe, but durable delivery semantics must be represented in the database. If operational evidence shows retries need stronger guarantees, move notification execution to Cloudflare Queues in a later version without changing the domain contract.

---

## 26. PDF generation semantics

PDF rendering receives a read-only `EstimateDocumentModel` generated from the saved snapshot.

The renderer must not:

- query the active pricing model;
- call the calculation engine;
- mutate estimate data;
- include hidden admin notes;
- include raw free text without escaping/layout bounds.

PDF tests should validate:

- generation succeeds for minimum/maximum-length supported content;
- currency values exactly match estimate snapshot;
- correct estimate reference/version;
- no line overlaps/truncation in standard fixtures;
- output is a valid PDF.

---

## 27. Observability

Cloudflare Worker observability should be enabled.

Log structured events such as:

- request correlation ID;
- route/action;
- safe domain event name;
- estimate internal ID only where safe in server logs;
- pricing-model version;
- engine version;
- success/failure code;
- provider latency/error code;
- manual-review boolean.

Never log:

- Supabase secret keys;
- Resend keys;
- Turnstile secret;
- passwords/MFA tokens;
- full free-text notes;
- full tax/accounting answers by default;
- unnecessary email/phone values.

Production logs should use a deliberate sampling/retention policy.

---

## 28. Analytics separation

Operational logs and marketing analytics are separate concerns.

GA4/GTM receives coarse non-PII funnel events only.

Supabase/admin database remains the source for actual estimate/lead business reporting.

Do not send detailed customer financial state to GA4 as custom dimensions.

---

## 29. Data retention/deletion

Retention periods are a business/legal decision still awaiting Goat approval, but the architecture must support deletion/anonymisation workflows.

At minimum, records need timestamps sufficient to support policies for:

- anonymous estimates with no contact lead;
- unsuccessful leads;
- closed-not-a-fit leads;
- successful clients whose accounting records move into other systems.

Avoid designing immutable audit requirements in a way that makes legally required deletion impossible. Where audit history must be retained, permit PII anonymisation while preserving commercial/calculation metadata when lawful.

---

## 30. Database migrations

All schema changes must be version-controlled as Supabase migrations.

Implementation workflow:

- establish dedicated Goat project/local target;
- create migrations through the current Supabase CLI workflow;
- run schema/security advisors after DDL changes;
- generate TypeScript database types;
- commit migrations and generated types according to repository policy;
- verify staging before production.

No ad-hoc production-only schema edits should become the canonical state.

---

## 31. RLS policy principles

Examples of intended policy posture:

- public/anon: no broad direct table read access to leads/pricing/admin data;
- authenticated admin: access only when linked staff record is active and required assurance level is satisfied;
- role-sensitive writes checked by staff role plus AAL2 where appropriate;
- pricing activation restricted to `admin`;
- viewer role read-only;
- advisor can manage leads but not activate pricing unless explicitly authorised.

Do not use `user_metadata` for these decisions.

---

## 32. Admin route guards

Every `/admin` server route/load/action must verify:

1. valid Supabase user/session;
2. staff record exists and is `ACTIVE`;
3. required role;
4. MFA assurance level `aal2` for protected admin operations;
5. target resource permission.

Client-side route hiding is not authorisation.

---

## 33. Existing code migration/refactor requirements

### 33.1 `AGENTS.md`

Must be updated before estimator implementation because the current rule “no Postgres / KV only” is false and conflicts with accepted architecture.

Target repo instructions should say, in substance:

- SvelteKit on Cloudflare Workers;
- Supabase is authoritative persistent relational storage/Auth;
- no new KV state unless a specifically justified cache/ephemeral use case exists;
- `wrangler.toml` is deployment-config authority;
- secrets never committed;
- estimator pricing logic is pure/domain-layer and versioned;
- migrations required for DB changes.

### 33.2 Legacy Supabase env names

Replace new usage of:

- `SUPABASE_SERVICE_ROLE_KEY`

with:

- `SUPABASE_SECRET_KEY`

and add publishable-key usage where required.

### 33.3 Existing lead adapter

Do not blindly extend the current generic `LeadSchema` because it is oriented to financial-planning consultation booking (`Retirement`, `Investments`, `Risk Cover`, `General`) and requires an appointment timestamp.

Estimator lead/contact needs its own domain contract.

### 33.4 Existing Resend adapter

Reuse infrastructure patterns, not the booking-specific data model. Estimator emails should have separate DTOs/templates.

### 33.5 Existing risk-appetite calculator

Reuse UI/design conventions selectively, but the new estimator should use a step-based full-page flow rather than rendering all questions in one long page.

---

## 34. Testing strategy

### 34.1 Unit tests

Mandatory for:

- pricing engine;
- each rule type;
- range aggregation;
- catch-up vs ongoing separation;
- confidence classification;
- review triggers;
- lifecycle transition guards;
- money arithmetic;
- canonicalisation of answers.

### 34.2 Property/boundary tests

Examples:

- min <= max always;
- no negative estimate totals;
- increasing a workload band cannot reduce price unless explicitly documented;
- active pricing model invariant;
- unknown answer handling never produces NaN/undefined money;
- line-item sum equals displayed totals.

### 34.3 Integration tests

- estimate save transaction;
- contact + Turnstile mocked validation;
- admin auth/RLS;
- pricing activation transaction;
- PDF generation;
- Resend adapter response handling;
- failed email does not lose lead.

### 34.4 End-to-end tests

At least:

- simple business flow;
- conditional catch-up flow;
- personal-tax flow;
- result-before-contact behaviour;
- contact conversion;
- admin login/MFA path where testable;
- pricing-draft edit/activation;
- historic estimate unchanged after new pricing activation;
- PDF values equal on-screen saved result.

---

## 35. CI/CD acceptance gates

Before deploy/merge of estimator changes:

- format/lint/check;
- SvelteKit type check;
- unit tests;
- pricing test corpus;
- migration validation;
- generated Supabase types current;
- Wrangler type generation/check current;
- production build;
- security tests/policy checks where automated;
- staging smoke test for DB/Auth/Turnstile/Resend integration.

Production migration/deployment order must be documented per release to avoid code/schema incompatibility.

---

## 36. Admin pricing UX constraints

The admin may edit values but cannot create arbitrary executable logic.

For each draft rule, the UI should expose only fields allowed by its typed rule schema, e.g.:

- label;
- enabled;
- amount min/max;
- band lower/upper bound;
- per-unit amount;
- confidence points;
- manual-review threshold.

Validation occurs client-side for convenience and server-side authoritatively.

---

## 37. Question-definition strategy

V1 does **not** store the entire public questionnaire as a generic CMS form-builder.

Question IDs, branching and allowed answer shapes live in typed application code.

Pricing values/weights live in data.

Reason:

- question logic is part of the tested product contract;
- arbitrary admin-created branching would require a second rules engine;
- it would weaken type safety and make pricing-version compatibility harder.

Future versions can externalise content/labels separately if a real operational need appears.

---

## 38. Cache policy

- marketing/static assets: normal Cloudflare caching.
- pricing model: may be cached briefly server-side/at Worker runtime only if activation invalidation/version safety is guaranteed; DB remains authority.
- public personalised estimate result/PDF: private/no shared-cache unless intentionally designed around anonymous immutable token access.
- admin pages/API: no public caching.

Do not use Cloudflare KV as the authoritative pricing or estimate store.

---

## 39. Security threat considerations

The implementation must explicitly test/mitigate:

- client tampering with calculated amounts;
- forged pricing-model IDs;
- direct admin URL access without auth;
- RLS bypass mistakes;
- leaked Supabase secret key;
- email flooding;
- Turnstile bypass/no server verification;
- predictable public estimate references;
- XSS via free text/name/company fields;
- PDF injection/layout abuse from free text;
- duplicate submissions;
- race during pricing activation;
- changing historic estimate through current pricing data;
- PII leakage in analytics/logs;
- privilege based on Supabase user-editable metadata.

---

## 40. Performance targets

Targets, subject to field validation:

- estimator step interaction: immediate client-side response;
- estimate server calculation excluding network: effectively negligible relative to DB call;
- typical estimate create response: target p95 < 1.5 s under normal external-service health;
- contact save must prioritise DB durability over waiting for secondary notification work;
- public JS payload should not balloon due to admin/PDF dependencies;
- admin code should be route-split.

PDF generation should not be imported into the public calculator’s client bundle.

---

## 41. Versioning and authority

Track separately:

- product spec version;
- tech spec version;
- pricing model version;
- pricing engine version;
- database migration history;
- deployed application git SHA.

An estimate should store enough authority metadata to answer:

> Which code/pricing rules produced this number?

without relying on mutable current state.

---

## 42. Implementation phases

This is a technical sequencing recommendation, not yet the detailed implementation plan.

### Phase 0 — Baseline/migration authority

- verify exact main;
- update stale repo instructions;
- migrate SvelteKit 2 -> 3;
- establish `wrangler.toml`;
- generate Worker types;
- confirm dedicated Goat Supabase project/environment;
- migrate Supabase API-key model;
- preserve existing site/risk calculator/booking behaviour.

### Phase 1 — Domain engine

- question contract;
- answer schemas;
- pricing rule schemas;
- deterministic engine;
- confidence/review logic;
- test corpus.

### Phase 2 — Database/security

- migrations;
- RLS;
- Supabase Auth admin model;
- generated DB types;
- repository adapters.

### Phase 3 — Public estimator

- step UI;
- branching;
- estimate create flow;
- result page;
- local recovery/accessibility.

### Phase 4 — Conversion

- contact capture;
- Turnstile;
- Resend internal/customer emails;
- PDF.

### Phase 5 — Admin

- admin auth/MFA;
- estimates/leads;
- lifecycle operations;
- pricing draft/test/activate UI;
- dashboard.

### Phase 6 — Calibration/launch hardening

- real pricing data;
- benchmark fixtures reviewed by Rossouw;
- staging scenarios;
- security/accessibility checks;
- monitoring;
- launch.

---

## 43. Technical acceptance criteria

Architecture is implementation-ready when:

1. SvelteKit 3 migration path is verified against the actual repo.
2. Current site builds/deploys through authoritative `wrangler.toml`.
3. Cloudflare runtime bindings use current SvelteKit 3/Worker APIs.
4. Dedicated Goat Supabase project/environment is confirmed.
5. New Supabase publishable/secret key model is in use.
6. Database migrations are version-controlled.
7. RLS/advisor checks pass.
8. Public browser cannot authoritatively set totals/pricing versions.
9. Pricing engine is pure and deterministically tested.
10. Pricing activation is atomic and preserves one ACTIVE model.
11. Completed estimates are immutable and version-linked.
12. Result/email/PDF agree because all read the same saved snapshot.
13. Free text cannot influence calculation.
14. Admin routes require active staff auth and MFA policy.
15. Turnstile is validated server-side on protected public actions.
16. Provider failures cannot lose persisted lead data.
17. No PII/detailed financial answers leak to GA4 or routine logs.
18. CI verifies types, tests, migrations, pricing corpus and build.

---

## 44. Authority references verified during design

Current official references consulted on 2026-11-03:

- SvelteKit 3 migration: https://svelte.dev/docs/kit/migrating-to-sveltekit-3
- SvelteKit adapters: https://svelte.dev/docs/kit/adapters
- Cloudflare SvelteKit Workers guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/sveltekit/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare static assets: https://developers.cloudflare.com/workers/static-assets/binding/
- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Supabase new API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase migration to publishable/secret keys: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- Supabase SSR auth: https://supabase.com/docs/guides/auth/server-side
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase breaking-change changelog: https://supabase.com/changelog?types=breaking-change

---

## 45. Decisions locked in v0.1.0

- One SvelteKit application, not a separate estimator service.
- Migrate to SvelteKit 3 before estimator implementation.
- Cloudflare Workers + static assets are the target runtime.
- `wrangler.toml` is the deployment config source of truth by project choice.
- Supabase is persistent DB + staff Auth authority.
- Use 2026 publishable/secret API keys, not new legacy `anon/service_role` usage.
- Public calculation is server-authoritative.
- Money uses integer minor units.
- Pricing rules are typed/data-driven and cannot execute arbitrary code.
- Active pricing models are immutable/versioned.
- Estimates are immutable snapshots with pricing + engine versions.
- Result, email and PDF consume saved snapshot, not recalculation.
- Resend retained for mail.
- Turnstile required for PII/contact/email side effects and validated server-side.
- Admin requires Supabase Auth plus TOTP MFA policy.
- RLS enabled for exposed application tables.
- Questionnaire logic remains typed in code in V1; amounts/weights are data-driven.
- KV is not authoritative storage for estimator data.

---

## 46. Pre-implementation blockers / decisions still requiring confirmation

These are intentionally explicit rather than hidden assumptions:

1. Identify/create the dedicated Goat Supabase production/staging target(s).
2. Confirm initial administrator email accounts.
3. Supply/approve initial pricing values and review thresholds.
4. Confirm exact Rossouw titles/contact details for PDF/email.
5. Confirm POPIA/privacy/retention wording and periods.
6. Run the SvelteKit 3 migration spike and verify all existing routes/integrations before feature work.
7. Run Worker-compatibility spike for chosen PDF library and lock exact package/version.

None of these changes the accepted high-level architecture.

---

## 47. Change control

This specification uses SemVer.

- Patch: clarification/implementation detail with no contract change.
- Minor: additive architecture/data/API capability compatible with existing contracts.
- Major: breaking authority, lifecycle, persistence, security or API contract change.

Accepted decisions must be amended/superseded explicitly; do not silently rewrite historical authority.
