-- Run inside a transaction after the dashboard migration. Never leaves fixtures behind.
DO $$
BEGIN
  BEGIN
    PERFORM estimator.dashboard_metrics(now() - interval '7 days', now());
    RAISE EXCEPTION 'dashboard accepted an anonymous caller';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('fb1eaa7d-b456-446e-9cb7-079caa1f8001', 'authenticated', 'authenticated', 'dashboard-admin@example.invalid', '{}', '{}', now(), now()),
       ('fb1eaa7d-b456-446e-9cb7-079caa1f8002', 'authenticated', 'authenticated', 'dashboard-viewer@example.invalid', '{}', '{}', now(), now()),
       ('fb1eaa7d-b456-446e-9cb7-079caa1f8003', 'authenticated', 'authenticated', 'dashboard-inactive@example.invalid', '{}', '{}', now(), now());
INSERT INTO estimator.staff_users (user_id, role, state) VALUES
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8001', 'admin', 'ACTIVE'),
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8002', 'viewer', 'ACTIVE'),
  ('fb1eaa7d-b456-446e-9cb7-079caa1f8003', 'viewer', 'SUSPENDED');
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
SELECT set_config('request.jwt.claims', '{"sub":"fb1eaa7d-b456-446e-9cb7-079caa1f8001","role":"authenticated","aal":"aal2"}', true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
  result := estimator.dashboard_metrics('1970-01-01T00:00:00Z'::timestamptz, '1970-01-08T00:00:00Z'::timestamptz);
  IF result ->> 'completed' <> '0' OR result ->> 'new_leads' <> '0' OR result ->> 'catchup_min_cents' <> '0' THEN RAISE EXCEPTION 'empty-period metrics are incorrect'; END IF;
  IF jsonb_typeof(result -> 'failed_notifications') <> 'number' THEN RAISE EXCEPTION 'admin notification count missing'; END IF;
END $$;
RESET ROLE;
