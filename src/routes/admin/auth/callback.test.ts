import { describe, expect, it } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { actions, load } from './callback/+page.server';

const userId = '10000000-0000-4000-8000-000000000041';
const invalidLinkPath = '/admin/login?link=invalid';

function makeEvent(options: {
	url: string;
	method?: string;
	origin?: string;
	staffState?: string;
	callbackError?: boolean;
	singleUse?: boolean;
	access?: 'invited' | 'active' | 'non-staff';
}) {
	const url = new URL(options.url);
	const calls: Array<{ name: string; args?: unknown }> = [];
	const cookies = new Map<string, string>();
	const redeemed = new Set<string>();
	const headers: Record<string, string> = {};
	const request = new Request(url, {
		method: options.method ?? 'GET',
		headers: options.origin ? { origin: options.origin } : undefined
	});
	const staffState = options.staffState ?? (options.access === 'active' ? 'ACTIVE' : 'INVITED');
	const hasStaff = options.access !== 'non-staff';
	const client = {
		auth: {
			exchangeCodeForSession: async (code: string) => {
				calls.push({ name: 'exchangeCodeForSession', args: code });
				if (options.callbackError || (options.singleUse && redeemed.has(code))) {
					return { data: { session: null, user: null }, error: { message: 'expired' } };
				}
				redeemed.add(code);
				return options.callbackError
					? { data: { session: null, user: null }, error: { message: 'expired' } }
					: { data: { session: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }, user: { id: userId } }, error: null };
			},
			verifyOtp: async (args: unknown) => {
				calls.push({ name: 'verifyOtp', args });
				const tokenHash = (args as { token_hash?: string }).token_hash ?? '';
				if (options.callbackError || (options.singleUse && redeemed.has(tokenHash))) {
					return { data: { session: null, user: null }, error: { message: 'expired' } };
				}
				redeemed.add(tokenHash);
				return options.callbackError
					? { data: { session: null, user: null }, error: { message: 'expired' } }
					: { data: { session: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }, user: { id: userId } }, error: null };
			},
			getClaims: async () => ({ data: { claims: { sub: userId, aal: 'aal1' } }, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
			},
			signOut: async () => {
				calls.push({ name: 'signOut' });
				return { error: null };
			}
		},
		from: (table: string) => {
			calls.push({ name: 'from', args: table });
			const query = {
				select: (columns: string) => {
					calls.push({ name: 'select', args: columns });
					return query;
				},
				eq: (column: string, value: string) => {
					calls.push({ name: 'eq', args: [column, value] });
					return query;
				},
				maybeSingle: async () => ({
					data: hasStaff ? { user_id: userId, role: 'viewer', state: staffState } : null,
					error: null
				})
			};
			return query;
		}
	};

	return {
		url,
		request,
		locals: { supabase: client },
		cookies: {
			get: (name: string) => cookies.get(name),
			set: (name: string, value: string, cookieOptions: Record<string, unknown>) => {
				cookies.set(name, value);
				calls.push({ name: 'cookie:set', args: [name, value, cookieOptions] });
			},
			delete: (name: string, cookieOptions: Record<string, unknown>) => {
				cookies.delete(name);
				calls.push({ name: 'cookie:delete', args: [name, cookieOptions] });
			}
		},
		setHeaders: (value: Record<string, string>) => Object.assign(headers, value),
		calls,
		cookiesSet: cookies,
		headers
	} as unknown as RequestEvent & {
		calls: typeof calls;
		cookiesSet: typeof cookies;
		headers: typeof headers;
	};
}

async function outcome(operation: () => unknown) {
	try {
		return await operation();
	} catch (cause) {
		return cause as { status?: number; location?: string };
	}
}

describe('staff auth callback', () => {
	it('does not redeem a valid invite link during GET', async () => {
		const event = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?token_hash=synthetic-invite-hash&type=invite'
		});

		expect(await load(event as never)).toEqual({ kind: 'invite' });
		expect(event.calls.some((call) => call.name === 'verifyOtp' || call.name === 'exchangeCodeForSession')).toBe(false);
		expect(event.headers['Referrer-Policy']).toBe('no-referrer');
	});

	it('verifies an invited user token hash and redirects only to password setup', async () => {
		const event = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?token_hash=synthetic-invite-hash&type=invite',
			method: 'POST',
			origin: 'https://goataccounting.co.za'
		});

		const result = await outcome(() => actions.default!(event as never));

		expect(result).toMatchObject({ status: 303, location: '/admin/login/set-password' });
		expect(event.calls).toContainEqual({ name: 'verifyOtp', args: { token_hash: 'synthetic-invite-hash', type: 'invite' } });
		expect(event.cookiesSet.get('goat-password-link')).toBe('1');
		expect(event.calls.filter((call) => call.name === 'from')).toEqual([{ name: 'from', args: 'staff_users' }]);
	});

	it('exchanges a same-browser recovery PKCE code on POST', async () => {
		const event = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?flow=recovery&code=synthetic-recovery-code',
			method: 'POST',
			origin: 'https://goataccounting.co.za',
			access: 'active'
		});

		const result = await outcome(() => actions.default!(event as never));

		expect(result).toMatchObject({ status: 303, location: '/admin/login/set-password' });
		expect(event.calls).toContainEqual({ name: 'exchangeCodeForSession', args: 'synthetic-recovery-code' });
		expect(event.cookiesSet.get('goat-password-link')).toBe('1');
	});

	it('verifies a recovery token hash on POST', async () => {
		const event = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?flow=recovery&token_hash=synthetic-recovery-hash&type=recovery',
			method: 'POST',
			origin: 'https://goataccounting.co.za',
			access: 'active'
		});

		const result = await outcome(() => actions.default!(event as never));

		expect(result).toMatchObject({ status: 303, location: '/admin/login/set-password' });
		expect(event.calls).toContainEqual({
			name: 'verifyOtp',
			args: { token_hash: 'synthetic-recovery-hash', type: 'recovery' }
		});
	});

	it('shows the same safe result for an expired invite link', async () => {
		const event = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?token_hash=synthetic-single-use-hash&type=invite',
			method: 'POST',
			origin: 'https://goataccounting.co.za',
			callbackError: true
		});

		const result = await outcome(() => actions.default!(event as never));

		expect(result).toMatchObject({ status: 303, location: invalidLinkPath });
		expect(event.cookiesSet.has('goat-password-link')).toBe(false);
		expect(JSON.stringify(result)).not.toContain('synthetic-single-use-hash');
	});

	it('rejects the second use of a previously redeemed recovery code', async () => {
		const event = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?flow=recovery&code=synthetic-single-use-code',
			method: 'POST',
			origin: 'https://goataccounting.co.za',
			singleUse: true,
			access: 'active'
		});

		const first = await outcome(() => actions.default!(event as never));
		const replay = await outcome(() => actions.default!(event as never));

		expect(first).toMatchObject({ status: 303, location: '/admin/login/set-password' });
		expect(replay).toMatchObject({ status: 303, location: invalidLinkPath });
		expect(event.cookiesSet.has('goat-password-link')).toBe(false);
		expect(event.calls.filter((call) => call.name === 'exchangeCodeForSession')).toHaveLength(2);
	});

	it('rejects untrusted origins and open redirects before redeeming a link', async () => {
		const badOrigin = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?token_hash=synthetic-hash&type=invite',
			method: 'POST',
			origin: 'https://attacker.invalid'
		});
		const openRedirect = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?token_hash=synthetic-hash&type=invite&next=https%3A%2F%2Fattacker.invalid'
		});

		const result = await outcome(() => actions.default!(badOrigin as never));
		const invalid = await outcome(() => load(openRedirect as never));

		expect(result).toMatchObject({ status: 403 });
		expect(badOrigin.calls.some((call) => call.name === 'verifyOtp' || call.name === 'exchangeCodeForSession')).toBe(false);
		expect(invalid).toMatchObject({ status: 303, location: invalidLinkPath });
		expect(openRedirect.calls.some((call) => call.name === 'verifyOtp' || call.name === 'exchangeCodeForSession')).toBe(false);
	});

	it('rejects authenticated non-staff users and does not change invitation state', async () => {
		const event = makeEvent({
			url: 'https://goataccounting.co.za/admin/auth/callback?token_hash=synthetic-invite-hash&type=invite',
			method: 'POST',
			origin: 'https://goataccounting.co.za',
			access: 'non-staff'
		});

		const result = await outcome(() => actions.default!(event as never));

		expect(result).toMatchObject({ status: 303, location: invalidLinkPath });
		expect(event.calls.map((call) => call.name)).not.toContain('update');
		expect(event.cookiesSet.has('goat-password-link')).toBe(false);
	});
});
