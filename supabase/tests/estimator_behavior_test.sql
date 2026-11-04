BEGIN;

CREATE FUNCTION pg_temp.throws_sqlstate(statement text, expected_state text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  actual_state text;
BEGIN
  EXECUTE statement;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  RETURN actual_state = expected_state;
END;
$$;

CREATE FUNCTION pg_temp.exec_sql(statement text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE FUNCTION pg_temp.query_jsonb(statement text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE statement INTO result;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

SELECT plan(55);

SELECT is(
  (
    SELECT array_agg(key_match.captured[1] ORDER BY key_match.captured[1])
    FROM pg_catalog.pg_constraint AS constraint_row
    CROSS JOIN LATERAL pg_catalog.regexp_matches(
      pg_catalog.pg_get_constraintdef(constraint_row.oid),
      $$'((business\.[A-Za-z]+)|(personal\.[A-Za-z]+)|urgency)'$$,
      'g'
    ) AS key_match(captured)
    WHERE constraint_row.conrelid = 'estimator.pricing_rules'::regclass
      AND constraint_row.conname = 'pricing_rules_input_key_format'
  ),
  ARRAY[
    'business.bankStatementsAvailableForFullPeriod',
    'business.booksStatus',
    'business.complexityFactors',
    'business.employeeCount',
    'business.entityCount',
    'business.entityType',
    'business.financialAccounts',
    'business.monthlyTransactionVolume',
    'business.ongoingServices',
    'business.outstandingComplianceAreas',
    'business.outstandingMonths',
    'business.recordCondition',
    'business.taxPosition',
    'personal.capitalGainsOccurred',
    'personal.currentStatus',
    'personal.foreignIncomePresent',
    'personal.incomeSources',
    'personal.ongoingRequirements',
    'personal.outstandingYears',
    'personal.rentalPropertyCount',
    'personal.sarsPosition',
    'urgency'
  ]::text[],
  'database pricing input keys exactly match PR2 PRICING_INPUT_KEYS'
);

CREATE FUNCTION pg_temp.reject_second_model_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $trigger$
BEGIN
  IF NEW.id = '20000000-0000-4000-8000-000000000002' AND NEW.state = 'ACTIVE' THEN
    RAISE EXCEPTION 'injected activation failure' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$trigger$;
CREATE TRIGGER test_reject_second_model_activation
  BEFORE UPDATE ON estimator.pricing_models
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_second_model_activation();

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'schema-admin-1@example.invalid', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'schema-admin-2@example.invalid', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'schema-advisor@example.invalid', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'schema-viewer@example.invalid', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'schema-outsider@example.invalid', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'schema-invited@example.invalid', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'schema-suspended@example.invalid', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'schema-deactivated@example.invalid', '{}', '{}', now(), now())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF pg_catalog.to_regclass('estimator.staff_users') IS NOT NULL THEN
    INSERT INTO estimator.staff_users (user_id, role, state)
    VALUES
      ('10000000-0000-4000-8000-000000000001', 'admin', 'ACTIVE'),
      ('10000000-0000-4000-8000-000000000002', 'admin', 'ACTIVE'),
      ('10000000-0000-4000-8000-000000000003', 'advisor', 'ACTIVE'),
      ('10000000-0000-4000-8000-000000000004', 'viewer', 'ACTIVE'),
      ('10000000-0000-4000-8000-000000000006', 'viewer', 'INVITED'),
      ('10000000-0000-4000-8000-000000000007', 'advisor', 'SUSPENDED'),
      ('10000000-0000-4000-8000-000000000008', 'viewer', 'DEACTIVATED')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO estimator.pricing_models (
      id, version, name, state, engine_contract_version,
      confidence_high_max_points, confidence_good_max_points, created_by
    ) VALUES
      ('20000000-0000-4000-8000-000000000001', '1.0.0', 'Test model one', 'DRAFT', '1.0.0', 0, 1, '10000000-0000-4000-8000-000000000001'),
      ('20000000-0000-4000-8000-000000000002', '1.1.0', 'Test model two', 'DRAFT', '1.0.0', 0, 1, '10000000-0000-4000-8000-000000000001'),
      ('20000000-0000-4000-8000-000000000004', '1.3.0', 'Input key round-trip test model', 'DRAFT', '1.0.0', 0, 1, '10000000-0000-4000-8000-000000000001')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO estimator.pricing_rules (
      id, pricing_model_id, code, label, scope, category, rule_type,
      input_key, explanation, conditions, parameters, enabled, sort_order
    ) VALUES
      ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'core_test', 'Test rule one', 'business', 'catchup', 'FIXED_RANGE', NULL, 'Test explanation', '{}', '{"range":{"minCents":100,"maxCents":200}}', true, 1),
      ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'core_test', 'Test rule two', 'business', 'catchup', 'FIXED_RANGE', NULL, 'Test explanation', '{}', '{"range":{"minCents":1,"maxCents":1}}', true, 1)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO estimator.pricing_rules (
      id, pricing_model_id, code, label, scope, category, rule_type,
      input_key, explanation, conditions, parameters, enabled, sort_order
    ) VALUES
      ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
       'conditional_unit', 'Conditional unit rule', 'business', 'ongoing', 'PER_UNIT_RANGE',
       'business.entityCount', 'Conditional explanation',
       '{"when":{"inputKey":"business.entityType","value":"multiple_entities"}}',
       '{"unitLabel":"entity","unitRange":{"minCents":10,"maxCents":20}}', true, 2),
      ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
       'disabled_rule', 'Disabled rule', 'business', 'catchup', 'FIXED_RANGE',
       NULL, 'Disabled explanation', '{}', '{"range":{"minCents":0,"maxCents":0}}', false, 3)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO estimator.pricing_rules (
      id, pricing_model_id, code, label, scope, category, rule_type,
      input_key, explanation, conditions, parameters, enabled, sort_order
    ) VALUES (
      '30000000-0000-4000-8000-000000000007',
      '20000000-0000-4000-8000-000000000004',
      'ongoing_services_round_trip',
      'Test ongoing services',
      'business',
      'ongoing',
      'SERVICE_ADDON_RANGE',
      'business.ongoingServices',
      'Synthetic database round-trip fixture.',
      '{}',
      '{"addOns":[{"value":"monthly_bookkeeping","label":"Test service","range":{"minCents":0,"maxCents":0}}]}',
      true,
      0
    );

    INSERT INTO estimator.pricing_models (
      id, version, name, state, engine_contract_version,
      confidence_high_max_points, confidence_good_max_points, created_by
    ) VALUES (
      '20000000-0000-4000-8000-000000000003', '1.2.0', 'Invalid V1 threshold model', 'DRAFT', '1.0.0', 1, 1,
      '10000000-0000-4000-8000-000000000001'
    ) ON CONFLICT (id) DO NOTHING;
    INSERT INTO estimator.pricing_rules (
      id, pricing_model_id, code, label, scope, category, rule_type,
      input_key, explanation, conditions, parameters, enabled, sort_order
    ) VALUES (
      '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003',
      'threshold_test', 'Threshold rule', 'business', 'catchup', 'FIXED_RANGE',
      NULL, 'Test explanation', '{}', '{"range":{"minCents":1,"maxCents":1}}', true, 1
    ) ON CONFLICT (id) DO NOTHING;

    IF pg_catalog.to_regprocedure('estimator.activate_pricing_model(uuid,uuid,jsonb)') IS NOT NULL THEN
      PERFORM estimator.activate_pricing_model(
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        estimator.pricing_model_activation_projection('20000000-0000-4000-8000-000000000001')
      );
    END IF;

    PERFORM set_config(
      'estimator.test_initial_checksum_matches',
      (SELECT model.checksum = estimator.pricing_model_definition_checksum(model.id)
       FROM estimator.pricing_models AS model
       WHERE model.id = '20000000-0000-4000-8000-000000000001')::text,
      true
    );

    INSERT INTO estimator.estimates (
      id, public_ref, calculator_type, pricing_model_id, pricing_model_version,
      engine_version, answers_snapshot, calculation_snapshot,
      catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
      confidence, manual_review_required, review_reasons, free_text
    ) VALUES (
      '40000000-0000-4000-8000-000000000001',
      '40000000000040008000000000000001',
      'business',
      '20000000-0000-4000-8000-000000000001',
      '1.0.0',
      '1.0.0',
      '{"calculatorType":"business","answers":{}}',
      '{"engineVersion":"1.0.0","pricingModelId":"20000000-0000-4000-8000-000000000001","pricingModelVersion":"1.0.0","catchup":{"minCents":100,"maxCents":200,"lineItems":[{"code":"core_test","ruleCode":"core_test","label":"Test item","category":"catchup","branch":"business","minCents":100,"maxCents":200,"quantity":1,"unit":"return","sourceAnswers":{},"explanation":"Test explanation"}]},"ongoing":{"minCents":50,"maxCents":100,"lineItems":[{"code":"conditional_unit","ruleCode":"conditional_unit","label":"Ongoing item","category":"ongoing","branch":"business","minCents":50,"maxCents":100,"quantity":1,"unit":"entity","sourceAnswers":{},"explanation":"Conditional explanation"}]},"confidence":"good","confidenceReasons":[],"confidencePoints":{"business":0},"complexityScores":{"business":0},"manualReviewRequired":false,"reviewFlags":[],"reviewReasons":[]}',
      100, 200, 50, 100, 'good', false, '[]', 'Test note'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO estimator.estimates (
      id, public_ref, calculator_type, pricing_model_id, pricing_model_version,
      engine_version, answers_snapshot, calculation_snapshot,
      catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
      confidence, manual_review_required, review_reasons, supersedes_estimate_id
    ) VALUES (
      '40000000-0000-4000-8000-000000000006',
      '40000000000040008000000000000006',
      'business',
      '20000000-0000-4000-8000-000000000001',
      '1.0.0',
      '1.0.0',
      '{"calculatorType":"business","answers":{}}',
      '{"engineVersion":"1.0.0","pricingModelId":"20000000-0000-4000-8000-000000000001","pricingModelVersion":"1.0.0","catchup":{"minCents":100,"maxCents":200,"lineItems":[]},"ongoing":{"minCents":50,"maxCents":100,"lineItems":[]},"confidence":"good","confidenceReasons":[],"confidencePoints":{"business":0},"complexityScores":{"business":0},"manualReviewRequired":false,"reviewFlags":[],"reviewReasons":[]}',
      100, 200, 50, 100, 'good', false, '[]',
      '40000000-0000-4000-8000-000000000001'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO estimator.leads (
      id, estimate_id, state, full_name, email, contact_consent_at
    ) VALUES (
      '60000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'NEW', 'Test Prospect', 'prospect@example.invalid', now()
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

SELECT is(
  current_setting('estimator.test_initial_checksum_matches', true),
  'true',
  'activation stores the checksum of canonical model fields and ordered rules'
);
SELECT is(
  pg_temp.query_jsonb(
    $sql$SELECT estimator.pricing_model_activation_projection('20000000-0000-4000-8000-000000000001'::uuid)$sql$
  ),
  '{"id":"20000000-0000-4000-8000-000000000001","version":"1.0.0","engineVersion":"1.0.0","currency":"ZAR","state":"ACTIVE","confidenceThresholds":{"highMaxPoints":0,"goodMaxPoints":1},"rules":[{"type":"FIXED_RANGE","scope":"business","category":"catchup","code":"core_test","label":"Test rule one","explanation":"Test explanation","range":{"minCents":100,"maxCents":200}},{"type":"PER_UNIT_RANGE","scope":"business","category":"ongoing","code":"conditional_unit","label":"Conditional unit rule","explanation":"Conditional explanation","inputKey":"business.entityCount","when":{"inputKey":"business.entityType","value":"multiple_entities"},"unitLabel":"entity","unitRange":{"minCents":10,"maxCents":20}}]}'::jsonb,
  'database columns and JSONB rebuild the strict typed-rule DTO in sort order'
);
SELECT is(
  (
    SELECT reconstructed_rule
    FROM pg_catalog.jsonb_array_elements(
      estimator.pricing_model_activation_projection('20000000-0000-4000-8000-000000000004'::uuid)->'rules'
    ) AS projected(reconstructed_rule)
    WHERE reconstructed_rule->>'code' = 'ongoing_services_round_trip'
  ),
  '{"type":"SERVICE_ADDON_RANGE","scope":"business","category":"ongoing","code":"ongoing_services_round_trip","label":"Test ongoing services","explanation":"Synthetic database round-trip fixture.","inputKey":"business.ongoingServices","addOns":[{"value":"monthly_bookkeeping","label":"Test service","range":{"minCents":0,"maxCents":0}}]}'::jsonb,
  'business.ongoingServices SERVICE_ADDON_RANGE persists and reconstructs through the DTO projection'
);

SELECT ok(
  pg_catalog.to_regprocedure('estimator.activate_pricing_model(uuid,uuid,jsonb)') IS NOT NULL,
  'pricing activation requires the server-validated domain model payload'
);
SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$SELECT estimator.activate_pricing_model(
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '{"id":"20000000-0000-4000-8000-000000000002"}'::jsonb
    )$sql$,
    '22023'
  ),
  'activation rejects a DTO that does not match the locked draft model'
);
SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$SELECT estimator.activate_pricing_model(
      '20000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '{"id":"20000000-0000-4000-8000-000000000003"}'::jsonb
    )$sql$,
    '23514'
  ),
  'activation rejects V1 thresholds outside high=0 and good<=1'
);

SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$SELECT estimator.activate_pricing_model(
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      estimator.pricing_model_activation_projection('20000000-0000-4000-8000-000000000002')
    )$sql$,
    'P0001'
  ),
  'an activation failure aborts the replacement transaction'
);
SELECT is(
  (SELECT state::text FROM estimator.pricing_models WHERE id = '20000000-0000-4000-8000-000000000001'),
  'ACTIVE',
  'failed activation leaves the prior model active'
);
SELECT is(
  (SELECT state::text FROM estimator.pricing_models WHERE id = '20000000-0000-4000-8000-000000000002'),
  'DRAFT',
  'failed activation leaves the target draft unchanged'
);
DROP TRIGGER test_reject_second_model_activation ON estimator.pricing_models;

SET LOCAL ROLE service_role;
SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$UPDATE estimator.pricing_models
      SET state = 'ACTIVE', activated_at = now(),
          activated_by = '10000000-0000-4000-8000-000000000001',
          checksum = repeat('a', 64)
      WHERE id = '20000000-0000-4000-8000-000000000002'$sql$,
    '55000'
  ),
  'service-role table writes cannot bypass guarded model activation'
);
RESET ROLE;

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.estimates (
        id, public_ref, calculator_type, pricing_model_id, pricing_model_version,
        engine_version, answers_snapshot, calculation_snapshot,
        catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
        confidence, manual_review_required, review_reasons
      ) VALUES (
        '40000000-0000-4000-8000-000000000002', '40000000000040008000000000000002',
        'business', '20000000-0000-4000-8000-000000000001', '1.0.0', '1.0.0',
        '{}', '{}', -1, 0, 0, 0, 'good', false, '[]'
      )$sql$,
      '23514'
    )
  END,
  'negative estimate amounts are rejected'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.estimates (
        id, public_ref, calculator_type, pricing_model_id, pricing_model_version,
        engine_version, answers_snapshot, calculation_snapshot,
        catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
        confidence, manual_review_required, review_reasons
      ) VALUES (
        '40000000-0000-4000-8000-000000000003', '40000000000040008000000000000003',
        'business', '20000000-0000-4000-8000-000000000001', '1.0.0', '1.0.0',
        '{}', '{}', 201, 200, 0, 0, 'good', false, '[]'
      )$sql$,
      '23514'
    )
  END,
  'estimate minimum cannot exceed its maximum'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.estimates (
        id, public_ref, calculator_type, pricing_model_id, pricing_model_version,
        engine_version, answers_snapshot, calculation_snapshot,
        catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
        confidence, manual_review_required, review_reasons, free_text
      ) VALUES (
        '40000000-0000-4000-8000-000000000004', '40000000000040008000000000000004',
        'business', '20000000-0000-4000-8000-000000000001', '1.0.0', '1.0.0',
        '{}', '{}', 0, 0, 0, 0, 'good', false, '[]', repeat('x', 2001)
      )$sql$,
      '23514'
    )
  END,
  'free text over 2,000 characters is rejected'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'itemCode', item_code,
        'ruleCode', rule_code,
        'label', label,
        'category', category::text,
        'branch', branch::text,
        'minCents', min_cents,
        'maxCents', max_cents,
        'quantity', quantity,
        'unit', unit,
        'explanation', explanation,
        'sortOrder', sort_order
      ) ORDER BY sort_order
    )
    FROM estimator.estimate_line_items
    WHERE estimate_id = '40000000-0000-4000-8000-000000000001'
  ),
  '[{"itemCode":"core_test","ruleCode":"core_test","label":"Test item","category":"catchup","branch":"business","minCents":100,"maxCents":200,"quantity":1,"unit":"return","explanation":"Test explanation","sortOrder":0},{"itemCode":"conditional_unit","ruleCode":"conditional_unit","label":"Ongoing item","category":"ongoing","branch":"business","minCents":50,"maxCents":100,"quantity":1,"unit":"entity","explanation":"Conditional explanation","sortOrder":1}]'::jsonb,
  'relational line items are materialized from the immutable calculation snapshot in order'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimate_line_items') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.estimate_line_items (
        estimate_id, pricing_rule_id, item_code, rule_code, label, category, branch,
        min_cents, max_cents, explanation, sort_order
      ) VALUES (
        '40000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'negative_test', 'core_test', 'Bad item', 'catchup', 'business', -1, 0, 'Negative test', 2
      )$sql$,
      '23514'
    )
  END,
  'negative line-item amounts are rejected'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimate_line_items') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.estimate_line_items (
        estimate_id, pricing_rule_id, item_code, rule_code, label, category, branch,
        min_cents, max_cents, explanation, sort_order
      ) VALUES (
        '40000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002',
        'core_test', 'core_test', 'Mismatched rule', 'catchup', 'business', 0, 0, 'Mismatched rule', 3
      )$sql$,
      '23514'
    )
  END,
  'line items must reference a rule from their estimate pricing model'
);

SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$INSERT INTO estimator.estimate_line_items (
      estimate_id, pricing_rule_id, item_code, rule_code, label, category, branch,
      min_cents, max_cents, explanation, sort_order
    ) VALUES (
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'wrong_branch', 'core_test', 'Wrong branch', 'catchup', 'personal', 0, 0, 'Wrong branch', 4
    )$sql$,
    '23514'
  ),
  'line item branch must match the pricing rule scope'
);

SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$INSERT INTO estimator.estimate_line_items (
      estimate_id, pricing_rule_id, item_code, rule_code, label, category, branch,
      min_cents, max_cents, explanation, sort_order
    ) VALUES (
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'missing_explanation', 'core_test', 'Missing explanation', 'catchup', 'business', 0, 0, NULL, 5
    )$sql$,
    '23502'
  ),
  'line item explanation is required by the public estimate result'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.leads') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.leads (
        estimate_id, state, full_name, email, contact_consent_at
      ) VALUES (
        '40000000-0000-4000-8000-000000000001', 'NEW', 'Second Lead', 'second@example.invalid', now()
      )$sql$,
      '23505'
    )
  END,
  'an estimate cannot have two primary leads'
);

SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$INSERT INTO estimator.pricing_models (
      version, name, engine_contract_version, confidence_high_max_points,
      confidence_good_max_points, created_by
    ) VALUES (
      '1.0.0-01', 'Invalid SemVer', '1.0.0', 10, 20,
      '10000000-0000-4000-8000-000000000001'
    )$sql$,
    '23514'
  ),
  'pricing model versions enforce SemVer prerelease identifiers'
);
SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$INSERT INTO estimator.pricing_models (
      version, name, engine_contract_version, confidence_high_max_points,
      confidence_good_max_points, created_by
    ) VALUES (
      '2.0.0', 'Invalid thresholds', '1.0.0', 21, 20,
      '10000000-0000-4000-8000-000000000001'
    )$sql$,
    '23514'
  ),
  'confidence thresholds must be nonnegative and high cannot exceed good'
);
SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$INSERT INTO estimator.pricing_rules (
      id, pricing_model_id, code, label, scope, category, rule_type,
      input_key, explanation, conditions, parameters, enabled, sort_order
    ) VALUES (
      '30000000-0000-4000-8000-000000000006',
      '20000000-0000-4000-8000-000000000003',
      '1_invalid_code', 'Invalid code', 'business', 'catchup', 'FIXED_RANGE',
      NULL, 'Test explanation', '{}', '{"range":{"minCents":1,"maxCents":1}}', true, 2
    )$sql$,
    '23514'
  ),
  'persisted production rule codes must begin with a lowercase letter'
);
SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$INSERT INTO estimator.pricing_models (
      id, version, name, engine_contract_version, confidence_high_max_points,
      confidence_good_max_points, created_by
    ) VALUES (
      'not-a-uuid', '2.0.1', 'Invalid identifier', '1.0.0', 10, 20,
      '10000000-0000-4000-8000-000000000001'
    )$sql$,
    '22P02'
  ),
  'pricing model persistence rejects non-UUID identifiers'
);

SET LOCAL ROLE service_role;
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.pricing_models') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.pricing_models SET name = 'Changed active model' WHERE id = '20000000-0000-4000-8000-000000000001'$sql$,
      '55000'
    )
  END,
  'active pricing model content is immutable'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.pricing_rules') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.pricing_rules SET label = 'Changed active rule' WHERE id = '30000000-0000-4000-8000-000000000001'$sql$,
      '55000'
    )
  END,
  'active pricing rules are immutable'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.pricing_models') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.pricing_models SET state = 'ACTIVE' WHERE id = '20000000-0000-4000-8000-000000000002'$sql$,
      '55000'
    )
  END,
  'only the activation function may change model state'
);
RESET ROLE;

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.estimates SET catchup_min_cents = 101 WHERE id = '40000000-0000-4000-8000-000000000001'$sql$,
      '55000'
    )
  END,
  'saved estimate commercial fields are immutable'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimate_line_items') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.estimate_line_items SET min_cents = 101
        WHERE estimate_id = '40000000-0000-4000-8000-000000000001' AND sort_order = 0$sql$,
      '55000'
    )
  END,
  'saved estimate line items are immutable'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimate_line_items') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.estimate_line_items (
        id, estimate_id, pricing_rule_id, item_code, rule_code, label, category, branch,
        min_cents, max_cents, quantity, unit, explanation, sort_order
      ) VALUES (
        '50000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'core_test', 'core_test', 'Test item', 'catchup', 'business',
        100, 200, 1, 'return', 'Test explanation', 0
      )$sql$,
      '23505'
    )
  END,
  'an estimate cannot persist duplicate line-item ordering slots'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimate_line_items') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$DELETE FROM estimator.estimate_line_items
        WHERE estimate_id = '40000000-0000-4000-8000-000000000001' AND sort_order = 0$sql$,
      '55000'
    )
  END,
  'saved estimate line items cannot be deleted'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$DELETE FROM estimator.estimates WHERE id = '40000000-0000-4000-8000-000000000001'$sql$,
      '55000'
    )
  END,
  'saved estimates cannot be deleted'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.lead_events') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.lead_events SET note = 'Edited event' WHERE lead_id = '60000000-0000-4000-8000-000000000001'$sql$,
      '55000'
    )
  END,
  'lead events cannot be updated'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.lead_events') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$DELETE FROM estimator.lead_events WHERE lead_id = '60000000-0000-4000-8000-000000000001'$sql$,
      '55000'
    )
  END,
  'lead events cannot be deleted'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.leads') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.leads SET state = 'CLOSED_WON' WHERE id = '60000000-0000-4000-8000-000000000001'$sql$,
      '23514'
    )
  END,
  'lead lifecycle rejects invalid transitions'
);
SELECT ok(
  CASE WHEN pg_catalog.to_regprocedure('estimator.activate_pricing_model(uuid,uuid,jsonb)') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$SELECT estimator.activate_pricing_model(
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003',
        '{}'::jsonb
      )$sql$,
      '42501'
    )
  END,
  'advisor cannot activate a pricing model'
);

DO $$
DECLARE
  active_count integer;
BEGIN
  IF pg_catalog.to_regclass('estimator.pricing_models') IS NULL THEN
    active_count := 0;
  ELSE
    IF pg_catalog.to_regprocedure('estimator.activate_pricing_model(uuid,uuid,jsonb)') IS NOT NULL THEN
      PERFORM estimator.activate_pricing_model(
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001',
        '{"id":"20000000-0000-4000-8000-000000000002","version":"1.1.0","engineVersion":"1.0.0","currency":"ZAR","state":"DRAFT","confidenceThresholds":{"highMaxPoints":0,"goodMaxPoints":1},"rules":[{"type":"FIXED_RANGE","scope":"business","category":"catchup","code":"core_test","label":"Test rule two","explanation":"Test explanation","range":{"minCents":1,"maxCents":1}}]}'::jsonb
      );
    END IF;
    SELECT count(*)::integer INTO active_count
    FROM estimator.pricing_models
    WHERE state = 'ACTIVE';
  END IF;
  PERFORM set_config('estimator.test_active_model_count', active_count::text, true);
END;
$$;

SELECT is(
  current_setting('estimator.test_active_model_count', true),
  '1',
  'replacing a model commits exactly one active model'
);

SELECT ok(
  pg_temp.exec_sql($block$DO $$
  BEGIN
    UPDATE estimator.estimates
    SET state = 'SUPERSEDED', superseded_by_estimate_id = '40000000-0000-4000-8000-000000000006'
    WHERE id = '40000000-0000-4000-8000-000000000001';
    SET CONSTRAINTS ALL IMMEDIATE;
  END;
  $$;$block$),
  'estimate supersession requires a reciprocal replacement reference'
);

SET LOCAL ROLE anon;
SELECT ok(
  pg_temp.throws_sqlstate('SELECT * FROM estimator.estimates', '42501'),
  'anonymous clients cannot read estimates'
);
SELECT ok(
  pg_temp.throws_sqlstate(
    $sql$INSERT INTO estimator.estimates (calculator_type) VALUES ('business')$sql$,
    '42501'
  ),
  'anonymous clients cannot write estimates'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM estimator.estimates),
  0,
  'authenticated users without staff records cannot read estimates'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM estimator.estimates), 0, 'invited staff cannot read estimates');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM estimator.estimates), 0, 'suspended staff cannot read estimates');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000008', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000008","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM estimator.estimates), 0, 'deactivated staff cannot read estimates');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM estimator.estimates), 0, 'active staff below AAL2 cannot read estimates');
SELECT is((SELECT count(*)::integer FROM estimator.notification_deliveries), 0, 'viewers cannot read admin-only notification records');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.leads') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.leads SET state = 'CONTACTED' WHERE id = '60000000-0000-4000-8000-000000000001'$sql$,
      '42501'
    )
  END,
  'viewer cannot update a lead'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE service_role;
SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.leads') IS NULL THEN false ELSE
    pg_temp.exec_sql($sql$SELECT estimator.transition_lead(
      '60000000-0000-4000-8000-000000000001', 'CONTACTED',
      '10000000-0000-4000-8000-000000000001', 'follow_up', 'Test note'
    )$sql$)
  END,
  'server-only lead transition accepts an active administrator'
);
RESET ROLE;
DO $$
DECLARE
  actor_id uuid;
BEGIN
  IF pg_catalog.to_regclass('estimator.lead_events') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT actor_user_id FROM estimator.lead_events
      WHERE lead_id = '60000000-0000-4000-8000-000000000001'
        AND to_state = 'CONTACTED'
    $sql$ INTO actor_id;
  END IF;
  PERFORM set_config('estimator.test_actor_id', COALESCE(actor_id::text, ''), true);
END;
$$;
SELECT is(
  current_setting('estimator.test_actor_id', true),
  '10000000-0000-4000-8000-000000000001',
  'staff lead changes append an event with the authenticated actor'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.staff_users') IS NULL THEN false ELSE
    pg_temp.exec_sql(
      $sql$UPDATE estimator.staff_users SET state = 'DEACTIVATED' WHERE user_id = '10000000-0000-4000-8000-000000000002'$sql$
    )
    AND
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.staff_users SET state = 'DEACTIVATED' WHERE user_id = '10000000-0000-4000-8000-000000000001'$sql$,
      '23514'
    )
  END,
  'the last active administrator cannot be deactivated'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.estimates
      SET state = 'VOIDED', void_reason = NULL,
          voided_by = '10000000-0000-4000-8000-000000000001', voided_at = now()
      WHERE id = '40000000-0000-4000-8000-000000000006'$sql$,
      '23514'
    )
  END,
  'voiding an estimate requires a nonempty reason'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.exec_sql(
      $sql$UPDATE estimator.estimates
      SET state = 'VOIDED', void_reason = 'test correction',
          voided_by = '10000000-0000-4000-8000-000000000001', voided_at = now()
      WHERE id = '40000000-0000-4000-8000-000000000006'$sql$
    )
  END,
  'estimate lifecycle metadata permits a valid void transition'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.estimates') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.estimates
      SET state = 'VALID', void_reason = NULL, voided_by = NULL, voided_at = NULL
      WHERE id = '40000000-0000-4000-8000-000000000006'$sql$,
      '55000'
    )
  END,
  'voided estimates cannot return to a mutable state'
);

SELECT ok(
  CASE WHEN pg_catalog.to_regclass('estimator.notification_deliveries') IS NULL THEN false ELSE
    pg_temp.throws_sqlstate(
      $sql$INSERT INTO estimator.notification_deliveries (
        estimate_id, type, state, provider, attempt_count
      ) VALUES (
        '40000000-0000-4000-8000-000000000001', 'customer_estimate', 'PENDING', 'resend', -1
      )$sql$,
      '23514'
    )
  END,
  'notification attempt counts cannot be negative'
);

SELECT ok(
  pg_temp.exec_sql($block$DO $$
  BEGIN
    INSERT INTO estimator.notification_deliveries (
      id, estimate_id, type, state, provider, attempt_count
    ) VALUES (
      '70000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'customer_estimate', 'PENDING', 'resend', 0
    );
    UPDATE estimator.notification_deliveries
    SET state = 'SENT', attempt_count = 1, last_attempt_at = now(), sent_at = now(),
        provider_message_id = 'provider-message-1'
    WHERE id = '70000000-0000-4000-8000-000000000001';
    IF NOT pg_temp.throws_sqlstate(
      $sql$UPDATE estimator.notification_deliveries
      SET provider_message_id = 'provider-message-2'
      WHERE id = '70000000-0000-4000-8000-000000000001'$sql$,
      '55000'
    ) THEN
      RAISE EXCEPTION 'sent delivery was mutable';
    END IF;
  END;
  $$;$block$),
  'sent notification deliveries are terminal and immutable'
);

SELECT * FROM finish();
ROLLBACK;
