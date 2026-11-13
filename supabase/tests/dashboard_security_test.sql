-- Run inside a transaction after the dashboard migration. Never leaves fixtures behind.
DO $$
BEGIN
  IF has_function_privilege('anon', 'estimator.dashboard_metrics(timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dashboard function is executable by anon';
  END IF;
  IF has_function_privilege('authenticated', 'estimator.dashboard_metrics(timestamptz,timestamptz)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'dashboard function is not executable by authenticated';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'estimator.dashboard_metrics(timestamptz,timestamptz)'::regprocedure) THEN
    RAISE EXCEPTION 'dashboard function must use invoker rights';
  END IF;
END;
$$;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM estimator.dashboard_metrics(now() - interval '7 days', now());
    RAISE EXCEPTION 'dashboard accepted an anonymous caller';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('fb1eaa7d-b456-446e-9cb7-079caa1f8001', 'authenticated', 'authenticated', 'dashboard-admin@example.invalid', '{}', '{}', now(), now()),
       ('fb1eaa7d-b456-446e-9cb7-079caa1f8002', 'authenticated', 'authenticated', 'dashboard-viewer@example.invalid', '{}', '{}', now(), now()),
       ('fb1eaa7d-b456-446e-9cb7-079caa1f8003', 'authenticated', 'authenticated', 'dashboard-inactive@example.invalid', '{}', '{}', now(), now()),
       ('fb1eaa7d-b456-446e-9cb7-079caa1f8004', 'authenticated', 'authenticated', 'dashboard-advisor@example.invalid', '{}', '{}', now(), now()),
       ('fb1eaa7d-b456-446e-9cb7-079caa1f8005', 'authenticated', 'authenticated', 'dashboard-invited@example.invalid', '{}', '{}', now(), now()),
       ('fb1eaa7d-b456-446e-9cb7-079caa1f8006', 'authenticated', 'authenticated', 'dashboard-deactivated@example.invalid', '{}', '{}', now(), now());
INSERT INTO estimator.staff_users (user_id, role, state) VALUES
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8001', 'admin', 'ACTIVE'),
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8002', 'viewer', 'ACTIVE'),
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8003', 'viewer', 'SUSPENDED'),
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8004', 'advisor', 'ACTIVE'),
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8005', 'viewer', 'INVITED'),
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8006', 'viewer', 'DEACTIVATED');
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8002","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM estimator.dashboard_metrics(now() - interval '7 days', now()); RAISE EXCEPTION 'AAL1 accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8003","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM estimator.dashboard_metrics(now() - interval '7 days', now()); RAISE EXCEPTION 'suspended staff accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8002","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
  result := estimator.dashboard_metrics(now() - interval '7 days', now());
  IF result -> 'failed_notifications' <> 'null'::jsonb THEN RAISE EXCEPTION 'viewer can see notification metrics'; END IF;
  BEGIN PERFORM estimator.dashboard_metrics(now() - interval '91 days', now()); RAISE EXCEPTION 'unbounded period accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8005","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM estimator.dashboard_metrics(now() - interval '7 days', now()); RAISE EXCEPTION 'invited staff accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8006","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM estimator.dashboard_metrics(now() - interval '7 days', now()); RAISE EXCEPTION 'deactivated staff accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8004","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
  result := estimator.dashboard_metrics(now() - interval '7 days', now());
  IF result -> 'failed_notifications' <> 'null'::jsonb THEN RAISE EXCEPTION 'advisor can see notification metrics'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8001","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
  result := estimator.dashboard_metrics('1970-01-01T00:00:00Z'::timestamptz, '1970-01-08T00:00:00Z'::timestamptz);
  IF result ->> 'completed' <> '0' OR result ->> 'new_leads' <> '0' OR result ->> 'catchup_min_cents' <> '0' THEN RAISE EXCEPTION 'empty-period metrics are incorrect'; END IF;
  IF jsonb_typeof(result -> 'failed_notifications') <> 'number' THEN RAISE EXCEPTION 'admin notification count missing'; END IF;
END $$;
RESET ROLE;
