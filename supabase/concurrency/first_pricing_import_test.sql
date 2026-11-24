-- Run inside a transaction with the two migrations installed and candidate JSON/fingerprint supplied.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = estimator, extensions, public, pg_catalog;
SELECT plan(9);

INSERT INTO auth.users(id,email) VALUES ('23000000-0000-4000-8000-000000000001','pricing-test@example.invalid');
INSERT INTO estimator.staff_users(user_id,role,state)
VALUES ('23000000-0000-4000-8000-000000000001','admin','ACTIVE');
CREATE TEMP TABLE import_fixture AS SELECT :'candidate'::jsonb AS model, :'fingerprint'::text AS fingerprint;

SELECT ok(NOT has_function_privilege('authenticated','estimator.import_first_pricing_draft(uuid,jsonb,text)','EXECUTE'), 'browser callers cannot invoke the import');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft(NULL,model,fingerprint) FROM import_fixture$$,
  '42501','Active administrator required','database rejects an unauthorized actor');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',model || '{"rules":[]}',fingerprint) FROM import_fixture$$,
  '22023','Invalid first pricing draft','empty rules rejected');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',
  jsonb_set(model,'{rules,0,code}','"INVALID"'),fingerprint) FROM import_fixture$$,
  '23514',NULL,'bad rule rolls back the model insert');
SELECT is((SELECT count(*) FROM estimator.pricing_models),0::bigint,'no model after failed rule insert');
SELECT lives_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',model,fingerprint) FROM import_fixture$$,'starter imports successfully');
SELECT is((SELECT state::text FROM estimator.pricing_models),'DRAFT','bootstrap never activates');
SELECT ok(EXISTS(SELECT FROM estimator.first_pricing_import_audit a JOIN import_fixture f ON a.fingerprint=f.fingerprint
  WHERE a.actor_id='23000000-0000-4000-8000-000000000001'),'audit binds actor and fingerprint');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',model,fingerprint) FROM import_fixture$$,
  '23505','First pricing draft already exists','duplicate rejected');
SELECT * FROM finish();
