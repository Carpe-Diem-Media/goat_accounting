-- Synthetic fixtures only. Every mutation is rolled back.
BEGIN;
INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','clone-admin@example.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','clone-advisor@example.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','clone-viewer@example.invalid','{}','{}',now(),now()),
 ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','clone-inactive@example.invalid','{}','{}',now(),now());
INSERT INTO estimator.staff_users(user_id,role,state) VALUES
 ('10000000-0000-4000-8000-000000000001','admin','ACTIVE'),
 ('10000000-0000-4000-8000-000000000002','advisor','ACTIVE'),
 ('10000000-0000-4000-8000-000000000003','viewer','ACTIVE'),
 ('10000000-0000-4000-8000-000000000004','admin','SUSPENDED');
INSERT INTO estimator.pricing_models(id,version,name,engine_contract_version,confidence_high_max_points,confidence_good_max_points,created_by) VALUES
 ('20000000-0000-4000-8000-000000000001','1.0.0','Synthetic source','1.0.0',0,1,'10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','1.1.0','Synthetic replacement','1.0.0',0,1,'10000000-0000-4000-8000-000000000001');
INSERT INTO estimator.pricing_rules(id,pricing_model_id,code,label,scope,category,rule_type,explanation,conditions,parameters,enabled,sort_order) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','first','First','business','catchup','FIXED_RANGE','Synthetic','{}','{"range":{"minCents":1,"maxCents":2}}',true,1),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','second','Second','business','catchup','FIXED_RANGE','Synthetic','{}','{"range":{"minCents":3,"maxCents":4}}',false,2),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','replacement','Replacement','business','catchup','FIXED_RANGE','Synthetic','{}','{"range":{"minCents":1,"maxCents":2}}',true,1);
INSERT INTO estimator.pricing_rules(id,pricing_model_id,code,label,scope,category,rule_type,input_key,explanation,conditions,parameters,enabled,sort_order) VALUES
 ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','conditional','Conditional','business','ongoing','PER_UNIT_RANGE','business.entityCount','Synthetic',
  '{"when":{"inputKey":"business.entityType","value":"multiple_entities"}}','{"unitLabel":"entity","unitRange":{"minCents":10,"maxCents":20}}',true,3);
SELECT estimator.activate_pricing_model('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',estimator.pricing_model_activation_projection('20000000-0000-4000-8000-000000000001'));
DO $$
DECLARE
  source_id uuid := '20000000-0000-4000-8000-000000000001';
  actor_id uuid := '10000000-0000-4000-8000-000000000001';
  clone_id uuid; expected jsonb; actual jsonb; source_snapshot jsonb; bad_actor uuid;
BEGIN
  IF has_function_privilege('anon', 'estimator.clone_pricing_model(uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'estimator.clone_pricing_model(uuid,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'estimator.clone_pricing_model(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'unexpected clone permissions';
  END IF;
  SELECT jsonb_agg(to_jsonb(r) - ARRAY['id','pricing_model_id','created_at','updated_at'] ORDER BY sort_order)
    INTO expected FROM estimator.pricing_rules r WHERE pricing_model_id = source_id;
  SELECT to_jsonb(m) INTO source_snapshot FROM estimator.pricing_models m WHERE id = source_id;
  clone_id := estimator.clone_pricing_model(source_id, '2.0.0', actor_id);
  IF NOT EXISTS (SELECT 1 FROM estimator.pricing_models WHERE id = clone_id AND state = 'DRAFT'
    AND activated_at IS NULL AND activated_by IS NULL AND retired_at IS NULL AND retired_by IS NULL AND checksum IS NULL) THEN
    RAISE EXCEPTION 'clone state or lifecycle metadata is invalid';
  END IF;
  SELECT jsonb_agg(to_jsonb(r) - ARRAY['id','pricing_model_id','created_at','updated_at'] ORDER BY sort_order)
    INTO actual FROM estimator.pricing_rules r WHERE pricing_model_id = clone_id;
  IF actual IS DISTINCT FROM expected OR EXISTS (
    SELECT 1 FROM estimator.pricing_rules a JOIN estimator.pricing_rules b ON a.id = b.id
    WHERE a.pricing_model_id = source_id AND b.pricing_model_id = clone_id
  ) THEN RAISE EXCEPTION 'cloned rules differ or reuse identifiers'; END IF;
  IF (SELECT to_jsonb(m) FROM estimator.pricing_models m WHERE id = source_id) IS DISTINCT FROM source_snapshot
     OR (SELECT jsonb_agg(to_jsonb(r) - ARRAY['id','pricing_model_id','created_at','updated_at'] ORDER BY sort_order) FROM estimator.pricing_rules r WHERE pricing_model_id = source_id) IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'source was modified';
  END IF;
  BEGIN
    PERFORM estimator.clone_pricing_model(source_id, '2.0.0', actor_id);
    RAISE EXCEPTION 'duplicate version accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  FOREACH bad_actor IN ARRAY ARRAY['10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid,'10000000-0000-4000-8000-000000000004'::uuid] LOOP
    BEGIN
      PERFORM estimator.clone_pricing_model(source_id, '3.0.0', bad_actor);
      RAISE EXCEPTION 'unauthorized actor accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM estimator.clone_pricing_model(clone_id, '4.0.0', actor_id);
    RAISE EXCEPTION 'draft source accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END;
$$;
SELECT estimator.activate_pricing_model('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',estimator.pricing_model_activation_projection('20000000-0000-4000-8000-000000000002'));
SELECT estimator.clone_pricing_model('20000000-0000-4000-8000-000000000001','5.0.0','10000000-0000-4000-8000-000000000001');
CREATE FUNCTION pg_temp.reject_clone_rule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM estimator.pricing_models WHERE id = NEW.pricing_model_id AND version = '6.0.0') THEN
    RAISE EXCEPTION 'injected clone rule failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_clone_failure BEFORE INSERT ON estimator.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_clone_rule();
DO $$
BEGIN
  BEGIN
    PERFORM estimator.clone_pricing_model('20000000-0000-4000-8000-000000000001','6.0.0','10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'injected failure did not occur';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'injected clone rule failure' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM estimator.pricing_models WHERE version = '6.0.0') THEN
    RAISE EXCEPTION 'failed clone left a parent row';
  END IF;
END;
$$;
DO $$
DECLARE
  draft_id uuid; actor uuid := '10000000-0000-4000-8000-000000000001';
  revision bigint; new_revision bigint; updates jsonb; altered jsonb;
BEGIN
  IF has_function_privilege('anon', 'estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'estimator.save_pricing_draft(uuid,uuid,bigint,bigint,bigint,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'unexpected save permissions';
  END IF;
  SELECT id, draft_revision INTO draft_id, revision FROM estimator.pricing_models WHERE version = '2.0.0';
  SELECT jsonb_agg(jsonb_build_object('id', id, 'label', label, 'parameters', parameters, 'conditions', conditions, 'enabled', enabled) ORDER BY sort_order)
    INTO updates FROM estimator.pricing_rules WHERE pricing_model_id = draft_id;
  new_revision := estimator.save_pricing_draft(draft_id, actor, revision, 0, 1, updates);
  IF new_revision <> revision THEN RAISE EXCEPTION 'no-op save advanced the draft revision'; END IF;
  altered := jsonb_set(jsonb_set(updates, '{0,label}', to_jsonb(updates->0->>'label' || ' edited')), '{1,label}', to_jsonb(updates->1->>'label' || ' edited'));
  new_revision := estimator.save_pricing_draft(draft_id, actor, revision, 1, 2, altered);
  IF new_revision <> revision + 1 THEN RAISE EXCEPTION 'one aggregate save must advance revision exactly once'; END IF;
  BEGIN
    PERFORM estimator.save_pricing_draft(draft_id, actor, revision, 1, 2, altered);
    RAISE EXCEPTION 'stale edit accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  altered := jsonb_set(updates, '{1,label}', 'null'::jsonb);
  BEGIN
    PERFORM estimator.save_pricing_draft(draft_id, actor, new_revision, 0, 1, altered);
    RAISE EXCEPTION 'invalid edit accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT draft_revision FROM estimator.pricing_models WHERE id = draft_id) <> new_revision THEN
    RAISE EXCEPTION 'failed edit left a partial write';
  END IF;
  UPDATE estimator.pricing_rules SET label = label WHERE id = (updates->0->>'id')::uuid;
  IF (SELECT draft_revision FROM estimator.pricing_models WHERE id = draft_id) <> new_revision THEN
    RAISE EXCEPTION 'no-op direct rule update advanced the draft revision';
  END IF;
  UPDATE estimator.pricing_models SET confidence_high_max_points = confidence_high_max_points WHERE id = draft_id;
  IF (SELECT draft_revision FROM estimator.pricing_models WHERE id = draft_id) <> new_revision THEN
    RAISE EXCEPTION 'no-op direct model update advanced the draft revision';
  END IF;
  altered := jsonb_set(updates, '{1,id}', to_jsonb(replace(updates->0->>'id', '-', '')));
  BEGIN
    PERFORM estimator.save_pricing_draft(draft_id, actor, new_revision, 0, 1, altered);
    RAISE EXCEPTION 'duplicate UUID spelling accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM estimator.save_pricing_draft(draft_id, '10000000-0000-4000-8000-000000000002', new_revision, 0, 1, updates);
    RAISE EXCEPTION 'advisor edit accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM estimator.save_pricing_draft('20000000-0000-4000-8000-000000000001', actor, 0, 0, 1, updates);
    RAISE EXCEPTION 'retired model edit accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    PERFORM estimator.save_pricing_draft('20000000-0000-4000-8000-000000000002', actor, 0, 0, 1, updates);
    RAISE EXCEPTION 'active model edit accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  UPDATE estimator.pricing_rules SET label = label || ' changed' WHERE id = (updates->0->>'id')::uuid;
  IF (SELECT draft_revision FROM estimator.pricing_models WHERE id = draft_id) <= new_revision THEN
    RAISE EXCEPTION 'direct rule write did not advance revision';
  END IF;
END;
$$;
ROLLBACK;
