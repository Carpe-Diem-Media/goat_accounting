BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = estimator, extensions, public;

SELECT plan(12);
SELECT ok(to_regclass('estimator.pricing_acceptance_manifests') IS NOT NULL, 'acceptance revisions are persisted');
SELECT ok(to_regclass('estimator.pricing_acceptance_events') IS NOT NULL, 'acceptance transitions are audited');
SELECT ok(NOT has_function_privilege('service_role', 'estimator.activate_pricing_model(uuid,uuid,jsonb)', 'EXECUTE'), 'legacy activation is private');
SELECT ok(NOT has_table_privilege('authenticated', 'estimator.pricing_models', 'UPDATE'), 'browser cannot change model state');
SELECT ok(NOT EXISTS (
  SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
  WHERE n.nspname = 'estimator' AND p.proname IN ('submit_pricing_acceptance', 'approve_pricing_acceptance', 'activate_accepted_pricing_model', 'activate_pricing_model')
    AND has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
), 'no public or signed-in Data API caller can write or activate acceptance');
SELECT ok(NOT has_table_privilege('authenticated', 'estimator.pricing_acceptance_manifests', 'SELECT'), 'manifest reports require the server');
SELECT ok(NOT has_table_privilege('anon', 'estimator.pricing_acceptance_manifests', 'SELECT'), 'anonymous cannot read manifests');
SELECT ok(has_table_privilege('service_role', 'estimator.pricing_acceptance_manifests', 'SELECT'), 'server can read manifest revisions');
SELECT ok(NOT has_table_privilege('service_role', 'estimator.pricing_acceptance_manifests', 'INSERT,UPDATE,DELETE'), 'server key cannot write manifests directly');
SELECT ok(NOT has_table_privilege('service_role', 'estimator.pricing_acceptance_events', 'INSERT,UPDATE,DELETE'), 'server key cannot write audit history directly');
SELECT ok((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN (
  'estimator.pricing_acceptance_manifests'::regclass, 'estimator.pricing_acceptance_events'::regclass)), 'both acceptance tables force RLS');
SELECT ok((
  SELECT count(*) = 3 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'estimator' AND p.proname IN ('submit_pricing_acceptance', 'approve_pricing_acceptance', 'activate_accepted_pricing_model')
    AND has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'only the new server RPCs can submit, approve and activate acceptance');
SELECT * FROM finish();
ROLLBACK;
