BEGIN;

CREATE OR REPLACE FUNCTION estimator.activate_first_admin(
  p_user_id uuid,
  p_owner_authorization_ref text,
  p_execute boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  audit_event_id uuid;
  provision_authorization_ref text;
BEGIN
  IF p_user_id IS NULL
    OR p_owner_authorization_ref IS NULL
    OR p_owner_authorization_ref !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$'
    OR p_execute IS NULL THEN
    RAISE EXCEPTION 'invalid first-admin operation input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 17);

  SELECT event.owner_authorization_ref
  INTO provision_authorization_ref
  FROM estimator.staff_admin_audit AS event
  WHERE event.operation = 'first_admin_provision'
    AND event.target_user_id = p_user_id;

  IF NOT FOUND OR provision_authorization_ref = p_owner_authorization_ref THEN
    RAISE EXCEPTION 'first-admin activation is not ready' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
      SELECT 1 FROM estimator.staff_admin_audit AS event
      WHERE event.operation = 'first_admin_activate'
    )
    OR EXISTS (
      SELECT 1 FROM estimator.staff_users AS staff
      WHERE staff.role = 'admin' AND staff.state = 'ACTIVE'
    ) THEN
    RAISE EXCEPTION 'first-admin activation is not ready' USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM estimator.staff_users AS staff
  WHERE staff.user_id = p_user_id
    AND staff.role = 'admin'
    AND staff.state = 'INVITED'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'first-admin activation is not ready' USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM auth.users AS user_record
  WHERE user_record.id = p_user_id
    AND user_record.email_confirmed_at IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'first-admin activation is not ready' USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM auth.mfa_factors AS factor
  WHERE factor.user_id = p_user_id
    AND factor.factor_type = 'totp'
    AND factor.status = 'verified'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'first-admin activation is not ready' USING ERRCODE = '55000';
  END IF;

  IF NOT p_execute THEN
    RETURN pg_catalog.jsonb_build_object('status', 'ready', 'operation', 'activate');
  END IF;

  INSERT INTO estimator.staff_admin_bootstrap_context (
    transaction_id, backend_pid, target_user_id, operation
  ) VALUES (
    pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), p_user_id, 'first_admin_activate'
  );

  UPDATE estimator.staff_users
  SET state = 'ACTIVE'
  WHERE user_id = p_user_id AND role = 'admin' AND state = 'INVITED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'first-admin activation is not ready' USING ERRCODE = '55000';
  END IF;

  DELETE FROM estimator.staff_admin_bootstrap_context AS context
  WHERE context.transaction_id = pg_catalog.txid_current()
    AND context.backend_pid = pg_catalog.pg_backend_pid()
    AND context.target_user_id = p_user_id
    AND context.operation = 'first_admin_activate';

  INSERT INTO estimator.staff_admin_audit (
    target_user_id, operation, previous_state, resulting_state,
    owner_authorization_ref, identity_verification_ref
  ) VALUES (
    p_user_id, 'first_admin_activate', 'INVITED', 'ACTIVE',
    p_owner_authorization_ref, NULL
  )
  RETURNING id INTO audit_event_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'completed',
    'operation', 'activate',
    'auditEventId', audit_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION estimator.activate_first_admin(uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.activate_first_admin(uuid, text, boolean) TO service_role;

COMMIT;
