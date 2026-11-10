import { describe, expect, test } from 'bun:test';
import { runLeadTransition } from './transition-lead';
import type { LeadState } from '../../domain/leads/lifecycle';

function dependencies(state: LeadState | null, rpcError: { code?: string } | null = null) {
	const calls: unknown[] = [];
	return {
		calls,
		findCurrentState: async (leadId: string) => {
			calls.push(['find', leadId]);
			return state;
		},
		transition: async (input: unknown) => {
			calls.push(['transition', input]);
			return { error: rpcError };
		}
	};
}

describe('runLeadTransition', () => {
	test('provides a lead transition service', () => {
		expect(runLeadTransition).toBeFunction();
	});

	test('denies viewers before reading or calling the transition RPC', async () => {
		const repo = dependencies('NEW');
		const result = await runLeadTransition({
			leadId: 'lead-1', expectedState: 'NEW', toState: 'CONTACTED', actor: { userId: 'viewer-1', role: 'viewer' }
		}, repo);

		expect(result).toEqual({ kind: 'forbidden' });
		expect(repo.calls).toEqual([]);
	});

	test('requires a non-empty reason for closure and rejects graph violations', async () => {
		for (const [toState, reason] of [['CLOSED_LOST', undefined], ['CLOSED_WON', 'Won']]) {
			const repo = dependencies('NEW');
			const result = await runLeadTransition({
				leadId: 'lead-1', expectedState: 'NEW', toState, reason, actor: { userId: 'advisor-1', role: 'advisor' }
			}, repo);
			expect(result).toEqual({ kind: 'invalid' });
			expect(repo.calls).toEqual([['find', 'lead-1']]);
		}
	});

	test('passes a validated transition and trimmed audit fields to the RPC adapter', async () => {
		const repo = dependencies('NEW');
		const result = await runLeadTransition({
			leadId: 'lead-1', expectedState: 'NEW', toState: 'CONTACTED', reason: '  follow up  ', note: '  Called the prospect  ',
			actor: { userId: 'advisor-1', role: 'advisor' }
		}, repo);

		expect(result).toEqual({ kind: 'success' });
		expect(repo.calls).toEqual([
			['find', 'lead-1'],
			['transition', {
				leadId: 'lead-1', expectedState: 'NEW', toState: 'CONTACTED', actorUserId: 'advisor-1',
				reasonCode: 'follow up', note: 'Called the prospect'
			}]
		]);
	});

	test('maps a database transition conflict to a refreshable conflict result', async () => {
		const repo = dependencies('NEW', { code: '40001' });
		const result = await runLeadTransition({
			leadId: 'lead-1', expectedState: 'NEW', toState: 'CONTACTED', actor: { userId: 'admin-1', role: 'admin' }
		}, repo);

		expect(result).toEqual({ kind: 'conflict' });
		expect(repo.calls).toHaveLength(2);
	});

	test('rejects a stale form state before validating or writing its requested transition', async () => {
		const repo = dependencies('CONTACTED');
		const result = await runLeadTransition({
			leadId: 'lead-1', expectedState: 'NEW', toState: 'CLOSED_LOST', reason: 'No response',
			actor: { userId: 'advisor-2', role: 'advisor' }
		}, repo);

		expect(result).toEqual({ kind: 'conflict' });
		expect(repo.calls).toEqual([['find', 'lead-1']]);
	});

	test('rejects malformed expected states before reading or writing', async () => {
		const repo = dependencies('NEW');
		const result = await runLeadTransition({
			leadId: 'lead-1', expectedState: 'NOT_A_LEAD_STATE', toState: 'CONTACTED',
			actor: { userId: 'advisor-1', role: 'advisor' }
		}, repo);

		expect(result).toEqual({ kind: 'invalid' });
		expect(repo.calls).toEqual([]);
	});

	test('maps database lifecycle and closure-reason rejections to invalid input', async () => {
		for (const code of ['23514', '22023']) {
			const repo = dependencies('NEW', { code });
			const result = await runLeadTransition({
				leadId: 'lead-1', expectedState: 'NEW', toState: 'CONTACTED', actor: { userId: 'advisor-1', role: 'advisor' }
			}, repo);
			expect(result).toEqual({ kind: 'invalid' });
		}
	});
});
