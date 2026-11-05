import { describe, expect, it } from 'bun:test';
import type { Actions } from './$types';
import { actions } from './+page.server';
import { load as loadLogin } from '../+page.server';

const userId = '10000000-0000-4000-8000-000000000006';

function makeEvent(options: { refreshAalAfterVerify: boolean; initialNextLevel?: string }) {
	let staffState = 'INVITED';
	let aal = 'aal1';
	let currentLevel = 'aal1';
	let nextLevel = options.initialNextLevel ?? 'aal1';
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
			staffState = 'ACTIVE';
			return { data: null, error: null };
		}
	};
	const form = new FormData();
	form.set('code', '123456');
	const event = {
		locals: { supabase: client },
		request: { formData: async () => form }
	} as unknown as Parameters<NonNullable<Actions['verify']>>[0];

	return { calls, event, tables };
}

async function expectEstimateRedirect(event: Parameters<NonNullable<Actions['verify']>>[0]) {
	try {
		await actions.verify?.(event);
	} catch (result) {
		expect(result).toMatchObject({ status: 303, location: '/admin/estimates' });
		return;
	}
	throw new Error('Expected completed onboarding to redirect to the admin area.');
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

	it('activates only after factor verification establishes current AAL2', async () => {
		const { calls, event, tables } = makeEvent({ refreshAalAfterVerify: true });

		await expectEstimateRedirect(event);

		expect(calls).toEqual(['mfa.verify', 'rpc:activate_invited_staff_after_mfa']);
		expect(tables).toEqual(['staff_users', 'staff_users', 'staff_users']);
	});

	it('verifies an unverified factor when an invited session reports AAL2 as its next level', async () => {
		const { calls, event } = makeEvent({ refreshAalAfterVerify: true, initialNextLevel: 'aal2' });

		await expectEstimateRedirect(event);

		expect(calls).toEqual(['mfa.verify', 'rpc:activate_invited_staff_after_mfa']);
	});

	it('does not call activation when factor verification leaves the session at AAL1', async () => {
		const { calls, event } = makeEvent({ refreshAalAfterVerify: false });

		const result = await actions.verify?.(event);

		expect(result).toMatchObject({ status: 400 });
		expect(calls).toEqual(['mfa.verify']);
	});
});
