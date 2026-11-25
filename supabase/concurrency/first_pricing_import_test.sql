-- Run within a transaction against the disposable Supabase project.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = estimator, extensions, public, pg_catalog;
SELECT plan(14);

CREATE TEMP TABLE import_fixture AS
SELECT :'definition'::text AS definition, :'fingerprint'::text AS fingerprint;

CREATE FUNCTION pg_temp.import_with_change(path text[], value jsonb)
RETURNS uuid LANGUAGE sql AS $$
  SELECT estimator.import_first_pricing_draft(
    '23000000-0000-4000-8000-000000000001', changed,
    encode(extensions.digest(convert_to(changed, 'UTF8'), 'sha256'), 'hex'), 'GOAT-23#test')
  FROM (SELECT jsonb_set(definition::jsonb, path, value)::text AS changed FROM import_fixture) f;
$$;

SELECT ok(NOT has_function_privilege('authenticated','estimator.import_first_pricing_draft(uuid,text,text,text)','EXECUTE'), 'browser callers cannot execute');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft(NULL,definition,fingerprint,'GOAT-23#test') FROM import_fixture$$,
  '42501','Active administrator required','unauthorized actor rejected');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',definition,repeat('0',64),'GOAT-23#test') FROM import_fixture$$,
  '22023','Invalid import authorization or fingerprint','fingerprint mismatch rejected');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',definition,fingerprint,NULL) FROM import_fixture$$,
  '22023','Invalid import authorization or fingerprint','missing owner authorization rejected');
SELECT throws_ok($$SELECT pg_temp.import_with_change('{model,rules}','[]')$$,
  '22023','Invalid first pricing draft','empty rules rejected');
SELECT throws_ok($$SELECT pg_temp.import_with_change('{model,rules,0,code}','"INVALID"')$$,
  '23514',NULL,'bad rule rolls back');
SELECT throws_ok($$SELECT pg_temp.import_with_change('{enabled,0}','false')$$,
  '23514','Persisted pricing definition differs from the imported candidate','projection mismatch rolls back');
SELECT is((SELECT count(*) FROM estimator.pricing_models),0::bigint,'no model after failures');
CREATE FUNCTION pg_temp.reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit failure fixture';
END;
$$;
CREATE TRIGGER reject_test_audit BEFORE INSERT ON estimator.first_pricing_import_audit
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_audit();
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',definition,fingerprint,'GOAT-23#test') FROM import_fixture$$,
 'P0001','Audit failure fixture','audit failure aborts the import');
SELECT ok(NOT EXISTS (SELECT FROM estimator.pricing_models) AND NOT EXISTS (SELECT FROM estimator.pricing_rules)
 AND NOT EXISTS (SELECT FROM estimator.first_pricing_import_audit),'audit failure leaves all three tables empty');
DROP TRIGGER reject_test_audit ON estimator.first_pricing_import_audit;
SELECT lives_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',definition,fingerprint,'GOAT-23#test') FROM import_fixture$$,'starter imports successfully');
SELECT is((SELECT state::text FROM estimator.pricing_models),'DRAFT','bootstrap never activates');
SELECT ok(EXISTS(SELECT FROM estimator.first_pricing_import_audit a JOIN import_fixture f ON a.fingerprint=f.fingerprint
  WHERE a.actor_id='23000000-0000-4000-8000-000000000001' AND a.owner_authorization_ref='GOAT-23#test'
    AND a.definition_checksum=estimator.pricing_model_definition_checksum(a.model_id)),'audit binds actor, fingerprint, definition checksum and authorization');
SELECT throws_ok($$SELECT estimator.import_first_pricing_draft('23000000-0000-4000-8000-000000000001',definition,fingerprint,'GOAT-23#test') FROM import_fixture$$,
  '23505','First pricing draft already exists','duplicate rejected');
SELECT * FROM finish();
