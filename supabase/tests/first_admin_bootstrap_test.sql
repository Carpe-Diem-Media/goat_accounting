BEGIN;
SELECT plan(43);

SELECT ok(to_regclass('estimator.staff_admin_audit') IS NOT NULL, 'the first-admin audit table exists');
SELECT ok(to_regclass('estimator.staff_admin_bootstrap_context') IS NOT NULL, 'the private transaction context table exists');
SELECT ok(to_regprocedure('estimator.provision_first_admin(uuid,text,text,boolean)') IS NOT NULL, 'the provision procedure exists');
SELECT ok(to_regprocedure('estimator.activate_first_admin(uuid,text,boolean)') IS NOT NULL, 'the activation procedure exists');
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'estimator.staff_admin_audit'::regclass)
  AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'estimator.staff_admin_bootstrap_context'::regclass),
  'audit and transaction context tables force row-level security'
);
SELECT ok(
  NOT has_table_privilege('anon', 'estimator.staff_admin_audit', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'estimator.staff_admin_audit', 'SELECT')
    AND NOT has_table_privilege('service_role', 'estimator.staff_admin_audit', 'SELECT')
    AND NOT has_table_privilege('anon', 'estimator.staff_admin_bootstrap_context', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'estimator.staff_admin_bootstrap_context', 'INSERT')
    AND NOT has_table_privilege('service_role', 'estimator.staff_admin_bootstrap_context', 'INSERT'),
  'API roles cannot read the audit or write transaction context'
);
SELECT ok(
  to_regprocedure('estimator.provision_first_admin(uuid,text,text,boolean)') IS NOT NULL
    AND has_function_privilege('service_role', to_regprocedure('estimator.provision_first_admin(uuid,text,text,boolean)'), 'EXECUTE')
    AND NOT has_function_privilege('anon', to_regprocedure('estimator.provision_first_admin(uuid,text,text,boolean)'), 'EXECUTE')
    AND NOT has_function_privilege('authenticated', to_regprocedure('estimator.provision_first_admin(uuid,text,text,boolean)'), 'EXECUTE')
    AND to_regprocedure('estimator.activate_first_admin(uuid,text,boolean)') IS NOT NULL
    AND has_function_privilege('service_role', to_regprocedure('estimator.activate_first_admin(uuid,text,boolean)'), 'EXECUTE')
    AND NOT has_function_privilege('anon', to_regprocedure('estimator.activate_first_admin(uuid,text,boolean)'), 'EXECUTE')
    AND NOT has_function_privilege('authenticated', to_regprocedure('estimator.activate_first_admin(uuid,text,boolean)'), 'EXECUTE'),
  'only service_role can execute the two bootstrap procedures'
);
SELECT ok(
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('estimator.provision_first_admin(uuid,text,text,boolean)'::regprocedure), 'pg_advisory_xact_lock') > 0
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('estimator.provision_first_admin(uuid,text,text,boolean)'::regprocedure), '20261103') > 0
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('estimator.activate_first_admin(uuid,text,boolean)'::regprocedure), 'pg_advisory_xact_lock') > 0
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('estimator.activate_first_admin(uuid,text,boolean)'::regprocedure), '20261103') > 0,
  'both procedures share the staff lifecycle advisory lock'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'estimator.staff_admin_audit'::regclass
      AND attnum > 0 AND NOT attisdropped AND attname IN ('email', 'email_address', 'access_token', 'refresh_token')
  ),
  'audit records contain no email address or Auth token columns'
);
SELECT ok(
  pg_catalog.strpos(pg_catalog.pg_get_functiondef('estimator.activate_first_admin(uuid,text,boolean)'::regprocedure), 'FOR UPDATE') > 0
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('estimator.activate_first_admin(uuid,text,boolean)'::regprocedure), 'FOR SHARE') > 0,
  'activation holds staff and Auth verification rows through the transaction'
);

INSERT INTO auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bootstrap-owner-1@example.invalid', now(), '{}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bootstrap-owner-2@example.invalid', now(), '{}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'bootstrap-owner-3@example.invalid', now(), '{}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'bootstrap-owner-4@example.invalid', now(), '{}', '{}', now(), now());

SET LOCAL ROLE service_role;
SELECT is(
  estimator.provision_first_admin(
    '71000000-0000-4000-8000-000000000001', 'owner-approval-test-1', 'identity-check-test-1', false
  )->>'status',
  'ready',
  'provision preflight accepts an existing Auth identity without writing'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000001'),
  0,
  'provision preflight creates no row for its target identity'
);
SELECT is((SELECT count(*)::integer FROM estimator.staff_admin_audit), 0, 'provision preflight creates no audit event');

SET LOCAL ROLE service_role;
SELECT is(
  estimator.provision_first_admin(
    '71000000-0000-4000-8000-000000000001', 'owner-approval-test-1', 'identity-check-test-1', true
  )->>'status',
  'completed',
  'provision creates the first administrator invitation'
);
RESET ROLE;
SELECT is(
  (SELECT role::text || ':' || state::text FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000001'),
  'admin:INVITED',
  'the provisioned administrator remains invited'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM estimator.staff_admin_audit
    WHERE operation = 'first_admin_provision'
      AND target_user_id = '71000000-0000-4000-8000-000000000001'
      AND previous_state IS NULL
      AND resulting_state = 'INVITED'
      AND owner_authorization_ref = 'owner-approval-test-1'
      AND identity_verification_ref = 'identity-check-test-1'
  ),
  'provision audit records the transition and both owner references'
);
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $sql$UPDATE estimator.staff_users SET role = 'viewer' WHERE user_id = '71000000-0000-4000-8000-000000000001'$sql$,
  '42501', NULL, 'direct service-role role changes cannot invalidate the invited administrator'
);
RESET ROLE;
SELECT is(
  (SELECT role::text || ':' || state::text FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000001'),
  'admin:INVITED',
  'rejected role change preserves the invited administrator candidate'
);
UPDATE estimator.staff_users
SET role = 'admin'
WHERE user_id = '71000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $sql$SELECT estimator.provision_first_admin('71000000-0000-4000-8000-000000000099', 'owner-approval-test-1', 'identity-check-test-1', false)$sql$,
  '55000', NULL, 'provision rejects an Auth identity that does not exist'
);
SELECT throws_ok(
  $sql$SELECT estimator.provision_first_admin('71000000-0000-4000-8000-000000000001', 'owner-approval-test-2', 'identity-check-test-1', true)$sql$,
  '55000', NULL, 'a second provision attempt is rejected'
);
SELECT throws_ok(
  $sql$SELECT estimator.activate_first_admin('71000000-0000-4000-8000-000000000001', 'owner-activation-test-1', false)$sql$,
  '55000', NULL, 'activation preflight rejects an identity without verified TOTP'
);
SELECT throws_ok(
  $sql$SELECT estimator.activate_first_admin('71000000-0000-4000-8000-000000000002', 'owner-activation-test-1', false)$sql$,
  '55000', NULL, 'activation rejects an identity other than the provisioned candidate'
);
RESET ROLE;
SELECT is(
  (SELECT state::text FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000001'),
  'INVITED',
  'failed MFA preflight leaves the staff row invited'
);

INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at, secret)
VALUES (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'totp', 'verified', now(), now(), 'pgTAP-fixture-only'
);
UPDATE auth.users SET email_confirmed_at = NULL WHERE id = '71000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $sql$SELECT estimator.activate_first_admin('71000000-0000-4000-8000-000000000001', 'owner-activation-test-1', false)$sql$,
  '55000', NULL, 'activation rejects an unconfirmed Auth email even with verified TOTP'
);
RESET ROLE;
SELECT is(
  (SELECT state::text FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000001'),
  'INVITED',
  'unconfirmed email leaves the staff row invited'
);
UPDATE auth.users SET email_confirmed_at = now() WHERE id = '71000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT is(
  estimator.activate_first_admin('71000000-0000-4000-8000-000000000001', 'owner-activation-test-1', false)->>'status',
  'ready',
  'activation preflight accepts confirmed email and verified TOTP'
);
SELECT throws_ok(
  $sql$SELECT estimator.activate_first_admin('71000000-0000-4000-8000-000000000001', 'owner-approval-test-1', false)$sql$,
  '55000', NULL, 'activation requires a distinct owner authorization reference'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM estimator.staff_admin_audit WHERE operation = 'first_admin_activate'),
  0,
  'activation preflight creates no audit event'
);

INSERT INTO estimator.staff_users (user_id, role, state)
VALUES ('71000000-0000-4000-8000-000000000004', 'viewer', 'INVITED');
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $sql$INSERT INTO estimator.staff_users (user_id, role, state) VALUES ('71000000-0000-4000-8000-000000000002', 'admin', 'INVITED')$sql$,
  '42501', NULL, 'direct service-role admin invitation insert is rejected'
);
SELECT throws_ok(
  $sql$UPDATE estimator.staff_users SET state = 'ACTIVE' WHERE user_id = '71000000-0000-4000-8000-000000000001'$sql$,
  '42501', NULL, 'direct service-role activation is rejected'
);
SELECT throws_ok(
  $sql$UPDATE estimator.staff_users SET state = 'SUSPENDED' WHERE user_id = '71000000-0000-4000-8000-000000000004'$sql$,
  '42501', NULL, 'direct service-role state changes require an authorized procedure'
);
SELECT throws_ok(
  $sql$UPDATE estimator.staff_users SET role = 'advisor' WHERE user_id = '71000000-0000-4000-8000-000000000004'$sql$,
  '42501', NULL, 'direct service-role changes between non-admin roles are rejected'
);
SELECT is(
  (SELECT role::text FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000004'),
  'viewer',
  'rejected non-admin role change preserves the staff role'
);
SELECT throws_ok(
  $sql$INSERT INTO estimator.staff_admin_bootstrap_context (transaction_id, backend_pid, target_user_id, operation) VALUES (pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), '71000000-0000-4000-8000-000000000001', 'activate')$sql$,
  '42501', NULL, 'service_role cannot forge private transaction context'
);
RESET ROLE;
UPDATE estimator.staff_users
SET role = 'viewer'
WHERE user_id = '71000000-0000-4000-8000-000000000004';

CREATE FUNCTION pg_temp.reject_bootstrap_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'synthetic audit sink failure' USING ERRCODE = 'P0001';
END;
$$;
CREATE TRIGGER first_admin_test_reject_audit
  BEFORE INSERT ON estimator.staff_admin_audit
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_bootstrap_audit_insert();
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $sql$SELECT estimator.activate_first_admin('71000000-0000-4000-8000-000000000001', 'owner-activation-test-1', true)$sql$,
  'P0001', 'synthetic audit sink failure', 'activation rolls back if its audit insert fails'
);
RESET ROLE;
DROP TRIGGER first_admin_test_reject_audit ON estimator.staff_admin_audit;
DROP FUNCTION pg_temp.reject_bootstrap_audit_insert();
SELECT is(
  (SELECT state::text FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000001'),
  'INVITED',
  'audit failure rolls back the staff activation'
);

SET LOCAL ROLE service_role;
SELECT is(
  estimator.activate_first_admin('71000000-0000-4000-8000-000000000001', 'owner-activation-test-1', true)->>'status',
  'completed',
  'separately authorized activation succeeds after verified TOTP'
);
RESET ROLE;
SELECT is(
  (SELECT state::text FROM estimator.staff_users WHERE user_id = '71000000-0000-4000-8000-000000000001'),
  'ACTIVE',
  'successful activation changes the invited administrator to active'
);
SELECT is((SELECT count(*)::integer FROM estimator.staff_admin_audit), 2, 'provision and activation each append one audit event');
SELECT throws_ok(
  $sql$UPDATE estimator.staff_admin_audit SET owner_authorization_ref = 'changed' WHERE operation = 'first_admin_provision'$sql$,
  '55000', 'staff admin audit is append-only', 'audit rows cannot be updated'
);
SELECT throws_ok(
  $sql$DELETE FROM estimator.staff_admin_audit WHERE operation = 'first_admin_provision'$sql$,
  '55000', 'staff admin audit is append-only', 'audit rows cannot be deleted'
);

SELECT throws_ok(
  $sql$UPDATE estimator.staff_users SET state = 'DEACTIVATED' WHERE user_id = '71000000-0000-4000-8000-000000000001'$sql$,
  '23514', 'the last active administrator cannot be removed', 'the existing last-active-admin guard still applies'
);

INSERT INTO estimator.staff_users (user_id, role, state)
VALUES ('71000000-0000-4000-8000-000000000003', 'viewer', 'INVITED');
UPDATE estimator.staff_users SET state = 'DEACTIVATED' WHERE user_id = '71000000-0000-4000-8000-000000000003';
SELECT throws_ok(
  $sql$UPDATE estimator.staff_users SET role = 'advisor' WHERE user_id = '71000000-0000-4000-8000-000000000003'$sql$,
  '23514', 'DEACTIVATED staff records are terminal', 'the existing terminal deactivation guard still applies'
);

SELECT * FROM finish();
ROLLBACK;
