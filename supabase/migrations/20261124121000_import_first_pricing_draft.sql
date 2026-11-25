BEGIN;

CREATE TABLE estimator.first_pricing_import_audit (
  model_id uuid PRIMARY KEY REFERENCES estimator.pricing_models(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  definition_checksum text NOT NULL CHECK (definition_checksum ~ '^[0-9a-f]{64}$'),
  owner_authorization_ref text NOT NULL CHECK (owner_authorization_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{1,99}$'),
  imported_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE estimator.first_pricing_import_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.first_pricing_import_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON estimator.first_pricing_import_audit FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION estimator.import_first_pricing_draft(p_actor_user_id uuid, p_definition text, p_fingerprint text, p_owner_authorization_ref text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, estimator
AS $$
DECLARE
  draft_id uuid;
  candidate_definition jsonb;
  p_model jsonb;
BEGIN
  PERFORM 1 FROM estimator.staff_users
  WHERE user_id = p_actor_user_id AND role = 'admin' AND state = 'ACTIVE'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active administrator required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(20261124, 23);
  IF EXISTS (SELECT FROM estimator.pricing_models) OR EXISTS (SELECT FROM estimator.first_pricing_import_audit) THEN
    RAISE EXCEPTION 'First pricing draft already exists' USING ERRCODE = '23505';
  END IF;
  IF p_definition IS NULL OR octet_length(p_definition) > 131072
     OR p_fingerprint IS DISTINCT FROM encode(extensions.digest(convert_to(p_definition, 'UTF8'), 'sha256'), 'hex')
     OR p_owner_authorization_ref IS NULL
     OR p_owner_authorization_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{1,99}$' THEN
    RAISE EXCEPTION 'Invalid import authorization or fingerprint' USING ERRCODE = '22023';
  END IF;
  candidate_definition := p_definition::jsonb;
  p_model := candidate_definition->'model';
  IF p_model->>'state'  IS DISTINCT FROM 'DRAFT' OR p_model->>'currency' IS DISTINCT FROM 'ZAR'
     OR jsonb_typeof(p_model->'rules') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_model->'rules') NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid first pricing draft' USING ERRCODE = '22023';
  END IF;

  INSERT INTO estimator.pricing_models
    (id, version, name, engine_contract_version, confidence_high_max_points, confidence_good_max_points, created_by)
  VALUES
    ((p_model->>'id')::uuid, p_model->>'version', 'GOAT starter pricing V1', p_model->>'engineVersion',
     (p_model#>>'{confidenceThresholds,highMaxPoints}')::bigint,
     (p_model#>>'{confidenceThresholds,goodMaxPoints}')::bigint, p_actor_user_id)
  RETURNING id INTO draft_id;

  INSERT INTO estimator.pricing_rules
    (pricing_model_id, code, label, scope, category, rule_type, input_key, explanation, conditions, parameters, sort_order)
  SELECT draft_id, rule->>'code', rule->>'label', (rule->>'scope')::estimator.pricing_rule_scope,
    (rule->>'category')::estimator.pricing_rule_category, (rule->>'type')::estimator.pricing_rule_type,
    rule->>'inputKey', rule->>'explanation',
    CASE WHEN rule ? 'when' THEN jsonb_build_object('when', rule->'when') WHEN rule ? 'condition' THEN jsonb_build_object('condition', rule->'condition') ELSE '{}'::jsonb END,
    rule - ARRAY['type','code','label','scope','category','inputKey','explanation','when','condition'],
    position::integer - 1
  FROM jsonb_array_elements(p_model->'rules') WITH ORDINALITY AS candidate(rule, position);

  IF candidate_definition IS DISTINCT FROM jsonb_build_object(
    'model', estimator.pricing_model_activation_projection(draft_id),
    'enabled', (SELECT jsonb_agg(enabled ORDER BY sort_order)
                FROM estimator.pricing_rules WHERE pricing_model_id = draft_id)
  ) THEN
    RAISE EXCEPTION 'Persisted pricing definition differs from the imported candidate' USING ERRCODE = '23514';
  END IF;

  INSERT INTO estimator.first_pricing_import_audit(model_id, actor_id, fingerprint, definition_checksum, owner_authorization_ref)
  VALUES (draft_id, p_actor_user_id, p_fingerprint, estimator.pricing_model_definition_checksum(draft_id), p_owner_authorization_ref);
  RETURN draft_id;
END;
$$;

REVOKE ALL ON FUNCTION estimator.import_first_pricing_draft(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.import_first_pricing_draft(uuid, text, text, text) TO service_role;

COMMIT;
