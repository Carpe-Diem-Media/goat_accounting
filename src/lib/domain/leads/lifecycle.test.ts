import { describe, expect, test } from 'bun:test';
import { canTransitionLead, getLeadTransitions } from './lifecycle';

const states = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT'] as const;
const allowed: ReadonlyArray<readonly [typeof states[number], typeof states[number]]> = [
	['NEW', 'CONTACTED'],
	['CONTACTED', 'QUALIFIED'],
	['QUALIFIED', 'PROPOSAL_SENT'],
	['PROPOSAL_SENT', 'CLOSED_WON'],
	['NEW', 'CLOSED_LOST'], ['CONTACTED', 'CLOSED_LOST'], ['QUALIFIED', 'CLOSED_LOST'], ['PROPOSAL_SENT', 'CLOSED_LOST'],
	['NEW', 'CLOSED_NOT_A_FIT'], ['CONTACTED', 'CLOSED_NOT_A_FIT'], ['QUALIFIED', 'CLOSED_NOT_A_FIT']
];

function expected(from: typeof states[number], to: typeof states[number]) {
	return allowed.some(([source, target]) => source === from && target === to);
}

describe('canTransitionLead', () => {
	test('matches the contract for every source and target pair', () => {
		for (const from of states) for (const to of states) {
			expect(canTransitionLead(from, to, 'reason')).toBe(expected(from, to));
		}
	});

	test('requires a reason when closing a lead', () => {
		for (const target of ['CLOSED_WON', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT'] as const) {
			const source = target === 'CLOSED_WON' ? 'PROPOSAL_SENT' : 'NEW';
			expect(canTransitionLead(source, target)).toBe(false);
			expect(canTransitionLead(source, target, '  ')).toBe(false);
			expect(canTransitionLead(source, target, 'not a fit')).toBe(true);
		}
	});
});

describe('getLeadTransitions', () => {
	test('returns the exact product-spec transition graph for the detail form', () => {
		expect(states.map((state) => [state, getLeadTransitions(state)])).toEqual([
			['NEW', ['CONTACTED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT']],
			['CONTACTED', ['QUALIFIED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT']],
			['QUALIFIED', ['PROPOSAL_SENT', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT']],
			['PROPOSAL_SENT', ['CLOSED_WON', 'CLOSED_LOST']],
			['CLOSED_WON', []],
			['CLOSED_LOST', []],
			['CLOSED_NOT_A_FIT', []]
		]);
	});
});
