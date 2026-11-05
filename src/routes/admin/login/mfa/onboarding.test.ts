import { describe, expect, it } from 'bun:test';
import type { Actions } from './$types';
import { actions, load as loadMfa } from './+page.server';
import { load as loadLogin } from '../+page.server';

const userId = '10000000-0000-4000-8000-000000000006';

function makeEvent(options: {
	refreshAalAfterVerify: boolean;
	initialNextLevel?: string;
	initialAal?: string;
}) {
	let staffState = 'INVITED';
	let aal = options.initialAal ?? 'aal1';
	let currentLevel = options.initialAal ?? 'aal1';
	let nextLevel = options.initialNextLevel ?? options.initialAal ?? 'aal1';
	let factorStatus = 'unverified';
	const calls: string[] = [];
	const tables: string[] = [];
	const client = {
		auth: {
			getClaims: async () => ({ data: { claims: { sub: userId, aal } }, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({
					data: { currentLevel, nextLevel },
					error: null
				}),
				listFactors: async () => ({
					data: { totp: [{ id: 'factor-1', status: factorStatus }] },
					error: null
				}),
				challenge: async () => ({ data: { id: 'challenge-1' }, error: null }),
				verify: async () => {
					calls.push('mfa.verify');
					factorStatus = 'verified';
					if (options.refreshAalAfterVerify) {
						aal = 'aal2';
						currentLevel = 'aal2';
						nextLevel = 'aal2';
					}
					return { error: null };
				}
			}
		},
		from: (table: string) => {
			tables.push(table);
			if (table !== 'staff_users') throw new Error(`Unexpected table read: ${table}`);
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data: { user_id: userId, role: 'viewer', state: staffState },
							error: null
						})
					})
				})
			};
		},
		rpc: async (name: string) => {
			calls.push(`rpc:${name}`);
			return { data: null, error: null };
		}
	};
	const form = new FormData();
	form.set('code', '123456');
	const event = {
		locals: { supabase: client },
		request: { formData: async () => form }
	} as unknown as Parameters<NonNullable<Actions['verify']>>[0];

	return { calls, event, tables, staffState: () => staffState };
}

describe('invited staff MFA onboarding', () => {
	it('routes an invited sign-in to the MFA setup page', async () => {
		const { event } = makeEvent({ refreshAalAfterVerify: false });

		try {
			await loadLogin(event as unknown as Parameters<typeof loadLogin>[0]);
		} catch (result) {
			expect(result).toMatchObject({ status: 303, location: '/admin/login/mfa' });
			return;
		}
		throw new Error('Expected invited staff to continue to the MFA setup page.');
	});

	it('keeps invited staff pending after factor verification establishes current AAL2', async () => {
		const { calls, event, tables, staffState } = makeEvent({ refreshAalAfterVerify: true });

		let actionError: unknown;
		try {
			await actions.verify?.(event);
		} catch (result) {
			actionError = result;
		}

		expect(actionError).toBeUndefined();
		expect(staffState()).toBe('INVITED');
		expect(calls).toEqual(['mfa.verify']);
		expect(tables).toEqual(['staff_users', 'staff_users']);
		expect(
			await loadMfa(event as unknown as Parameters<typeof loadMfa>[0])
		).toEqual({ state: 'pending' });
	});

	it('keeps AAL2 invited staff pending without another challenge', async () => {
		const { calls, event, staffState } = makeEvent({
			refreshAalAfterVerify: false,
			initialAal: 'aal2'
		});

		expect(
			await loadMfa(event as unknown as Parameters<typeof loadMfa>[0])
		).toEqual({ state: 'pending' });
		expect(staffState()).toBe('INVITED');
		expect(calls).toEqual([]);
	});

	it('rejects MFA verification posts while the invitation awaits activation', async () => {
		const { calls, event, staffState } = makeEvent({
			refreshAalAfterVerify: false,
			initialAal: 'aal2'
		});

		const result = await actions.verify?.(event);

		expect(result).toMatchObject({ status: 409 });
		expect(calls).toEqual([]);
		expect(staffState()).toBe('INVITED');
	});

	it('does not complete MFA when factor verification leaves the session at AAL1', async () => {
		const { calls, event } = makeEvent({ refreshAalAfterVerify: false });

		const result = await actions.verify?.(event);

		expect(result).toMatchObject({ status: 400 });
		expect(calls).toEqual(['mfa.verify']);
	});
});
