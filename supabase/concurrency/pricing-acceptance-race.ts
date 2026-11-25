import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT as candidate } from '../pricing-candidates/goat-accounting-starter-v1';
import { GOAT_STARTER_V1_SCENARIOS as scenarios } from '../pricing-candidates/goat-accounting-starter-v1-acceptance';
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

async function compete(first: string, second: string, expected: string, firstVars = original, secondVars = original) {
	const a = sql(`BEGIN; SET LOCAL ROLE service_role; ${first}
		SELECT pg_advisory_xact_lock(23, 2); SELECT pg_sleep(3); COMMIT;`, firstVars);
	await waitFor("SELECT EXISTS (SELECT FROM pg_locks WHERE locktype='advisory' AND classid=23 AND objid=2 AND granted);");
	const b = sql(`BEGIN; SET LOCAL application_name='goat-23-2-competitor'; SET LOCAL ROLE service_role; ${second}\nCOMMIT;`, secondVars);
	await waitFor("SELECT EXISTS (SELECT FROM pg_stat_activity WHERE application_name='goat-23-2-competitor' AND wait_event_type='Lock');");
	const [winner, competitor] = await Promise.all([a, b]);
	same(winner.code, 0, winner.err.split('\n')[0]);
	if (expected === 'success') same(competitor.code, 0, competitor.err.split('\n')[0]);
	else if (!competitor.code || !competitor.err.includes(`ERROR:  ${expected}:`)) {
		throw new Error(`Expected concurrent SQLSTATE ${expected}, got ${competitor.err.split('\n')[0]}`);
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
await rejects('22023', submitted(draft, 'first', 'NULL', "'[]'"));
await rejects('22P02', submitted(draft, 'first', 'NULL', "'{'"));
await rejects('23514', submitted(draft, 'first', 'NULL', ":'payload'", "'wrong'"));
await rejects('40001', submitted(draft, 'first'), { ...original, fingerprint: '0'.repeat(64) });
const disabledDefinition = serializeDraftFingerprintInput(candidate, candidate.rules.map((_rule, index) => index !== 0));
await rejects('40001', submitted(draft, 'first'), {
	...original, definition: disabledDefinition, fingerprint: new Bun.CryptoHasher('sha256').update(disabledDefinition).digest('hex')
});

const first = await ok(submitted(draft, 'first'));
await rejects('22023', approves(draft, first, "jsonb_build_array(jsonb_build_object('passed', false))"));
await rejects('40001', activates(draft, first));
await compete(approves(draft, first), approves(draft, first), '40001');
same(await ok(`SELECT state, approver_id FROM estimator.pricing_acceptance_manifests WHERE id='${first}';`),
	`APPROVED|${actor}`, 'Competing approval did not retain the authorized approver.');
await rejects('55000', `UPDATE estimator.pricing_acceptance_manifests SET revision='edited' WHERE id='${first}';`);
await rejects('55000', `DELETE FROM estimator.pricing_acceptance_events WHERE manifest_id='${first}';`);
const second = await ok(submitted(draft, 'second', `'${first}'`));
await rejects('23505', submitted(draft, 'second', `'${second}'`));
await rejects('40001', approves(draft, first));
await rejects('40001', activates(draft, first));

// The ordinary draft editor bumps the revision under the same model lock.
// Change a label during the approval request, then restore it at a new revision.
const edit = (revision: string, change: string) => `SELECT estimator.save_pricing_draft('${candidate.id}', '${actor}', ${revision}, 0, 1,
 (SELECT jsonb_agg(jsonb_build_object('id', id, 'label', CASE WHEN sort_order=0 THEN ${change} ELSE label END,
  'enabled', enabled, 'conditions', conditions, 'parameters', parameters))
  FROM estimator.pricing_rules WHERE pricing_model_id='${candidate.id}'));`;
await compete(edit(rev, "label || ' local edit'"), approves(draft, second), '40001');
same(await ok(`SELECT state FROM estimator.pricing_acceptance_manifests WHERE id='${second}';`), 'INVALIDATED', 'Edit did not invalidate evidence.');
same(await ok(`SELECT actor_id FROM estimator.pricing_acceptance_events WHERE manifest_id='${second}' AND event='DRAFT_CHANGED';`),
	actor, 'Draft invalidation did not record the verified editor.');
await ok(edit(await draftRevision(candidate.id), "replace(label, ' local edit', '')"));
rev = await draftRevision(candidate.id);
draft = binding(candidate.id, rev);
const third = await ok(submitted(draft, 'third'));
await ok(approves(draft, third));
await compete(edit(rev, "label || ' local edit'"), activates(draft, third), '40001');
same(await ok(`SELECT state FROM estimator.pricing_acceptance_manifests WHERE id='${third}';`),
	'INVALIDATED', 'Concurrent edit failed to invalidate the approved revision.');
await ok(edit(await draftRevision(candidate.id), "replace(label, ' local edit', '')"));
rev = await draftRevision(candidate.id);
draft = binding(candidate.id, rev);
const final = await ok(submitted(draft, 'fourth'));
await ok(approves(draft, final));
await rejects('22023', activates(draft, final, "'{}'::jsonb"));
await rejects('40001', activates(draft, final), { ...original, digest: '0'.repeat(64) });
await compete(activates(draft, final), activates(draft, final), '40001');
same(await ok(`SELECT state, checksum=estimator.pricing_model_definition_checksum(id) FROM estimator.pricing_models WHERE id='${candidate.id}';`),
	'ACTIVE|t', 'Original draft did not activate with its SQL checksum.');

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

async function replacement(version: string) {
	const id = await ok(`SELECT estimator.clone_pricing_model('${candidate.id}', '${version}', '${actor}');`);
	const vars = await evidence({ ...candidate, id, version });
	const bound = binding(id, await draftRevision(id));
	const manifest = await ok(submitted(bound, 'replacement'), vars);
	await ok(approves(bound, manifest), vars);
	return { id, vars, bound, manifest };
}
const left = await replacement('99.0.1');
const right = await replacement('99.0.2');
await ok(`CREATE FUNCTION estimator.test_abort_activation() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.id = '${left.id}' AND NEW.state = 'ACTIVE' THEN
   IF EXISTS (SELECT FROM estimator.pricing_models WHERE id='${candidate.id}' AND state='ACTIVE') THEN
    RAISE EXCEPTION 'retirement was not observed';
   END IF;
   RAISE EXCEPTION 'injected failure after retirement' USING ERRCODE='P4321';
  END IF;
  RETURN NEW;
 END;
 $$;
 CREATE TRIGGER test_abort_activation BEFORE UPDATE ON estimator.pricing_models
 FOR EACH ROW EXECUTE FUNCTION estimator.test_abort_activation();`);
await rejects('P4321', activates(left.bound, left.manifest), left.vars);
same(await ok(`SELECT id FROM estimator.pricing_models WHERE state='ACTIVE';`), candidate.id, 'Rollback lost the previous ACTIVE model.');
same(await ok(`SELECT state FROM estimator.pricing_models WHERE id='${left.id}';`), 'DRAFT', 'Failed replacement did not roll back.');
same(await ok(`SELECT count(*) FROM estimator.pricing_acceptance_events WHERE manifest_id='${left.manifest}' AND event='ACTIVATED';`),
	'0', 'Failed activation left an audit event.');
await ok('DROP TRIGGER test_abort_activation ON estimator.pricing_models; DROP FUNCTION estimator.test_abort_activation();');

await compete(activates(left.bound, left.manifest), activates(right.bound, right.manifest), 'success', left.vars, right.vars);
same(await ok("SELECT count(*) FILTER (WHERE state='ACTIVE'), count(*) FILTER (WHERE state='RETIRED') FROM estimator.pricing_models;"),
	'1|2', 'Competing replacements did not preserve the single ACTIVE invariant.');
await rejects('40001', activates(draft, final));
same(await readHistory(), history, 'Retirement changed historical pricing, estimate snapshots or PDF document data.');
same(await ok(`SELECT count(*) FROM estimator.pricing_acceptance_events WHERE event='ACTIVATED';`), '3', 'Activation audit history mismatch.');
console.log('Observed separate-session approval, draft edit and activation waits. Verified rollback after retirement, immutable history, SQL checksum and stable historical estimate/PDF data.');
