BEGIN;
SELECT plan(17);

SELECT ok(
  has_schema_privilege('authenticated', 'estimator', 'USAGE')
    AND has_schema_privilege('service_role', 'estimator', 'USAGE')
    AND NOT has_schema_privilege('anon', 'estimator', 'USAGE')
    AND has_type_privilege('authenticated', 'estimator.pricing_model_state', 'USAGE')
    AND has_type_privilege('service_role', 'estimator.pricing_model_state', 'USAGE')
    AND NOT has_type_privilege('anon', 'estimator.pricing_model_state', 'USAGE'),
  'only authenticated and server roles can use estimator objects and types'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_class AS rel
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'estimator'
      AND rel.relkind = 'r'
      AND rel.relrowsecurity
      AND rel.relforcerowsecurity
  ),
  8,
  'all estimator tables enforce row-level security'
);

SELECT ok(
  (
    SELECT NOT has_schema_privilege('anon', ns.oid, 'USAGE')
    FROM pg_catalog.pg_namespace AS ns
    WHERE ns.nspname = 'estimator'
  ) IS TRUE,
  'anonymous clients cannot use the estimator schema'
);

SELECT ok(
  (
    SELECT count(*) = 8 AND bool_and(
      NOT has_table_privilege('anon', rel.oid, 'SELECT')
      AND NOT has_table_privilege('anon', rel.oid, 'INSERT')
      AND NOT has_table_privilege('anon', rel.oid, 'UPDATE')
      AND NOT has_table_privilege('anon', rel.oid, 'DELETE')
    )
    FROM pg_catalog.pg_class AS rel
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'estimator' AND rel.relkind = 'r'
  ),
  'anonymous clients have no table privileges'
);

SELECT ok(
  (
    SELECT count(*) = 8 AND bool_and(
      NOT has_table_privilege('authenticated', rel.oid, 'INSERT')
      AND NOT has_table_privilege('authenticated', rel.oid, 'UPDATE')
      AND NOT has_table_privilege('authenticated', rel.oid, 'DELETE')
    )
    FROM pg_catalog.pg_class AS rel
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'estimator' AND rel.relkind = 'r'
  ),
  'authenticated browser clients have no direct write privileges'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS idx
    WHERE idx.indrelid = pg_catalog.to_regclass('estimator.pricing_models')
      AND idx.indisunique
      AND idx.indpred IS NOT NULL
      AND pg_catalog.pg_get_expr(idx.indpred, idx.indrelid) ILIKE '%ACTIVE%'
  ),
  'a partial unique index permits at most one active pricing model'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = pg_catalog.to_regclass('estimator.estimates')
      AND con.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%_cents%'
  ),
  2,
  'estimate catch-up and ongoing ranges have database checks'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = pg_catalog.to_regclass('estimator.leads')
      AND con.contype = 'u'
      AND con.conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = con.conrelid AND attname = 'estimate_id')
      ]::smallint[]
  ),
  'each estimate can have at most one primary lead'
);

SELECT ok(
  (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'estimator' AND rel.relkind = 'r'
      AND con.contype = 'f'
    HAVING count(*) > 0 AND bool_and(con.confdeltype <> 'c')
  ) IS NOT NULL,
  'commercial history has no cascading foreign keys'
);

SELECT ok(
  (
    SELECT count(*) > 0 AND bool_and(
      EXISTS (
        SELECT 1 FROM unnest(proc.proconfig) AS setting
        WHERE setting LIKE 'search_path=%'
      )
    )
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'estimator' AND proc.prosecdef
  ),
  'every security-definer function has a fixed search path'
);

SELECT ok(
  (
    SELECT NOT has_function_privilege('service_role', proc.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', proc.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', proc.oid, 'EXECUTE')
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'estimator' AND proc.proname = 'activate_pricing_model'
  ) IS TRUE,
  'no Data API role can invoke pricing activation before candidate acceptance is integrated'
);

SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM estimator.activate_pricing_model(
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    );
    PERFORM set_config('estimator.test_direct_activation', 'allowed', true);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('estimator.test_direct_activation', SQLERRM, true);
  END;
END;
$$;
RESET ROLE;

SELECT is(
  current_setting('estimator.test_direct_activation', true),
  'permission denied for function activate_pricing_model',
  'service_role cannot directly invoke activation while the trusted acceptance gate is unavailable'
);

SELECT ok(
  (
    SELECT has_function_privilege('service_role', proc.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', proc.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', proc.oid, 'EXECUTE')
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'estimator' AND proc.proname = 'transition_lead'
  ) IS TRUE,
  'only the server secret role can invoke staff lead transitions'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'estimator'
      AND proc.proname IN ('pricing_model_definition_checksum', 'pricing_model_activation_projection')
      AND (has_function_privilege('anon', proc.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', proc.oid, 'EXECUTE')
        OR has_function_privilege('service_role', proc.oid, 'EXECUTE'))
  ),
  'internal pricing projection and checksum routines are not callable through Data API roles'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'estimator'
      AND (
        has_function_privilege('anon', proc.oid, 'EXECUTE')
        OR (has_function_privilege('authenticated', proc.oid, 'EXECUTE') AND proc.proname <> 'is_current_staff')
        OR (has_function_privilege('service_role', proc.oid, 'EXECUTE')
          AND proc.proname NOT IN ('is_current_staff', 'transition_lead', 'create_contact_lead'))
      )
  ),
  'no other estimator function is executable by Data API roles'
);

SELECT ok(
  has_table_privilege('service_role', 'estimator.estimates', 'INSERT')
    AND has_column_privilege('service_role', 'estimator.estimates', 'state', 'UPDATE')
    AND NOT has_column_privilege('service_role', 'estimator.estimates', 'catchup_min_cents', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'estimator.estimates', 'DELETE')
    AND NOT has_table_privilege('service_role', 'estimator.estimate_line_items', 'INSERT')
    AND NOT has_table_privilege('service_role', 'estimator.estimate_line_items', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'estimator.estimate_line_items', 'DELETE')
    AND has_column_privilege('service_role', 'estimator.notification_deliveries', 'state', 'UPDATE')
    AND has_column_privilege('service_role', 'estimator.notification_deliveries', 'attempt_count', 'UPDATE')
    AND NOT has_column_privilege('service_role', 'estimator.notification_deliveries', 'recipient_hash', 'UPDATE')
    AND NOT has_column_privilege('service_role', 'estimator.notification_deliveries', 'recipient_masked', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'estimator.lead_events', 'INSERT')
    AND NOT has_table_privilege('service_role', 'estimator.lead_events', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'estimator.lead_events', 'DELETE'),
  'the server role has only the write grants needed by persistence workflows'
);

SELECT ok(
  (
    SELECT count(*) > 0 AND bool_and(
      NOT pg_catalog.pg_get_functiondef(proc.oid) ILIKE '%user_metadata%'
    )
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'estimator' AND proc.prosecdef
  ),
  'staff authority does not read user-editable metadata'
);

SELECT * FROM finish();
ROLLBACK;
