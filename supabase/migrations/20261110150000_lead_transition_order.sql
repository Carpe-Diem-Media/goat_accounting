BEGIN;

-- Existing rows retain NULL because their committed transition order cannot be
-- reconstructed from transaction timestamps or event UUIDs.
ALTER TABLE estimator.lead_events
  ADD COLUMN event_order bigint,
  ADD CONSTRAINT lead_events_event_order_positive
    CHECK (event_order IS NULL OR event_order > 0);

-- The unique B-tree orders a lead's sequenced events and prevents duplicate
-- sequence values. PostgreSQL permits multiple NULL values for legacy rows.
CREATE UNIQUE INDEX lead_events_lead_event_order_idx
  ON estimator.lead_events (lead_id, event_order ASC NULLS FIRST);

CREATE OR REPLACE FUNCTION estimator.guard_lead_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  valid_transition boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'NEW' THEN
      RAISE EXCEPTION 'leads must be created in NEW state' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'leads cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.estimate_id IS DISTINCT FROM OLD.estimate_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.contact_consent_at IS DISTINCT FROM OLD.contact_consent_at THEN
    RAISE EXCEPTION 'lead identity and consent fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    NEW.updated_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  IF NEW.state IN ('CLOSED_WON', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    AND NULLIF(pg_catalog.btrim(pg_catalog.current_setting('estimator.lead_reason_code', true)), '') IS NULL THEN
    RAISE EXCEPTION 'a reason is required when closing a lead' USING ERRCODE = '22023';
  END IF;

  valid_transition := CASE OLD.state
    WHEN 'NEW' THEN NEW.state IN ('CONTACTED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    WHEN 'CONTACTED' THEN NEW.state IN ('QUALIFIED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    WHEN 'QUALIFIED' THEN NEW.state IN ('PROPOSAL_SENT', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    WHEN 'PROPOSAL_SENT' THEN NEW.state IN ('CLOSED_WON', 'CLOSED_LOST')
    ELSE false
  END;
  IF NOT valid_transition THEN
    RAISE EXCEPTION 'invalid lead lifecycle transition from % to %', OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION estimator.record_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  actor_id uuid;
  reason text;
  event_note text;
  next_event_order bigint;
BEGIN
  actor_id := COALESCE(
    (SELECT auth.uid()),
    NULLIF(pg_catalog.current_setting('estimator.actor_user_id', true), '')::uuid
  );
  reason := NULLIF(pg_catalog.current_setting('estimator.lead_reason_code', true), '');
  event_note := NULLIF(pg_catalog.current_setting('estimator.lead_note', true), '');

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(pg_catalog.max(event_order), 0) + 1
    INTO next_event_order
    FROM estimator.lead_events
    WHERE lead_id = NEW.id;
    INSERT INTO estimator.lead_events (
      lead_id, from_state, to_state, event_order, actor_user_id, reason_code, note
    ) VALUES (
      NEW.id, NULL, NEW.state, next_event_order, actor_id, 'lead_created', event_note
    );
  ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
    -- transition_lead locks the parent lead row before this trigger runs, so
    -- every state-change insert for this lead receives the next committed order.
    SELECT COALESCE(pg_catalog.max(event_order), 0) + 1
    INTO next_event_order
    FROM estimator.lead_events
    WHERE lead_id = NEW.id;
    INSERT INTO estimator.lead_events (
      lead_id, from_state, to_state, event_order, actor_user_id, reason_code, note
    ) VALUES (
      NEW.id, OLD.state, NEW.state, next_event_order, actor_id,
      COALESCE(reason, 'state_changed'), event_note
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION estimator.transition_lead(uuid, estimator.lead_state, uuid, text, text);

CREATE FUNCTION estimator.transition_lead(
  p_lead_id uuid,
  p_expected_state estimator.lead_state,
  p_to_state estimator.lead_state,
  p_actor_user_id uuid,
  p_reason_code text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  current_state estimator.lead_state;
BEGIN
  PERFORM 1 FROM estimator.staff_users AS staff
  WHERE staff.user_id = p_actor_user_id
    AND staff.state = 'ACTIVE'
    AND staff.role IN ('admin', 'advisor')
  FOR SHARE;
  IF p_actor_user_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'lead transition requires an active advisor or administrator' USING ERRCODE = '42501';
  END IF;

  SELECT lead.state INTO current_state
  FROM estimator.leads AS lead
  WHERE lead.id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_state IS DISTINCT FROM p_expected_state THEN
    RAISE EXCEPTION 'lead state changed before this transition was applied' USING ERRCODE = '40001';
  END IF;
  IF current_state = p_to_state THEN
    RAISE EXCEPTION 'lead is already in the requested state' USING ERRCODE = '23514';
  END IF;
  IF p_to_state IN ('CLOSED_WON', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT')
    AND NULLIF(pg_catalog.btrim(p_reason_code), '') IS NULL THEN
    RAISE EXCEPTION 'a reason is required when closing a lead' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('estimator.actor_user_id', p_actor_user_id::text, true);
  PERFORM pg_catalog.set_config('estimator.lead_reason_code', COALESCE(p_reason_code, ''), true);
  PERFORM pg_catalog.set_config('estimator.lead_note', COALESCE(p_note, ''), true);

  UPDATE estimator.leads
  SET state = p_to_state
  WHERE id = p_lead_id AND state = p_expected_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead state changed before this transition was applied' USING ERRCODE = '40001';
  END IF;

  PERFORM pg_catalog.set_config('estimator.actor_user_id', '', true);
  PERFORM pg_catalog.set_config('estimator.lead_reason_code', '', true);
  PERFORM pg_catalog.set_config('estimator.lead_note', '', true);
END;
$$;

REVOKE ALL ON FUNCTION estimator.transition_lead(
  uuid, estimator.lead_state, estimator.lead_state, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.transition_lead(
  uuid, estimator.lead_state, estimator.lead_state, uuid, text, text
) TO service_role;

COMMIT;
