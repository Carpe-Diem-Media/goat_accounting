import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = readFileSync(resolve(projectDir, 'supabase/config.toml'), 'utf8');
const projectId = config.match(/^project_id = "([^"]+)"$/m)?.[1];
const dbSection = config.match(/^\[db\]([\s\S]*?)(?=^\[)/m)?.[1];
const dbPort = dbSection?.match(/^port = (\d+)$/m)?.[1];
const apiPort = config.match(/^\[api\][\s\S]*?^port = (\d+)$/m)?.[1];
assert.equal(projectId, 'goat-accounting-estimator-local', 'refusing an unidentified Supabase project');
assert.equal(dbPort, '56522', 'refusing an unexpected local database port');
assert.equal(apiPort, '54321', 'refusing an unexpected local API port');

const cli = process.env.SUPABASE_CLI ?? 'supabase';
const status = await runCommand(cli, ['status', '--output', 'json'], { cwd: projectDir });
assert.equal(status.code, 0, 'local Supabase status must be available');
const statusJson = JSON.parse(status.stdout);
const api = new URL(statusJson.API_URL);
const database = new URL(statusJson.DB_URL);
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(api.hostname), 'refusing a non-loopback API host');
assert.equal(api.port, apiPort, 'refusing an API outside the configured local project');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(database.hostname), 'refusing a non-loopback database host');
assert.equal(database.port, dbPort, 'refusing a database outside the configured local port');
assert.equal(database.pathname, '/postgres', 'refusing an unexpected database name');
assert.equal(database.username, 'postgres', 'test cleanup requires the local postgres owner');

const actors = {
	admin: randomUUID(),
	advisor: randomUUID(),
	advisorB: randomUUID(),
	viewer: randomUUID()
};
const modelId = randomUUID();
const ruleId = randomUUID();
const version = `99.0.0+${randomUUID().replaceAll('-', '')}.leadtest`;
const testLeads = Array.from({ length: 5 }, () => ({ id: randomUUID(), estimateId: randomUUID() }));
const seededUserIds = Object.values(actors);
const seededEstimateIds = testLeads.map((lead) => lead.estimateId);
let seeded = false;

function sqlLiteral(value) {
	if (value === null || value === undefined) return 'NULL';
	return `'${String(value).replaceAll("'", "''")}'`;
}

function psql(sql) {
	return runCommand('psql', [
		'--no-psqlrc', '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=verbose', '--tuples-only', '--no-align',
		'--host=127.0.0.1', `--port=${database.port}`, `--username=${database.username}`,
		'--dbname=postgres', '--command', sql
	], {
		cwd: projectDir,
		env: {
			PATH: process.env.PATH,
			PGPASSWORD: database.password ?? '',
			PGSSLMODE: 'disable'
		}
	});
}

async function runCommand(command, args, options) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
		child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
		child.on('error', reject);
		child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr }));
	});
}

function transitionSql(leadId, expected, target, actorId, reason = null) {
	return `BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_catalog.pg_sleep(0.15);
SELECT estimator.transition_lead(
  '${leadId}'::uuid, '${expected}'::estimator.lead_state,
  '${target}'::estimator.lead_state, '${actorId}'::uuid,
  ${sqlLiteral(reason)}, NULL
);
COMMIT;`;
}

async function transition(leadId, expected, target, actorId, reason = null) {
	const result = await psql(transitionSql(leadId, expected, target, actorId, reason));
	if (result.code === 0) return '00000';
	return result.stderr.match(/ERROR:\s+([0-9A-Z]{5})/)?.[1] ?? 'UNKNOWN';
}

async function assertStateAndEventCount(leadId, state, expectedCount) {
	const result = await psql(`SELECT lead.state::text || ':' || count(event.id)::text
FROM estimator.leads AS lead
LEFT JOIN estimator.lead_events AS event ON event.lead_id = lead.id
WHERE lead.id = '${leadId}'::uuid
GROUP BY lead.state;`);
	assert.equal(result.code, 0, 'lead state and event count query should succeed');
	assert.equal(result.stdout, `${state}:${expectedCount}`);
}

function estimateInsertSql({ estimateId, leadId }) {
	const calculation = `jsonb_build_object(
  'engineVersion', '1.0.0', 'pricingModelId', '${modelId}', 'pricingModelVersion', ${sqlLiteral(version)},
  'catchup', jsonb_build_object('minCents', 1, 'maxCents', 1, 'lineItems', jsonb_build_array(
    jsonb_build_object('code', 'lead_test', 'ruleCode', 'lead_test', 'label', 'Lead test item',
      'category', 'catchup', 'branch', 'business', 'minCents', 1, 'maxCents', 1,
      'quantity', 1, 'unit', 'return', 'sourceAnswers', '{}'::jsonb, 'explanation', 'Synthetic transition fixture')
  )),
  'ongoing', jsonb_build_object('minCents', 0, 'maxCents', 0, 'lineItems', '[]'::jsonb),
  'confidence', 'good', 'confidenceReasons', '[]'::jsonb, 'confidencePoints', '{"business":0}'::jsonb,
  'complexityScores', '{"business":0}'::jsonb, 'manualReviewRequired', false,
  'reviewFlags', '[]'::jsonb, 'reviewReasons', '[]'::jsonb
)`;
	return `INSERT INTO estimator.estimates (
  id, public_ref, calculator_type, pricing_model_id, pricing_model_version,
  engine_version, answers_snapshot, calculation_snapshot, catchup_min_cents,
  catchup_max_cents, ongoing_min_cents, ongoing_max_cents, confidence,
  manual_review_required, review_reasons
) VALUES (
  '${estimateId}'::uuid, pg_catalog.replace('${estimateId}', '-', ''), 'business',
  '${modelId}'::uuid, ${sqlLiteral(version)}, '1.0.0',
  '{"calculatorType":"business","answers":{}}'::jsonb, ${calculation},
  1, 1, 0, 0, 'good', false, '[]'::jsonb
);
INSERT INTO estimator.leads (
  id, estimate_id, state, full_name, email, contact_consent_at,
  requested_contact, requested_estimate_email
)
VALUES (
  '${leadId}'::uuid, '${estimateId}'::uuid, 'NEW', 'Synthetic lead transition test',
  '${leadId}@example.invalid', pg_catalog.clock_timestamp(), true, false
);`;
}

const seedSql = `BEGIN;
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('${actors.admin}', 'authenticated', 'authenticated', '${actors.admin}@lead-test.example.invalid', '{}', '{}', now(), now()),
  ('${actors.advisor}', 'authenticated', 'authenticated', '${actors.advisor}@lead-test.example.invalid', '{}', '{}', now(), now()),
  ('${actors.advisorB}', 'authenticated', 'authenticated', '${actors.advisorB}@lead-test.example.invalid', '{}', '{}', now(), now()),
  ('${actors.viewer}', 'authenticated', 'authenticated', '${actors.viewer}@lead-test.example.invalid', '{}', '{}', now(), now());
INSERT INTO estimator.staff_users (user_id, role, state)
VALUES
  ('${actors.admin}', 'admin', 'ACTIVE'),
  ('${actors.advisor}', 'advisor', 'ACTIVE'),
  ('${actors.advisorB}', 'advisor', 'ACTIVE'),
  ('${actors.viewer}', 'viewer', 'ACTIVE');
INSERT INTO estimator.pricing_models (
  id, version, name, engine_contract_version, confidence_high_max_points,
  confidence_good_max_points, created_by
) VALUES (
  '${modelId}', ${sqlLiteral(version)}, 'Synthetic lead transition fixture', '1.0.0', 0, 1, '${actors.admin}'
);
INSERT INTO estimator.pricing_rules (
  id, pricing_model_id, code, label, scope, category, rule_type,
  explanation, conditions, parameters
) VALUES (
  '${ruleId}', '${modelId}', 'lead_test', 'Lead test item', 'business', 'catchup', 'FIXED_RANGE',
  'Synthetic lead transition fixture', '{}', '{"range":{"minCents":1,"maxCents":1}}'
);
SELECT estimator.activate_pricing_model(
  '${modelId}'::uuid, '${actors.admin}'::uuid,
  estimator.pricing_model_activation_projection('${modelId}'::uuid)
);
${testLeads.map((lead) => estimateInsertSql({ estimateId: lead.estimateId, leadId: lead.id })).join('\n')}
COMMIT;`;

async function cleanup() {
	const result = await psql(`BEGIN;
SET LOCAL session_replication_role = replica;
DELETE FROM estimator.lead_events WHERE lead_id IN (${testLeads.map((lead) => `'${lead.id}'::uuid`).join(', ')});
DELETE FROM estimator.leads WHERE id IN (${testLeads.map((lead) => `'${lead.id}'::uuid`).join(', ')});
DELETE FROM estimator.estimate_line_items WHERE estimate_id IN (${seededEstimateIds.map((id) => `'${id}'::uuid`).join(', ')});
DELETE FROM estimator.estimates WHERE id IN (${seededEstimateIds.map((id) => `'${id}'::uuid`).join(', ')});
DELETE FROM estimator.pricing_rules WHERE id = '${ruleId}'::uuid;
DELETE FROM estimator.pricing_models WHERE id = '${modelId}'::uuid;
DELETE FROM estimator.staff_users WHERE user_id IN (${seededUserIds.map((id) => `'${id}'::uuid`).join(', ')});
DELETE FROM auth.users WHERE id IN (${seededUserIds.map((id) => `'${id}'::uuid`).join(', ')});
COMMIT;`);
	assert.equal(result.code, 0, 'synthetic lead-transition fixture cleanup failed');
}

try {
	const preflight = await psql(`SELECT count(*) FROM estimator.pricing_models WHERE state = 'ACTIVE';`);
	assert.equal(preflight.code, 0, 'active-model preflight query should succeed');
	assert.equal(preflight.stdout, '0', 'test will not retire an existing active local pricing model');

	const seededResult = await psql(seedSql);
	const setupError = seededResult.stderr.split('\n').find((line) => line.includes('ERROR:'))
		?.replace(/ERROR:\s+[0-9A-Z]{5}:\s*/, 'ERROR: ');
	assert.equal(seededResult.code, 0, `synthetic transition fixture setup failed: ${setupError ?? 'no safe database detail'}`);
	seeded = true;
	const legacyEvent = await psql(`INSERT INTO estimator.lead_events (lead_id, from_state, to_state, reason_code)
VALUES ('${testLeads[2].id}'::uuid, NULL, 'NEW', 'legacy_fixture');`);
	assert.equal(legacyEvent.code, 0, 'legacy history fixture setup failed');

	const identical = await Promise.all([
		transition(testLeads[0].id, 'NEW', 'CONTACTED', actors.advisor),
		transition(testLeads[0].id, 'NEW', 'CONTACTED', actors.advisor)
	]);
	assert.deepEqual(identical.sort(), ['00000', '40001']);
	await assertStateAndEventCount(testLeads[0].id, 'CONTACTED', 2);
	process.stdout.write('PASS concurrent identical transitions: one success, one stale conflict, one event added\n');

	const conflicting = await Promise.all([
		transition(testLeads[1].id, 'NEW', 'CONTACTED', actors.advisor),
		transition(testLeads[1].id, 'NEW', 'CLOSED_LOST', actors.advisor, 'Synthetic test closure')
	]);
	assert.deepEqual([...conflicting].sort(), ['00000', '40001']);
	const winningState = conflicting[0] === '00000' ? 'CONTACTED' : 'CLOSED_LOST';
	await assertStateAndEventCount(testLeads[1].id, winningState, 2);
	process.stdout.write('PASS conflicting stale transitions: one committed sequence, stale request rejected\n');

	for (const [from, to, reason] of [
		['NEW', 'CONTACTED', null],
		['CONTACTED', 'QUALIFIED', null],
		['QUALIFIED', 'PROPOSAL_SENT', null],
		['PROPOSAL_SENT', 'CLOSED_WON', 'Synthetic test closure']
	]) {
		assert.equal(await transition(testLeads[2].id, from, to, actors.advisor, reason), '00000');
	}
	const order = await psql(`SELECT pg_catalog.string_agg(event_order::text || ':' || to_state::text, ',' ORDER BY event_order)
FROM estimator.lead_events WHERE lead_id = '${testLeads[2].id}'::uuid;`);
	assert.equal(order.code, 0);
	assert.equal(order.stdout, '1:NEW,2:CONTACTED,3:QUALIFIED,4:PROPOSAL_SENT,5:CLOSED_WON');
	const legacyOrder = await psql(`SELECT count(*)::text
FROM estimator.lead_events WHERE lead_id = '${testLeads[2].id}'::uuid AND event_order IS NULL;`);
	assert.equal(legacyOrder.code, 0);
	assert.equal(legacyOrder.stdout, '1');
	await assertStateAndEventCount(testLeads[2].id, 'CLOSED_WON', 6);
	process.stdout.write('PASS sequential transitions: event orders follow committed order and legacy events remain unordered\n');

	for (const [from, to, reason, code] of [
		['NEW', 'CLOSED_LOST', null, '22023'],
		['NEW', 'QUALIFIED', null, '23514'],
		['NEW', 'NEW', null, '23514']
	]) {
		assert.equal(await transition(testLeads[3].id, from, to, actors.advisor, reason), code);
	}
	assert.equal(await transition(testLeads[3].id, 'NEW', 'CONTACTED', actors.viewer), '42501');
	await assertStateAndEventCount(testLeads[3].id, 'NEW', 1);
	assert.equal(await transition(testLeads[2].id, 'CLOSED_WON', 'CLOSED_LOST', actors.advisor, 'Synthetic test'), '23514');
	await assertStateAndEventCount(testLeads[2].id, 'CLOSED_WON', 6);
	process.stdout.write('PASS invalid, duplicate, terminal, missing-reason, and viewer requests: no write or event\n');

	assert.equal(await transition(testLeads[4].id, 'NEW', 'CONTACTED', actors.advisor), '00000');
	await assertStateAndEventCount(testLeads[4].id, 'CONTACTED', 2);
	assert.equal(await transition(testLeads[4].id, 'NEW', 'CLOSED_LOST', actors.advisorB, 'No response'), '40001');
	await assertStateAndEventCount(testLeads[4].id, 'CONTACTED', 2);
	process.stdout.write('PASS older form after another advisor commits: stale RPC rejected with no additional event\n');

	const privileges = await psql(`SELECT
  pg_catalog.has_function_privilege('anon', 'estimator.transition_lead(uuid,estimator.lead_state,estimator.lead_state,uuid,text,text)', 'EXECUTE')::text || ':' ||
  pg_catalog.has_function_privilege('authenticated', 'estimator.transition_lead(uuid,estimator.lead_state,estimator.lead_state,uuid,text,text)', 'EXECUTE')::text || ':' ||
  pg_catalog.has_function_privilege('service_role', 'estimator.transition_lead(uuid,estimator.lead_state,estimator.lead_state,uuid,text,text)', 'EXECUTE')::text;`);
	assert.equal(privileges.code, 0);
	assert.equal(privileges.stdout, 'false:false:true');
	process.stdout.write('PASS database execution grants: only service_role can invoke the transition RPC\n');
} finally {
	if (seeded) await cleanup();
}
