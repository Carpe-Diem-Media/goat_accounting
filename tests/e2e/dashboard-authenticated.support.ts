import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';

export type StaffFixture = Readonly<{
	userId: string;
	role: 'viewer' | 'admin';
	aal1: Session;
	aal2: Session;
	cleanup: () => Promise<void>;
}>;

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing disposable dashboard test setting ${name}.`);
	return value;
}

function testConfig() {
	const supabaseUrl = required('DASHBOARD_E2E_SUPABASE_URL');
	const anonKey = required('DASHBOARD_E2E_ANON_KEY');
	const serviceRoleKey = required('DASHBOARD_E2E_SERVICE_ROLE_KEY');
	const databaseContainer = required('DASHBOARD_E2E_DB_CONTAINER');
	const projectId = required('DASHBOARD_E2E_PROJECT_ID');
	if (!/^goat-t13-[a-f0-9]{12}$/.test(projectId) || databaseContainer !== `supabase_db_${projectId}`) {
		throw new Error('Dashboard E2E requires its unique disposable local Supabase project.');
	}
	if (new URL(supabaseUrl).hostname !== '127.0.0.1') throw new Error('Dashboard E2E refuses non-loopback Supabase URLs.');
	return { supabaseUrl, anonKey, serviceRoleKey, databaseContainer, projectId };
}

function sql(statement: string): string {
	const { databaseContainer } = testConfig();
	const result = spawnSync('docker', [
		'exec', '-i', databaseContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'
	], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
	if (result.error || result.status !== 0) {
		const detail = (result.stderr ?? '').toLowerCase();
		const kind = /no such container|not found/.test(detail) ? 'container_missing'
			: /permission denied/.test(detail) ? 'permission_denied'
			: /does not exist/.test(detail) ? 'object_missing'
			: /syntax error/.test(detail) ? 'syntax_error'
			: /connection refused|could not connect/.test(detail) ? 'database_unavailable'
			: 'database_command_failed';
		throw new Error(`Disposable dashboard database operation failed (${kind}, status=${result.status ?? 'unknown'}).`);
	}
	return result.stdout.trim();
}

function makeTotp(secret: string): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const character of secret.toUpperCase().replace(/=+$/, '')) {
		const value = alphabet.indexOf(character);
		if (value < 0) throw new Error('Local Supabase returned an invalid TOTP seed.');
		bits += value.toString(2).padStart(5, '0');
	}
	const bytes = Buffer.from(bits.match(/.{8}/g)!.map((part) => Number.parseInt(part, 2)));
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
	const digest = createHmac('sha1', bytes).update(counter).digest();
	const offset = digest[19] & 15;
	return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function newUserClient(): SupabaseClient {
	const { supabaseUrl, anonKey } = testConfig();
	return createClient(supabaseUrl, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

async function createDisposableAdminAnchor(admin: SupabaseClient): Promise<void> {
	const email = `task13-admin-anchor-${randomBytes(12).toString('hex')}@example.invalid`;
	const password = randomBytes(32).toString('base64url');
	const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (created.error || !created.data.user) throw new Error('Could not create the disposable local admin cleanup anchor.');

	const userId = created.data.user.id;
	const banned = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
	if (banned.error) throw new Error('Could not secure the disposable local admin cleanup anchor.');
	sql(`INSERT INTO estimator.staff_users (user_id, role, state) VALUES ('${userId}'::uuid, 'admin', 'ACTIVE');`);
}

export async function createStaffFixture(role: StaffFixture['role']): Promise<StaffFixture> {
	const { supabaseUrl, serviceRoleKey } = testConfig();
	const admin = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const email = `task13-${role}-${randomBytes(12).toString('hex')}@example.invalid`;
	const password = randomBytes(32).toString('base64url');
	const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (created.error || !created.data.user) throw new Error('Could not create a disposable local staff user.');
	const userId = created.data.user.id;
	if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Local Supabase returned an invalid staff identifier.');

	try {
		sql(`INSERT INTO estimator.staff_users (user_id, role, state) VALUES ('${userId}'::uuid, '${role}', 'ACTIVE');`);
		if (role === 'admin') await createDisposableAdminAnchor(admin);
		const client = newUserClient();
		const signedIn = await client.auth.signInWithPassword({ email, password });
		if (signedIn.error || !signedIn.data.session) throw new Error('Local password sign-in failed.');
		const aal1 = structuredClone(signedIn.data.session);
		const aal1Claims = await client.auth.getClaims(aal1.access_token);
		if (aal1Claims.error || aal1Claims.data.claims?.aal !== 'aal1') throw new Error('Local password session did not verify as AAL1.');

		const enrollment = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'synthetic-dashboard-regression' });
		if (enrollment.error || !enrollment.data) throw new Error('Local TOTP enrollment failed.');
		const verified = await client.auth.mfa.challengeAndVerify({
			factorId: enrollment.data.id,
			code: makeTotp(enrollment.data.totp.secret)
		});
		if (verified.error) throw new Error('Local TOTP verification failed.');
		const elevated = await client.auth.getSession();
		const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
		if (
			elevated.error || !elevated.data.session ||
			assurance.error || assurance.data.currentLevel !== 'aal2' || assurance.data.nextLevel !== 'aal2'
		) {
			throw new Error('Local TOTP session did not verify as AAL2.');
		}

		return {
			userId,
			role,
			aal1,
			aal2: structuredClone(elevated.data.session),
			cleanup: async () => {
				try {
					sql(`UPDATE estimator.staff_users SET state = 'DEACTIVATED' WHERE user_id = '${userId}'::uuid AND state <> 'DEACTIVATED';`);
					const disabled = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
					if (disabled.error) throw new Error();
				} catch {
					throw new Error('Disposable local staff cleanup failed.');
				}
			}
		};
	} catch (error) {
		try {
			sql(`UPDATE estimator.staff_users SET state = 'DEACTIVATED' WHERE user_id = '${userId}'::uuid AND state <> 'DEACTIVATED';`);
			await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
		} catch {
			throw new Error('Local staff fixture setup failed and cleanup needs attention.');
		}
		throw error;
	}
}

export function cookiesForSession(session: Session, workerOrigin: string) {
	const url = new URL(workerOrigin);
	const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
	const chunks = encoded.match(/.{1,3000}/g)!;
	return chunks.map((value, index) => ({
		name: chunks.length === 1 ? 'sb-127-auth-token' : `sb-127-auth-token.${index}`,
		value,
		url: workerOrigin,
		httpOnly: true,
		sameSite: 'Lax' as const,
		secure: url.protocol === 'https:'
	}));
}

export function setStaffState(userId: string, state: 'SUSPENDED' | 'DEACTIVATED'): void {
	if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid disposable staff identifier.');
	sql(`UPDATE estimator.staff_users SET state = '${state}' WHERE user_id = '${userId}'::uuid;`);
}

export function setDashboardRpcEnabled(enabled: boolean): void {
	const command = enabled ? 'GRANT EXECUTE' : 'REVOKE EXECUTE';
	const direction = enabled ? 'TO' : 'FROM';
	sql(`${command} ON FUNCTION estimator.dashboard_metrics(timestamptz, timestamptz) ${direction} authenticated;`);
}

/** Diagnostic preflight runs only after an unexpected AAL1 503 and prints fixed stage outcomes only. */
export async function logAal1StageEvidence(session: Session, userId: string): Promise<void> {
	const diagnostic = newUserClient();
	let sessionClient: 'ready' | 'failed' = 'failed';
	let claims: 'verified' | 'failed' = 'failed';
	let staff: 'present' | 'failed' = 'failed';
	let assurance: 'aal1-to-aal2' | 'failed' = 'failed';
	try {
		const restored = await diagnostic.auth.setSession(session);
		if (!restored.error) {
			sessionClient = 'ready';
			const result = await diagnostic.auth.getClaims();
			if (!result.error && result.data.claims?.aal === 'aal1') claims = 'verified';
			const row = await diagnostic.from('staff_users').select('role,state').eq('user_id', userId).maybeSingle();
			if (!row.error && row.data?.state === 'ACTIVE') staff = 'present';
			const level = await diagnostic.auth.mfa.getAuthenticatorAssuranceLevel();
			if (!level.error && level.data.currentLevel === 'aal1' && level.data.nextLevel === 'aal2') assurance = 'aal1-to-aal2';
		}
	} catch {
		// Keep the diagnostic line limited to fixed stage labels.
	}
	console.error(`AAL1_STAGE_EVIDENCE session_client=${sessionClient} claims=${claims} staff=${staff} assurance=${assurance} dashboard_rpc=not_reached`);
}

export function dashboardOrigins() {
	return {
		defaultOff: `http://127.0.0.1:${required('DASHBOARD_E2E_DEFAULT_PORT')}`,
		enabled: `http://127.0.0.1:${required('DASHBOARD_E2E_ENABLED_PORT')}`
	} as const;
}
