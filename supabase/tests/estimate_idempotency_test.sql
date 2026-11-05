BEGIN;

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '93000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'idempotency-test-admin@example.invalid', '{}', '{}', now(), now()
);
INSERT INTO estimator.staff_users (user_id, role, state)
VALUES ('93000000-0000-4000-8000-000000000001', 'admin', 'ACTIVE');
INSERT INTO estimator.pricing_models (
  id, version, name, state, engine_contract_version,
  confidence_high_max_points, confidence_good_max_points, created_by
) VALUES (
  '93000000-0000-4000-8000-000000000010', '1.0.0', 'Idempotency test model', 'DRAFT', '1.0.0', 0, 1,
  '93000000-0000-4000-8000-000000000001'
);
INSERT INTO estimator.pricing_rules (
  id, pricing_model_id, code, label, scope, category, rule_type,
  input_key, explanation, conditions, parameters, enabled, sort_order
) VALUES (
  '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000010',
  'test_catchup', 'Test catch-up', 'business', 'catchup', 'FIXED_RANGE',
  NULL, 'Synthetic database test rule.', '{}', '{"range":{"minCents":0,"maxCents":0}}', true, 1
);
SELECT estimator.activate_pricing_model(
  '93000000-0000-4000-8000-000000000010',
  '93000000-0000-4000-8000-000000000001',
  estimator.pricing_model_activation_projection('93000000-0000-4000-8000-000000000010')
);

CREATE FUNCTION pg_temp.try_duplicate_idempotency_estimate()
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  error_state text;
  violated_constraint text;
BEGIN
  INSERT INTO estimator.estimates (
    id, calculator_type, pricing_model_id, pricing_model_version, engine_version,
    answers_snapshot, calculation_snapshot,
    catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
    confidence, manual_review_required, review_reasons,
    idempotency_key_hash, request_fingerprint_hash
  ) VALUES (
    '93000000-0000-4000-8000-000000000003', 'business',
    '93000000-0000-4000-8000-000000000010', '1.0.0', '1.0.0',
    '{"calculatorType":"business","answers":{}}',
    '{"engineVersion":"1.0.0","pricingModelId":"93000000-0000-4000-8000-000000000010","pricingModelVersion":"1.0.0","catchup":{"minCents":0,"maxCents":0,"lineItems":[]},"ongoing":{"minCents":0,"maxCents":0,"lineItems":[]},"confidence":"good","confidenceReasons":[],"confidencePoints":{"business":0},"complexityScores":{"business":0},"manualReviewRequired":false,"reviewFlags":[],"reviewReasons":[]}',
    0, 0, 0, 0, 'good', false, '[]', repeat('a', 64), repeat('c', 64)
  );
  RETURN 'inserted';
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS
    error_state = RETURNED_SQLSTATE,
    violated_constraint = CONSTRAINT_NAME;
  RETURN error_state || ':' || violated_constraint;
END;
$$;

CREATE FUNCTION pg_temp.try_invalid_line_item_estimate()
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  error_state text;
  error_message text;
BEGIN
  INSERT INTO estimator.estimates (
    id, calculator_type, pricing_model_id, pricing_model_version, engine_version,
    answers_snapshot, calculation_snapshot,
    catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
    confidence, manual_review_required, review_reasons,
    idempotency_key_hash, request_fingerprint_hash
  ) VALUES (
    '93000000-0000-4000-8000-000000000004', 'business',
    '93000000-0000-4000-8000-000000000010', '1.0.0', '1.0.0',
    '{"calculatorType":"business","answers":{}}',
    '{"engineVersion":"1.0.0","pricingModelId":"93000000-0000-4000-8000-000000000010","pricingModelVersion":"1.0.0","catchup":{"minCents":0,"maxCents":0,"lineItems":[{"code":"test_catchup","ruleCode":"test_catchup","label":"Valid first item","category":"catchup","branch":"business","minCents":0,"maxCents":0,"quantity":1,"unit":"return","sourceAnswers":{},"explanation":"Synthetic test item."},{"code":"missing_rule","ruleCode":"missing_rule","label":"Invalid second item","category":"catchup","branch":"business","minCents":0,"maxCents":0,"quantity":1,"unit":"return","sourceAnswers":{},"explanation":"Synthetic invalid item."}]},"ongoing":{"minCents":0,"maxCents":0,"lineItems":[]},"confidence":"good","confidenceReasons":[],"confidencePoints":{"business":0},"complexityScores":{"business":0},"manualReviewRequired":false,"reviewFlags":[],"reviewReasons":[]}',
    0, 0, 0, 0, 'good', false, '[]', repeat('e', 64), repeat('f', 64)
  );
  RETURN 'inserted';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    error_state = RETURNED_SQLSTATE,
    error_message = MESSAGE_TEXT;
  RETURN error_state || ':' || error_message;
END;
$$;

SELECT plan(9);

SELECT has_column(
  'estimator',
  'estimates',
  'idempotency_key_hash',
  'estimates store only the hash of the request key'
);

SELECT has_column(
  'estimator',
  'estimates',
  'request_fingerprint_hash',
  'estimates store a canonical request fingerprint hash'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_row.indexrelid
    WHERE index_row.indrelid = 'estimator.estimates'::regclass
      AND index_row.indisunique
      AND index_class.relname = 'estimates_idempotency_key_hash_uidx'
      AND index_row.indpred IS NOT NULL
  ),
  'a unique partial index serializes requests that share an idempotency key hash'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'estimator.estimates'::regclass
      AND constraint_row.conname = 'estimates_idempotency_hash_pair_check'
  ),
  'the idempotency key and request fingerprint are stored together'
);

INSERT INTO estimator.estimates (
  id, calculator_type, pricing_model_id, pricing_model_version, engine_version,
  answers_snapshot, calculation_snapshot,
  catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
  confidence, manual_review_required, review_reasons,
  idempotency_key_hash, request_fingerprint_hash
) VALUES (
  '93000000-0000-4000-8000-000000000002', 'business',
  '93000000-0000-4000-8000-000000000010', '1.0.0', '1.0.0',
  '{"calculatorType":"business","answers":{}}',
  '{"engineVersion":"1.0.0","pricingModelId":"93000000-0000-4000-8000-000000000010","pricingModelVersion":"1.0.0","catchup":{"minCents":0,"maxCents":0,"lineItems":[]},"ongoing":{"minCents":0,"maxCents":0,"lineItems":[]},"confidence":"good","confidenceReasons":[],"confidencePoints":{"business":0},"complexityScores":{"business":0},"manualReviewRequired":false,"reviewFlags":[],"reviewReasons":[]}',
  0, 0, 0, 0, 'good', false, '[]', repeat('a', 64), repeat('b', 64)
);

SELECT is(
  pg_temp.try_duplicate_idempotency_estimate(),
  '23505:estimates_idempotency_key_hash_uidx',
  'the unique index rejects a second snapshot for the same request-key hash'
);

SELECT is(
  (SELECT count(*)::integer FROM estimator.estimates WHERE idempotency_key_hash = repeat('a', 64)),
  1,
  'a rejected duplicate leaves one persisted snapshot'
);

SELECT is(
  pg_temp.try_invalid_line_item_estimate(),
  '23514:snapshot line item must reference an enabled rule in its pricing model',
  'an invalid second line item rejects the estimate insert'
);

SELECT is(
  (SELECT count(*)::integer FROM estimator.estimates WHERE id = '93000000-0000-4000-8000-000000000004'),
  0,
  'an invalid line item leaves no estimate row'
);

SELECT is(
  (SELECT count(*)::integer FROM estimator.estimate_line_items WHERE estimate_id = '93000000-0000-4000-8000-000000000004'),
  0,
  'an invalid line item rolls back earlier materialized items'
);

SELECT * FROM finish();
ROLLBACK;
