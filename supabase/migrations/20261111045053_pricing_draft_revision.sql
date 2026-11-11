BEGIN;
ALTER TABLE estimator.pricing_models ADD COLUMN draft_revision bigint NOT NULL DEFAULT 0
  CHECK (draft_revision BETWEEN 0 AND 9007199254740991);

-- All draft writes, including direct server-role writes, advance the aggregate revision.
CREATE FUNCTION estimator.advance_pricing_model_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, estimator AS $$
BEGIN
  IF OLD.state = 'DRAFT' AND NEW.state = 'DRAFT' THEN
    IF NEW.draft_revision IS DISTINCT FROM OLD.draft_revision AND current_user <> 'postgres' THEN
      RAISE EXCEPTION 'draft revision is database controlled' USING ERRCODE = '42501';
    END IF;
    IF (pg_catalog.to_jsonb(NEW) - 'draft_revision') IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'draft_revision') THEN
      NEW.draft_revision := OLD.draft_revision + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pricing_models_revision BEFORE UPDATE ON estimator.pricing_models
  FOR EACH ROW EXECUTE FUNCTION estimator.advance_pricing_model_revision();

CREATE FUNCTION estimator.advance_pricing_rules_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, estimator AS $$
BEGIN
  UPDATE estimator.pricing_models SET draft_revision = draft_revision + 1
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.pricing_model_id ELSE NEW.pricing_model_id END;
  RETURN NULL;
END;
$$;
CREATE TRIGGER pricing_rules_revision AFTER INSERT OR UPDATE OR DELETE ON estimator.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION estimator.advance_pricing_rules_revision();

-- The trusted server validates the full model before submitting this bounded projection.
CREATE FUNCTION estimator.save_pricing_draft(
  p_model_id uuid, p_actor_user_id uuid, p_expected_revision bigint,
  p_high_max_points bigint, p_good_max_points bigint, p_rules jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, estimator, auth AS $$
DECLARE model estimator.pricing_models%ROWTYPE; item jsonb; actual_count integer; updated_count integer;
BEGIN
  PERFORM 1 FROM estimator.staff_users WHERE user_id = p_actor_user_id AND role = 'admin' AND state = 'ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active administrator required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO model FROM estimator.pricing_models WHERE id = p_model_id FOR UPDATE;
  IF NOT FOUND OR model.state <> 'DRAFT' THEN RAISE EXCEPTION 'draft model not found' USING ERRCODE = '55000'; END IF;
  IF p_expected_revision IS NULL OR model.draft_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'pricing draft changed' USING ERRCODE = '40001';
  END IF;
  IF pg_catalog.jsonb_typeof(p_rules) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(p_rules) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid draft rules' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO actual_count FROM estimator.pricing_rules WHERE pricing_model_id = p_model_id;
  IF actual_count <> pg_catalog.jsonb_array_length(p_rules) THEN RAISE EXCEPTION 'rule set changed' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(DISTINCT (value->>'id')::uuid) FROM pg_catalog.jsonb_array_elements(p_rules)) <> actual_count THEN
    RAISE EXCEPTION 'duplicate rule identifiers' USING ERRCODE = '22023';
  END IF;
  UPDATE estimator.pricing_models SET confidence_high_max_points = p_high_max_points, confidence_good_max_points = p_good_max_points WHERE id = p_model_id;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rules) LOOP
    IF pg_catalog.jsonb_typeof(item) <> 'object' OR (item - ARRAY['id','label','parameters','conditions','enabled']) <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(item->'label') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(item->'parameters') IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(item->'conditions') IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(item->'enabled') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'invalid rule update' USING ERRCODE = '22023';
    END IF;
    UPDATE estimator.pricing_rules SET label = item->>'label', parameters = item->'parameters', conditions = item->'conditions', enabled = (item->>'enabled')::boolean
      WHERE id = (item->>'id')::uuid AND pricing_model_id = p_model_id;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count <> 1 THEN RAISE EXCEPTION 'rule does not belong to draft' USING ERRCODE = '22023'; END IF;
  END LOOP;
  SELECT draft_revision INTO model.draft_revision FROM estimator.pricing_models WHERE id = p_model_id;
  RETURN model.draft_revision;
END;
$$;
REVOKE ALL ON FUNCTION estimator.advance_pricing_model_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION estimator.advance_pricing_rules_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb) TO service_role;
COMMIT;
