# Goat Accounting Estimator — Product Specification

**Document:** GOAT_ACCOUNTING_ESTIMATOR_PRODUCT_SPEC_v0.1.0.md<br>
**Version:** 0.1.0<br>
**Status:** Design draft for sign-off<br>
**Date:** 2026-11-03<br>
**Product:** Goat Accounting Cost Estimator<br>
**Architecture decision:** Approach B accepted — modernise Goat to current SvelteKit + Cloudflare Workers, with Supabase persistence/auth and Resend email delivery.

---

## 1. Product intent

Goat Accounting will provide a public online estimator that gives prospective clients a credible indication of:

1. the **once-off cost to take over, repair and catch up** their accounting/tax position; and
2. the **ongoing monthly cost** once the client is current and operating normally.

The estimator is intended to remove the uncertainty that normally forces a prospect to contact an accounting firm before they have any idea of cost. It must differentiate Goat Accounting through useful transparency without pretending that a short web questionnaire can replace a professional review.

The estimator is therefore an **indicative estimate generator**, not a binding quote engine.

---

## 2. Primary product promise

> Tell us where your finances stand and we will give you a useful estimate of what it may cost to get everything back on track — and what ongoing accounting could cost once you are current.

The public experience must be simple enough to complete in a few minutes, while gathering enough information to create a commercially useful estimate.

---

## 3. Product goals

### 3.1 Customer goals

The estimator must let a prospective customer:

- understand likely accounting costs before speaking to the firm;
- separate historic/catch-up cost from future monthly cost;
- complete the assessment without knowing accounting terminology;
- select “I’m not sure” where they genuinely do not know an answer;
- receive an estimate without first surrendering personal contact details;
- optionally add information the structured questions did not cover;
- optionally request contact from Rossouw;
- optionally receive the estimate by email;
- download a branded PDF estimate;
- understand what major factors drove the result;
- understand when the case is too uncertain or risky for a reliable automated estimate.

### 3.2 Goat Accounting goals

The estimator must let Goat Accounting:

- convert website traffic into pre-qualified leads;
- collect structured workload information before first contact;
- separate catch-up opportunities from recurring revenue opportunities;
- review every completed estimate in a secured backend;
- change prices, bands and scoring weights without modifying application code;
- retain the exact pricing version and calculation used for every estimate;
- track lead lifecycle from new enquiry through outcome;
- send structured lead notifications to Rossouw/the firm;
- use estimator completion and conversion data to improve pricing accuracy over time.

---

## 4. Non-goals for V1

V1 is **not**:

- a legally binding quote;
- an engagement-letter generator;
- a full accounting CRM;
- a client portal;
- a document upload/review system;
- an automated SARS or CIPC integration;
- an AI system that interprets free text and changes the price;
- a generic drag-and-drop form builder;
- a fully user-configurable pricing-programming language;
- an online payment or checkout flow;
- a replacement for professional judgement in high-risk tax disputes, audits, objections or incomplete-record reconstructions.

These may be future capabilities, but V1 must not be distorted to accommodate them prematurely.

---

## 5. Target users

### 5.1 Business prospect

Examples:

- sole proprietor;
- Pty Ltd / CC;
- partnership;
- trust with business activity;
- non-profit entity;
- business with multiple related entities.

### 5.2 Personal-tax prospect

Examples:

- salaried taxpayer;
- provisional taxpayer;
- individual with rental property;
- individual with investments/capital gains;
- individual with trust distributions;
- individual with foreign income/assets;
- individual who is behind on tax submissions.

### 5.3 Combined prospect

A business owner may require both business accounting/tax and personal tax work. The product must support **Business + Personal** without mixing the pricing drivers of the two domains.

### 5.4 Internal staff user

An authorised Goat Accounting staff member who can:

- review estimates;
- manage leads;
- inspect calculation details;
- manage pricing-model drafts;
- activate a tested pricing model;
- download/regenerate PDFs;
- retry failed email delivery where supported;
- review estimator analytics.

---

## 6. Experience principles

1. **Distraction-free.** The estimator should feel like a focused product, not a long marketing page.
2. **One decision at a time.** Prefer one primary question per step/screen.
3. **Progressive disclosure.** Only ask conditional questions when the answer can materially affect price, confidence or review requirements.
4. **Plain language.** Avoid bookkeeping/accounting jargon where the prospect may not understand it.
5. **No false precision.** Show a price range, not an artificially exact amount.
6. **Result before lead capture.** The customer must see their estimate before being required to enter contact details.
7. **Explainability.** The result must say what major inputs drove it.
8. **Honest uncertainty.** “I’m not sure” is valid and should lower confidence or widen the range rather than block completion.
9. **No hidden AI pricing.** Structured answers alone drive the automated result.
10. **Mobile first and accessible.** The interaction must work comfortably on phones, keyboards and assistive technologies.

---

## 7. Public entry flow

### 7.1 Entry question

**What do you need help with?**

- Business accounting & tax
- Personal tax
- Both

This branching happens immediately because business and personal-tax workload drivers are materially different.

### 7.2 Business flow target

- **8 core questions**
- normally **2–4 conditional questions**
- target **<=15 questions** for all but exceptional cases

### 7.3 Personal flow target

- normally **5–8 questions**
- conditional questions only when complexity warrants them

### 7.4 Combined flow

Complete the business assessment, then a compact personal-tax module for the relevant individual(s).

---

## 8. Business estimator question contract

The exact wording may be refined during UI implementation, but the **information contract** below is locked for V1 unless formally amended.

### B1 — Entity type

**Question:** What type of business/entity is this?

Options:

- Sole proprietor
- Pty Ltd / Close Corporation
- Partnership
- Trust
- Non-profit / PBO / NPO
- Multiple entities
- Other / not sure

Conditional:

- if `multiple_entities`, ask approximate entity count.

Pricing purpose:

- base compliance structure;
- multi-entity workload;
- possible review flag.

### B2 — Books currency / backlog

**Question:** How up to date are your books/accounting records?

Options:

- Fully current and reconciled
- Less than 3 months behind
- 3–6 months behind
- 6–12 months behind
- 1–2 years behind
- More than 2 years behind
- I’m not sure

Conditional:

- if more than one financial year is involved, ask approximate financial years/months outstanding where needed.

Pricing purpose:

- historical bookkeeping periods;
- catch-up scope;
- annual-financial-statement periods;
- estimate confidence.

### B3 — Record condition

**Question:** What condition are the existing records in?

Options:

- Accounting software is current/reasonably clean
- Accounting software exists but needs correction/reconciliation
- Mainly organised spreadsheets
- Bank statements plus invoices/receipts
- Bank statements only
- Records are incomplete or messy
- I’m not sure

Conditional:

- if incomplete/messy or bank-statements-only and backlog exists, ask whether bank statements are available for the full period.

Pricing purpose:

- explicit cleanup/reconciliation workload;
- reconstruction/manual review flags;
- confidence.

**Important:** backlog duration and record condition remain separate variables. A long clean backlog and a short chaotic backlog are not equivalent.

### B4 — Monthly transaction volume

**Question:** Roughly how many transactions go through the business each month?

Helper text: Think bank transactions, card payments, customer receipts and supplier payments.

Options:

- Under 50
- 50–150
- 151–300
- 301–750
- More than 750
- I’m not sure

Pricing purpose:

- primary recurring bookkeeping workload;
- historical bookkeeping workload;
- confidence.

### B5 — Financial accounts to reconcile

**Question:** How many financial accounts need to be reconciled?

Helper text: Include bank accounts, business credit cards and payment accounts/gateways that require separate reconciliation.

Options:

- 1
- 2–3
- 4–6
- 7+
- I’m not sure

Pricing purpose:

- recurring reconciliation workload;
- historical reconciliation workload.

### B6 — Employees / payroll

**Question:** How many employees are on payroll?

Options:

- None
- 1–5
- 6–15
- 16–30
- 31+
- I’m not sure

Conditional examples:

- if employees > 0, ask whether payroll is monthly or weekly only if that materially changes Goat’s pricing;
- do not expose unnecessary payroll-detail questions if a simple band is sufficient.

Pricing purpose:

- recurring payroll cost;
- historical payroll-compliance scope if behind.

### B7 — Tax/compliance position

**Question:** Which best describes your current tax/compliance position?

Options:

- Everything is submitted/current
- Some submissions are outstanding
- Multiple periods/years are outstanding
- SARS has raised penalties, verification, audit or another issue
- I’m not sure

Conditional multi-select when not current:

- Company income tax
- Personal income tax
- VAT
- PAYE/payroll
- CIPC/company compliance
- Other

Additional conditional questions are permitted only when the count/status materially affects the estimate, for example number of VAT periods or financial years outstanding.

Pricing purpose:

- explicit remediation line items;
- professional-review flag;
- confidence.

### B8 — Ongoing services required

**Question:** What would you like Goat Accounting to handle going forward?

Multi-select:

- Monthly bookkeeping/accounting
- Bank reconciliations
- Payroll
- VAT
- Annual financial statements
- Company income tax
- Personal tax for owner/director
- CIPC/company compliance
- Monthly/quarterly management reporting
- Financial management/advisory

Pricing purpose:

- recurring service package composition;
- relevant follow-up questions.

---

## 9. Business complexity question

The estimator should generally use **one multi-select complexity step** instead of asking the user to classify their industry and then assuming complexity from that industry.

**Does your business involve any of the following?**

- Stock/inventory
- Ecommerce or payment gateways
- Imports/exports
- Foreign currencies
- Multiple branches
- Multiple companies/entities
- Construction/project accounting
- Rental properties/property portfolio
- Trust structures
- Manufacturing
- None of these
- I’m not sure

Conditional follow-ups may be used when material, for example:

- multiple entities → how many entities;
- ecommerce → approximate number of payment platforms/channels;
- inventory → whether inventory is already maintained in a system;
- multiple branches → branch count band.

Complexity selections can:

- add explicit priced workload components;
- add complexity points;
- lower confidence;
- trigger manual review.

They must not simply apply an opaque “industry multiplier”.

---

## 10. Urgency

Urgency is useful operational information but must not automatically change price unless Goat Accounting deliberately configures and publishes a rush-fee policy.

Options:

- No urgent deadline
- Within 3 months
- Within 30 days
- Within 14 days
- Urgent / deadline already missed

Urgency can:

- create a priority/manual-review flag;
- influence lead prioritisation;
- optionally activate a configured rush fee in a future version.

V1 default: **no automatic urgency multiplier**.

---

## 11. Personal-tax estimator contract

Personal tax is a separate pricing branch.

### P1 — Current status

Options:

- Current
- One tax year outstanding
- Multiple tax years outstanding
- SARS issue/verification/audit/penalties
- I’m not sure

### P2 — Income/activity sources

Multi-select:

- Salary/remuneration
- Sole-proprietor/business income
- Rental property
- Investments/dividends/interest
- Capital gains/disposals
- Provisional tax
- Trust distributions
- Foreign income/assets
- Cryptocurrency/digital assets
- Other

### P3 — Complexity count

Ask only the minimum follow-up required for selected complexity, for example:

- number of rental properties band;
- foreign income yes/no;
- whether capital gains transactions occurred;
- number of outstanding years.

### P4 — SARS position

- Normal filing only
- Verification/query
- Audit
- Objection/appeal likely
- Tax debt/payment arrangement
- Not sure

High-risk items should trigger professional review rather than false automation.

### P5 — Ongoing requirement

- Annual personal tax return
- Provisional tax
- Tax planning
- SARS correspondence
- Dispute/objection support

---

## 12. Free-text information

At the end of the structured calculator, show:

**Anything else you’d like us to know?**

- optional textarea;
- recommended limit: 2,000 characters;
- clearly state that the text **does not change the automatic estimate**;
- saved with the estimate/lead for Rossouw to read;
- sanitised/escaped at output boundaries;
- never executed, parsed as instructions or fed into an automated price adjustment.

Suggested helper copy:

> Optional — this won’t change your automatic estimate, but Rossouw can take it into account when reviewing your enquiry.

---

## 13. Pricing output contract

Every completed automated calculation must produce separate ranges.

### 13.1 Catch-up / takeover

Example:

**Getting you up to date**<br>
Estimated once-off cost: **R18,000 – R24,000**

Potential breakdown:

- historic bookkeeping/reconstruction;
- additional reconciliations;
- outstanding VAT periods;
- outstanding payroll periods;
- annual financial statements;
- company/personal returns;
- setup/migration/onboarding;
- explicit specialist/remediation items.

### 13.2 Ongoing

Example:

**Once everything is current**<br>
Estimated ongoing cost: **R3,400 – R4,100/month**

Potential breakdown:

- bookkeeping/accounting;
- account reconciliations;
- payroll;
- VAT;
- tax compliance;
- annual financial statements allocation where pricing model includes it;
- CIPC/company secretarial scope;
- reporting/advisory.

### 13.3 No false precision

The public product must not display cents or a single exact price that implies certainty the input data cannot support.

---

## 14. Estimate confidence

The product must classify confidence using **rule-based labels**, not pretend to produce a statistically precise probability.

Suggested labels:

- **High** — critical workload drivers known and records/compliance are reasonably clear.
- **Good** — enough information for a useful estimate; some uncertainty remains.
- **Preliminary** — one or more major pricing drivers are unknown or high-risk review flags exist.

Confidence inputs can include:

- unknown transaction volume;
- unknown backlog duration;
- incomplete records;
- unknown account count;
- tax dispute/audit;
- multiple entities without confirmed count;
- major reconstruction flags.

A preliminary estimate may still be shown, but with a wider rule-driven range or explicit review notice.

---

## 15. Manual review rules

The automated calculator must flag cases where professional review is required before a fixed quote can be given.

Examples:

- SARS audit or objection/appeal;
- tax debt/payment arrangements;
- multiple years with incomplete records;
- unreliable opening balances;
- unknown transaction volume plus major backlog;
- large/complex entity groups;
- complex trust structures;
- large payroll not covered by configured bands;
- transaction/account volumes beyond configured maximums;
- explicit “other” complexity that cannot be priced safely.

The result may still show an indicative range if the pricing model permits it, but must say the once-off work requires review before confirmation.

---

## 16. Result page

The result screen must include:

- catch-up estimate range;
- ongoing monthly estimate range;
- estimate confidence;
- major factors driving the estimate;
- likely services included;
- any manual-review warning;
- disclaimer that it is indicative, not a final quote;
- CTA to contact Rossouw;
- CTA to email/save the estimate;
- CTA to download PDF;
- CTA to retake/recalculate.

### 16.1 Result-before-contact rule

Contact information must **not** be required to reveal the estimate.

This rule is a deliberate product differentiator and should not be removed without a product-spec amendment.

---

## 17. Contact / upsell flow

After the estimate is visible, offer:

### Want Rossouw to review your estimate?

Capture:

- full name;
- email;
- mobile/phone;
- company/business name where relevant;
- preferred contact method;
- consent to be contacted;
- optional free-text note already entered.

Actions:

- **Email me my estimate**
- **Ask Rossouw to contact me**
- **Book/talk to Rossouw** (can link into the existing Goat booking flow)

The product may combine email-delivery and contact-request actions in one form, but consent choices must remain explicit.

---

## 18. PDF estimate

V1 includes a branded downloadable PDF generated from the **saved immutable estimate snapshot**.

The PDF should contain:

- Goat Accounting branding;
- estimate reference;
- date generated;
- customer/company name if supplied;
- catch-up range;
- recurring monthly range;
- key assumptions/input summary;
- included/likely services;
- confidence/manual-review note;
- disclaimer;
- Rossouw’s current approved contact details;
- approved professional descriptor, currently intended as:
  - Tax Consultant
  - Financial Accountant
  - Financial Planner

Exact professional-title wording must be confirmed before production launch.

The PDF must never silently recalculate using a newer pricing model.

---

## 19. Email behaviour

### 19.1 Internal notification

When a prospect requests contact, Goat Accounting receives an email containing:

- prospect contact details;
- estimate reference;
- catch-up range;
- ongoing range;
- confidence;
- important risk/complexity flags;
- structured-answer summary;
- free-text note;
- direct link to the secured admin estimate detail screen.

### 19.2 Customer email

When requested, the prospect receives:

- estimate summary;
- estimate reference;
- Rossouw/Goat contact details;
- CTA to continue/contact/book;
- PDF attachment or secure download link.

A failed email must not delete or invalidate an already-saved estimate/lead.

---

## 20. Admin product surface

### 20.1 Dashboard

At minimum:

- completed estimates today / selected period;
- contact-request conversion;
- new leads;
- catch-up opportunity value range;
- recurring opportunity range;
- manual-review queue;
- failed notification count.

### 20.2 Estimates list

Search/filter by:

- date;
- estimate reference;
- name/company if supplied;
- calculator type;
- catch-up range;
- ongoing range;
- confidence;
- manual-review flag;
- lead status.

### 20.3 Estimate detail

Must show:

- immutable estimate result;
- pricing-model version;
- all structured answers;
- free-text note;
- calculation line items;
- confidence/review reasons;
- linked lead/contact data;
- notification status;
- PDF action;
- lead-status controls where authorised.

### 20.4 Pricing administration

Authorised users can:

- create a new pricing-model draft by cloning the active model;
- edit allowed amounts, bands, thresholds and weights in the draft;
- preview/test the draft against known scenarios;
- activate a validated draft;
- retire the previous active version automatically;
- inspect historic versions.

Authorised users **cannot edit an active or retired model in place**.

---

## 21. Pricing philosophy

V1 pricing must favour **explicit workload components** over opaque global multipliers.

Preferred examples:

- transaction-volume band amount;
- financial-account band amount;
- employee/payroll band amount;
- historic bookkeeping amount per month/period;
- explicit cleanup amount per historic period by record-condition band;
- VAT catch-up per outstanding period;
- payroll catch-up per outstanding period;
- annual financial statements per year;
- company/personal return per outstanding year;
- explicit ecommerce/inventory/multi-entity workload component;
- explicit advisory/reporting add-on.

Avoid:

- “construction × 1.6”;
- “messy books × 1.35”;
- arbitrary final-price multipliers that are difficult to explain.

Weights are permitted for:

- complexity score;
- confidence score/category;
- manual-review thresholds;
- range-width policy;

but should not become an unexplainable substitute for real priced work.

---

## 22. Pricing model lifecycle

### States

- `DRAFT`
- `ACTIVE`
- `RETIRED`

### Transitions

#### `DRAFT -> ACTIVE`

Guards:

- user is authorised;
- schema/rule validation passes;
- mandatory pricing keys exist;
- test scenarios pass;
- no other activation transaction is in progress.

Side effects:

- active timestamp recorded;
- activating user recorded;
- previously active model transitions to `RETIRED` in the same database transaction;
- configuration checksum/version persisted;
- new public estimates immediately use the new active model.

#### `ACTIVE -> RETIRED`

Only as part of successful activation of a replacement model, except explicit emergency retirement policy if later added.

Side effects:

- retired timestamp recorded;
- historical estimates remain linked to this model.

### Terminal state

`RETIRED` is terminal and immutable.

### Invariants

- exactly one `ACTIVE` pricing model in production;
- `ACTIVE` and `RETIRED` models are immutable;
- completed estimates never change when a new pricing model becomes active.

---

## 23. Calculator session lifecycle

This is a transient client/session concept in V1.

### States

- `NOT_STARTED`
- `IN_PROGRESS`
- `COMPLETED`
- `CONTACT_SUBMITTED`
- `ABANDONED`
- `EXPIRED`

### Transitions

- `NOT_STARTED -> IN_PROGRESS`: first answer supplied.
- `IN_PROGRESS -> COMPLETED`: all required dynamic questions valid and estimate successfully created.
- `COMPLETED -> CONTACT_SUBMITTED`: valid contact request saved.
- `IN_PROGRESS -> ABANDONED`: user leaves and client recovery window expires/explicitly resets.
- `IN_PROGRESS -> EXPIRED`: locally retained draft exceeds defined lifetime.

### Terminal states

- `CONTACT_SUBMITTED`
- `ABANDONED`
- `EXPIRED`

A new attempt creates a new session rather than reopening a terminal one.

V1 may retain in-progress answers locally for convenience but does not need to persist incomplete anonymous sessions server-side.

---

## 24. Estimate lifecycle

A completed estimate is an immutable commercial snapshot.

### States

- `VALID`
- `SUPERSEDED`
- `VOIDED`

### Creation

An estimate is created directly into `VALID` only after:

- server-side input validation;
- active pricing model resolution;
- deterministic calculation;
- successful persistence of result and line items.

### `VALID -> SUPERSEDED`

Occurs when a new estimate is intentionally created as a recalculation/replacement of an existing estimate.

Side effects:

- new estimate records `supersedes_estimate_id`;
- old estimate records supersession state/reference;
- old estimate remains readable for audit.

### `VALID -> VOIDED`

Admin-only exceptional action for an invalid/corrupted estimate or known calculator defect.

Guards:

- authorised user;
- mandatory reason;
- estimate is not silently deleted.

Side effects:

- void reason, actor and timestamp logged;
- PDF/email UI clearly marks it void;
- linked lead remains available.

### Terminal states

- `SUPERSEDED`
- `VOIDED`

`VALID` is immutable except for permitted lifecycle metadata.

---

## 25. Lead lifecycle

### States

- `NEW`
- `CONTACTED`
- `QUALIFIED`
- `PROPOSAL_SENT`
- `CLOSED_WON`
- `CLOSED_LOST`
- `CLOSED_NOT_A_FIT`

### Typical transitions

- `NEW -> CONTACTED`
- `CONTACTED -> QUALIFIED`
- `QUALIFIED -> PROPOSAL_SENT`
- `PROPOSAL_SENT -> CLOSED_WON`
- `NEW|CONTACTED|QUALIFIED|PROPOSAL_SENT -> CLOSED_LOST`
- `NEW|CONTACTED|QUALIFIED -> CLOSED_NOT_A_FIT`

### Guards

- transition performed by authorised staff;
- closure states require a reason/category where configured;
- `CLOSED_WON` should optionally record resulting client/account reference in a future integration.

### Side effects

Every transition creates an immutable lead-event record containing:

- previous state;
- new state;
- actor;
- timestamp;
- optional note/reason.

### Terminal states

- `CLOSED_WON`
- `CLOSED_LOST`
- `CLOSED_NOT_A_FIT`

If the same prospect returns after closure, create a new lead/estimate relationship rather than mutating historical truth.

---

## 26. Notification lifecycle

### States

- `PENDING`
- `SENT`
- `FAILED_RETRYABLE`
- `EXHAUSTED`

### Transitions

- `PENDING -> SENT`
- `PENDING -> FAILED_RETRYABLE`
- `FAILED_RETRYABLE -> PENDING` through authorised/system retry
- `FAILED_RETRYABLE -> EXHAUSTED` when retry policy is exhausted or failure is permanent

### Terminal states

- `SENT`
- `EXHAUSTED`

Email failure must not roll back a valid estimate or lead record.

---

## 27. Analytics events

The estimator should emit non-PII funnel events such as:

- `estimate_started`
- `estimate_step_completed`
- `estimate_completed`
- `estimate_result_viewed`
- `estimate_contact_started`
- `estimate_contact_submitted`
- `estimate_pdf_downloaded`
- `estimate_booking_clicked`

Permitted event metadata may include coarse categories such as:

- calculator type;
- result band;
- catch-up required true/false;
- confidence category;
- manual-review true/false.

Do not send:

- name;
- email;
- phone;
- free text;
- full tax/accounting answers;
- exact tax/compliance problem details

to GA4/GTM or another generic analytics platform.

---

## 28. Accessibility / interaction requirements

- WCAG 2.2 AA target for estimator and admin surfaces.
- All controls keyboard operable.
- Radio/multi-select semantics must be correct; do not fake controls with inaccessible divs.
- Visible focus states.
- Error messages associated with controls.
- Progress indicator has accessible text equivalent.
- Sliders only where they are genuinely easier than categorical buttons and must have non-slider accessible alternatives/value labels.
- Do not rely on colour alone for selection/error/state.
- Respect reduced-motion preferences.

---

## 29. Responsive design requirements

- Mobile-first.
- Primary question card should fit comfortably at common phone widths.
- Avoid sidebars during the step flow on small screens.
- Result cards can stack vertically.
- Admin tables must degrade to cards/scrollable tabular views without hiding critical data.

---

## 30. Error handling principles

Customer-visible failures must:

- preserve already entered answers where possible;
- use plain language;
- never expose database/provider/internal error details;
- distinguish recoverable network failure from invalid input;
- never show a successful estimate unless the server persisted the authoritative estimate snapshot.

If the database write fails, the application must not pretend that a permanent estimate exists.

---

## 31. Privacy / POPIA product principles

- Collect only data needed for the estimate, follow-up and agreed communication.
- Contact details are captured after estimate display.
- Consent to contact must be explicit.
- Marketing consent, if ever added, must be separate from service/contact consent.
- Free text should warn users not to include unnecessary sensitive information.
- Retention policy must be documented before production launch.
- Failed/unqualified leads must not be retained indefinitely merely because storage is cheap.
- The final privacy notice and retention periods require Goat Accounting approval before launch.

---

## 32. V1 success measures

Recommended metrics:

- estimator start rate from eligible landing pages;
- completion rate;
- median questions answered;
- median completion time;
- contact conversion after result;
- booking/contact CTA conversion;
- percentage of preliminary/manual-review estimates;
- percentage of “I’m not sure” on each core question;
- variance between estimator result and final human quote once enough data exists;
- lead-to-client conversion;
- recurring-revenue opportunity created.

The most important quality metric over time is not merely form conversion; it is **estimate calibration against actual quoted/realised work**.

---

## 33. V1 acceptance criteria

V1 is product-complete when all of the following are true:

1. A business user can complete the core flow with conditional branching.
2. A personal-tax user can complete the dedicated personal flow.
3. “Both” runs the two modules without conflating their pricing drivers.
4. The typical business flow is 8 core questions plus only material conditional questions.
5. Free text is optional and cannot alter the automatic estimate.
6. The customer sees the estimate before providing contact details.
7. Catch-up and ongoing amounts are shown separately.
8. The result is a range and includes confidence/review status.
9. A completed estimate is saved against one immutable pricing-model version.
10. Retaking/recalculating creates a new estimate rather than rewriting history.
11. A prospect can request contact and/or receive their estimate by email.
12. A branded PDF can be downloaded from the saved estimate.
13. Internal staff receive a structured lead notification.
14. Staff can find and review estimates in `/admin`.
15. Staff can progress lead lifecycle with audit history.
16. Staff can clone/edit/test a pricing-model draft.
17. Active/retired pricing models cannot be edited in place.
18. Activation retires the prior model atomically.
19. Analytics do not include PII or detailed tax/accounting answers.
20. The public estimator and admin meet agreed accessibility/security acceptance checks.

---

## 34. Product decisions explicitly locked in v0.1.0

- Business and personal tax use separate branches.
- Business flow target: 8 core questions, normally 2–4 conditional questions.
- Backlog duration and record condition are separate pricing inputs.
- Industry is not a mandatory pricing proxy; actual complexity is captured instead.
- “I’m not sure” is a first-class answer where appropriate.
- Free text is optional and excluded from automated pricing.
- Catch-up and recurring costs are always separate.
- Result is shown before contact capture.
- Result is an estimate range, not a precise quote.
- Urgency does not automatically create a surcharge in V1.
- Pricing uses explicit workload components before opaque multipliers.
- Pricing models are versioned and immutable once active.
- Completed estimates are immutable snapshots.
- Admin pricing changes happen through draft -> activate -> retire lifecycle.
- PDF/email derive from the saved estimate snapshot, not a fresh recalculation.

---

## 35. Remaining business-content decisions before production

These do **not** block technical planning, but must be supplied/approved before launch:

1. Initial Rand amounts for every pricing component/band.
2. Initial min/max ranges for personal-tax services.
3. Exact thresholds for manual review.
4. Exact customer-facing disclaimer wording.
5. Exact Rossouw professional-title wording and contact details.
6. Contact-consent wording and privacy notice.
7. Data-retention periods for anonymous estimates, unsuccessful leads and successful clients.
8. Whether weekly payroll materially changes pricing enough to warrant a question.
9. Whether any formal rush-fee policy should exist after V1.
10. Whether PDF should be automatically attached to customer email or linked for download.

---

## 36. Change control

This specification uses SemVer.

- Patch: wording/clarification with no product-contract change.
- Minor: additive product behaviour/questions/states while preserving existing contracts.
- Major: breaking product-flow, lifecycle or pricing-contract change.

No accepted requirement should be silently overwritten. Amendments must record what they supersede.
