-- Run only against the disposable local Goat Supabase instance as a test administrator.
-- The committed synthetic fixture is required for visibility across independent sessions.
BEGIN;

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
      confidence, manual_review_required, review_reasons
    ) VALUES (
      '40000000-0000-4000-8000-000000000006',
      '40000000000040008000000000000006',
      'business',
      '20000000-0000-4000-8000-000000000001',
      '1.0.0',
      '1.0.0',
      '{"calculatorType":"business","answers":{}}',
      '{"engineVersion":"1.0.0","pricingModelId":"20000000-0000-4000-8000-000000000001","pricingModelVersion":"1.0.0","catchup":{"minCents":0,"maxCents":0,"lineItems":[]},"ongoing":{"minCents":0,"maxCents":0,"lineItems":[]},"confidence":"good","confidenceReasons":[],"confidencePoints":{"business":0},"complexityScores":{"business":0},"manualReviewRequired":false,"reviewFlags":[],"reviewReasons":[]}',
      0, 0, 0, 0, 'good', false, '[]'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO estimator.leads (
      id, estimate_id, state, full_name, email, contact_consent_at, requested_contact, requested_estimate_email
    ) VALUES (
      '60000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'NEW', 'Test Prospect', 'prospect@example.invalid', now(), true, false
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

INSERT INTO estimator.estimates (
  id, public_ref, calculator_type, pricing_model_id, pricing_model_version, engine_version,
  answers_snapshot, calculation_snapshot, catchup_min_cents, catchup_max_cents,
  ongoing_min_cents, ongoing_max_cents, confidence, manual_review_required, review_reasons
)
SELECT ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '40000000000040008000' || lpad(n::text, 12, '0'), calculator_type, pricing_model_id,
  pricing_model_version, engine_version, answers_snapshot, calculation_snapshot,
  catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
  confidence, manual_review_required, review_reasons
FROM estimator.estimates CROSS JOIN generate_series(7, 10) AS n
WHERE id = '40000000-0000-4000-8000-000000000006';

CREATE FUNCTION pg_temp.reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estimate_id = '40000000-0000-4000-8000-000000000009' THEN
    RAISE EXCEPTION 'synthetic delivery failure' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_reject_delivery BEFORE INSERT ON estimator.notification_deliveries
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_delivery();

COMMIT;
CREATE EXTENSION IF NOT EXISTS dblink;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions, pg_catalog;
SELECT plan(4);
SELECT dblink_connect('first', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('second', 'dbname=postgres user=supabase_admin application_name=task7_second');
SELECT dblink_exec('first', 'SET ROLE service_role');
SELECT dblink_exec('second', 'SET ROLE service_role');
SELECT dblink_exec('first', 'BEGIN');
SELECT dblink_send_query('first', $$SELECT estimator.create_contact_lead('40000000-0000-4000-8000-000000000007','Concurrent Prospect','concurrent@example.invalid',NULL,NULL,'email',true,true,true)$$);
CREATE TEMP TABLE concurrent_results (id uuid);
INSERT INTO concurrent_results SELECT id FROM dblink_get_result('first') AS result(id uuid);
SELECT * FROM dblink_get_result('first') AS result(id uuid);
SELECT dblink_send_query('second', $$SELECT estimator.create_contact_lead('40000000-0000-4000-8000-000000000007','Concurrent Prospect','concurrent@example.invalid',NULL,NULL,'email',true,true,true)$$);
DO $$
BEGIN
  FOR attempt IN 1..500 LOOP
    IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'task7_second' AND wait_event_type = 'Lock') THEN
      RETURN;
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  RAISE EXCEPTION 'second submission did not wait for the first transaction';
END;
$$;
SELECT dblink_exec('first', 'COMMIT');
INSERT INTO concurrent_results SELECT id FROM dblink_get_result('second') AS result(id uuid);
SELECT is((SELECT count(DISTINCT id)::integer FROM concurrent_results), 1, 'concurrent submissions return the same lead');
SELECT is((SELECT count(*)::integer FROM estimator.leads WHERE estimate_id='40000000-0000-4000-8000-000000000007'),1,'concurrent submissions create one lead');
SELECT is((SELECT count(*)::integer FROM estimator.lead_events e JOIN estimator.leads l ON l.id=e.lead_id WHERE l.estimate_id='40000000-0000-4000-8000-000000000007'),1,'concurrent submissions create one event');
SELECT is((SELECT count(*)::integer FROM estimator.notification_deliveries d LEFT JOIN estimator.leads l ON l.id=d.lead_id WHERE l.estimate_id='40000000-0000-4000-8000-000000000007' OR d.estimate_id='40000000-0000-4000-8000-000000000007'),2,'concurrent submissions create only the two requested deliveries');
SELECT dblink_disconnect('first');
SELECT dblink_disconnect('second');
SELECT * FROM finish();
