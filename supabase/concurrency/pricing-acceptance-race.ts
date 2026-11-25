import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT as candidate } from '../pricing-candidates/goat-accounting-starter-v1';
import { GOAT_STARTER_V1_MANIFEST_REVISION, GOAT_STARTER_V1_SCENARIOS as scenarios } from '../pricing-candidates/goat-accounting-starter-v1-acceptance';
import { fingerprintDraft, runPricingCorpus, serializeDraftFingerprintInput } from '../../src/lib/server/pricing/run-pricing-corpus';
import { createEstimate } from '../../src/lib/server/estimator/create-estimate';
import { createEstimatesRepository } from '../../src/lib/server/supabase/repositories/estimates';
import { createEstimatorRepository } from '../../src/lib/server/supabase/repository.server';
import { createEstimateDocumentRepository, toEstimateDocumentModel } from '../../src/lib/server/pdf/estimate-document';
import type { Database } from '../../src/lib/server/supabase/database.types';

const [container, migration] = process.argv.slice(2);
const api = new URL(Bun.env.GOAT_PRICING_TEST_API ?? '');
const key = Bun.env.GOAT_PRICING_TEST_KEY;
if (!/^supabase_db_goat-t13-[a-f0-9]{12}$/.test(container) || migration !== '20261125100000' ||
	api.hostname !== '127.0.0.1' || !key) throw new Error('Expected a disposable GOAT acceptance project.');

const actor = crypto.randomUUID();
const aal2 = crypto.randomUUID();
const aal1 = crypto.randomUUID();
const payload = JSON.stringify(scenarios);
const digest = new Bun.CryptoHasher('sha256').update(payload).digest('hex');

async function evidence(model: typeof candidate) {
	const definition = serializeDraftFingerprintInput(model);
	const fingerprint = await fingerprintDraft(model);
	const report = await runPricingCorpus(model, {
		modelId: model.id, definitionFingerprint: fingerprint, revision: 'local-only', scenarios
	});
	if (!report.passed || report.scenarios.length !== 21) throw new Error('Expected a complete passing V1 report.');
	return { definition, fingerprint, results: JSON.stringify(report.scenarios), payload, digest };
}
const original = await evidence(candidate);

async function sql(statement: string, vars: Record<string, string> = original) {
	const process = Bun.spawn(['docker', 'exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres',
		'-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', ...Object.entries(vars).flatMap(([name, value]) => ['-v', `${name}=${value}`])],
	{ stdin: new Blob([statement]), stdout: 'pipe', stderr: 'pipe' });
	const [out, err, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
	return { out: out.trim(), err, code };
}

async function ok(statement: string, vars?: Record<string, string>) {
	const result = await sql(statement, vars);
	if (result.code) throw new Error(result.err.split('\n')[0]);
	return result.out;
}
async function rejects(code: string, statement: string, vars?: Record<string, string>) {
	const result = await sql(statement, vars);
	if (!result.code || !result.err.includes(`ERROR:  ${code}:`)) throw new Error(`Expected SQLSTATE ${code}, got ${result.err.split('\n')[0]}`);
}
function same(actual: unknown, expected: unknown, context: string) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(context);
}
async function waitFor(query: string) {
	for (let attempts = 0; attempts < 20; attempts++) {
		if (await ok(query) === 't') return;
		await Bun.sleep(60);
	}
	throw new Error('Did not observe two competing SQL sessions.');
}
const submitted = (binding: string, revision: string, prior = 'NULL', body = ":'payload'", hash = ":'digest'") =>
	`SELECT estimator.submit_pricing_acceptance(${binding}, '${revision}', ${body}, ${hash}, ${prior});`;
const approves = (binding: string, manifest: string, report = ":'results'::jsonb") =>
	`SELECT estimator.approve_pricing_acceptance(${binding}, '${manifest}', :'digest', ${report});`;
const activates = (binding: string, manifest: string, projection = ":'definition'::jsonb->'model'") =>
	`SELECT estimator.activate_accepted_pricing_model(${binding}, '${manifest}', :'digest', :'results', ${projection});`;

async function compete(first: string, second: string) {
	const a = sql(`BEGIN; SET LOCAL ROLE service_role; ${first}
		SELECT pg_advisory_xact_lock(23, 2); SELECT pg_sleep(3); COMMIT;`);
	await waitFor("SELECT EXISTS (SELECT FROM pg_locks WHERE locktype='advisory' AND classid=23 AND objid=2 AND granted);");
	const b = sql(`BEGIN; SET LOCAL application_name='goat-23-2-competitor'; SET LOCAL ROLE service_role; ${second}\nCOMMIT;`);
	await waitFor("SELECT EXISTS (SELECT FROM pg_stat_activity WHERE application_name='goat-23-2-competitor' AND wait_event_type='Lock');");
	const [winner, competitor] = await Promise.all([a, b]);
	same(winner.code, 0, winner.err.split('\n')[0]);
	if (!competitor.code || !competitor.err.includes('ERROR:  40001:')) {
		throw new Error(`Expected a concurrent conflict, got ${competitor.err.split('\n')[0]}`);
	}
}

same(await ok(`SELECT EXISTS (SELECT FROM supabase_migrations.schema_migrations WHERE version='${migration}');`), 't', 'Acceptance migration missing.');
const tap = await ok(await Bun.file(new URL('../tests/pricing_acceptance_test.sql', import.meta.url)).text());
if (/^not ok /m.test(tap) || (tap.match(/^ok /gm) ?? []).length !== 12) throw new Error(tap);
console.log(tap);
await ok(`INSERT INTO auth.users(id,email) VALUES ('${actor}', 'pricing-acceptance@example.invalid');
	INSERT INTO estimator.staff_users(user_id,role,state) VALUES ('${actor}','admin','ACTIVE');
	INSERT INTO auth.sessions(id,user_id,aal) VALUES ('${aal2}','${actor}','aal2'), ('${aal1}','${actor}','aal1');
	SELECT estimator.import_first_pricing_draft('${actor}', :'definition', :'fingerprint', 'GOAT-23#test');`);

const draftRevision = (id: string) => ok(`SELECT draft_revision FROM estimator.pricing_models WHERE id='${id}';`);
const binding = (id: string, rev: string, session = aal2) => `'${actor}', '${session}', '${id}', ${rev}, :'definition', :'fingerprint'`;
let rev = await draftRevision(candidate.id);
let draft = binding(candidate.id, rev);
const missing = crypto.randomUUID();
await rejects('42501', submitted(binding(candidate.id, rev, aal1), 'first'));
await rejects('42501', submitted(binding(candidate.id, rev, missing), 'first'));
await rejects('40001', approves(draft, missing));
await rejects('40001', activates(draft, missing));
await rejects('40001', submitted(draft, 'first'), { ...original, fingerprint: '0'.repeat(64) });
const disabledDefinition = serializeDraftFingerprintInput(candidate, candidate.rules.map((_rule, index) => index !== 0));
await rejects('40001', submitted(draft, 'first'), {
	...original, definition: disabledDefinition, fingerprint: new Bun.CryptoHasher('sha256').update(disabledDefinition).digest('hex')
});

const releaseRevision = (revision: string) => `${GOAT_STARTER_V1_MANIFEST_REVISION}.${revision}`;
const blankAnswers = scenarios.map((scenario) => ({ ...scenario, answers: {}, expected: {} }));
const differentAnswers = scenarios.map((scenario, index) => ({
	...scenario, answers: scenarios[(index + 1) % scenarios.length].answers
}));
const changedAmounts = scenarios.map((scenario) => ({
	...scenario,
	expected: { ...scenario.expected, ongoing: { minCents: 1, maxCents: 2 } }
}));
for (const scenarioPayload of ['[]', '{', ...[blankAnswers, differentAnswers, changedAmounts].map((cases) => JSON.stringify(cases))]) {
	await rejects('42501', `SET ROLE service_role; ${submitted(draft, releaseRevision(rev))}`, {
		...original, payload: scenarioPayload, digest: new Bun.CryptoHasher('sha256').update(scenarioPayload).digest('hex')
	});
}
same(await ok('SELECT (SELECT count(*) FROM estimator.pricing_acceptance_manifests), (SELECT count(*) FROM estimator.pricing_acceptance_events);'),
	'0|0', 'Unauthorized payloads changed acceptance history.');

await rejects('42501', `SET ROLE service_role; ${submitted(draft, releaseRevision(rev), 'NULL', "'[]'")}`);
await rejects('42501', `SET ROLE service_role; ${submitted(draft, releaseRevision(rev), 'NULL', ":'payload'", "'wrong'")}`);
await rejects('42501', `SET ROLE service_role; ${submitted(draft, 'unreviewed-revision')}`);
const first = await ok(`SET ROLE service_role; ${submitted(draft, releaseRevision(rev))}`);
await rejects('22023', approves(draft, first, "jsonb_build_array(jsonb_build_object('passed', false))"));
await rejects('40001', activates(draft, first));
await compete(approves(draft, first), approves(draft, first));
same(await ok(`SELECT state, approver_id FROM estimator.pricing_acceptance_manifests WHERE id='${first}';`),
	`APPROVED|${actor}`, 'Competing approval did not retain the authorized approver.');
await rejects('55000', `UPDATE estimator.pricing_acceptance_manifests SET revision='edited' WHERE id='${first}';`);
await rejects('55000', `DELETE FROM estimator.pricing_acceptance_events WHERE manifest_id='${first}';`);
await rejects('23505', submitted(draft, releaseRevision(rev), `'${first}'`));
same(await ok(`SELECT state FROM estimator.pricing_acceptance_manifests WHERE id='${first}';`),
	'APPROVED', 'Duplicate submission invalidated an approval.');

// The ordinary draft editor bumps the revision under the same model lock.
// Change a label during the approval request, then restore it at a new revision.
const edit = (revision: string, change: string) => `SELECT estimator.save_pricing_draft('${candidate.id}', '${actor}', ${revision}, 0, 1,
 (SELECT jsonb_agg(jsonb_build_object('id', id, 'label', CASE WHEN sort_order=0 THEN ${change} ELSE label END,
  'enabled', enabled, 'conditions', conditions, 'parameters', parameters))
  FROM estimator.pricing_rules WHERE pricing_model_id='${candidate.id}'));`;
await ok(edit(rev, "label || ' local edit'"));
same(await ok(`SELECT state, approver_id FROM estimator.pricing_acceptance_manifests WHERE id='${first}';`),
	`INVALIDATED|${actor}`, 'Editing the approved draft did not preserve its approval history.');
await rejects('40001', approves(draft, first));
await rejects('40001', activates(draft, first));

async function restoreDraft() {
	await ok(edit(await draftRevision(candidate.id), "replace(label, ' local edit', '')"));
	rev = await draftRevision(candidate.id);
	draft = binding(candidate.id, rev);
	return ok(submitted(draft, releaseRevision(rev)));
}
const second = await restoreDraft();
await compete(edit(rev, "label || ' local edit'"), approves(draft, second));
same(await ok(`SELECT state FROM estimator.pricing_acceptance_manifests WHERE id='${second}';`), 'INVALIDATED', 'Edit did not invalidate evidence.');
same(await ok(`SELECT actor_id FROM estimator.pricing_acceptance_events WHERE manifest_id='${second}' AND event='DRAFT_CHANGED';`),
	actor, 'Draft invalidation did not record the verified editor.');
const third = await restoreDraft();
await ok(approves(draft, third));
await compete(edit(rev, "label || ' local edit'"), activates(draft, third));
same(await ok(`SELECT state FROM estimator.pricing_acceptance_manifests WHERE id='${third}';`),
	'INVALIDATED', 'Concurrent edit failed to invalidate the approved revision.');
const final = await restoreDraft();
await ok(approves(draft, final));
await rejects('22023', activates(draft, final, "'{}'::jsonb"));
await rejects('40001', activates(draft, final), { ...original, digest: '0'.repeat(64) });

// Seed a preexisting ACTIVE only as the owner of this disposable database.
// Every approval and activation under test still uses the shipped V1 checks.
const previous = crypto.randomUUID();
await ok(`
	INSERT INTO estimator.pricing_models
		(id, version, name, engine_contract_version, currency, confidence_high_max_points, confidence_good_max_points, created_by)
	SELECT '${previous}', '0.9.0', name, engine_contract_version, currency,
		confidence_high_max_points, confidence_good_max_points, created_by
	FROM estimator.pricing_models WHERE id='${candidate.id}';
	INSERT INTO estimator.pricing_rules
		(pricing_model_id, code, label, scope, category, rule_type, input_key, explanation, conditions, parameters, enabled, sort_order)
	SELECT '${previous}', code, label, scope, category, rule_type, input_key, explanation, conditions, parameters, enabled, sort_order
	FROM estimator.pricing_rules WHERE pricing_model_id='${candidate.id}';
	SELECT estimator.activate_pricing_model('${previous}', '${actor}', estimator.pricing_model_activation_projection('${previous}'));
`);

const cloneVersion = '99.0.1';
const clone = await ok(`SELECT estimator.clone_pricing_model('${previous}', '${cloneVersion}', '${actor}');`);
const cloneModel = { ...candidate, id: clone, version: cloneVersion };
const cloneRev = await draftRevision(clone);
const cloneBinding = binding(clone, cloneRev);
const cloneVars = {
	...original, definition: serializeDraftFingerprintInput(cloneModel), fingerprint: await fingerprintDraft(cloneModel)
};
await rejects('42501', `SET ROLE service_role; ${submitted(cloneBinding, releaseRevision(cloneRev))}`, cloneVars);
same(await ok(`SELECT count(*) FROM estimator.pricing_acceptance_manifests WHERE model_id='${clone}';`),
	'0', 'The unreviewed clone gained a manifest.');

// Seed out-of-policy history as the test database owner to check the transition
// guards independently of submit. Use the passing report from V1 with this clone.
const cloneManifest = await ok(`
	INSERT INTO estimator.pricing_acceptance_manifests
		(model_id, draft_revision, definition_fingerprint, revision, scenario_payload, scenario_digest, author_id)
	VALUES ('${clone}', ${cloneRev}, :'fingerprint', '${releaseRevision(cloneRev)}', :'payload', :'digest', '${actor}')
	RETURNING id;
`, cloneVars);
await rejects('42501', `SET ROLE service_role; ${approves(cloneBinding, cloneManifest)}`, cloneVars);
same(await ok(`SELECT state FROM estimator.pricing_acceptance_manifests WHERE id='${cloneManifest}';`),
	'DRAFT', 'The unreviewed clone gained approval.');
await ok(`UPDATE estimator.pricing_acceptance_manifests SET state='APPROVED', approver_id='${actor}', approved_at=now()
	WHERE id='${cloneManifest}';
	INSERT INTO estimator.pricing_acceptance_events(manifest_id, event, actor_id)
	VALUES ('${cloneManifest}', 'APPROVED', '${actor}');`);
await rejects('42501', `SET ROLE service_role; ${activates(cloneBinding, cloneManifest)}`, cloneVars);
same(await ok(`SELECT state FROM estimator.pricing_models WHERE id='${clone}';`),
	'DRAFT', 'The unreviewed clone became active.');
same(await ok(`SELECT id FROM estimator.pricing_models WHERE state='ACTIVE';`),
	previous, 'Rejected activation retired the ACTIVE model.');
same(await ok(`SELECT string_agg(event, ',') FROM estimator.pricing_acceptance_events WHERE manifest_id='${cloneManifest}';`),
	'APPROVED', 'The rejected transitions wrote an audit event.');

const client = createClient<Database, 'estimator'>(api.origin, key, { db: { schema: 'estimator' }, auth: { persistSession: false } });
const estimates = createEstimatesRepository(client);
const models = createEstimatorRepository(client);
const documents = createEstimateDocumentRepository(client);
const { answers } = scenarios[0];
const saved = await createEstimate({ calculatorType: answers.calculatorType, answers, idempotencyKey: randomBytes(32).toString('base64url') }, {
	getActivePricingModel: models.getActivePricingModel, findByIdempotencyKey: estimates.findByIdempotencyKey,
	persistEstimate: estimates.createEstimateSnapshot
});
async function readHistory() {
	const row = await documents.findDocumentByPublicRef(saved.publicRef);
	if (!row) throw new Error('Historical estimate unavailable.');
	const snapshot = await ok(`SELECT to_jsonb(e) FROM estimator.estimates e WHERE public_ref='${saved.publicRef}';`);
	return { snapshot, document: toEstimateDocumentModel(row) };
}
const history = await readHistory();

await ok(`CREATE FUNCTION estimator.test_abort_activation() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.id = '${candidate.id}' AND NEW.state = 'ACTIVE' THEN
   IF EXISTS (SELECT FROM estimator.pricing_models WHERE id='${previous}' AND state='ACTIVE') THEN
    RAISE EXCEPTION 'retirement was not observed';
   END IF;
   RAISE EXCEPTION 'injected failure after retirement' USING ERRCODE='P4321';
  END IF;
  RETURN NEW;
 END;
 $$;
 CREATE TRIGGER test_abort_activation BEFORE UPDATE ON estimator.pricing_models
 FOR EACH ROW EXECUTE FUNCTION estimator.test_abort_activation();`);
await rejects('P4321', `SET ROLE service_role; ${activates(draft, final)}`);
same(await ok("SELECT id FROM estimator.pricing_models WHERE state='ACTIVE';"), previous, 'Rollback lost the previous ACTIVE model.');
same(await ok(`SELECT state FROM estimator.pricing_models WHERE id='${candidate.id}';`), 'DRAFT', 'Failed replacement did not roll back.');
same(await ok(`SELECT count(*) FROM estimator.pricing_acceptance_events WHERE manifest_id='${final}' AND event='ACTIVATED';`),
	'0', 'Failed activation left an audit event.');
same(await readHistory(), history, 'Failed activation changed historical estimate or PDF data.');
await ok('DROP TRIGGER test_abort_activation ON estimator.pricing_models; DROP FUNCTION estimator.test_abort_activation();');

await compete(activates(draft, final), activates(draft, final));
same(await ok("SELECT count(*) FILTER (WHERE state='ACTIVE'), count(*) FILTER (WHERE state='RETIRED') FROM estimator.pricing_models;"),
	'1|1', 'Competing activations did not preserve the single ACTIVE invariant.');
same(await ok(`SELECT state, checksum=estimator.pricing_model_definition_checksum(id) FROM estimator.pricing_models WHERE id='${candidate.id}';`),
	'ACTIVE|t', 'The authorized V1 draft did not activate with its SQL checksum.');
same(await ok(`SELECT state FROM estimator.pricing_models WHERE id='${previous}';`), 'RETIRED', 'Replacement did not retire the previous ACTIVE model.');
await rejects('40001', activates(draft, final));
await rejects('40001', activates(binding(previous, await draftRevision(previous)), final));
same(await readHistory(), history, 'Retirement changed historical pricing, estimate snapshots or PDF document data.');
same(await ok(`SELECT count(*) FROM estimator.pricing_acceptance_events WHERE event='ACTIVATED';`), '1', 'Activation audit history mismatch.');
console.log('Verified V1 release pins, unauthorized payload and definition rejection, separate-session transitions, rollback, and historical estimate/PDF data.');
