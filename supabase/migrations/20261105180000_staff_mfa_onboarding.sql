BEGIN;

DROP POLICY staff_users_self_read ON estimator.staff_users;
CREATE POLICY staff_users_self_read ON estimator.staff_users
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND state IN ('INVITED', 'ACTIVE')
  );

CREATE TABLE estimator.staff_onboarding_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES estimator.staff_users(user_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  from_state estimator.staff_state NOT NULL,
  to_state estimator.staff_state NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT staff_onboarding_events_one_activation UNIQUE (staff_user_id),
  CONSTRAINT staff_onboarding_events_invited_activation CHECK (
    from_state = 'INVITED'
    AND to_state = 'ACTIVE'
    AND actor_user_id = staff_user_id
  )
);

ALTER TABLE estimator.staff_onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.staff_onboarding_events FORCE ROW LEVEL SECURITY;

CREATE POLICY staff_onboarding_events_admin_read ON estimator.staff_onboarding_events
  FOR SELECT TO authenticated
  USING ((SELECT estimator.is_current_staff(ARRAY['admin']::estimator.staff_role[], true)));

CREATE FUNCTION estimator.activate_invited_staff_after_mfa()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL OR (SELECT auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'staff activation requires verified AAL2' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM auth.mfa_factors AS factor
  WHERE factor.user_id = actor_id
    AND factor.factor_type = 'totp'
    AND factor.status = 'verified';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff activation requires a verified TOTP factor' USING ERRCODE = '42501';
  END IF;

  UPDATE estimator.staff_users
  SET state = 'ACTIVE'
  WHERE user_id = actor_id
    AND state = 'INVITED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only the signed-in invited account can be activated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO estimator.staff_onboarding_events (
    staff_user_id, actor_user_id, from_state, to_state
  ) VALUES (
    actor_id, actor_id, 'INVITED', 'ACTIVE'
  );
END;
$$;
COMMENT ON FUNCTION estimator.activate_invited_staff_after_mfa() IS
  'Completes an administrator-provisioned invitation for the caller after verified TOTP setup.';

REVOKE ALL ON TABLE estimator.staff_onboarding_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON estimator.staff_onboarding_events TO authenticated;

REVOKE ALL ON FUNCTION estimator.activate_invited_staff_after_mfa() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.activate_invited_staff_after_mfa() TO authenticated;

COMMIT;
