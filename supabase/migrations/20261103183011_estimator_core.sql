BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA estimator AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA estimator FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA estimator TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA estimator
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA estimator
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA estimator
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA estimator
  REVOKE USAGE ON TYPES FROM PUBLIC, anon, authenticated, service_role;

CREATE TYPE estimator.pricing_model_state AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE estimator.pricing_rule_scope AS ENUM ('business', 'personal', 'shared');
CREATE TYPE estimator.pricing_rule_category AS ENUM ('catchup', 'ongoing', 'score', 'review');
CREATE TYPE estimator.estimate_line_item_category AS ENUM ('catchup', 'ongoing');
CREATE TYPE estimator.estimate_branch AS ENUM ('business', 'personal');
CREATE TYPE estimator.pricing_rule_type AS ENUM (
  'FIXED_RANGE',
  'BAND_RANGE',
  'PER_UNIT_RANGE',
  'PER_PERIOD_RANGE',
  'SERVICE_ADDON_RANGE',
  'COMPLEXITY_SCORE',
  'CONFIDENCE_WEIGHT',
  'REVIEW_TRIGGER'
);
CREATE TYPE estimator.calculator_type AS ENUM ('business', 'personal', 'both');
CREATE TYPE estimator.estimate_state AS ENUM ('VALID', 'SUPERSEDED', 'VOIDED');
CREATE TYPE estimator.confidence_level AS ENUM ('high', 'good', 'preliminary');
CREATE TYPE estimator.lead_state AS ENUM (
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'CLOSED_WON',
  'CLOSED_LOST',
  'CLOSED_NOT_A_FIT'
);
CREATE TYPE estimator.staff_role AS ENUM ('admin', 'advisor', 'viewer');
CREATE TYPE estimator.staff_state AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE estimator.notification_type AS ENUM ('internal_lead', 'customer_estimate');
CREATE TYPE estimator.notification_state AS ENUM ('PENDING', 'SENT', 'FAILED_RETRYABLE', 'EXHAUSTED');
CREATE TYPE estimator.notification_provider AS ENUM ('resend');

REVOKE ALL ON TYPE
  estimator.pricing_model_state,
  estimator.pricing_rule_scope,
  estimator.pricing_rule_category,
  estimator.estimate_line_item_category,
  estimator.estimate_branch,
  estimator.pricing_rule_type,
  estimator.calculator_type,
  estimator.estimate_state,
  estimator.confidence_level,
  estimator.lead_state,
  estimator.staff_role,
  estimator.staff_state,
  estimator.notification_type,
  estimator.notification_state,
  estimator.notification_provider
FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON TYPE
  estimator.pricing_model_state,
  estimator.pricing_rule_scope,
  estimator.pricing_rule_category,
  estimator.estimate_line_item_category,
  estimator.estimate_branch,
  estimator.pricing_rule_type,
  estimator.calculator_type,
  estimator.estimate_state,
  estimator.confidence_level,
  estimator.lead_state,
  estimator.staff_role,
  estimator.staff_state,
  estimator.notification_type,
  estimator.notification_state,
  estimator.notification_provider
TO authenticated, service_role;

CREATE TABLE estimator.pricing_models (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  version text NOT NULL UNIQUE,
  name text NOT NULL,
  state estimator.pricing_model_state NOT NULL DEFAULT 'DRAFT',
  engine_contract_version text NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  confidence_high_max_points bigint NOT NULL,
  confidence_good_max_points bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_at timestamptz,
  activated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  retired_at timestamptz,
  retired_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes text,
  checksum text,
  CONSTRAINT pricing_models_version_semver CHECK (
    pg_catalog.char_length(version) BETWEEN 1 AND 80
    AND version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*)|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.((0|[1-9][0-9]*)|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
  ),
  CONSTRAINT pricing_models_engine_contract_version_length CHECK (
    pg_catalog.char_length(engine_contract_version) BETWEEN 1 AND 80
  ),
  CONSTRAINT pricing_models_name_nonempty CHECK (
    pg_catalog.char_length(name) BETWEEN 1 AND 160 AND pg_catalog.btrim(name) <> ''
  ),
  CONSTRAINT pricing_models_currency_v1 CHECK (currency = 'ZAR'),
  CONSTRAINT pricing_models_confidence_thresholds CHECK (
    confidence_high_max_points >= 0
    AND confidence_good_max_points >= 0
    AND confidence_high_max_points <= confidence_good_max_points
    AND confidence_high_max_points <= 9007199254740991
    AND confidence_good_max_points <= 9007199254740991
  ),
  CONSTRAINT pricing_models_checksum_sha256 CHECK (
    checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT pricing_models_state_metadata CHECK (
    (state = 'DRAFT' AND activated_at IS NULL AND activated_by IS NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (state = 'ACTIVE' AND activated_at IS NOT NULL AND activated_by IS NOT NULL AND retired_at IS NULL AND retired_by IS NULL AND checksum IS NOT NULL)
    OR (state = 'RETIRED' AND activated_at IS NOT NULL AND activated_by IS NOT NULL AND retired_at IS NOT NULL AND retired_by IS NOT NULL AND checksum IS NOT NULL)
  ),
  CONSTRAINT pricing_models_id_version_unique UNIQUE (id, version)
);

CREATE UNIQUE INDEX pricing_models_one_active_idx
  ON estimator.pricing_models ((state))
  WHERE state = 'ACTIVE';
CREATE INDEX pricing_models_created_by_idx ON estimator.pricing_models (created_by);
CREATE INDEX pricing_models_activated_by_idx ON estimator.pricing_models (activated_by)
  WHERE activated_by IS NOT NULL;
CREATE INDEX pricing_models_retired_by_idx ON estimator.pricing_models (retired_by)
  WHERE retired_by IS NOT NULL;

CREATE TABLE estimator.pricing_rules (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  pricing_model_id uuid NOT NULL REFERENCES estimator.pricing_models(id) ON DELETE RESTRICT,
  code text NOT NULL,
  label text NOT NULL,
  scope estimator.pricing_rule_scope NOT NULL,
  category estimator.pricing_rule_category NOT NULL,
  rule_type estimator.pricing_rule_type NOT NULL,
  input_key text,
  explanation text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameters jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT pricing_rules_model_code_unique UNIQUE (pricing_model_id, code),
  CONSTRAINT pricing_rules_model_sort_order_unique UNIQUE (pricing_model_id, sort_order),
  CONSTRAINT pricing_rules_code_format CHECK (code ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'),
  CONSTRAINT pricing_rules_code_length CHECK (pg_catalog.char_length(code) BETWEEN 1 AND 80),
  CONSTRAINT pricing_rules_label_length CHECK (
    pg_catalog.char_length(label) BETWEEN 1 AND 160 AND pg_catalog.btrim(label) <> ''
  ),
  CONSTRAINT pricing_rules_explanation_length CHECK (
    pg_catalog.char_length(explanation) BETWEEN 1 AND 300 AND pg_catalog.btrim(explanation) <> ''
  ),
  CONSTRAINT pricing_rules_input_key_format CHECK (
    (rule_type IN ('FIXED_RANGE', 'REVIEW_TRIGGER') AND input_key IS NULL)
    OR (
      rule_type NOT IN ('FIXED_RANGE', 'REVIEW_TRIGGER')
      AND input_key IS NOT NULL
      AND input_key IN (
        'urgency',
        'business.entityType',
        'business.booksStatus',
        'business.recordCondition',
        'business.monthlyTransactionVolume',
        'business.financialAccounts',
        'business.employeeCount',
        'business.taxPosition',
        'business.ongoingServices',
        'business.complexityFactors',
        'business.bankStatementsAvailableForFullPeriod',
        'business.outstandingComplianceAreas',
        'personal.currentStatus',
        'personal.incomeSources',
        'personal.sarsPosition',
        'personal.ongoingRequirements',
        'personal.rentalPropertyCount',
        'personal.foreignIncomePresent',
        'personal.capitalGainsOccurred',
        'business.entityCount',
        'business.outstandingMonths',
        'personal.outstandingYears'
      )
    )
  ),
  CONSTRAINT pricing_rules_type_category_scope CHECK (
    (
      rule_type IN ('FIXED_RANGE', 'BAND_RANGE', 'PER_UNIT_RANGE', 'PER_PERIOD_RANGE', 'SERVICE_ADDON_RANGE')
      AND category IN ('catchup', 'ongoing')
      AND scope IN ('business', 'personal')
    )
    OR (rule_type = 'COMPLEXITY_SCORE' AND category = 'score' AND scope IN ('business', 'personal'))
    OR (rule_type = 'CONFIDENCE_WEIGHT' AND category = 'score')
    OR (rule_type = 'REVIEW_TRIGGER' AND category = 'review')
  ),
  CONSTRAINT pricing_rules_conditions_object CHECK (pg_catalog.jsonb_typeof(conditions) = 'object'),
  CONSTRAINT pricing_rules_condition_shape CHECK (
    (
      rule_type = 'REVIEW_TRIGGER'
      AND conditions ? 'condition'
      AND conditions - 'condition' = '{}'::jsonb
    )
    OR (
      rule_type IN ('BAND_RANGE', 'PER_UNIT_RANGE', 'CONFIDENCE_WEIGHT')
      AND (
        conditions = '{}'::jsonb
        OR (conditions ? 'when' AND conditions - 'when' = '{}'::jsonb)
      )
    )
    OR (
      rule_type IN ('FIXED_RANGE', 'PER_PERIOD_RANGE', 'SERVICE_ADDON_RANGE', 'COMPLEXITY_SCORE')
      AND conditions = '{}'::jsonb
    )
  ),
  CONSTRAINT pricing_rules_parameters_object CHECK (pg_catalog.jsonb_typeof(parameters) = 'object'),
  CONSTRAINT pricing_rules_parameters_shape CHECK (
    CASE rule_type
      WHEN 'FIXED_RANGE' THEN parameters ? 'range' AND parameters - 'range' = '{}'::jsonb
      WHEN 'BAND_RANGE' THEN parameters ? 'bands' AND parameters - 'bands' = '{}'::jsonb
      WHEN 'PER_UNIT_RANGE' THEN
        parameters ? 'unitLabel' AND parameters ? 'unitRange'
        AND parameters - ARRAY['unitLabel', 'unitRange', 'unknownRange'] = '{}'::jsonb
      WHEN 'PER_PERIOD_RANGE' THEN
        parameters ? 'periodLabel' AND parameters ? 'periodsByValue' AND parameters ? 'unitRange'
        AND parameters - ARRAY['periodLabel', 'periodsByValue', 'periodCountInputKey', 'unitRange', 'unknownRange'] = '{}'::jsonb
      WHEN 'SERVICE_ADDON_RANGE' THEN parameters ? 'addOns' AND parameters - 'addOns' = '{}'::jsonb
      WHEN 'COMPLEXITY_SCORE' THEN parameters ? 'pointsByValue' AND parameters - 'pointsByValue' = '{}'::jsonb
      WHEN 'CONFIDENCE_WEIGHT' THEN
        parameters ? 'pointsByValue' AND parameters ? 'missingPoints'
        AND parameters - ARRAY['pointsByValue', 'missingPoints'] = '{}'::jsonb
      WHEN 'REVIEW_TRIGGER' THEN parameters = '{}'::jsonb
    END
  ),
  CONSTRAINT pricing_rules_sort_order_range CHECK (sort_order BETWEEN 0 AND 127)
);

CREATE FUNCTION estimator.pricing_model_activation_projection(p_model_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, estimator
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', model.id::text,
    'version', model.version,
    'engineVersion', model.engine_contract_version,
    'currency', model.currency,
    'state', model.state::text,
    'confidenceThresholds', pg_catalog.jsonb_build_object(
      'highMaxPoints', model.confidence_high_max_points,
      'goodMaxPoints', model.confidence_good_max_points
    ),
    'rules', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'type', rule.rule_type,
            'scope', rule.scope,
            'category', rule.category,
            'code', rule.code,
            'label', rule.label,
            'explanation', rule.explanation
          )
          || CASE WHEN rule.input_key IS NULL THEN '{}'::jsonb
                  ELSE pg_catalog.jsonb_build_object('inputKey', rule.input_key) END
          || rule.conditions
          || rule.parameters
          ORDER BY rule.sort_order
        )
        FROM estimator.pricing_rules AS rule
        WHERE rule.pricing_model_id = model.id AND rule.enabled
      ),
      '[]'::jsonb
    )
  )
  FROM estimator.pricing_models AS model
  WHERE model.id = p_model_id;
$$;

CREATE FUNCTION estimator.pricing_model_definition_checksum(p_model_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, estimator, extensions
AS $$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        (estimator.pricing_model_activation_projection(p_model_id) - ARRAY['id', 'state'])::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE TABLE estimator.estimates (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  public_ref text NOT NULL UNIQUE DEFAULT pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
  calculator_type estimator.calculator_type NOT NULL,
  state estimator.estimate_state NOT NULL DEFAULT 'VALID',
  pricing_model_id uuid NOT NULL,
  pricing_model_version text NOT NULL,
  engine_version text NOT NULL,
  answers_snapshot jsonb NOT NULL,
  calculation_snapshot jsonb NOT NULL,
  catchup_min_cents bigint NOT NULL DEFAULT 0,
  catchup_max_cents bigint NOT NULL DEFAULT 0,
  ongoing_min_cents bigint NOT NULL DEFAULT 0,
  ongoing_max_cents bigint NOT NULL DEFAULT 0,
  confidence estimator.confidence_level NOT NULL,
  manual_review_required boolean NOT NULL,
  review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_flag_codes text[] NOT NULL DEFAULT '{}'::text[],
  free_text text,
  supersedes_estimate_id uuid REFERENCES estimator.estimates(id) ON DELETE RESTRICT,
  superseded_by_estimate_id uuid REFERENCES estimator.estimates(id) ON DELETE RESTRICT,
  void_reason text,
  voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT estimates_public_ref_entropy CHECK (public_ref ~ '^[a-f0-9]{32}$'),
  CONSTRAINT estimates_pricing_model_version_fk FOREIGN KEY (pricing_model_id, pricing_model_version)
    REFERENCES estimator.pricing_models(id, version) ON DELETE RESTRICT,
  CONSTRAINT estimates_answers_object CHECK (pg_catalog.jsonb_typeof(answers_snapshot) = 'object'),
  CONSTRAINT estimates_calculation_object CHECK (pg_catalog.jsonb_typeof(calculation_snapshot) = 'object'),
  CONSTRAINT estimates_review_reasons_array CHECK (pg_catalog.jsonb_typeof(review_reasons) = 'array'),
  CONSTRAINT estimates_engine_version_length CHECK (pg_catalog.char_length(engine_version) BETWEEN 1 AND 80),
  CONSTRAINT estimates_review_flag_codes_no_null CHECK (
    pg_catalog.array_position(review_flag_codes, NULL) IS NULL
  ),
  CONSTRAINT estimates_nonnegative_amounts CHECK (
    catchup_min_cents >= 0 AND catchup_max_cents >= 0
    AND ongoing_min_cents >= 0 AND ongoing_max_cents >= 0
    AND catchup_min_cents <= 9007199254740991
    AND catchup_max_cents <= 9007199254740991
    AND ongoing_min_cents <= 9007199254740991
    AND ongoing_max_cents <= 9007199254740991
  ),
  CONSTRAINT estimates_range_order CHECK (
    catchup_min_cents <= catchup_max_cents
    AND ongoing_min_cents <= ongoing_max_cents
  ),
  CONSTRAINT estimates_free_text_length CHECK (free_text IS NULL OR pg_catalog.char_length(free_text) <= 2000),
  CONSTRAINT estimates_not_self_superseding CHECK (
    supersedes_estimate_id IS NULL OR supersedes_estimate_id <> id
  ),
  CONSTRAINT estimates_not_self_superseded CHECK (
    superseded_by_estimate_id IS NULL OR superseded_by_estimate_id <> id
  ),
  CONSTRAINT estimates_lifecycle_metadata CHECK (
    (state = 'VALID' AND superseded_by_estimate_id IS NULL AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
    OR (state = 'SUPERSEDED' AND superseded_by_estimate_id IS NOT NULL AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
    OR (state = 'VOIDED' AND superseded_by_estimate_id IS NULL AND void_reason IS NOT NULL AND pg_catalog.btrim(void_reason) <> '' AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
  )
);

CREATE INDEX estimates_pricing_model_version_idx
  ON estimator.estimates (pricing_model_id, pricing_model_version);
CREATE INDEX estimates_supersedes_idx
  ON estimator.estimates (supersedes_estimate_id)
  WHERE supersedes_estimate_id IS NOT NULL;
CREATE INDEX estimates_superseded_by_idx
  ON estimator.estimates (superseded_by_estimate_id)
  WHERE superseded_by_estimate_id IS NOT NULL;
CREATE INDEX estimates_voided_by_idx
  ON estimator.estimates (voided_by)
  WHERE voided_by IS NOT NULL;
CREATE INDEX estimates_created_at_idx ON estimator.estimates (created_at DESC);
CREATE INDEX estimates_manual_review_idx
  ON estimator.estimates (created_at DESC)
  WHERE manual_review_required;
CREATE INDEX estimates_review_flag_codes_gin_idx
  ON estimator.estimates USING gin (review_flag_codes);

CREATE FUNCTION estimator.guard_estimate_snapshot_projection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  catchup_snapshot jsonb;
  ongoing_snapshot jsonb;
  expected_review_flags text[];
  expected_review_reasons jsonb;
  review_flag jsonb;
  flag_ordinal bigint;
  min_amount numeric;
  max_amount numeric;
  model_engine_version text;
BEGIN
  IF NEW.state <> 'VALID' THEN
    RAISE EXCEPTION 'estimates must be created as VALID snapshots' USING ERRCODE = '23514';
  END IF;

  IF NEW.answers_snapshot ->> 'calculatorType' IS DISTINCT FROM NEW.calculator_type::text THEN
    RAISE EXCEPTION 'answer snapshot calculator type must match the estimate' USING ERRCODE = '23514';
  END IF;

  IF NEW.calculation_snapshot ->> 'pricingModelId' IS DISTINCT FROM NEW.pricing_model_id::text
    OR NEW.calculation_snapshot ->> 'pricingModelVersion' IS DISTINCT FROM NEW.pricing_model_version
    OR NEW.calculation_snapshot ->> 'engineVersion' IS DISTINCT FROM NEW.engine_version THEN
    RAISE EXCEPTION 'calculation snapshot versions must match the estimate row' USING ERRCODE = '23514';
  END IF;

  SELECT model.engine_contract_version INTO model_engine_version
  FROM estimator.pricing_models AS model
  WHERE model.id = NEW.pricing_model_id
    AND model.version = NEW.pricing_model_version;
  IF model_engine_version IS DISTINCT FROM NEW.engine_version THEN
    RAISE EXCEPTION 'estimate engine version must match its pricing model contract' USING ERRCODE = '23514';
  END IF;

  IF NEW.calculation_snapshot ->> 'confidence' IS DISTINCT FROM NEW.confidence::text
    OR NEW.calculation_snapshot -> 'manualReviewRequired' IS DISTINCT FROM pg_catalog.to_jsonb(NEW.manual_review_required)
    OR NEW.calculation_snapshot -> 'reviewReasons' IS DISTINCT FROM NEW.review_reasons THEN
    RAISE EXCEPTION 'calculation snapshot projection must match estimate review fields' USING ERRCODE = '23514';
  END IF;

  IF pg_catalog.jsonb_typeof(NEW.calculation_snapshot -> 'confidenceReasons') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(NEW.calculation_snapshot -> 'confidencePoints') IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(NEW.calculation_snapshot -> 'complexityScores') IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(NEW.calculation_snapshot -> 'reviewFlags') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'calculation snapshot must preserve the complete V1 result fields' USING ERRCODE = '23514';
  END IF;

  catchup_snapshot := NEW.calculation_snapshot -> 'catchup';
  ongoing_snapshot := NEW.calculation_snapshot -> 'ongoing';
  IF pg_catalog.jsonb_typeof(catchup_snapshot) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(ongoing_snapshot) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(catchup_snapshot -> 'lineItems') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(ongoing_snapshot -> 'lineItems') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'calculation snapshot totals must contain line item arrays' USING ERRCODE = '23514';
  END IF;

  IF pg_catalog.jsonb_typeof(catchup_snapshot -> 'minCents') IS DISTINCT FROM 'number'
    OR pg_catalog.jsonb_typeof(catchup_snapshot -> 'maxCents') IS DISTINCT FROM 'number'
    OR pg_catalog.jsonb_typeof(ongoing_snapshot -> 'minCents') IS DISTINCT FROM 'number'
    OR pg_catalog.jsonb_typeof(ongoing_snapshot -> 'maxCents') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'calculation snapshot totals must use integer cents' USING ERRCODE = '23514';
  END IF;

  min_amount := (catchup_snapshot ->> 'minCents')::numeric;
  max_amount := (catchup_snapshot ->> 'maxCents')::numeric;
  IF min_amount <> pg_catalog.trunc(min_amount) OR max_amount <> pg_catalog.trunc(max_amount)
    OR min_amount < 0 OR max_amount < min_amount OR max_amount > 9007199254740991
    OR min_amount::bigint IS DISTINCT FROM NEW.catchup_min_cents
    OR max_amount::bigint IS DISTINCT FROM NEW.catchup_max_cents THEN
    RAISE EXCEPTION 'catch-up snapshot totals must match the nonnegative estimate range' USING ERRCODE = '23514';
  END IF;

  min_amount := (ongoing_snapshot ->> 'minCents')::numeric;
  max_amount := (ongoing_snapshot ->> 'maxCents')::numeric;
  IF min_amount <> pg_catalog.trunc(min_amount) OR max_amount <> pg_catalog.trunc(max_amount)
    OR min_amount < 0 OR max_amount < min_amount OR max_amount > 9007199254740991
    OR min_amount::bigint IS DISTINCT FROM NEW.ongoing_min_cents
    OR max_amount::bigint IS DISTINCT FROM NEW.ongoing_max_cents THEN
    RAISE EXCEPTION 'ongoing snapshot totals must match the nonnegative estimate range' USING ERRCODE = '23514';
  END IF;

  expected_review_flags := ARRAY[]::text[];
  expected_review_reasons := '[]'::jsonb;
  FOR review_flag, flag_ordinal IN
    SELECT flags.value, flags.ordinality
    FROM pg_catalog.jsonb_array_elements(NEW.calculation_snapshot -> 'reviewFlags')
      WITH ORDINALITY AS flags(value, ordinality)
    ORDER BY flags.ordinality
  LOOP
    IF pg_catalog.jsonb_typeof(review_flag -> 'code') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(review_flag -> 'label') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(review_flag -> 'reason') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(review_flag -> 'ruleCode') IS DISTINCT FROM 'string'
      OR review_flag ->> 'code' !~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
      OR review_flag ->> 'ruleCode' !~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
      OR review_flag ->> 'ruleCode' IS DISTINCT FROM review_flag ->> 'code'
      OR pg_catalog.btrim(review_flag ->> 'label') = ''
      OR pg_catalog.btrim(review_flag ->> 'reason') = '' THEN
      RAISE EXCEPTION 'review flags must preserve their stable code and reason' USING ERRCODE = '23514';
    END IF;
    expected_review_flags := pg_catalog.array_append(expected_review_flags, review_flag ->> 'code');
    expected_review_reasons := expected_review_reasons || pg_catalog.jsonb_build_array(review_flag -> 'reason');
  END LOOP;

  IF NEW.review_flag_codes IS DISTINCT FROM expected_review_flags
    OR NEW.review_reasons IS DISTINCT FROM expected_review_reasons
    OR NEW.manual_review_required IS DISTINCT FROM (pg_catalog.cardinality(expected_review_flags) > 0)
    OR (pg_catalog.cardinality(expected_review_flags) > 0 AND NEW.confidence <> 'preliminary')
    OR pg_catalog.cardinality(expected_review_flags) IS DISTINCT FROM (
      SELECT pg_catalog.count(DISTINCT code)::integer
      FROM pg_catalog.unnest(expected_review_flags) AS codes(code)
    ) THEN
    RAISE EXCEPTION 'estimate review projections must match the calculation snapshot' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER estimates_snapshot_projection_guard
  BEFORE INSERT ON estimator.estimates
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_estimate_snapshot_projection();

CREATE TABLE estimator.estimate_line_items (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimator.estimates(id) ON DELETE RESTRICT,
  pricing_rule_id uuid NOT NULL REFERENCES estimator.pricing_rules(id) ON DELETE RESTRICT,
  item_code text NOT NULL,
  rule_code text NOT NULL,
  label text NOT NULL,
  category estimator.estimate_line_item_category NOT NULL,
  branch estimator.estimate_branch NOT NULL,
  min_cents bigint NOT NULL,
  max_cents bigint NOT NULL,
  quantity numeric(20, 6),
  unit text,
  explanation text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT estimate_line_items_estimate_sort_order_unique UNIQUE (estimate_id, sort_order),
  CONSTRAINT estimate_line_items_nonnegative_amounts CHECK (
    min_cents >= 0 AND max_cents >= 0
    AND min_cents <= 9007199254740991
    AND max_cents <= 9007199254740991
  ),
  CONSTRAINT estimate_line_items_range_order CHECK (min_cents <= max_cents),
  CONSTRAINT estimate_line_items_quantity_nonnegative CHECK (quantity IS NULL OR quantity >= 0),
  CONSTRAINT estimate_line_items_code_nonempty CHECK (pg_catalog.btrim(item_code) <> ''),
  CONSTRAINT estimate_line_items_label_nonempty CHECK (pg_catalog.btrim(label) <> ''),
  CONSTRAINT estimate_line_items_sort_order_nonnegative CHECK (sort_order >= 0)
);
CREATE INDEX estimate_line_items_pricing_rule_idx
  ON estimator.estimate_line_items (pricing_rule_id);

CREATE TABLE estimator.leads (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  estimate_id uuid NOT NULL UNIQUE REFERENCES estimator.estimates(id) ON DELETE RESTRICT,
  state estimator.lead_state NOT NULL DEFAULT 'NEW',
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  business_name text,
  preferred_contact_method text,
  contact_consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT leads_full_name_nonempty CHECK (pg_catalog.btrim(full_name) <> ''),
  CONSTRAINT leads_email_nonempty CHECK (pg_catalog.btrim(email) <> ''),
  CONSTRAINT leads_phone_length CHECK (phone IS NULL OR pg_catalog.char_length(phone) <= 64),
  CONSTRAINT leads_business_name_length CHECK (business_name IS NULL OR pg_catalog.char_length(business_name) <= 250),
  CONSTRAINT leads_contact_method_length CHECK (
    preferred_contact_method IS NULL OR pg_catalog.char_length(preferred_contact_method) <= 40
  )
);
CREATE INDEX leads_state_created_at_idx ON estimator.leads (state, created_at DESC);

CREATE TABLE estimator.lead_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES estimator.leads(id) ON DELETE RESTRICT,
  from_state estimator.lead_state,
  to_state estimator.lead_state NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason_code text,
  note text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT lead_events_note_length CHECK (note IS NULL OR pg_catalog.char_length(note) <= 2000)
);
CREATE INDEX lead_events_lead_created_at_idx
  ON estimator.lead_events (lead_id, created_at DESC);
CREATE INDEX lead_events_actor_idx
  ON estimator.lead_events (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE TABLE estimator.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  estimate_id uuid REFERENCES estimator.estimates(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES estimator.leads(id) ON DELETE RESTRICT,
  type estimator.notification_type NOT NULL,
  state estimator.notification_state NOT NULL DEFAULT 'PENDING',
  provider estimator.notification_provider NOT NULL DEFAULT 'resend',
  provider_message_id text,
  recipient_hash text,
  recipient_masked text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_safe_message text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  CONSTRAINT notification_deliveries_type_parent CHECK (
    (type = 'internal_lead' AND lead_id IS NOT NULL AND estimate_id IS NULL)
    OR (type = 'customer_estimate' AND estimate_id IS NOT NULL AND lead_id IS NULL)
  ),
  CONSTRAINT notification_deliveries_attempt_count_nonnegative CHECK (attempt_count >= 0),
  CONSTRAINT notification_deliveries_recipient_metadata CHECK (
    recipient_hash IS NULL OR recipient_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT notification_deliveries_error_code_length CHECK (
    last_error_code IS NULL OR pg_catalog.char_length(last_error_code) <= 100
  ),
  CONSTRAINT notification_deliveries_safe_message_length CHECK (
    last_error_safe_message IS NULL OR pg_catalog.char_length(last_error_safe_message) <= 500
  ),
  CONSTRAINT notification_deliveries_sent_timestamp CHECK (
    (state = 'SENT' AND sent_at IS NOT NULL)
    OR (state <> 'SENT' AND sent_at IS NULL)
  )
);
CREATE INDEX notification_deliveries_estimate_created_idx
  ON estimator.notification_deliveries (estimate_id, created_at DESC)
  WHERE estimate_id IS NOT NULL;
CREATE INDEX notification_deliveries_lead_created_idx
  ON estimator.notification_deliveries (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX notification_deliveries_retry_idx
  ON estimator.notification_deliveries (state, last_attempt_at)
  WHERE state IN ('FAILED_RETRYABLE', 'PENDING');

CREATE TABLE estimator.staff_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  role estimator.staff_role NOT NULL,
  state estimator.staff_state NOT NULL DEFAULT 'INVITED',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX staff_users_active_role_idx
  ON estimator.staff_users (role)
  WHERE state = 'ACTIVE';

CREATE FUNCTION estimator.is_current_staff(
  p_roles estimator.staff_role[],
  p_require_aal2 boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
  SELECT COALESCE(
    (
      SELECT staff.state = 'ACTIVE' AND staff.role = ANY (p_roles)
      FROM estimator.staff_users AS staff
      WHERE staff.user_id = (SELECT auth.uid())
    ),
    false
  )
  AND (
    NOT p_require_aal2
    OR (SELECT auth.jwt() ->> 'aal') = 'aal2'
  );
$$;

CREATE FUNCTION estimator.guard_pricing_model()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'DRAFT' OR NEW.activated_at IS NOT NULL OR NEW.activated_by IS NOT NULL
      OR NEW.retired_at IS NOT NULL OR NEW.retired_by IS NOT NULL OR NEW.checksum IS NOT NULL THEN
      RAISE EXCEPTION 'pricing models must be created as DRAFT' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM estimator.staff_users AS staff
    WHERE staff.user_id = NEW.created_by
      AND staff.role = 'admin'
      AND staff.state = 'ACTIVE'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'pricing model creation requires an active administrator' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pricing models cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.engine_contract_version IS DISTINCT FROM OLD.engine_contract_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'pricing model identity fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'DRAFT' AND NEW.state = 'DRAFT' THEN
    IF NEW.activated_at IS DISTINCT FROM OLD.activated_at
      OR NEW.activated_by IS DISTINCT FROM OLD.activated_by
      OR NEW.retired_at IS DISTINCT FROM OLD.retired_at
      OR NEW.retired_by IS DISTINCT FROM OLD.retired_by THEN
      RAISE EXCEPTION 'draft pricing models cannot set lifecycle metadata' USING ERRCODE = '55000';
    END IF;
    IF current_user <> 'postgres' AND NEW.checksum IS DISTINCT FROM OLD.checksum THEN
      RAISE EXCEPTION 'pricing model checksums are computed by the database' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'DRAFT' AND NEW.state = 'ACTIVE' THEN
    IF current_user <> 'postgres'
      OR NEW.activated_at IS NULL OR NEW.activated_by IS NULL
      OR NEW.retired_at IS NOT NULL OR NEW.retired_by IS NOT NULL
      OR NEW.checksum IS NULL
      OR (pg_catalog.to_jsonb(NEW) - ARRAY['state', 'activated_at', 'activated_by', 'retired_at', 'retired_by', 'checksum'])
        IS DISTINCT FROM
         (pg_catalog.to_jsonb(OLD) - ARRAY['state', 'activated_at', 'activated_by', 'retired_at', 'retired_by', 'checksum']) THEN
      RAISE EXCEPTION 'pricing activation must use the guarded database function' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'ACTIVE' AND NEW.state = 'RETIRED' THEN
    IF current_user <> 'postgres'
      OR NEW.retired_at IS NULL OR NEW.retired_by IS NULL
      OR (pg_catalog.to_jsonb(NEW) - ARRAY['state', 'retired_at', 'retired_by'])
        IS DISTINCT FROM
         (pg_catalog.to_jsonb(OLD) - ARRAY['state', 'retired_at', 'retired_by']) THEN
      RAISE EXCEPTION 'pricing retirement must use the guarded database function' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'active and retired pricing models are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER pricing_models_guard
  BEFORE INSERT OR UPDATE OR DELETE ON estimator.pricing_models
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_pricing_model();

CREATE FUNCTION estimator.guard_pricing_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  model_state estimator.pricing_model_state;
  model_id uuid;
BEGIN
  model_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.pricing_model_id ELSE NEW.pricing_model_id END;
  SELECT model.state INTO model_state
  FROM estimator.pricing_models AS model
  WHERE model.id = model_id
  FOR UPDATE;

  IF model_state IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'pricing rules can only change on a DRAFT model' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.pricing_model_id IS DISTINCT FROM OLD.pricing_model_id
    OR NEW.code IS DISTINCT FROM OLD.code
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'pricing rule identity fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := pg_catalog.clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pricing_rules_guard
  BEFORE INSERT OR UPDATE OR DELETE ON estimator.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_pricing_rule();

CREATE FUNCTION estimator.guard_estimate_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'VALID'
      OR NEW.superseded_by_estimate_id IS NOT NULL
      OR NEW.void_reason IS NOT NULL
      OR NEW.voided_by IS NOT NULL
      OR NEW.voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'estimates must be created as VALID snapshots' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'estimates cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD.state <> 'VALID' THEN
    RAISE EXCEPTION 'terminal estimates are immutable' USING ERRCODE = '55000';
  END IF;

  IF (pg_catalog.to_jsonb(NEW) - ARRAY['state', 'superseded_by_estimate_id', 'void_reason', 'voided_by', 'voided_at'])
    IS DISTINCT FROM
     (pg_catalog.to_jsonb(OLD) - ARRAY['state', 'superseded_by_estimate_id', 'void_reason', 'voided_by', 'voided_at']) THEN
    RAISE EXCEPTION 'estimate commercial snapshot fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.state = 'VALID' THEN
    IF NEW.superseded_by_estimate_id IS DISTINCT FROM OLD.superseded_by_estimate_id
      OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
      OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
      OR NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
      RAISE EXCEPTION 'estimate lifecycle metadata must accompany a terminal transition' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state = 'VOIDED' THEN
    IF pg_catalog.btrim(COALESCE(NEW.void_reason, '')) = ''
      OR NEW.voided_by IS NULL OR NEW.voided_at IS NULL
      OR NEW.superseded_by_estimate_id IS NOT NULL THEN
      RAISE EXCEPTION 'voiding an estimate requires actor, timestamp, and reason' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state = 'SUPERSEDED' THEN
    IF NEW.superseded_by_estimate_id IS NULL
      OR NEW.void_reason IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'superseding an estimate requires its replacement reference' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid estimate lifecycle transition' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER estimates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON estimator.estimates
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_estimate_immutability();

CREATE FUNCTION estimator.check_estimate_supersession_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  related_estimate estimator.estimates%ROWTYPE;
BEGIN
  IF NEW.supersedes_estimate_id IS NOT NULL THEN
    SELECT estimate.* INTO related_estimate
    FROM estimator.estimates AS estimate
    WHERE estimate.id = NEW.supersedes_estimate_id;
    IF NOT FOUND
      OR related_estimate.state <> 'SUPERSEDED'
      OR related_estimate.superseded_by_estimate_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'supersession must update the prior estimate in the same transaction' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.state = 'SUPERSEDED' THEN
    SELECT estimate.* INTO related_estimate
    FROM estimator.estimates AS estimate
    WHERE estimate.id = NEW.superseded_by_estimate_id;
    IF NOT FOUND OR related_estimate.supersedes_estimate_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'replacement estimate must reference the superseded estimate' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER estimates_supersession_pair_guard
  AFTER INSERT OR UPDATE ON estimator.estimates
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION estimator.check_estimate_supersession_pair();

CREATE FUNCTION estimator.guard_estimate_line_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'estimate line items cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'estimate line items cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER estimate_line_items_guard
  BEFORE UPDATE OR DELETE ON estimator.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_estimate_line_item();

CREATE FUNCTION estimator.guard_estimate_line_item_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  estimate_model_id uuid;
  matched_rule_code text;
BEGIN
  SELECT estimate.pricing_model_id INTO estimate_model_id
  FROM estimator.estimates AS estimate
  WHERE estimate.id = NEW.estimate_id;

  SELECT rule.code INTO matched_rule_code
  FROM estimator.pricing_rules AS rule
  WHERE rule.id = NEW.pricing_rule_id
    AND rule.pricing_model_id = estimate_model_id
    AND rule.enabled
    AND rule.category::text = NEW.category::text
    AND rule.scope::text = NEW.branch::text;

  IF matched_rule_code IS NULL OR matched_rule_code IS DISTINCT FROM NEW.rule_code THEN
    RAISE EXCEPTION 'line item rule must match its estimate model, code, and category' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER estimate_line_items_reference_guard
  BEFORE INSERT ON estimator.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_estimate_line_item_reference();

CREATE FUNCTION estimator.materialize_estimate_line_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  category_name text;
  snapshot_line_item jsonb;
  matched_rule_id uuid;
  next_sort_order integer := 0;
BEGIN
  FOREACH category_name IN ARRAY ARRAY['catchup', 'ongoing']::text[] LOOP
    FOR snapshot_line_item IN
      SELECT line_item.value
      FROM pg_catalog.jsonb_array_elements(
        NEW.calculation_snapshot -> category_name -> 'lineItems'
      ) WITH ORDINALITY AS line_item(value, ordinal)
      ORDER BY line_item.ordinal
    LOOP
      SELECT rule.id INTO matched_rule_id
      FROM estimator.pricing_rules AS rule
      WHERE rule.pricing_model_id = NEW.pricing_model_id
        AND rule.code = snapshot_line_item ->> 'ruleCode'
        AND rule.enabled;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'snapshot line item must reference an enabled rule in its pricing model'
          USING ERRCODE = '23514';
      END IF;

      INSERT INTO estimator.estimate_line_items (
        estimate_id, pricing_rule_id, item_code, rule_code, label, category, branch,
        min_cents, max_cents, quantity, unit, explanation, sort_order
      ) VALUES (
        NEW.id,
        matched_rule_id,
        snapshot_line_item ->> 'code',
        snapshot_line_item ->> 'ruleCode',
        snapshot_line_item ->> 'label',
        category_name::estimator.estimate_line_item_category,
        (snapshot_line_item ->> 'branch')::estimator.estimate_branch,
        (snapshot_line_item ->> 'minCents')::bigint,
        (snapshot_line_item ->> 'maxCents')::bigint,
        CASE WHEN snapshot_line_item ? 'quantity'
          THEN (snapshot_line_item ->> 'quantity')::numeric
          ELSE NULL
        END,
        snapshot_line_item ->> 'unit',
        snapshot_line_item ->> 'explanation',
        next_sort_order
      );
      next_sort_order := next_sort_order + 1;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER estimates_materialize_line_items
  AFTER INSERT ON estimator.estimates
  FOR EACH ROW EXECUTE FUNCTION estimator.materialize_estimate_line_items();

CREATE FUNCTION estimator.guard_lead_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  valid_transition boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'NEW' THEN
      RAISE EXCEPTION 'leads must be created in NEW state' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'leads cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.estimate_id IS DISTINCT FROM OLD.estimate_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.contact_consent_at IS DISTINCT FROM OLD.contact_consent_at THEN
    RAISE EXCEPTION 'lead identity and consent fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    NEW.updated_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  valid_transition := CASE OLD.state
    WHEN 'NEW' THEN NEW.state IN ('CONTACTED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    WHEN 'CONTACTED' THEN NEW.state IN ('QUALIFIED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    WHEN 'QUALIFIED' THEN NEW.state IN ('PROPOSAL_SENT', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    WHEN 'PROPOSAL_SENT' THEN NEW.state IN ('CLOSED_WON', 'CLOSED_LOST')
    ELSE false
  END;
  IF NOT valid_transition THEN
    RAISE EXCEPTION 'invalid lead lifecycle transition from % to %', OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER leads_transition_guard
  BEFORE INSERT OR UPDATE OR DELETE ON estimator.leads
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_lead_transition();

CREATE FUNCTION estimator.record_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  actor_id uuid;
  reason text;
  event_note text;
BEGIN
  actor_id := COALESCE(
    (SELECT auth.uid()),
    NULLIF(pg_catalog.current_setting('estimator.actor_user_id', true), '')::uuid
  );
  reason := NULLIF(pg_catalog.current_setting('estimator.lead_reason_code', true), '');
  event_note := NULLIF(pg_catalog.current_setting('estimator.lead_note', true), '');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO estimator.lead_events (lead_id, from_state, to_state, actor_user_id, reason_code, note)
    VALUES (NEW.id, NULL, NEW.state, actor_id, 'lead_created', event_note);
  ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO estimator.lead_events (lead_id, from_state, to_state, actor_user_id, reason_code, note)
    VALUES (NEW.id, OLD.state, NEW.state, actor_id, COALESCE(reason, 'state_changed'), event_note);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER leads_event_after_insert
  AFTER INSERT ON estimator.leads
  FOR EACH ROW EXECUTE FUNCTION estimator.record_lead_event();
CREATE TRIGGER leads_event_after_state_change
  AFTER UPDATE OF state ON estimator.leads
  FOR EACH ROW EXECUTE FUNCTION estimator.record_lead_event();

CREATE FUNCTION estimator.guard_lead_event_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
BEGIN
  RAISE EXCEPTION 'lead events are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER lead_events_append_only
  BEFORE UPDATE OR DELETE ON estimator.lead_events
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_lead_event_immutability();

CREATE FUNCTION estimator.transition_lead(
  p_lead_id uuid,
  p_to_state estimator.lead_state,
  p_actor_user_id uuid,
  p_reason_code text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
BEGIN
  PERFORM 1 FROM estimator.staff_users AS staff
  WHERE staff.user_id = p_actor_user_id
    AND staff.state = 'ACTIVE'
    AND staff.role IN ('admin', 'advisor')
  FOR SHARE;
  IF p_actor_user_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'lead transition requires an active advisor or administrator' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('estimator.actor_user_id', p_actor_user_id::text, true);
  PERFORM pg_catalog.set_config('estimator.lead_reason_code', COALESCE(p_reason_code, ''), true);
  PERFORM pg_catalog.set_config('estimator.lead_note', COALESCE(p_note, ''), true);

  UPDATE estimator.leads SET state = p_to_state WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.set_config('estimator.actor_user_id', '', true);
  PERFORM pg_catalog.set_config('estimator.lead_reason_code', '', true);
  PERFORM pg_catalog.set_config('estimator.lead_note', '', true);
END;
$$;

CREATE FUNCTION estimator.guard_staff_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  active_admin_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'staff records are deactivated, not deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'DEACTIVATED'
    AND (NEW.state IS DISTINCT FROM OLD.state OR NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'DEACTIVATED staff records are terminal' USING ERRCODE = '23514';
  END IF;

  IF OLD.role = 'admin' AND OLD.state = 'ACTIVE'
    AND (NEW.role IS DISTINCT FROM 'admin' OR NEW.state IS DISTINCT FROM 'ACTIVE') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 17);
    SELECT count(*)::integer INTO active_admin_count
    FROM estimator.staff_users AS staff
    WHERE staff.role = 'admin' AND staff.state = 'ACTIVE';
    IF active_admin_count <= 1 THEN
      RAISE EXCEPTION 'the last active administrator cannot be removed' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_users_guard
  BEFORE UPDATE OF role, state OR DELETE ON estimator.staff_users
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_staff_user();

CREATE FUNCTION estimator.guard_notification_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'PENDING' OR NEW.attempt_count <> 0
      OR NEW.last_attempt_at IS NOT NULL OR NEW.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'notification deliveries must start in PENDING state' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'notification delivery records cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.estimate_id IS DISTINCT FROM OLD.estimate_id
    OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.recipient_hash IS DISTINCT FROM OLD.recipient_hash
    OR NEW.recipient_masked IS DISTINCT FROM OLD.recipient_masked
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'notification delivery identity fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.attempt_count < OLD.attempt_count
    OR NEW.attempt_count::bigint > OLD.attempt_count::bigint + 1
    OR (NEW.attempt_count > OLD.attempt_count AND NEW.last_attempt_at IS NULL) THEN
    RAISE EXCEPTION 'notification attempts must be monotonic and timestamped' USING ERRCODE = '23514';
  END IF;

  IF OLD.state IN ('SENT', 'EXHAUSTED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal notification deliveries are immutable' USING ERRCODE = '55000';
  END IF;

  IF NOT (
    (OLD.state = 'PENDING' AND NEW.state IN ('PENDING', 'SENT', 'FAILED_RETRYABLE', 'EXHAUSTED'))
    OR (OLD.state = 'FAILED_RETRYABLE' AND NEW.state IN ('FAILED_RETRYABLE', 'SENT', 'EXHAUSTED'))
    OR OLD.state = NEW.state
  ) THEN
    RAISE EXCEPTION 'invalid notification delivery transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_deliveries_guard
  BEFORE INSERT OR UPDATE OR DELETE ON estimator.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_notification_delivery();

CREATE FUNCTION estimator.activate_pricing_model(
  p_model_id uuid,
  p_actor_user_id uuid,
  p_validated_model jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  target_model estimator.pricing_models%ROWTYPE;
  current_active_id uuid;
  enabled_rule_count integer;
  computed_checksum text;
  current_domain_model jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 3);

  PERFORM 1 FROM estimator.staff_users AS staff
  WHERE staff.user_id = p_actor_user_id
    AND staff.role = 'admin'
    AND staff.state = 'ACTIVE'
  FOR SHARE;
  IF p_actor_user_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'pricing activation requires an active administrator' USING ERRCODE = '42501';
  END IF;

  SELECT model.* INTO target_model
  FROM estimator.pricing_models AS model
  WHERE model.id = p_model_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pricing model not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_model.state <> 'DRAFT' THEN
    RAISE EXCEPTION 'only DRAFT pricing models can be activated' USING ERRCODE = '55000';
  END IF;

  IF target_model.confidence_high_max_points <> 0
    OR target_model.confidence_good_max_points > 1 THEN
    RAISE EXCEPTION 'V1 confidence thresholds require highMaxPoints = 0 and goodMaxPoints <= 1'
      USING ERRCODE = '23514';
  END IF;

  current_domain_model := estimator.pricing_model_activation_projection(p_model_id);
  IF p_validated_model IS NULL
    OR pg_catalog.jsonb_typeof(p_validated_model) <> 'object'
    OR p_validated_model IS DISTINCT FROM current_domain_model THEN
    RAISE EXCEPTION 'validated pricing model does not match the locked DRAFT; revalidate before activation'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) FILTER (WHERE rule.enabled)::integer
  INTO enabled_rule_count
  FROM estimator.pricing_rules AS rule
  WHERE rule.pricing_model_id = p_model_id;
  IF enabled_rule_count = 0 THEN
    RAISE EXCEPTION 'pricing model must include an enabled rule' USING ERRCODE = '23514';
  END IF;

  computed_checksum := estimator.pricing_model_definition_checksum(p_model_id);
  IF computed_checksum IS NULL THEN
    RAISE EXCEPTION 'pricing model checksum could not be computed' USING ERRCODE = '23514';
  END IF;

  SELECT model.id INTO current_active_id
  FROM estimator.pricing_models AS model
  WHERE model.state = 'ACTIVE'
  FOR UPDATE;

  IF current_active_id IS NOT NULL THEN
    UPDATE estimator.pricing_models
    SET state = 'RETIRED', retired_at = pg_catalog.clock_timestamp(), retired_by = p_actor_user_id
    WHERE id = current_active_id;
  END IF;

  UPDATE estimator.pricing_models
  SET state = 'ACTIVE', activated_at = pg_catalog.clock_timestamp(), activated_by = p_actor_user_id,
      checksum = computed_checksum
  WHERE id = p_model_id;
END;
$$;

ALTER TABLE estimator.pricing_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.pricing_models FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.pricing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.estimates FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.estimate_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.leads FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.lead_events FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.notification_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.staff_users FORCE ROW LEVEL SECURITY;

CREATE POLICY pricing_models_staff_read ON estimator.pricing_models
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin', 'advisor', 'viewer']::estimator.staff_role[], true)));
CREATE POLICY pricing_rules_staff_read ON estimator.pricing_rules
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin', 'advisor', 'viewer']::estimator.staff_role[], true)));

CREATE POLICY estimates_staff_read ON estimator.estimates
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin', 'advisor', 'viewer']::estimator.staff_role[], true)));
CREATE POLICY estimate_line_items_staff_read ON estimator.estimate_line_items
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin', 'advisor', 'viewer']::estimator.staff_role[], true)));

CREATE POLICY leads_staff_read ON estimator.leads
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin', 'advisor', 'viewer']::estimator.staff_role[], true)));
CREATE POLICY lead_events_staff_read ON estimator.lead_events
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin', 'advisor', 'viewer']::estimator.staff_role[], true)));

CREATE POLICY notification_deliveries_admin_read ON estimator.notification_deliveries
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin']::estimator.staff_role[], true)));
CREATE POLICY staff_users_admin_read ON estimator.staff_users
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin']::estimator.staff_role[], true)));

REVOKE ALL ON ALL TABLES IN SCHEMA estimator FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON
  estimator.pricing_models,
  estimator.pricing_rules,
  estimator.estimates,
  estimator.estimate_line_items,
  estimator.leads,
  estimator.lead_events,
  estimator.notification_deliveries,
  estimator.staff_users
TO authenticated;
GRANT SELECT ON
  estimator.pricing_models,
  estimator.pricing_rules,
  estimator.estimates,
  estimator.estimate_line_items,
  estimator.leads,
  estimator.lead_events,
  estimator.notification_deliveries,
  estimator.staff_users
TO service_role;
GRANT INSERT, UPDATE ON estimator.pricing_models TO service_role;
GRANT INSERT, UPDATE, DELETE ON estimator.pricing_rules TO service_role;
GRANT INSERT ON estimator.estimates, estimator.leads,
  estimator.notification_deliveries, estimator.staff_users TO service_role;
GRANT UPDATE (state, superseded_by_estimate_id, void_reason, voided_by, voided_at)
  ON estimator.estimates TO service_role;
GRANT UPDATE (state, provider_message_id, attempt_count,
  last_error_code, last_error_safe_message, last_attempt_at, sent_at)
  ON estimator.notification_deliveries TO service_role;
GRANT UPDATE (role, state) ON estimator.staff_users TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA estimator FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.is_current_staff(estimator.staff_role[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.transition_lead(uuid, estimator.lead_state, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION estimator.activate_pricing_model(uuid, uuid, jsonb) TO service_role;

COMMIT;
