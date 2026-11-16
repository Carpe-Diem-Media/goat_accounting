import { describe, expect, it, spyOn } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { actions, load } from './set-password/+page.server';

const userId = '10000000-0000-4000-8000-000000000042';
const invalidLinkPath = '/admin/login?link=invalid';

function makeEvent(options: {
	method?: string;
	origin?: string;
	marker?: boolean;
	staffState?: string | null;
	role?: string;
	claimsError?: boolean;
	updateError?: boolean;
	password?: string;
	confirmation?: string;
}) {
	const url = new URL('https://goataccounting.co.za/admin/login/set-password');
	const form = new FormData();
	form.set('password', options.password ?? 'Synthetic-password-value');
	form.set('confirmation', options.confirmation ?? options.password ?? 'Synthetic-password-value');
	const cookies = new Map<string, string>();
	if (options.marker ?? true) cookies.set('goat-password-link', '1');
	const calls: Array<{ name: string; args?: unknown }> = [];
	const headers: Record<string, string> = {};
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
			data: options.staffState === null
				? null
				: { user_id: userId, role: options.role ?? 'viewer', state: options.staffState ?? 'INVITED' },
			error: null
		})
	};
	const client = {
		auth: {
			getClaims: async () => options.claimsError
				? { data: { claims: null }, error: { status: 401 } }
				: { data: { claims: { sub: userId, aal: 'aal1' } }, error: null },
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({
					data: { currentLevel: 'aal1', nextLevel: 'aal1' },
					error: null
				})
			},
			updateUser: async (args: unknown) => {
				calls.push({ name: 'updateUser', args });
				return options.updateError ? { error: { status: 401, message: 'provider detail' } } : { error: null };
			},
			signOut: async () => {
				calls.push({ name: 'signOut' });
				return { error: null };
			}
		},
		from: (table: string) => {
			calls.push({ name: 'from', args: table });
			return query;
		}
	};
	const request = new Request(url, {
		method: options.method ?? 'POST',
		headers: options.origin ? { origin: options.origin } : undefined,
		body: options.method === 'GET' ? undefined : form
	});
	return {
		url,
		request,
		locals: { supabase: client },
		setHeaders: (value: Record<string, string>) => Object.assign(headers, value),
		cookies: {
			get: (name: string) => cookies.get(name),
			set: (name: string, value: string) => cookies.set(name, value),
			delete: (name: string) => cookies.delete(name)
		},
		calls,
		cookieValues: cookies,
		headers
	} as unknown as RequestEvent & {
		calls: typeof calls;
		cookieValues: typeof cookies;
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

describe('staff password setup', () => {
	it('requires the short-lived link marker and a verified invited staff record', async () => {
		const event = makeEvent({ method: 'GET', staffState: 'INVITED' });
		expect(await load(event as never)).toEqual({ state: 'invited' });
		expect(event.headers).toEqual({});
		expect(event.calls).toContainEqual({ name: 'from', args: 'staff_users' });
	});

	it('does not show the password form without a verified email link', async () => {
		const event = makeEvent({ method: 'GET', marker: false });
		const result = await outcome(() => load(event as never));
		expect(result).toMatchObject({ status: 303, location: invalidLinkPath });
	});

	it('sets the password for invited staff but keeps them pending for MFA and activation', async () => {
		const event = makeEvent({ origin: 'https://goataccounting.co.za', staffState: 'INVITED' });
		const result = await outcome(() => actions.default!(event as never));
		expect(result).toMatchObject({ status: 303, location: '/admin/login/mfa' });
		expect(event.calls).toContainEqual({ name: 'updateUser', args: { password: 'Synthetic-password-value' } });
		expect(event.cookieValues.has('goat-password-link')).toBe(false);
		expect(event.calls.map((call) => call.name)).not.toContain('update');
	});

	it('requires matching passwords without returning either password value', async () => {
		const event = makeEvent({
			origin: 'https://goataccounting.co.za',
			password: 'Synthetic-password-value',
			confirmation: 'Different-password-value'
		});
		const result = await actions.default!(event as never);
		expect(result).toMatchObject({ status: 400 });
		expect(JSON.stringify(result)).not.toContain('Synthetic-password-value');
		expect(event.calls.map((call) => call.name)).not.toContain('updateUser');
	});

	it('returns a controlled response when Supabase rejects the password update', async () => {
		const event = makeEvent({ origin: 'https://goataccounting.co.za', updateError: true });
		const updateLog = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = await actions.default!(event as never);

			expect(result).toMatchObject({ status: 400 });
			expect(JSON.stringify(result)).not.toContain('provider detail');
			expect(updateLog).toHaveBeenCalledWith('STAFF_PASSWORD_UPDATE category=provider_unauthorized');
			expect(JSON.stringify(updateLog.mock.calls)).not.toContain('provider detail');
			expect(event.cookieValues.get('goat-password-link')).toBe('1');
			expect(event.calls.map((call) => call.name)).toContain('updateUser');
			expect(event.headers).toEqual({});
		} finally {
			updateLog.mockRestore();
		}
	});

	it('rejects cross-origin posts before changing a password', async () => {
		const event = makeEvent({ origin: 'https://attacker.invalid' });
		const result = await actions.default!(event as never);
		expect(result).toMatchObject({ status: 403 });
		expect(event.headers).toEqual({});
		expect(event.calls.map((call) => call.name)).not.toContain('updateUser');
	});

	it('requires a staff record and an active or invited state before changing a password', async () => {
		const missingStaff = makeEvent({ origin: 'https://goataccounting.co.za', staffState: null });
		const suspended = makeEvent({ origin: 'https://goataccounting.co.za', staffState: 'SUSPENDED' });
		const missingResult = await outcome(() => actions.default!(missingStaff as never));
		const suspendedResult = await outcome(() => actions.default!(suspended as never));
		expect(missingResult).toMatchObject({ status: 303, location: invalidLinkPath });
		expect(suspendedResult).toMatchObject({ status: 303, location: invalidLinkPath });
		expect(missingStaff.calls.map((call) => call.name)).not.toContain('updateUser');
		expect(suspended.calls.map((call) => call.name)).not.toContain('updateUser');
	});

	it('routes active staff to MFA after password setup', async () => {
		const event = makeEvent({ origin: 'https://goataccounting.co.za', staffState: 'ACTIVE' });
		const result = await outcome(() => actions.default!(event as never));
		expect(result).toMatchObject({ status: 303, location: '/admin/login/mfa' });
	});
});
