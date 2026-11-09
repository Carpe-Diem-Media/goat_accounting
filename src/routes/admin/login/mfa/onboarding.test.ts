import { describe, expect, it } from 'bun:test';
import type { Actions } from './$types';
import { actions, load as loadMfa } from './+page.server';
import { load as loadLogin } from '../+page.server';
import { load as loadEstimateList } from '../../estimates/+page.server';

const userId = '10000000-0000-4000-8000-000000000006';

type Factor = {
	id: string;
	factor_type: 'phone' | 'totp' | 'webauthn' | 'recovery_code';
	status: 'unverified' | 'verified';
};

type FactorList = {
	all: Factor[];
	phone: Factor[];
	totp: Factor[];
};

const totpFactor = (id: string, status: Factor['status']): Factor => ({ id, factor_type: 'totp', status });
const phoneFactor = (id: string, status: Factor['status']): Factor => ({ id, factor_type: 'phone', status });
const otherFactor = (id: string, factor_type: 'webauthn' | 'recovery_code', status: Factor['status']): Factor => ({ id, factor_type, status });

function makeEvent(options: {
	refreshAalAfterVerify: boolean;
	initialNextLevel?: string;
	initialAal?: string;
	factors?: FactorList;
	verificationFails?: boolean;
}) {
	let staffState = 'INVITED';
	let aal = options.initialAal ?? 'aal1';
	let currentLevel = options.initialAal ?? 'aal1';
	let nextLevel = options.initialNextLevel ?? options.initialAal ?? 'aal1';
	const factors: FactorList = options.factors ?? {
		all: [totpFactor('factor-1', 'unverified')],
		phone: [],
		totp: []
	};
	const calls: string[] = [];
	const tables: string[] = [];
	let nextFactorId = 1;
	const client = {
		auth: {
			getClaims: async () => ({ data: { claims: { sub: userId, aal } }, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({
					data: { currentLevel, nextLevel },
					error: null
				}),
				listFactors: async () => ({
				data: factors,
					error: null
				}),
			unenroll: async ({ factorId }: { factorId: string }) => {
				calls.push(`unenroll:${factorId}`);
				factors.all = factors.all.filter((factor) => factor.id !== factorId);
				factors.phone = factors.phone.filter((factor) => factor.id !== factorId);
				factors.totp = factors.totp.filter((factor) => factor.id !== factorId);
				return { error: null };
			},
			enroll: async () => {
				const factor = totpFactor(`new-factor-${nextFactorId++}`, 'unverified');
				factors.all.push(factor);
				calls.push('enroll');
				return {
					data: {
						id: factor.id,
						totp: { qr_code: 'data:image/svg+xml;base64,AA==', secret: 'JBSWY3DPEHPK3PXP' }
					},
					error: null
				};
			},
				challenge: async ({ factorId }: { factorId: string }) => {
					calls.push(`challenge:${factorId}`);
					return { data: { id: 'challenge-1' }, error: null };
				},
				verify: async ({ factorId }: { factorId: string }) => {
					calls.push(`verify:${factorId}`);
					if (options.refreshAalAfterVerify) {
						aal = 'aal2';
						currentLevel = 'aal2';
						nextLevel = 'aal2';
					}
					return { error: options.verificationFails ? { message: 'Invalid TOTP code.' } : null };
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
		url: new URL('https://goat.test/admin/login/mfa'),
		request: { formData: async () => form }
	} as unknown as Parameters<NonNullable<Actions['verify']>>[0] & Parameters<NonNullable<Actions['enroll']>>[0];

	return { calls, event, factors, tables, staffState: () => staffState };
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
		expect(calls).toEqual(['challenge:factor-1', 'verify:factor-1']);
		expect(tables).toEqual(['staff_users', 'staff_users']);
		expect(
			await loadMfa(event as unknown as Parameters<typeof loadMfa>[0])
		).toEqual({ state: 'pending' });
	});

	it('uses the verified factor for an invited AAL1 challenge', async () => {
		const { calls, event } = makeEvent({
			refreshAalAfterVerify: true,
			initialNextLevel: 'aal2',
			factors: {
				all: [totpFactor('verified-factor', 'verified')],
				phone: [],
				totp: [totpFactor('verified-factor', 'verified')]
			}
		});

		const result = await actions.verify?.(event);

		expect(result).toEqual({});
		expect(calls).toEqual(['challenge:verified-factor', 'verify:verified-factor']);
	});

	it('uses the verified factor when an unfinished enrollment is listed first', async () => {
		const { calls, event } = makeEvent({
			refreshAalAfterVerify: true,
			initialNextLevel: 'aal2',
			factors: {
				all: [totpFactor('unfinished-factor', 'unverified'), totpFactor('verified-factor', 'verified')],
				phone: [],
				totp: [totpFactor('verified-factor', 'verified')]
			}
		});

		const result = await actions.verify?.(event);

		expect(result).toEqual({});
		expect(calls).toEqual(['challenge:verified-factor', 'verify:verified-factor']);
	});

	it('uses the unverified factor for initial setup verification', async () => {
		const { calls, event } = makeEvent({
			refreshAalAfterVerify: true,
		factors: {
				all: [
					totpFactor('enrollment-factor', 'unverified'),
					phoneFactor('phone-factor', 'unverified'),
					otherFactor('webauthn-factor', 'webauthn', 'unverified')
				],
				phone: [phoneFactor('phone-factor', 'unverified')],
				totp: []
			}
		});

		const result = await actions.verify?.(event);

		expect(result).toEqual({});
		expect(calls).toEqual(['challenge:enrollment-factor', 'verify:enrollment-factor']);
	});

	it('fails closed when no verified factor is available for a challenge', async () => {
		const { calls, event } = makeEvent({
			refreshAalAfterVerify: true,
			initialNextLevel: 'aal2',
		factors: {
			all: [totpFactor('unfinished-factor', 'unverified')],
			phone: [],
			totp: []
		}
		});

		const result = await actions.verify?.(event);

		expect(result).toMatchObject({ status: 409 });
		expect(calls).toEqual([]);
	});

	it('fails closed when no unverified factor is available for setup', async () => {
		const { calls, event } = makeEvent({
			refreshAalAfterVerify: true,
		factors: {
			all: [totpFactor('verified-factor', 'verified')],
			phone: [],
			totp: [totpFactor('verified-factor', 'verified')]
		}
		});

		const result = await actions.verify?.(event);

		expect(result).toMatchObject({ status: 409 });
		expect(calls).toEqual([]);
	});

	it('denies protected estimates after invited MFA reaches AAL2', async () => {
		const { calls, event, staffState } = makeEvent({
			refreshAalAfterVerify: true,
			initialNextLevel: 'aal2',
		factors: {
			all: [totpFactor('verified-factor', 'verified')],
			phone: [],
			totp: [totpFactor('verified-factor', 'verified')]
		}
		});

		expect(await actions.verify?.(event)).toEqual({});
		expect(staffState()).toBe('INVITED');

		let denial: unknown;
		try {
			await loadEstimateList(event as unknown as Parameters<typeof loadEstimateList>[0]);
		} catch (result) {
			denial = result;
		}

		expect(denial).toMatchObject({ status: 403 });
		expect(calls).toEqual(['challenge:verified-factor', 'verify:verified-factor']);
	});

	it('fails safely when multiple unverified TOTP factors exist during setup', async () => {
		const { calls, event } = makeEvent({
			refreshAalAfterVerify: true,
			factors: {
				all: [totpFactor('unfinished-b', 'unverified'), totpFactor('unfinished-a', 'unverified')],
				phone: [],
				totp: []
			}
		});

		const result = await actions.verify?.(event);

		expect(result).toMatchObject({ status: 409 });
		expect(calls).toEqual([]);
	});

	it('cleans up unverified TOTP factors in stable order and preserves verified and phone factors', async () => {
		const verified = totpFactor('verified-factor', 'verified');
		const phone = phoneFactor('phone-factor', 'unverified');
		const webauthn = otherFactor('webauthn-factor', 'webauthn', 'unverified');
		const { calls, event, factors } = makeEvent({
			refreshAalAfterVerify: false,
			factors: {
				all: [totpFactor('unfinished-z', 'unverified'), phone, webauthn, verified, totpFactor('unfinished-a', 'unverified')],
				phone: [phone],
				totp: [verified]
			}
		});

		const result = await actions.enroll?.(event);

		expect(result).toMatchObject({ enrollment: { secret: 'JBSWY3DPEHPK3PXP' } });
		expect(calls).toEqual(['unenroll:unfinished-a', 'unenroll:unfinished-z', 'enroll']);
		expect(factors.all.map((factor) => factor.id)).toEqual([
			'phone-factor',
			'webauthn-factor',
			'verified-factor',
			'new-factor-1'
		]);
		expect(factors.totp.map((factor) => factor.id)).toEqual(['verified-factor']);
		expect(factors.phone.map((factor) => factor.id)).toEqual(['phone-factor']);
	});

	it('removes the previous unfinished factor when the user restarts setup', async () => {
		const { calls, event, factors } = makeEvent({ refreshAalAfterVerify: false, factors: { all: [], phone: [], totp: [] } });

		await actions.enroll?.(event);
		await actions.enroll?.(event);

		expect(calls).toEqual(['enroll', 'unenroll:new-factor-1', 'enroll']);
		expect(factors.all.map((factor) => factor.id)).toEqual(['new-factor-2']);
	});

	it('explains how to restart setup after an incorrect first code', async () => {
		const { event } = makeEvent({ refreshAalAfterVerify: false, verificationFails: true });

		const result = await actions.verify?.(event);

		expect(result?.status).toBe(400);
		expect(result?.data.message).toMatch(/restart authenticator setup/i);
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
		expect(calls).toEqual(['challenge:factor-1', 'verify:factor-1']);
	});
});
