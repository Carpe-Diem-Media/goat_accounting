BEGIN;

REVOKE ALL PRIVILEGES ON TABLE estimator.staff_users
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (user_id, role, state, created_at, updated_at)
  ON TABLE estimator.staff_users
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE estimator.staff_users TO authenticated, service_role;
GRANT INSERT ON TABLE estimator.staff_users TO service_role;
GRANT UPDATE (role, state) ON TABLE estimator.staff_users TO service_role;

COMMIT;
