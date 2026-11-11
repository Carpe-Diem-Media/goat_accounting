BEGIN;
ALTER TABLE estimator.pricing_models ADD COLUMN draft_revision bigint NOT NULL DEFAULT 0
  CHECK (draft_revision BETWEEN 0 AND 9007199254740991);

-- All draft writes, including direct server-role writes, advance the aggregate revision.
CREATE FUNCTION estimator.advance_pricing_model_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, estimator AS $$
BEGIN
  IF OLD.state = 'DRAFT' AND NEW.state = 'DRAFT' THEN
    IF NEW.draft_revision IS DISTINCT FROM OLD.draft_revision THEN
      IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'draft revision is database controlled' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF (pg_catalog.to_jsonb(NEW) - ARRAY['draft_revision','updated_at']) IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - ARRAY['draft_revision','updated_at']) THEN
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
DECLARE model_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.pricing_model_id ELSE NEW.pricing_model_id END;
BEGIN
  IF pg_catalog.current_setting('estimator.pricing_draft_save_model', true) = model_id::text THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND (pg_catalog.to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'updated_at') THEN
    RETURN NULL;
  END IF;
  UPDATE estimator.pricing_models SET draft_revision = draft_revision + 1 WHERE id = model_id;
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
DECLARE model estimator.pricing_models%ROWTYPE; item jsonb; actual_count integer; matched_count integer; updated_count integer; changed_count integer := 0; prior_save_model text;
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
  SELECT count(*) INTO matched_count
    FROM pg_catalog.jsonb_array_elements(p_rules) AS submitted(value)
    JOIN estimator.pricing_rules AS rule ON rule.id = (submitted.value->>'id')::uuid AND rule.pricing_model_id = p_model_id;
  IF matched_count <> actual_count THEN RAISE EXCEPTION 'rule set changed' USING ERRCODE = '22023'; END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rules) LOOP
    IF pg_catalog.jsonb_typeof(item) <> 'object' OR (item - ARRAY['id','label','parameters','conditions','enabled']) <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(item->'label') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(item->'parameters') IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(item->'conditions') IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(item->'enabled') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'invalid rule update' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  prior_save_model := pg_catalog.current_setting('estimator.pricing_draft_save_model', true);
  PERFORM pg_catalog.set_config('estimator.pricing_draft_save_model', p_model_id::text, true);
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rules) LOOP
    UPDATE estimator.pricing_rules AS rule SET label = item->>'label', parameters = item->'parameters', conditions = item->'conditions', enabled = (item->>'enabled')::boolean
      WHERE rule.id = (item->>'id')::uuid AND rule.pricing_model_id = p_model_id
        AND ROW(rule.label, rule.parameters, rule.conditions, rule.enabled)
          IS DISTINCT FROM ROW(item->>'label', item->'parameters', item->'conditions', (item->>'enabled')::boolean);
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    changed_count := changed_count + updated_count;
  END LOOP;
  PERFORM pg_catalog.set_config('estimator.pricing_draft_save_model', COALESCE(prior_save_model, ''), true);
  IF changed_count > 0 OR model.confidence_high_max_points IS DISTINCT FROM p_high_max_points
     OR model.confidence_good_max_points IS DISTINCT FROM p_good_max_points THEN
    UPDATE estimator.pricing_models SET confidence_high_max_points = p_high_max_points,
      confidence_good_max_points = p_good_max_points, draft_revision = model.draft_revision + 1 WHERE id = p_model_id;
  END IF;
  SELECT draft_revision INTO model.draft_revision FROM estimator.pricing_models WHERE id = p_model_id;
  RETURN model.draft_revision;
END;
$$;
REVOKE ALL ON FUNCTION estimator.advance_pricing_model_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION estimator.advance_pricing_rules_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb) TO service_role;
COMMIT;
