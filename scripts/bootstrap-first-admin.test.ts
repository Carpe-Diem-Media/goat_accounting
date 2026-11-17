import { describe, expect, test } from 'bun:test';
import { parseBootstrapArguments, runBootstrapCommand, validateBootstrapTarget } from './bootstrap-first-admin';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const HOSTED_URL = 'https://pxguvhxfvaqtdvqwgbyd.supabase.co';

describe('parseBootstrapArguments', () => {
	test('parses a provision preflight with identity and authorization references', () => {
		expect(
			parseBootstrapArguments([
				'provision',
				'--user-id',
				USER_ID,
				'--owner-authorization-ref',
				'owner-approval-20',
				'--identity-verification-ref',
				'identity-check-20'
			])
		).toEqual({
			operation: 'provision',
			userId: USER_ID,
			ownerAuthorizationRef: 'owner-approval-20',
			identityVerificationRef: 'identity-check-20',
			execute: false
		});
	});

	test('parses activation only with separate owner authorization', () => {
		expect(
			parseBootstrapArguments([
				'activate',
				'--user-id',
				USER_ID,
				'--owner-authorization-ref',
				'owner-approval-21'
			])
		).toEqual({
			operation: 'activate',
			userId: USER_ID,
			ownerAuthorizationRef: 'owner-approval-21',
			execute: false
		});
	});

	test('requires exact target confirmation before an execution request', () => {
		const args = [
			'provision',
			'--user-id',
			USER_ID,
			'--owner-authorization-ref',
			'owner-approval-20',
			'--identity-verification-ref',
			'identity-check-20',
			'--execute'
		];

		expect(parseBootstrapArguments(args)).toBeNull();
		expect(parseBootstrapArguments([...args, '--confirm-user-id', OTHER_USER_ID])).toBeNull();
		expect(parseBootstrapArguments([...args, '--confirm-user-id', USER_ID])).toMatchObject({
			operation: 'provision',
			execute: true,
			confirmedUserId: USER_ID
		});
	});

	test('rejects malformed, duplicate, missing, or operation-inapplicable flags', () => {
		expect(parseBootstrapArguments(['provision', '--user-id', 'not-a-uuid'])).toBeNull();
		expect(
			parseBootstrapArguments([
				'activate',
				'--user-id',
				USER_ID,
				'--owner-authorization-ref',
				'approval',
				'--owner-authorization-ref',
				'other-approval'
			])
		).toBeNull();
		expect(parseBootstrapArguments(['activate', '--user-id', USER_ID])).toBeNull();
		expect(
			parseBootstrapArguments([
				'activate',
				'--user-id',
				USER_ID,
				'--owner-authorization-ref',
				'approval',
				'--identity-verification-ref',
				'identity-check'
			])
		).toBeNull();
		expect(parseBootstrapArguments(['provision', '--unknown', 'value'])).toBeNull();
		expect(
			parseBootstrapArguments([
				'provision',
				'--user-id',
				USER_ID,
				'--owner-authorization-ref',
				'!invalid reference',
				'--identity-verification-ref',
				'identity-check'
			])
		).toBeNull();
	});
});

describe('validateBootstrapTarget', () => {
	test('accepts only the configured Goat hosted origin', () => {
		expect(validateBootstrapTarget(HOSTED_URL)).toBe(HOSTED_URL);
		expect(() => validateBootstrapTarget('http://pxguvhxfvaqtdvqwgbyd.supabase.co')).toThrow();
		expect(() => validateBootstrapTarget('https://other-project.supabase.co')).toThrow();
		expect(() => validateBootstrapTarget(`${HOSTED_URL}/rest/v1`)).toThrow();
		expect(() => validateBootstrapTarget(`${HOSTED_URL}?redirect=elsewhere`)).toThrow();
		expect(() => validateBootstrapTarget('https://pxguvhxfvaqtdvqwgbyd.supabase.co.attacker.invalid')).toThrow();
	});

	test('allows a loopback target only through the local-test validator option', () => {
		expect(() => validateBootstrapTarget('http://127.0.0.1:54321')).toThrow();
		expect(validateBootstrapTarget('http://127.0.0.1:54321', true)).toBe('http://127.0.0.1:54321');
		expect(() => validateBootstrapTarget('http://192.168.1.20:54321', true)).toThrow();
	});
});

describe('runBootstrapCommand', () => {
	const env = {
		SUPABASE_URL: HOSTED_URL,
		SUPABASE_SECRET_KEY: 'local-test-placeholder'
	};
	const provisionArgs = [
		'provision',
		'--user-id',
		USER_ID,
		'--owner-authorization-ref',
		'owner-approval-22',
		'--identity-verification-ref',
		'identity-check-22'
	];

	test('runs the provision RPC in preflight mode and prints no identity details', async () => {
		const calls: { name: string; args: Record<string, unknown> }[] = [];
		const output: unknown[] = [];
		const exitCode = await runBootstrapCommand(provisionArgs, env, {
			write: (record) => output.push(record),
			createClient: () => ({
				rpc: async (name, args) => {
					calls.push({ name, args });
					return { data: { status: 'ready', operation: 'provision' }, error: null };
				}
			})
		});

		expect(exitCode).toBe(0);
		expect(calls).toEqual([
			{
				name: 'provision_first_admin',
				args: {
					p_user_id: USER_ID,
					p_owner_authorization_ref: 'owner-approval-22',
					p_identity_verification_ref: 'identity-check-22',
					p_execute: false
				}
			}
		]);
		expect(JSON.stringify(output)).not.toContain(USER_ID);
		expect(JSON.stringify(output)).not.toContain('identity-check-22');
	});

	test('runs activation only after exact execute confirmation and returns its audit ID', async () => {
		const auditEventId = '73000000-0000-4000-8000-000000000001';
		const calls: { name: string; args: Record<string, unknown> }[] = [];
		const output: unknown[] = [];
		const exitCode = await runBootstrapCommand(
			[
				'activate',
				'--user-id',
				USER_ID,
				'--owner-authorization-ref',
				'owner-activation-23',
				'--execute',
				'--confirm-user-id',
				USER_ID
			],
			env,
			{
				write: (record) => output.push(record),
				createClient: () => ({
					rpc: async (name, args) => {
						calls.push({ name, args });
						return { data: { status: 'completed', operation: 'activate', auditEventId }, error: null };
					}
				})
			}
		);

		expect(exitCode).toBe(0);
		expect(calls).toEqual([
			{
				name: 'activate_first_admin',
				args: {
					p_user_id: USER_ID,
					p_owner_authorization_ref: 'owner-activation-23',
					p_execute: true
				}
			}
		]);
		expect(output).toEqual([{ status: 'completed', operation: 'activate', auditEventId }]);
	});

	test('rejects a mismatched or unapproved target before constructing a client', async () => {
		let clientCreated = false;
		const output: unknown[] = [];
		const exitCode = await runBootstrapCommand(
			[
				'provision',
				'--user-id',
				USER_ID,
				'--owner-authorization-ref',
				'owner-approval-22',
				'--identity-verification-ref',
				'identity-check-22',
				'--execute',
				'--confirm-user-id',
				OTHER_USER_ID
			],
			env,
			{
				write: (record) => output.push(record),
				createClient: () => {
					clientCreated = true;
					throw new Error('must not construct client');
				}
			}
		);

		expect(exitCode).toBe(1);
		expect(clientCreated).toBe(false);
		expect(output).toEqual([{ code: 'INVALID_ARGUMENTS' }]);
	});

	test('rejects missing secrets and wrong project URLs before constructing a client', async () => {
		let clientCreated = false;
		const output: unknown[] = [];
		const createClient = () => {
			clientCreated = true;
			throw new Error('must not construct client');
		};

		expect(
			await runBootstrapCommand(provisionArgs, { SUPABASE_URL: HOSTED_URL }, {
				write: (record) => output.push(record),
				createClient
			})
		).toBe(1);
		expect(
			await runBootstrapCommand(provisionArgs, { ...env, SUPABASE_URL: 'https://other-project.supabase.co' }, {
				write: (record) => output.push(record),
				createClient
			})
		).toBe(1);
		expect(clientCreated).toBe(false);
		expect(JSON.stringify(output)).not.toContain('local-test-placeholder');
	});

	test('does not print raw database error details', async () => {
		const output: unknown[] = [];
		const exitCode = await runBootstrapCommand(provisionArgs, env, {
			write: (record) => output.push(record),
			createClient: () => ({
				rpc: async () => ({
					data: null,
					error: { code: '55000', message: 'private database details and identity@example.invalid' }
				})
			})
		});

		expect(exitCode).toBe(1);
		expect(output).toEqual([{ code: 'BOOTSTRAP_NOT_READY' }]);
		expect(JSON.stringify(output)).not.toContain('private database details');
		expect(JSON.stringify(output)).not.toContain('identity@example.invalid');
	});
});
