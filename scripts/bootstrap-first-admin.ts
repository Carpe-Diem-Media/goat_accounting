import { createEstimatorServiceClient, type EstimatorServerEnv } from '../src/lib/server/supabase/client.server';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$/;
const GOAT_SUPABASE_HOST = 'pxguvhxfvaqtdvqwgbyd.supabase.co';

export type BootstrapArguments = {
	operation: 'provision' | 'activate';
	userId: string;
	ownerAuthorizationRef: string;
	identityVerificationRef?: string;
	execute: boolean;
	confirmedUserId?: string;
};

export function parseBootstrapArguments(args: string[]): BootstrapArguments | null {
	const operation = args[0];
	if (operation !== 'provision' && operation !== 'activate') return null;

	const values = new Map<string, string | true>();
	const valuedFlags = new Set([
		'--user-id',
		'--owner-authorization-ref',
		'--identity-verification-ref',
		'--confirm-user-id'
	]);
	const booleanFlags = new Set(['--execute']);

	for (let index = 1; index < args.length; index += 1) {
		const flag = args[index];
		if (!flag || values.has(flag)) return null;
		if (booleanFlags.has(flag)) {
			values.set(flag, true);
			continue;
		}
		if (!valuedFlags.has(flag)) return null;
		const value = args[index + 1];
		if (!value || value.startsWith('--')) return null;
		values.set(flag, value);
		index += 1;
	}

	const userId = values.get('--user-id');
	const ownerAuthorizationRef = values.get('--owner-authorization-ref');
	const identityVerificationRef = values.get('--identity-verification-ref');
	const confirmedUserId = values.get('--confirm-user-id');
	const execute = values.has('--execute');

	if (
		typeof userId !== 'string' ||
		!UUID.test(userId) ||
		typeof ownerAuthorizationRef !== 'string' ||
		!REFERENCE.test(ownerAuthorizationRef)
	) {
		return null;
	}

	if (operation === 'provision') {
		if (typeof identityVerificationRef !== 'string' || !REFERENCE.test(identityVerificationRef)) return null;
	} else if (identityVerificationRef !== undefined) {
		return null;
	}

	if (execute) {
		if (confirmedUserId !== userId) return null;
	} else if (confirmedUserId !== undefined) {
		return null;
	}

	return {
		operation,
		userId,
		ownerAuthorizationRef,
		...(typeof identityVerificationRef === 'string' ? { identityVerificationRef } : {}),
		execute,
		...(typeof confirmedUserId === 'string' ? { confirmedUserId } : {})
	};
}

export function validateBootstrapTarget(urlValue: string, allowLocalTestTarget = false): string {
	let target: URL;
	try {
		target = new URL(urlValue);
	} catch {
		throw new Error('SUPABASE_TARGET_INVALID');
	}

	const isUnadornedOrigin =
		target.username === '' &&
		target.password === '' &&
		target.pathname === '/' &&
		target.search === '' &&
		target.hash === '';
	if (!isUnadornedOrigin) throw new Error('SUPABASE_TARGET_INVALID');

	if (
		target.protocol === 'https:' &&
		target.hostname === GOAT_SUPABASE_HOST &&
		target.port === ''
	) {
		return target.origin;
	}

	const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
	if (allowLocalTestTarget && target.protocol === 'http:' && isLoopback && target.port !== '') {
		return target.origin;
	}

	throw new Error('SUPABASE_TARGET_INVALID');
}

type BootstrapRpcName = 'provision_first_admin' | 'activate_first_admin';
type BootstrapRpcClient = {
	rpc: (
		name: BootstrapRpcName,
		args: Record<string, unknown>
	) => Promise<{
		data: unknown;
		error: { code?: string | null } | null;
	}>;
};

type BootstrapDependencies = {
	write?: (record: unknown) => void;
	createClient?: (url: string, secretKey: string) => BootstrapRpcClient;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeDatabaseErrorCode(code: string | null | undefined): string {
	if (code === '55000') return 'BOOTSTRAP_NOT_READY';
	if (code === '42501') return 'OPERATION_NOT_AUTHORIZED';
	if (code === '22023') return 'INVALID_ARGUMENTS';
	return 'DATABASE_OPERATION_UNAVAILABLE';
}

export async function runBootstrapCommand(
	args: string[],
	env: EstimatorServerEnv,
	dependencies: BootstrapDependencies = {}
): Promise<number> {
	const write = dependencies.write ?? ((record: unknown) => console.log(JSON.stringify(record)));
	const fail = (code: string) => {
		write({ code });
		return 1;
	};

	if (args.length === 1 && args[0] === '--help') {
		write({
			usage:
				'provision --user-id UUID --owner-authorization-ref REF --identity-verification-ref REF [--execute --confirm-user-id UUID] | activate --user-id UUID --owner-authorization-ref REF [--execute --confirm-user-id UUID]'
		});
		return 0;
	}

	const command = parseBootstrapArguments(args);
	if (!command) return fail('INVALID_ARGUMENTS');
	if (!env.SUPABASE_URL) return fail('SUPABASE_URL_MISSING');
	if (!env.SUPABASE_SECRET_KEY) return fail('SUPABASE_SECRET_KEY_MISSING');

	let targetUrl: string;
	try {
		targetUrl = validateBootstrapTarget(env.SUPABASE_URL);
	} catch {
		return fail('SUPABASE_TARGET_INVALID');
	}

	try {
		const createClient = dependencies.createClient ?? ((url, secretKey) =>
			createEstimatorServiceClient({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey }) as unknown as BootstrapRpcClient);
		const client = createClient(targetUrl, env.SUPABASE_SECRET_KEY);
		const rpcName: BootstrapRpcName =
			command.operation === 'provision' ? 'provision_first_admin' : 'activate_first_admin';
		const rpcArgs: Record<string, unknown> = {
			p_user_id: command.userId,
			p_owner_authorization_ref: command.ownerAuthorizationRef,
			p_execute: command.execute
		};
		if (command.operation === 'provision') {
			rpcArgs.p_identity_verification_ref = command.identityVerificationRef;
		}

		const result = await client.rpc(rpcName, rpcArgs);
		if (result.error) return fail(safeDatabaseErrorCode(result.error.code));
		if (!isRecord(result.data) || result.data.operation !== command.operation) {
			return fail('DATABASE_RESPONSE_INVALID');
		}

		if (result.data.status === 'ready' && !command.execute) {
			write({ status: 'ready', operation: command.operation });
			return 0;
		}

		if (
			result.data.status === 'completed' &&
			command.execute &&
			typeof result.data.auditEventId === 'string' &&
			UUID.test(result.data.auditEventId)
		) {
			write({
				status: 'completed',
				operation: command.operation,
				auditEventId: result.data.auditEventId
			});
			return 0;
		}

		return fail('DATABASE_RESPONSE_INVALID');
	} catch {
		return fail('DATABASE_OPERATION_UNAVAILABLE');
	}
}

if (import.meta.main) {
	process.exitCode = await runBootstrapCommand(process.argv.slice(2), process.env);
}
