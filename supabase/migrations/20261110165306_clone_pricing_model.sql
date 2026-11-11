BEGIN;

CREATE FUNCTION estimator.clone_pricing_model(p_source_id uuid, p_version text, p_actor_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator, auth
AS $$
DECLARE
  source estimator.pricing_models%ROWTYPE;
  draft_id uuid;
  cloned_count integer;
BEGIN
  PERFORM 1 FROM estimator.staff_users
    WHERE user_id = p_actor_user_id AND role = 'admin' AND state = 'ACTIVE'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pricing cloning requires an active administrator' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO source FROM estimator.pricing_models WHERE id = p_source_id FOR SHARE;
  IF NOT FOUND OR source.state NOT IN ('ACTIVE', 'RETIRED') THEN
    RAISE EXCEPTION 'source must be an active or retired pricing model' USING ERRCODE = '55000';
  END IF;

  INSERT INTO estimator.pricing_models
    (version, name, engine_contract_version, currency, confidence_high_max_points,
     confidence_good_max_points, created_by, notes)
  VALUES
    (p_version, source.name, source.engine_contract_version, source.currency,
     source.confidence_high_max_points, source.confidence_good_max_points, p_actor_user_id, source.notes)
  RETURNING id INTO draft_id;

  INSERT INTO estimator.pricing_rules
    (pricing_model_id, code, label, scope, category, rule_type, input_key, explanation,
     conditions, parameters, enabled, sort_order)
  SELECT draft_id, code, label, scope, category, rule_type, input_key, explanation,
    conditions, parameters, enabled, sort_order
  FROM estimator.pricing_rules WHERE pricing_model_id = p_source_id ORDER BY sort_order;
  GET DIAGNOSTICS cloned_count = ROW_COUNT;
  IF cloned_count = 0 THEN
    RAISE EXCEPTION 'source pricing model has no rules' USING ERRCODE = '23514';
  END IF;
  RETURN draft_id;
END;
$$;

REVOKE ALL ON FUNCTION estimator.clone_pricing_model(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.clone_pricing_model(uuid, text, uuid) TO service_role;

COMMIT;
