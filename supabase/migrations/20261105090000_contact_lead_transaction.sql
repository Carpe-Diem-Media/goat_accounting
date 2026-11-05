BEGIN;

-- NULL preserves the unknown choices of leads created before this migration.
ALTER TABLE estimator.leads
  ADD COLUMN requested_contact boolean,
  ADD COLUMN requested_estimate_email boolean,
  ADD CONSTRAINT leads_requested_actions_pair CHECK (
    (requested_contact IS NULL AND requested_estimate_email IS NULL)
    OR (requested_contact IS NOT NULL AND requested_estimate_email IS NOT NULL
        AND (requested_contact OR requested_estimate_email))
  );

-- Historical rows retain unknown actions; every new direct or RPC insert must name them.
CREATE FUNCTION estimator.require_lead_requested_actions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.requested_contact IS NULL OR NEW.requested_estimate_email IS NULL
    OR NOT (NEW.requested_contact OR NEW.requested_estimate_email) THEN
    RAISE EXCEPTION 'lead requested actions are required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER leads_require_requested_actions
  BEFORE INSERT ON estimator.leads
  FOR EACH ROW EXECUTE FUNCTION estimator.require_lead_requested_actions();
REVOKE ALL ON FUNCTION estimator.require_lead_requested_actions() FROM PUBLIC, anon, authenticated, service_role;

-- The service role is the trusted server-side write path; public roles cannot execute this RPC.
CREATE FUNCTION estimator.create_contact_lead(
  p_estimate_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_business_name text,
  p_preferred_contact_method text,
  p_contact_consent boolean,
  p_requested_contact boolean,
  p_requested_estimate_email boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  created_lead_id uuid;
  existing_lead estimator.leads%ROWTYPE;
  estimate_state estimator.estimate_state;
BEGIN
  IF p_contact_consent IS DISTINCT FROM true
    OR p_requested_contact IS NULL OR p_requested_estimate_email IS NULL
    OR NOT (p_requested_contact OR p_requested_estimate_email)
    OR p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 1 AND 250
    OR p_email IS NULL OR char_length(btrim(p_email)) NOT BETWEEN 3 AND 320
    OR char_length(p_phone) > 64 OR char_length(p_business_name) > 250
    OR char_length(p_preferred_contact_method) > 40 THEN
    RAISE EXCEPTION 'invalid contact request' USING ERRCODE = '22023';
  END IF;

  -- Serialise both concurrent submissions and estimate state changes.
  SELECT state INTO estimate_state FROM estimator.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO existing_lead FROM estimator.leads WHERE estimate_id = p_estimate_id;
  IF FOUND THEN
    IF existing_lead.full_name IS DISTINCT FROM p_full_name
      OR existing_lead.email IS DISTINCT FROM p_email
      OR existing_lead.phone IS DISTINCT FROM p_phone
      OR existing_lead.business_name IS DISTINCT FROM p_business_name
      OR existing_lead.preferred_contact_method IS DISTINCT FROM p_preferred_contact_method
      OR existing_lead.requested_contact IS DISTINCT FROM p_requested_contact
      OR existing_lead.requested_estimate_email IS DISTINCT FROM p_requested_estimate_email THEN
      RAISE EXCEPTION 'contact request conflicts with existing lead' USING ERRCODE = '23505';
    END IF;
    RETURN existing_lead.id;
  END IF;

  -- A matching retry remains successful after invalidation; new requests do not.
  IF estimate_state <> 'VALID' THEN
    RAISE EXCEPTION 'estimate unavailable' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO estimator.leads (
    estimate_id, full_name, email, phone, business_name, preferred_contact_method,
    contact_consent_at, requested_contact, requested_estimate_email
  ) VALUES (
    p_estimate_id, p_full_name, p_email, p_phone, p_business_name, p_preferred_contact_method,
    clock_timestamp(), p_requested_contact, p_requested_estimate_email
  ) RETURNING id INTO created_lead_id;
  -- The existing AFTER INSERT trigger writes the sole initial NEW event.
  IF p_requested_contact THEN
    INSERT INTO estimator.notification_deliveries (lead_id, type)
    VALUES (created_lead_id, 'internal_lead');
  END IF;
  IF p_requested_estimate_email THEN
    INSERT INTO estimator.notification_deliveries (estimate_id, type)
    VALUES (p_estimate_id, 'customer_estimate');
  END IF;
  RETURN created_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION estimator.create_contact_lead(uuid,text,text,text,text,text,boolean,boolean,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.create_contact_lead(uuid,text,text,text,text,text,boolean,boolean,boolean)
  TO service_role;

COMMIT;
