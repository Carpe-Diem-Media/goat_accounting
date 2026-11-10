import { describe, expect, mock, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';

mock.module('cloudflare:workers', () => ({ env: {} }));

const { actions } = await import('./[id]/+page.server');
const transitionAction = actions.transition as (event: RequestEvent) => Promise<unknown>;
const leadId = '60000000-0000-4000-8000-000000000001';
const advisorA = '10000000-0000-4000-8000-000000000011';
const advisorB = '10000000-0000-4000-8000-000000000012';

type RpcInput = { p_expected_state: string; p_to_state: string };

function createHarness(initialState: string) {
	let state = initialState;
	let eventCount = 1;
	let rpcCalls = 0;
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		if (!url.endsWith('/rpc/transition_lead')) {
			return originalFetch(input, init);
		}

		rpcCalls += 1;
		const rpcInput = JSON.parse(String(init?.body)) as RpcInput;
		if (rpcInput.p_expected_state !== state) {
			return new Response(JSON.stringify({ code: '40001', message: 'stale state' }), {
				status: 400,
				headers: { 'content-type': 'application/json' }
			});
		}
		state = rpcInput.p_to_state;
		eventCount += 1;
		return new Response('null', { headers: { 'content-type': 'application/json' } });
	}) as typeof fetch;

	return {
		state: () => state,
		eventCount: () => eventCount,
		rpcCalls: () => rpcCalls,
		restoreFetch: () => {
			globalThis.fetch = originalFetch;
		},
		event(actorId: string, values: Record<string, string | undefined>) {
			const client = {
				auth: {
					getClaims: async () => ({ data: { claims: { sub: actorId, aal: 'aal2' } }, error: null }),
					mfa: {
						getAuthenticatorAssuranceLevel: async () => ({
							data: { currentLevel: 'aal2', nextLevel: 'aal2' },
							error: null
						})
					}
				},
				from(table: string) {
					const query = {
						select: () => query,
						eq: () => query,
						maybeSingle: async () =>
							table === 'staff_users'
								? { data: { user_id: actorId, role: 'advisor', state: 'ACTIVE' }, error: null }
								: { data: { state }, error: null }
					};
					return query;
				}
			};

			const formData = new FormData();
			for (const [name, value] of Object.entries(values)) {
				if (value !== undefined) formData.set(name, value);
			}
			return {
				locals: { supabase: client },
				params: { id: leadId },
				platform: { env: { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SECRET_KEY: 'test-only-key' } },
				request: new Request(`https://goat.test/admin/leads/${leadId}?/transition`, {
					method: 'POST',
					body: formData
				})
			} as unknown as RequestEvent;
		}
	};
}

async function outcome(event: RequestEvent) {
	try {
		const result = await transitionAction(event);
		return { kind: 'returned', status: (result as { status?: number }).status };
	} catch (thrown) {
		return { kind: 'thrown', status: (thrown as { status?: number }).status };
	}
}

describe('lead transition action stale form handling', () => {
	test('advisor B gets 409 after advisor A commits from the same loaded state', async () => {
		const harness = createHarness('NEW');
		try {
			const advisorAResult = await outcome(
				harness.event(advisorA, {
					expectedState: 'NEW',
					targetState: 'CONTACTED',
					reason: '',
					note: 'Advisor A contact'
				})
			);
			expect(advisorAResult).toEqual({ kind: 'thrown', status: 303 });
			expect(harness.state()).toBe('CONTACTED');
			expect(harness.eventCount()).toBe(2);

			const advisorBResult = await outcome(
				harness.event(advisorB, {
					expectedState: 'NEW',
					targetState: 'CLOSED_LOST',
					reason: 'No response',
					note: 'Advisor B older form'
				})
			);

			expect(advisorBResult).toMatchObject({ kind: 'returned', status: 409 });
			expect(harness.state()).toBe('CONTACTED');
			expect(harness.eventCount()).toBe(2);
			expect(harness.rpcCalls()).toBe(1);
		} finally {
			harness.restoreFetch();
		}
	});

	test('rejects malformed and forged expected states without calling the RPC', async () => {
		const harness = createHarness('NEW');
		try {
			const malformed = await outcome(
				harness.event(advisorB, {
					expectedState: 'NOT_A_LEAD_STATE',
					targetState: 'CONTACTED',
					reason: '',
					note: ''
				})
			);
			expect(malformed).toMatchObject({ kind: 'returned', status: 400 });
			const missing = await outcome(
				harness.event(advisorB, {
					targetState: 'CONTACTED',
					reason: '',
					note: ''
				})
			);
			expect(missing).toMatchObject({ kind: 'returned', status: 400 });

			const forged = await outcome(
				harness.event(advisorB, {
					expectedState: 'CONTACTED',
					targetState: 'CONTACTED',
					reason: '',
					note: ''
				})
			);
			expect(forged).toMatchObject({ kind: 'returned', status: 409 });
			expect(harness.state()).toBe('NEW');
			expect(harness.eventCount()).toBe(1);
			expect(harness.rpcCalls()).toBe(0);
		} finally {
			harness.restoreFetch();
		}
	});
});
