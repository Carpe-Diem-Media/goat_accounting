import { describe, expect, it } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { evaluateStaffAccess, getStaffAccess, requireStaff } from './staff-guard';

const userId = '10000000-0000-4000-8000-000000000004';

function claims(overrides: Record<string, unknown> = {}) {
	return {
		sub: userId,
		aal: 'aal2',
		email: 'staff@example.invalid',
		...overrides
	};
}

function staff(overrides: Record<string, unknown> = {}) {
	return {
		user_id: userId,
		role: 'viewer',
		state: 'ACTIVE',
		...overrides
	};
}

const aal2 = { currentLevel: 'aal2', nextLevel: 'aal2' };

function guardedEvent(options: {
	claims?: Record<string, unknown> | null;
	claimsError?: { status?: number; name?: string } | null;
	staff?: { user_id: string; role: string; state: string } | null;
	assurance?: { currentLevel: string | null; nextLevel: string | null } | null;
} = {}): RequestEvent {
	const client = {
		auth: {
			getClaims: async () => ({
				data: { claims: options.claims === undefined ? claims() : options.claims },
				error: options.claimsError ?? null
			}),
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({
					data: options.assurance === undefined ? aal2 : options.assurance,
					error: null
				})
			}
		},
		from: (table: string) => {
			expect(table).toBe('staff_users');
			return {
				select: () => ({
					eq: (column: string, value: string) => {
						expect(column).toBe('user_id');
						expect(value).toBe(userId);
						return {
							maybeSingle: async () => ({
								data: options.staff === undefined ? staff() : options.staff,
								error: null
							})
						};
					}
				})
			};
		}
	};
	return { locals: { supabase: client } } as unknown as RequestEvent;
}

async function expectGuardRedirect(event: RequestEvent, status: number, location: string) {
	try {
		await requireStaff(event);
	} catch (result) {
		expect(result).toMatchObject({ status, location });
		return;
	}
	throw new Error(`Expected a redirect to ${location}.`);
}

async function expectGuardError(event: RequestEvent, status: number) {
	try {
		await requireStaff(event);
	} catch (result) {
		expect(result).toMatchObject({ status });
		return;
	}
	throw new Error(`Expected a ${status} staff access error.`);
}

describe('evaluateStaffAccess', () => {
	it('requires a verified subject and an active matching staff record', () => {
		expect(evaluateStaffAccess({ claims: null, staff: null, assurance: null }).kind).toBe(
			'unauthenticated'
		);
		expect(
			evaluateStaffAccess({ claims: claims(), staff: staff({ state: 'INVITED' }), assurance: aal2 }).kind
		).toBe('denied');
		expect(
			evaluateStaffAccess({ claims: claims(), staff: staff({ user_id: 'another-user' }), assurance: aal2 }).kind
		).toBe('denied');
		for (const state of ['SUSPENDED', 'DEACTIVATED']) {
			expect(
				evaluateStaffAccess({ claims: claims(), staff: staff({ state }), assurance: aal2 }).kind
			).toBe('denied');
		}
		expect(
			evaluateStaffAccess({ claims: claims(), staff: staff({ role: 'owner' }), assurance: aal2 }).kind
		).toBe('denied');
	});

	it('authorizes active viewer, advisor, and admin roles only at verified AAL2', () => {
		for (const role of ['viewer', 'advisor', 'admin'] as const) {
			const access = evaluateStaffAccess({ claims: claims(), staff: staff({ role }), assurance: aal2 });
			expect(access.kind).toBe('authorized');
			if (access.kind === 'authorized') expect(access.identity.role).toBe(role);
		}
	});

	it('routes active AAL1 staff to enrollment or a verified-factor challenge', () => {
		expect(
			evaluateStaffAccess({
				claims: claims({ aal: 'aal1' }),
				staff: staff(),
				assurance: { currentLevel: 'aal1', nextLevel: 'aal1' }
			}).kind
		).toBe('setup');
		expect(
			evaluateStaffAccess({
				claims: claims({ aal: 'aal1' }),
				staff: staff(),
				assurance: { currentLevel: 'aal1', nextLevel: 'aal2' }
			}).kind
		).toBe('challenge');
	});

	it('does not accept stale AAL2 claims after MFA is disabled', () => {
		expect(
			evaluateStaffAccess({
				claims: claims({ aal: 'aal2' }),
				staff: staff(),
				assurance: { currentLevel: 'aal2', nextLevel: 'aal1' }
			}).kind
		).toBe('setup');
		expect(
			evaluateStaffAccess({
				claims: claims({ aal: 'aal1' }),
				staff: staff(),
				assurance: { currentLevel: 'aal2', nextLevel: 'aal2' }
			}).kind
		).toBe('unavailable');
	});

	it('uses the staff table role instead of editable user metadata', () => {
		const access = evaluateStaffAccess({
			claims: claims({ user_metadata: { role: 'admin' } }),
			staff: staff({ role: 'viewer' }),
			assurance: aal2
		});

		expect(access.kind).toBe('authorized');
		if (access.kind === 'authorized') expect(access.identity.role).toBe('viewer');
	});

	it('enforces caller-specific allowed roles after AAL2', () => {
		const access = evaluateStaffAccess({
			claims: claims(),
			staff: staff({ role: 'viewer' }),
			assurance: aal2,
			allowedRoles: ['admin']
		});

		expect(access.kind).toBe('forbidden');
	});

	it('fails closed when the assurance check is unavailable', () => {
		expect(evaluateStaffAccess({ claims: claims(), staff: staff(), assurance: null }).kind).toBe(
			'unavailable'
		);
	});

	it('uses verified claims, the caller-scoped staff row, and current AAL data', async () => {
		let getClaimsCalls = 0;
		const client = {
			auth: {
				getClaims: async () => {
					getClaimsCalls += 1;
					return { data: { claims: claims({ user_metadata: { role: 'admin' } }) }, error: null };
				},
				mfa: {
					getAuthenticatorAssuranceLevel: async () => ({ data: aal2, error: null })
				}
			},
			from: (table: string) => {
				expect(table).toBe('staff_users');
				return {
					select: () => ({
						eq: (column: string, value: string) => {
							expect(column).toBe('user_id');
							expect(value).toBe(userId);
							return { maybeSingle: async () => ({ data: staff(), error: null }) };
						}
					})
				};
			}
		};
		const event = { locals: { supabase: client } } as unknown as RequestEvent;

		const access = await getStaffAccess(event);
		expect(getClaimsCalls).toBe(1);
		expect(access.kind).toBe('authorized');
		if (access.kind === 'authorized') expect(access.identity.role).toBe('viewer');
	});

	it('treats an expired verified session as unauthenticated', async () => {
		const client = {
			auth: {
				getClaims: async () => ({ data: { claims: null }, error: { status: 401 } }),
				mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: aal2, error: null }) }
			},
			from: () => {
				throw new Error('A missing session must not query staff records.');
			}
		};
		const event = { locals: { supabase: client } } as unknown as RequestEvent;

		expect((await getStaffAccess(event)).kind).toBe('unauthenticated');
	});

	it('redirects direct protected requests with missing, expired, or forged credentials to sign-in', async () => {
		await expectGuardRedirect(guardedEvent({ claims: null }), 303, '/admin/login');
		await expectGuardRedirect(
			guardedEvent({ claims: null, claimsError: { status: 401, name: 'AuthSessionMissingError' } }),
			303,
			'/admin/login'
		);
		await expectGuardRedirect(
			guardedEvent({ claims: null, claimsError: { status: 401, name: 'AuthInvalidJwtError' } }),
			303,
			'/admin/login'
		);
	});

	it('redirects AAL1 and stale AAL2 sessions to authenticator enrollment or challenge', async () => {
		await expectGuardRedirect(
			guardedEvent({
				claims: claims({ aal: 'aal1' }),
				assurance: { currentLevel: 'aal1', nextLevel: 'aal1' }
			}),
			303,
			'/admin/login/mfa'
		);
		await expectGuardRedirect(
			guardedEvent({ assurance: { currentLevel: 'aal1', nextLevel: 'aal2' } }),
			303,
			'/admin/login/mfa'
		);
	});

	it('serves direct protected requests only to active staff roles with AAL2', async () => {
		for (const role of ['viewer', 'advisor', 'admin'] as const) {
			const identity = await requireStaff(guardedEvent({ staff: staff({ role }) }));
			expect(identity).toMatchObject({ userId, role });
		}
		for (const state of ['INVITED', 'SUSPENDED', 'DEACTIVATED']) {
			await expectGuardError(
				guardedEvent({ staff: staff({ state }) }),
				403
			);
		}
	});
});
