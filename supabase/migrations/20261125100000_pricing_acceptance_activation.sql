BEGIN;

CREATE FUNCTION estimator.pricing_model_projection(p_model_id uuid, enabled_only boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, estimator
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', model.id::text,
    'version', model.version,
    'engineVersion', model.engine_contract_version,
    'currency', model.currency,
    'state', model.state::text,
    'confidenceThresholds', pg_catalog.jsonb_build_object(
      'highMaxPoints', model.confidence_high_max_points,
      'goodMaxPoints', model.confidence_good_max_points
    ),
    'rules', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'type', rule.rule_type,
            'scope', rule.scope,
            'category', rule.category,
            'code', rule.code,
            'label', rule.label,
            'explanation', rule.explanation
          )
          || CASE WHEN rule.input_key IS NULL THEN '{}'::jsonb
                  ELSE pg_catalog.jsonb_build_object('inputKey', rule.input_key) END
          || rule.conditions
          || rule.parameters
          ORDER BY rule.sort_order
        )
        FROM estimator.pricing_rules AS rule
        WHERE rule.pricing_model_id = model.id AND (NOT enabled_only OR rule.enabled)
      ),
      '[]'::jsonb
    )
  )
  FROM estimator.pricing_models AS model
  WHERE model.id = p_model_id;
$$;

CREATE OR REPLACE FUNCTION estimator.pricing_model_activation_projection(p_model_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, estimator AS $$
  SELECT estimator.pricing_model_projection(p_model_id, true);
$$;

CREATE TABLE estimator.pricing_acceptance_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES estimator.pricing_models(id),
  draft_revision bigint NOT NULL CHECK (draft_revision BETWEEN 0 AND 9007199254740991),
  definition_fingerprint text NOT NULL CHECK (definition_fingerprint ~ '^[0-9a-f]{64}$'),
  revision text NOT NULL CHECK (revision ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  scenario_payload text NOT NULL CHECK (octet_length(scenario_payload) BETWEEN 2 AND 131072),
  scenario_digest text NOT NULL CHECK (scenario_digest ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'APPROVED', 'INVALIDATED')),
  author_id uuid NOT NULL REFERENCES estimator.staff_users(user_id),
  approver_id uuid REFERENCES estimator.staff_users(user_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_at timestamptz,
  invalidated_at timestamptz,
  UNIQUE (model_id, revision),
  CHECK ((approver_id IS NULL) = (approved_at IS NULL)),
  CHECK (
    (state = 'DRAFT' AND approved_at IS NULL AND invalidated_at IS NULL)
    OR (state = 'APPROVED' AND approved_at IS NOT NULL AND invalidated_at IS NULL)
    OR (state = 'INVALIDATED' AND invalidated_at IS NOT NULL)
  ),
  CHECK (scenario_digest = encode(extensions.digest(convert_to(scenario_payload, 'UTF8'), 'sha256'), 'hex'))
);
CREATE UNIQUE INDEX pricing_acceptance_current_revision
  ON estimator.pricing_acceptance_manifests(model_id) WHERE state <> 'INVALIDATED';

CREATE TABLE estimator.pricing_acceptance_events (
  manifest_id uuid NOT NULL REFERENCES estimator.pricing_acceptance_manifests(id),
  event text NOT NULL CHECK (event IN ('SUBMITTED', 'APPROVED', 'SUPERSEDED', 'DRAFT_CHANGED', 'ACTIVATED')),
  actor_id uuid REFERENCES estimator.staff_users(user_id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (manifest_id, event),
  CHECK (actor_id IS NOT NULL OR event = 'DRAFT_CHANGED')
);

ALTER TABLE estimator.pricing_acceptance_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.pricing_acceptance_manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator.pricing_acceptance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator.pricing_acceptance_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON estimator.pricing_acceptance_manifests, estimator.pricing_acceptance_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON estimator.pricing_acceptance_manifests TO service_role;

CREATE FUNCTION estimator.guard_pricing_acceptance_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, estimator AS $$
BEGIN
  IF TG_TABLE_NAME = 'pricing_acceptance_manifests' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['state','approver_id','approved_at','invalidated_at'])
      = (to_jsonb(OLD) - ARRAY['state','approver_id','approved_at','invalidated_at'])
      AND (
        (OLD.state = 'DRAFT' AND NEW.state = 'APPROVED')
        OR (OLD.state IN ('DRAFT','APPROVED') AND NEW.state = 'INVALIDATED'
          AND ROW(NEW.approver_id, NEW.approved_at) IS NOT DISTINCT FROM ROW(OLD.approver_id, OLD.approved_at))
      ) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'pricing acceptance history is immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER pricing_acceptance_manifest_guard BEFORE UPDATE OR DELETE ON estimator.pricing_acceptance_manifests
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_pricing_acceptance_history();
CREATE TRIGGER pricing_acceptance_event_guard BEFORE UPDATE OR DELETE ON estimator.pricing_acceptance_events
  FOR EACH ROW EXECUTE FUNCTION estimator.guard_pricing_acceptance_history();

-- The model row serializes edits, acceptance and activation. Draft-change events
-- also cover SQL edits that have no end-user actor.
CREATE FUNCTION estimator.invalidate_pricing_acceptance_after_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, estimator AS $$
BEGIN
  WITH invalidated AS (
    UPDATE estimator.pricing_acceptance_manifests SET state = 'INVALIDATED', invalidated_at = clock_timestamp()
    WHERE model_id = NEW.id AND state <> 'INVALIDATED' RETURNING id
  )
  INSERT INTO estimator.pricing_acceptance_events(manifest_id, event, actor_id)
  SELECT id, 'DRAFT_CHANGED', nullif(current_setting('estimator.pricing_acceptance_edit_actor', true), '')::uuid
  FROM invalidated;
  RETURN NULL;
END;
$$;
CREATE TRIGGER pricing_acceptance_invalidate_after_edit AFTER UPDATE ON estimator.pricing_models
  FOR EACH ROW WHEN (OLD.state = 'DRAFT' AND NEW.state = 'DRAFT' AND OLD.draft_revision IS DISTINCT FROM NEW.draft_revision)
  EXECUTE FUNCTION estimator.invalidate_pricing_acceptance_after_edit();

-- Preserve the editor RPC and carry its verified actor into the invalidation event.
ALTER FUNCTION estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb) RENAME TO save_pricing_draft_revision;
REVOKE ALL ON FUNCTION estimator.save_pricing_draft_revision(uuid,uuid,bigint,bigint,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION estimator.save_pricing_draft(
  p_model_id uuid, p_actor_user_id uuid, p_expected_revision bigint,
  p_high_max_points bigint, p_good_max_points bigint, p_rules jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, estimator AS $$
DECLARE
  previous_actor text := current_setting('estimator.pricing_acceptance_edit_actor', true);
  revision bigint;
BEGIN
  PERFORM set_config('estimator.pricing_acceptance_edit_actor', coalesce(p_actor_user_id::text, ''), true);
  revision := estimator.save_pricing_draft_revision(
    p_model_id, p_actor_user_id, p_expected_revision, p_high_max_points, p_good_max_points, p_rules
  );
  PERFORM set_config('estimator.pricing_acceptance_edit_actor', coalesce(previous_actor, ''), true);
  RETURN revision;
END;
$$;
REVOKE ALL ON FUNCTION estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb) TO service_role;

-- The route verifies the signed staff claims and MFA assurance. The RPCs also
-- require a live AAL2 session belonging to the actor and lock the staff row.
CREATE FUNCTION estimator.lock_pricing_acceptance_actor(p_actor uuid, p_session uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, estimator, auth AS $$
BEGIN
  PERFORM 1 FROM estimator.staff_users
  WHERE user_id = p_actor AND role = 'admin' AND state = 'ACTIVE' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active administrator required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM auth.sessions
  WHERE id = p_session AND user_id = p_actor AND aal = 'aal2'
    AND (not_after IS NULL OR not_after > statement_timestamp()) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'administrator AAL2 session required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION estimator.lock_pricing_acceptance_draft(
  p_model uuid, p_revision bigint, p_definition text, p_fingerprint text
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, estimator AS $$
DECLARE draft estimator.pricing_models%ROWTYPE;
BEGIN
  SELECT * INTO draft FROM estimator.pricing_models WHERE id = p_model FOR UPDATE;
  IF NOT FOUND OR draft.state <> 'DRAFT' OR draft.draft_revision IS DISTINCT FROM p_revision THEN
    RAISE EXCEPTION 'pricing draft changed' USING ERRCODE = '40001';
  END IF;
  IF p_definition IS NULL OR octet_length(p_definition) > 131072
    OR p_fingerprint IS DISTINCT FROM encode(extensions.digest(convert_to(p_definition, 'UTF8'), 'sha256'), 'hex')
    OR p_definition::jsonb IS DISTINCT FROM jsonb_build_object(
      'model', estimator.pricing_model_projection(p_model, false),
      'enabled', (SELECT coalesce(jsonb_agg(enabled ORDER BY sort_order), '[]'::jsonb)
                  FROM estimator.pricing_rules WHERE pricing_model_id = p_model)
    ) THEN
    RAISE EXCEPTION 'pricing definition changed' USING ERRCODE = '40001';
  END IF;
END;
$$;

-- GOAT #23: pin the owner-reviewed release to the canonical full definition and
-- exact UTF-8 corpus bytes. The disposable SQL test derives both hashes and
-- the source revision from the version-controlled TypeScript release.
CREATE FUNCTION estimator.require_pricing_acceptance_v1(
  p_draft_revision bigint, p_fingerprint text, p_revision text, p_payload text, p_digest text
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF p_fingerprint IS DISTINCT FROM 'dd63a8a80af54302be061bec9b1c2f553ea1bddece3860d5eebd39cca50b832d'
    OR p_revision IS DISTINCT FROM ('goat-starter-v1-owner-provisional.' || p_draft_revision::text)
    OR p_digest IS DISTINCT FROM '95cb7afe040170a3bf493cc76da4162fd1e45cf7ea08401661e8905fae3e9db2'
    OR p_payload IS NULL OR octet_length(p_payload) > 131072
    OR p_digest IS DISTINCT FROM encode(extensions.digest(convert_to(p_payload, 'UTF8'), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'pricing acceptance requires the reviewed V1 release' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- This checks the trusted server's report against the authorized scenario order.
-- The TypeScript corpus runner evaluates pricing before calling the RPC.
CREATE FUNCTION estimator.pricing_acceptance_required_report(p_payload text) RETURNS jsonb
LANGUAGE sql SET search_path = pg_catalog AS $$
  SELECT jsonb_agg(jsonb_build_object('id', item->>'id', 'passed', true, 'failures', '[]'::jsonb) ORDER BY position)
  FROM jsonb_array_elements(p_payload::jsonb) WITH ORDINALITY AS s(item, position);
$$;

CREATE FUNCTION estimator.submit_pricing_acceptance(
  p_actor uuid, p_session uuid, p_model uuid, p_draft_revision bigint, p_definition text, p_fingerprint text,
  p_revision text, p_payload text, p_digest text, p_prior_manifest uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, estimator AS $$
DECLARE prior uuid; submitted uuid;
BEGIN
  PERFORM estimator.lock_pricing_acceptance_actor(p_actor, p_session);
  PERFORM estimator.lock_pricing_acceptance_draft(p_model, p_draft_revision, p_definition, p_fingerprint);
  PERFORM estimator.require_pricing_acceptance_v1(p_draft_revision, p_fingerprint, p_revision, p_payload, p_digest);

  SELECT id INTO prior FROM estimator.pricing_acceptance_manifests
    WHERE model_id = p_model AND state <> 'INVALIDATED' FOR UPDATE;
  IF prior IS DISTINCT FROM p_prior_manifest THEN
    RAISE EXCEPTION 'acceptance revision changed' USING ERRCODE = '40001';
  END IF;
  IF prior IS NOT NULL THEN
    UPDATE estimator.pricing_acceptance_manifests SET state = 'INVALIDATED', invalidated_at = clock_timestamp() WHERE id = prior;
    INSERT INTO estimator.pricing_acceptance_events(manifest_id, event, actor_id) VALUES (prior, 'SUPERSEDED', p_actor);
  END IF;
  INSERT INTO estimator.pricing_acceptance_manifests
    (model_id, draft_revision, definition_fingerprint, revision, scenario_payload, scenario_digest, author_id)
    VALUES (p_model, p_draft_revision, p_fingerprint, p_revision, p_payload, p_digest, p_actor)
    RETURNING id INTO submitted;
  INSERT INTO estimator.pricing_acceptance_events(manifest_id, event, actor_id) VALUES (submitted, 'SUBMITTED', p_actor);
  RETURN submitted;
END;
$$;

CREATE FUNCTION estimator.lock_pricing_acceptance_manifest(
  p_model uuid, p_draft_revision bigint, p_fingerprint text, p_manifest uuid, p_digest text, p_state text, p_results jsonb
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, estimator AS $$
DECLARE manifest estimator.pricing_acceptance_manifests%ROWTYPE;
BEGIN
  SELECT * INTO manifest FROM estimator.pricing_acceptance_manifests WHERE id = p_manifest FOR UPDATE;
  IF NOT FOUND OR manifest.state IS DISTINCT FROM p_state OR manifest.model_id IS DISTINCT FROM p_model
    OR manifest.draft_revision IS DISTINCT FROM p_draft_revision
    OR manifest.definition_fingerprint IS DISTINCT FROM p_fingerprint
    OR manifest.scenario_digest IS DISTINCT FROM p_digest THEN
    RAISE EXCEPTION 'acceptance revision changed' USING ERRCODE = '40001';
  END IF;
  PERFORM estimator.require_pricing_acceptance_v1(
    manifest.draft_revision, manifest.definition_fingerprint, manifest.revision, manifest.scenario_payload, manifest.scenario_digest
  );
  IF p_results IS DISTINCT FROM estimator.pricing_acceptance_required_report(manifest.scenario_payload) THEN
    RAISE EXCEPTION 'all scenarios must pass' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION estimator.approve_pricing_acceptance(
  p_actor uuid, p_session uuid, p_model uuid, p_draft_revision bigint, p_definition text, p_fingerprint text,
  p_manifest uuid, p_digest text, p_results jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, estimator AS $$
BEGIN
  PERFORM estimator.lock_pricing_acceptance_actor(p_actor, p_session);
  PERFORM estimator.lock_pricing_acceptance_draft(p_model, p_draft_revision, p_definition, p_fingerprint);
  PERFORM estimator.lock_pricing_acceptance_manifest(p_model, p_draft_revision, p_fingerprint, p_manifest, p_digest, 'DRAFT', p_results);
  UPDATE estimator.pricing_acceptance_manifests
    SET state = 'APPROVED', approver_id = p_actor, approved_at = clock_timestamp() WHERE id = p_manifest;
  INSERT INTO estimator.pricing_acceptance_events(manifest_id, event, actor_id) VALUES (p_manifest, 'APPROVED', p_actor);
END;
$$;

CREATE FUNCTION estimator.activate_accepted_pricing_model(
  p_actor uuid, p_session uuid, p_model uuid, p_draft_revision bigint, p_definition text, p_fingerprint text,
  p_manifest uuid, p_digest text, p_results jsonb, p_projection jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, estimator AS $$
BEGIN
  -- Match the legacy transaction's order. All acceptance row locks follow the model lock.
  PERFORM pg_advisory_xact_lock(20261103, 3);
  PERFORM estimator.lock_pricing_acceptance_actor(p_actor, p_session);
  PERFORM estimator.lock_pricing_acceptance_draft(p_model, p_draft_revision, p_definition, p_fingerprint);
  PERFORM estimator.lock_pricing_acceptance_manifest(p_model, p_draft_revision, p_fingerprint, p_manifest, p_digest, 'APPROVED', p_results);
  IF NOT EXISTS (
    SELECT FROM estimator.pricing_acceptance_events AS event
    JOIN estimator.pricing_acceptance_manifests AS manifest ON manifest.id = event.manifest_id
    WHERE manifest.id = p_manifest AND event.event = 'APPROVED' AND event.actor_id = manifest.approver_id
  ) THEN
    RAISE EXCEPTION 'approval event missing' USING ERRCODE = '55000';
  END IF;
  -- The private transaction checks the enabled projection, computes the enabled
  -- definition checksum, and retires/replaces the active model atomically.
  PERFORM estimator.activate_pricing_model(p_model, p_actor, p_projection);
  INSERT INTO estimator.pricing_acceptance_events(manifest_id, event, actor_id) VALUES (p_manifest, 'ACTIVATED', p_actor);
END;
$$;

REVOKE ALL ON FUNCTION
  estimator.pricing_model_projection(uuid,boolean),
  estimator.guard_pricing_acceptance_history(),
  estimator.invalidate_pricing_acceptance_after_edit(),
  estimator.lock_pricing_acceptance_actor(uuid,uuid),
  estimator.lock_pricing_acceptance_draft(uuid,bigint,text,text),
  estimator.require_pricing_acceptance_v1(bigint,text,text,text,text),
  estimator.pricing_acceptance_required_report(text),
  estimator.lock_pricing_acceptance_manifest(uuid,bigint,text,uuid,text,text,jsonb),
  estimator.activate_pricing_model(uuid,uuid,jsonb),
  estimator.submit_pricing_acceptance(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid),
  estimator.approve_pricing_acceptance(uuid,uuid,uuid,bigint,text,text,uuid,text,jsonb),
  estimator.activate_accepted_pricing_model(uuid,uuid,uuid,bigint,text,text,uuid,text,jsonb,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  estimator.submit_pricing_acceptance(uuid,uuid,uuid,bigint,text,text,text,text,text,uuid),
  estimator.approve_pricing_acceptance(uuid,uuid,uuid,bigint,text,text,uuid,text,jsonb),
  estimator.activate_accepted_pricing_model(uuid,uuid,uuid,bigint,text,text,uuid,text,jsonb,jsonb)
TO service_role;

COMMIT;
