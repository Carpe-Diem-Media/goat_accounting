BEGIN;

CREATE OR REPLACE FUNCTION estimator.guard_first_admin_staff_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  required_operation text;
BEGIN
  -- The database owner may seed trusted local SQL test fixtures. Data API sessions do not use this role context.
  IF session_user = 'postgres' AND pg_catalog.current_setting('role', true) = 'none' THEN
    RETURN NEW;
  END IF;

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
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'staff role changes require an authorized lifecycle procedure' USING ERRCODE = '42501';
    END IF;

    IF NEW.state IS DISTINCT FROM OLD.state THEN
      IF NEW.state = 'ACTIVE' THEN
        required_operation := 'first_admin_activate';
      ELSE
        RAISE EXCEPTION 'staff state changes require an authorized lifecycle procedure' USING ERRCODE = '42501';
      END IF;
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

REVOKE ALL ON FUNCTION estimator.guard_first_admin_staff_write() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
