import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const enabled = Bun.env.GOAT_FIRST_ADMIN_RACE_TESTS === '1';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

type CommandResult = { code: number; stdout: string; stderr: string };

function runCommand(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<CommandResult> {
	return new Promise((resolveResult, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
		child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
		child.on('error', reject);
		child.on('close', (code) => resolveResult({ code: code ?? 1, stdout: stdout.trim(), stderr }));
	});
}

async function localDatabaseTarget() {
	const config = await readFile(resolve(projectRoot, 'supabase/config.toml'), 'utf8');
	const projectId = config.match(/^project_id = "([^"]+)"$/m)?.[1];
	const dbPort = config.match(/^\[db\][\s\S]*?^port = (\d+)$/m)?.[1];
	const apiPort = config.match(/^\[api\][\s\S]*?^port = (\d+)$/m)?.[1];
	if (projectId !== 'goat-accounting-estimator-local' || !dbPort || !apiPort) {
		throw new Error('Refusing an unidentified local Supabase project.');
	}

	const status = await runCommand('supabase', ['status', '--output', 'json'], { cwd: projectRoot });
	if (status.code !== 0) throw new Error('Local Supabase status is unavailable.');

	let statusJson: { DB_URL?: string; API_URL?: string };
	try {
		statusJson = JSON.parse(status.stdout) as { DB_URL?: string; API_URL?: string };
	} catch {
		throw new Error('Local Supabase status did not return valid JSON.');
	}
	if (!statusJson.DB_URL || !statusJson.API_URL) throw new Error('Local Supabase endpoints are unavailable.');

	const database = new URL(statusJson.DB_URL);
	const api = new URL(statusJson.API_URL);
	const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
	if (
		!['postgres:', 'postgresql:'].includes(database.protocol) ||
		!loopbackHosts.has(database.hostname) ||
		database.port !== dbPort ||
		database.pathname !== '/postgres' ||
		database.username !== 'postgres' ||
		api.protocol !== 'http:' ||
		!loopbackHosts.has(api.hostname) ||
		api.port !== apiPort
	) {
		throw new Error('Local Supabase endpoints do not match the configured Goat project.');
	}

	const env = { ...process.env, PGPASSWORD: database.password, PGSSLMODE: 'disable' };
	const psqlArgs = [
		'--no-psqlrc',
		'--set=ON_ERROR_STOP=1',
		'--set=VERBOSITY=verbose',
		'--tuples-only',
		'--no-align',
		`--host=${database.hostname.replace(/^\[|\]$/g, '')}`,
		`--port=${database.port}`,
		`--username=${database.username}`,
		`--dbname=${database.pathname.slice(1)}`
	];
	return {
		env,
		psql: (sql: string) => runCommand('psql', [...psqlArgs, '--command', sql], { cwd: projectRoot, env })
	};
}

async function assertCleanBaseline(psql: (sql: string) => Promise<CommandResult>) {
	const result = await psql(`
		SELECT
			(SELECT count(*) FROM estimator.staff_users WHERE role = 'admin')::text || '|' ||
			(SELECT count(*) FROM estimator.staff_admin_audit)::text || '|' ||
			(SELECT count(*) FROM estimator.staff_admin_bootstrap_context)::text;
	`);
	expect(result.code, 'baseline query should succeed').toBe(0);
	expect(result.stdout, 'race test requires a clean first-admin baseline').toBe('0|0|0');
}

async function cleanSyntheticFixtures(psql: (sql: string) => Promise<CommandResult>, userIds: string[]) {
	const targetIds = userIds.map((userId) => `'${userId}'::uuid`).join(', ');
	const cleanup = await psql(`
		BEGIN;
		ALTER TABLE estimator.staff_admin_audit DISABLE TRIGGER staff_admin_audit_append_only;
		ALTER TABLE estimator.staff_users DISABLE TRIGGER staff_users_guard;
		DELETE FROM estimator.staff_admin_audit WHERE target_user_id IN (${targetIds});
		DELETE FROM estimator.staff_users WHERE user_id IN (${targetIds});
		DELETE FROM estimator.staff_admin_bootstrap_context WHERE target_user_id IN (${targetIds});
		DELETE FROM auth.mfa_factors WHERE user_id IN (${targetIds});
		DELETE FROM auth.users WHERE id IN (${targetIds});
		ALTER TABLE estimator.staff_users ENABLE TRIGGER staff_users_guard;
		ALTER TABLE estimator.staff_admin_audit ENABLE TRIGGER staff_admin_audit_append_only;
		COMMIT;
	`);
	if (cleanup.code !== 0) throw new Error('Synthetic first-admin fixtures could not be cleaned up.');

	const remainingFixtures = await psql(`
		SELECT
			(SELECT count(*) FROM auth.users WHERE id IN (${targetIds}))::text || '|' ||
			(SELECT count(*) FROM estimator.staff_users WHERE user_id IN (${targetIds}))::text || '|' ||
			(SELECT count(*) FROM estimator.staff_admin_audit WHERE target_user_id IN (${targetIds}))::text || '|' ||
			(SELECT count(*) FROM estimator.staff_admin_bootstrap_context WHERE target_user_id IN (${targetIds}))::text || '|' ||
			(SELECT count(*) FROM auth.mfa_factors WHERE user_id IN (${targetIds}))::text;
	`);
	expect(remainingFixtures.code).toBe(0);
	expect(remainingFixtures.stdout).toBe('0|0|0|0|0');
	await assertCleanBaseline(psql);
}

describe.skipIf(!enabled)('first-admin lifecycle concurrency in local Goat Supabase', () => {
	test('serializes competing provision and activation requests to one lifecycle', async () => {
		const { psql } = await localDatabaseTarget();
		const firstUserId = crypto.randomUUID();
		const secondUserId = crypto.randomUUID();
		const provisionRef = `race-provision-${crypto.randomUUID().replaceAll('-', '')}`;
		const firstIdentityRef = `race-identity-${crypto.randomUUID().replaceAll('-', '')}`;
		const secondIdentityRef = `race-identity-${crypto.randomUUID().replaceAll('-', '')}`;

		await assertCleanBaseline(psql);

		let fixturesCreated = false;
		try {
			const setup = await psql(`
				BEGIN;
				INSERT INTO auth.users (
					id, aud, role, email, email_confirmed_at,
					raw_app_meta_data, raw_user_meta_data, created_at, updated_at
				) VALUES
					('${firstUserId}', 'authenticated', 'authenticated', 'race-${firstUserId}@example.invalid', now(), '{}', '{}', now(), now()),
					('${secondUserId}', 'authenticated', 'authenticated', 'race-${secondUserId}@example.invalid', now(), '{}', '{}', now(), now());
				COMMIT;
			`);
			if (setup.code !== 0) throw new Error('Synthetic Auth fixture setup failed.');
			fixturesCreated = true;

			const provision = (userId: string, identityRef: string) => `
				BEGIN;
				SET LOCAL ROLE service_role;
				SELECT pg_catalog.pg_sleep(0.15);
				SELECT estimator.provision_first_admin(
					'${userId}'::uuid,
					'${provisionRef}',
					'${identityRef}',
					true
				);
				SELECT pg_catalog.pg_sleep(0.25);
				COMMIT;
			`;
			const provisionResults = await Promise.all([
				psql(provision(firstUserId, firstIdentityRef)),
				psql(provision(secondUserId, secondIdentityRef))
			]);
			expect(provisionResults.filter((result) => result.code === 0)).toHaveLength(1);
			const provisionFailure = provisionResults.find((result) => result.code !== 0);
			expect(provisionFailure?.stderr).toContain('55000');

			const winnerResult = await psql(`
				SELECT target_user_id::text
				FROM estimator.staff_admin_audit
				WHERE operation = 'first_admin_provision';
			`);
			expect(winnerResult.code).toBe(0);
			const winnerUserId = winnerResult.stdout;
			expect([firstUserId, secondUserId]).toContain(winnerUserId);

			const mfaFixture = await psql(`
				INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at, secret)
				VALUES (
					'${crypto.randomUUID()}', '${winnerUserId}', 'totp', 'verified', now(), now(), 'race-test-fixture-only'
				);
			`);
			if (mfaFixture.code !== 0) throw new Error('Synthetic MFA fixture setup failed.');

			const activate = (authorizationRef: string) => `
				BEGIN;
				SET LOCAL ROLE service_role;
				SELECT pg_catalog.pg_sleep(0.15);
				SELECT estimator.activate_first_admin('${winnerUserId}'::uuid, '${authorizationRef}', true);
				SELECT pg_catalog.pg_sleep(0.25);
				COMMIT;
			`;
			const activationResults = await Promise.all([
				psql(activate(`race-activation-a-${crypto.randomUUID().replaceAll('-', '')}`)),
				psql(activate(`race-activation-b-${crypto.randomUUID().replaceAll('-', '')}`))
			]);
			expect(activationResults.filter((result) => result.code === 0)).toHaveLength(1);
			const activationFailure = activationResults.find((result) => result.code !== 0);
			expect(activationFailure?.stderr).toContain('55000');

			const finalState = await psql(`
				SELECT
					(SELECT count(*) FROM estimator.staff_users
					 WHERE user_id = '${winnerUserId}' AND role = 'admin' AND state = 'ACTIVE')::text || '|' ||
					(SELECT count(*) FROM estimator.staff_admin_audit
					 WHERE operation = 'first_admin_provision')::text || '|' ||
					(SELECT count(*) FROM estimator.staff_admin_audit
					 WHERE operation = 'first_admin_activate')::text;
			`);
			expect(finalState.code).toBe(0);
			expect(finalState.stdout).toBe('1|1|1');
		} finally {
			if (fixturesCreated) await cleanSyntheticFixtures(psql, [firstUserId, secondUserId]);
		}
	});

	test('serializes an activation request against concurrent initial provisioning', async () => {
		const { psql } = await localDatabaseTarget();
		const userId = crypto.randomUUID();
		const provisionRef = `cross-provision-${crypto.randomUUID().replaceAll('-', '')}`;
		const identityRef = `cross-identity-${crypto.randomUUID().replaceAll('-', '')}`;
		const activationRef = `cross-activation-${crypto.randomUUID().replaceAll('-', '')}`;
		await assertCleanBaseline(psql);

		let fixturesCreated = false;
		try {
			const setup = await psql(`
				BEGIN;
				INSERT INTO auth.users (
					id, aud, role, email, email_confirmed_at,
					raw_app_meta_data, raw_user_meta_data, created_at, updated_at
				) VALUES (
					'${userId}', 'authenticated', 'authenticated', 'cross-${userId}@example.invalid', now(), '{}', '{}', now(), now()
				);
				INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at, secret)
				VALUES ('${crypto.randomUUID()}', '${userId}', 'totp', 'verified', now(), now(), 'race-test-fixture-only');
				COMMIT;
			`);
			if (setup.code !== 0) throw new Error('Synthetic Auth and MFA fixture setup failed.');
			fixturesCreated = true;

			const provision = `
				BEGIN;
				SET LOCAL ROLE service_role;
				SELECT pg_catalog.pg_sleep(0.15);
				SELECT estimator.provision_first_admin('${userId}'::uuid, '${provisionRef}', '${identityRef}', true);
				SELECT pg_catalog.pg_sleep(0.25);
				COMMIT;
			`;
			const activate = `
				BEGIN;
				SET LOCAL ROLE service_role;
				SELECT pg_catalog.pg_sleep(0.15);
				SELECT estimator.activate_first_admin('${userId}'::uuid, '${activationRef}', true);
				SELECT pg_catalog.pg_sleep(0.25);
				COMMIT;
			`;
			const [provisionResult, activationResult] = await Promise.all([psql(provision), psql(activate)]);
			expect(provisionResult.code, 'provision should succeed in the cross-operation race').toBe(0);
			if (activationResult.code !== 0) expect(activationResult.stderr).toContain('55000');

			const finalState = await psql(`
				SELECT
					(SELECT state::text FROM estimator.staff_users WHERE user_id = '${userId}') || '|' ||
					(SELECT count(*) FROM estimator.staff_admin_audit WHERE operation = 'first_admin_provision')::text || '|' ||
					(SELECT count(*) FROM estimator.staff_admin_audit WHERE operation = 'first_admin_activate')::text;
			`);
			expect(finalState.code).toBe(0);
			if (activationResult.code === 0) {
				expect(finalState.stdout).toBe('ACTIVE|1|1');
			} else {
				expect(finalState.stdout).toBe('INVITED|1|0');
			}
		} finally {
			if (fixturesCreated) await cleanSyntheticFixtures(psql, [userId]);
		}
	});
});
