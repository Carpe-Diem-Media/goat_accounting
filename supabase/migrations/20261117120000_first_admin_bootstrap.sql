BEGIN;

CREATE TABLE estimator.staff_admin_audit (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('first_admin_provision', 'first_admin_activate')),
  previous_state estimator.staff_state,
  resulting_state estimator.staff_state NOT NULL,
  owner_authorization_ref text NOT NULL
    CHECK (owner_authorization_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$'),
  identity_verification_ref text
    CHECK (identity_verification_ref IS NULL OR identity_verification_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT staff_admin_audit_single_bootstrap_operation UNIQUE (operation),
  CONSTRAINT staff_admin_audit_transition_valid CHECK (
    (operation = 'first_admin_provision'
      AND previous_state IS NULL
      AND resulting_state = 'INVITED'
      AND identity_verification_ref IS NOT NULL)
    OR
    (operation = 'first_admin_activate'
      AND previous_state = 'INVITED'
      AND resulting_state = 'ACTIVE'
      AND identity_verification_ref IS NULL)
  )
);

CREATE TABLE estimator.staff_admin_bootstrap_context (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  target_user_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('first_admin_provision', 'first_admin_activate')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (transaction_id, backend_pid, target_user_id, operation)
);

ALTER TABLE estimator.staff_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.staff_admin_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.staff_admin_bootstrap_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.staff_admin_bootstrap_context FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE estimator.staff_admin_audit
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE estimator.staff_admin_bootstrap_context
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE estimator.staff_admin_audit IS
  'Append-only evidence for the one-time first-administrator lifecycle. Does not store Auth email addresses or tokens.';
COMMENT ON TABLE estimator.staff_admin_bootstrap_context IS
  'Transaction-scoped authorization context used only by the first-administrator procedures and staff write guard.';

CREATE FUNCTION estimator.reject_staff_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator
AS $$
BEGIN
  RAISE EXCEPTION 'staff admin audit is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER staff_admin_audit_append_only
  BEFORE UPDATE OR DELETE ON estimator.staff_admin_audit
  FOR EACH ROW EXECUTE FUNCTION estimator.reject_staff_admin_audit_mutation();

CREATE FUNCTION estimator.guard_first_admin_staff_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  required_operation text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state = 'ACTIVE' THEN
      RAISE EXCEPTION 'active staff rows require an authorized lifecycle procedure' USING ERRCODE = '42501';
    END IF;

    IF NEW.role = 'admin' THEN
      required_operation := 'first_admin_provision';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'admin' THEN
      RAISE EXCEPTION 'administrator role assignment requires an authorized lifecycle procedure' USING ERRCODE = '42501';
    END IF;

    IF NEW.state IS DISTINCT FROM OLD.state AND NEW.state = 'ACTIVE' THEN
      required_operation := 'first_admin_activate';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM estimator.staff_admin_bootstrap_context AS context
    WHERE context.transaction_id = pg_catalog.txid_current()
      AND context.backend_pid = pg_catalog.pg_backend_pid()
      AND context.target_user_id = NEW.user_id
      AND context.operation = required_operation
  ) THEN
    RAISE EXCEPTION 'administrator lifecycle mutation requires an authorized procedure' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_users_first_admin_guard
  BEFORE INSERT OR UPDATE OF role, state ON estimator.staff_users
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_first_admin_staff_write();

CREATE FUNCTION estimator.provision_first_admin(
  p_user_id uuid,
  p_owner_authorization_ref text,
  p_identity_verification_ref text,
  p_execute boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  audit_event_id uuid;
BEGIN
  IF p_user_id IS NULL
    OR p_owner_authorization_ref IS NULL
    OR p_owner_authorization_ref !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$'
    OR p_identity_verification_ref IS NULL
    OR p_identity_verification_ref !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$'
    OR p_execute IS NULL THEN
    RAISE EXCEPTION 'invalid first-admin operation input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 17);

  IF NOT EXISTS (SELECT 1 FROM auth.users AS user_record WHERE user_record.id = p_user_id)
    OR EXISTS (
      SELECT 1 FROM estimator.staff_users AS staff
      WHERE staff.role = 'admin' AND staff.state = 'ACTIVE'
    )
    OR EXISTS (SELECT 1 FROM estimator.staff_users AS staff WHERE staff.role = 'admin')
    OR EXISTS (SELECT 1 FROM estimator.staff_admin_audit) THEN
    RAISE EXCEPTION 'first-admin bootstrap is not available' USING ERRCODE = '55000';
  END IF;

  IF NOT p_execute THEN
    RETURN pg_catalog.jsonb_build_object('status', 'ready', 'operation', 'provision');
  END IF;

  INSERT INTO estimator.staff_admin_bootstrap_context (
    transaction_id, backend_pid, target_user_id, operation
  ) VALUES (
    pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), p_user_id, 'first_admin_provision'
  );

  INSERT INTO estimator.staff_users (user_id, role, state)
  VALUES (p_user_id, 'admin', 'INVITED');

  DELETE FROM estimator.staff_admin_bootstrap_context AS context
  WHERE context.transaction_id = pg_catalog.txid_current()
    AND context.backend_pid = pg_catalog.pg_backend_pid()
    AND context.target_user_id = p_user_id
    AND context.operation = 'first_admin_provision';

  INSERT INTO estimator.staff_admin_audit (
    target_user_id, operation, previous_state, resulting_state,
    owner_authorization_ref, identity_verification_ref
  ) VALUES (
    p_user_id, 'first_admin_provision', NULL, 'INVITED',
    p_owner_authorization_ref, p_identity_verification_ref
  )
  RETURNING id INTO audit_event_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'completed',
    'operation', 'provision',
    'auditEventId', audit_event_id
  );
END;
$$;

CREATE FUNCTION estimator.activate_first_admin(
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
BEGIN
  IF p_user_id IS NULL
    OR p_owner_authorization_ref IS NULL
    OR p_owner_authorization_ref !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$'
    OR p_execute IS NULL THEN
    RAISE EXCEPTION 'invalid first-admin operation input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(20261103, 17);

  IF NOT EXISTS (
      SELECT 1 FROM estimator.staff_admin_audit AS event
      WHERE event.operation = 'first_admin_provision' AND event.target_user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1 FROM estimator.staff_admin_audit AS event
      WHERE event.operation = 'first_admin_activate'
    )
    OR EXISTS (
      SELECT 1 FROM estimator.staff_users AS staff
      WHERE staff.role = 'admin' AND staff.state = 'ACTIVE'
    )
    OR NOT EXISTS (
      SELECT 1 FROM estimator.staff_users AS staff
      WHERE staff.user_id = p_user_id AND staff.role = 'admin' AND staff.state = 'INVITED'
    )
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS user_record
      WHERE user_record.id = p_user_id AND user_record.email_confirmed_at IS NOT NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors AS factor
      WHERE factor.user_id = p_user_id
        AND factor.factor_type = 'totp'
        AND factor.status = 'verified'
    ) THEN
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

REVOKE ALL ON FUNCTION estimator.reject_staff_admin_audit_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION estimator.guard_first_admin_staff_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION estimator.provision_first_admin(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION estimator.activate_first_admin(uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.provision_first_admin(uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION estimator.activate_first_admin(uuid, text, boolean) TO service_role;

COMMIT;
