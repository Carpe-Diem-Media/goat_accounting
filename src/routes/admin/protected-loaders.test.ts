import { describe, expect, it } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { load as loadEstimateDetail } from './estimates/[id]/+page.server';
import { load as loadEstimateList } from './estimates/+page.server';
import { load as loadLeadDetail } from './leads/[id]/+page.server';
import { load as loadLeadList } from './leads/+page.server';

const userId = '10000000-0000-4000-8000-000000000004';
const estimateId = '40000000-0000-4000-8000-000000000001';
const leadId = '60000000-0000-4000-8000-000000000001';

type Scenario = {
	name: string;
	claims?: Record<string, unknown> | null;
	claimsError?: { status: number; name: string } | null;
	staffState?: string;
	assurance?: { currentLevel: string | null; nextLevel: string | null };
	denial: { status: number; location?: string };
};

type TestLoad = (event: RequestEvent) => unknown;

const protectedLoaders: Array<{
	name: string;
	path: string;
	params?: Record<string, string>;
	load: TestLoad;
}> = [
	{ name: 'estimate list', path: '/admin/estimates', load: loadEstimateList as unknown as TestLoad },
	{
		name: 'estimate detail',
		path: `/admin/estimates/${estimateId}`,
		load: loadEstimateDetail as unknown as TestLoad,
		params: { id: estimateId }
	},
	{ name: 'lead list', path: '/admin/leads', load: loadLeadList as unknown as TestLoad },
	{
		name: 'lead detail',
		path: `/admin/leads/${leadId}`,
		load: loadLeadDetail as unknown as TestLoad,
		params: { id: leadId }
	}
];

const denials: Scenario[] = [
	{
		name: 'unauthenticated requests',
		claims: null,
		denial: { status: 303, location: '/admin/login' }
	},
	{
		name: 'expired sessions',
		claims: null,
		claimsError: { status: 401, name: 'AuthInvalidJwtError' },
		denial: { status: 303, location: '/admin/login' }
	},
	{
		name: 'AAL1 sessions',
		claims: { sub: userId, aal: 'aal1' },
		assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
		denial: { status: 303, location: '/admin/login/mfa' }
	},
	{
		name: 'invited staff',
		staffState: 'INVITED',
		denial: { status: 403 }
	},
	{
		name: 'suspended staff',
		staffState: 'SUSPENDED',
		denial: { status: 403 }
	},
	{
		name: 'deactivated staff',
		staffState: 'DEACTIVATED',
		denial: { status: 403 }
	}
];

function createRequest(options: {
	claims?: Record<string, unknown> | null;
	claimsError?: { status: number; name: string } | null;
	staffState?: string;
	role?: string;
	assurance?: { currentLevel: string | null; nextLevel: string | null };
	path?: string;
	params?: Record<string, string>;
} = {}) {
	const privateQueries: string[] = [];
	const client = {
		auth: {
			getClaims: async () => ({
				data: { claims: options.claims === undefined ? { sub: userId, aal: 'aal2' } : options.claims },
				error: options.claimsError ?? null
			}),
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({
					data: options.assurance ?? { currentLevel: 'aal2', nextLevel: 'aal2' },
					error: null
				})
			}
		},
		from: (table: string) => {
			if (table === 'staff_users') {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data:
									options.staffState === 'MISSING'
										? null
										: {
											user_id: userId,
											role: options.role ?? 'viewer',
											state: options.staffState ?? 'ACTIVE'
										},
								error: null
							})
						})
					})
				};
			}

			privateQueries.push(table);
			const query = {
				select: () => query,
				eq: () => query,
				order: () => query,
				range: async () => ({ data: [], error: null }),
				maybeSingle: async () => ({
					data:
						table === 'estimates'
							? {
								id: estimateId,
								public_ref: 'public-ref',
								calculator_type: 'business_tax',
								state: 'VALID',
								created_at: '2026-11-05T00:00:00.000Z',
								estimate_line_items: []
							}
							: {
								id: leadId,
								estimate_id: estimateId,
								state: 'NEW',
								full_name: 'Test staff',
								email: 'test@example.invalid',
								phone: null,
								business_name: null,
								preferred_contact_method: 'email',
								contact_consent_at: null,
								created_at: '2026-11-05T00:00:00.000Z'
							},
					error: null
				})
			};
			return query;
		}
	};

	return {
		privateQueries,
		event: {
			locals: { supabase: client },
			url: new URL(`https://goat.test${options.path ?? '/admin/estimates'}`),
			params: options.params ?? {}
		} as unknown as RequestEvent
	};
}

async function expectDenied(
	load: TestLoad,
	event: RequestEvent,
	expected: Scenario['denial']
) {
	try {
		await load(event);
	} catch (result) {
		expect(result).toMatchObject(expected);
		return;
	}
	throw new Error(`Expected request to fail with ${expected.status}.`);
}

for (const loader of protectedLoaders) {
	describe(`${loader.name} loader`, () => {
		for (const scenario of denials) {
			it(`rejects ${scenario.name} before reading private records`, async () => {
				const { event, privateQueries } = createRequest({
					...scenario,
					path: loader.path,
					params: 'params' in loader ? loader.params : undefined
				});

				await expectDenied(loader.load, event, scenario.denial);
				expect(privateQueries).toEqual([]);
			});
		}

		for (const role of ['viewer', 'advisor', 'admin'] as const) {
			it(`allows an active ${role} after current AAL2 verification`, async () => {
				const { event, privateQueries } = createRequest({
					role,
					path: loader.path,
					params: 'params' in loader ? loader.params : undefined
				});

				await loader.load(event);
				expect(privateQueries.length).toBeGreaterThan(0);
			});
		}

		it('rechecks suspension and MFA loss on a subsequent client-navigation load', async () => {
			const activeRequest = createRequest({ path: loader.path, params: 'params' in loader ? loader.params : undefined });
			await loader.load(activeRequest.event);
			const readsAfterFirstLoad = activeRequest.privateQueries.length;

			const suspendedRequest = createRequest({
				staffState: 'SUSPENDED',
				path: loader.path,
				params: 'params' in loader ? loader.params : undefined
			});
			await expectDenied(loader.load, suspendedRequest.event, { status: 403 });
			expect(activeRequest.privateQueries).toHaveLength(readsAfterFirstLoad);
			expect(suspendedRequest.privateQueries).toEqual([]);

			const mfaLostRequest = createRequest({
				claims: { sub: userId, aal: 'aal2' },
				assurance: { currentLevel: 'aal2', nextLevel: 'aal1' },
				path: loader.path,
				params: 'params' in loader ? loader.params : undefined
			});
			await expectDenied(loader.load, mfaLostRequest.event, {
				status: 303,
				location: '/admin/login/mfa'
			});
			expect(mfaLostRequest.privateQueries).toEqual([]);
		});
	});
}
