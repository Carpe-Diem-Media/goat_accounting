import { describe, expect, it } from 'bun:test';
import type { EstimateLifecycleRecord } from './lifecycle';

async function getLifecycle() {
	const module = await import('./lifecycle').catch(() => null);
	expect(module).not.toBeNull();
	return module ?? null;
}

describe('estimate lifecycle guards', () => {
	it('supersedes a valid estimate while preserving its calculation snapshot', async () => {
		const lifecycle = await getLifecycle();
		if (!lifecycle) return;
		const estimate: EstimateLifecycleRecord & {
			catchupMinCents: number;
			pricingModelVersion: string;
		} = {
			id: 'estimate-old',
			state: 'VALID',
			catchupMinCents: 10_000,
			pricingModelVersion: 'test-1'
		};

		expect(
			lifecycle.transitionEstimateLifecycle(estimate, {
				type: 'SUPERSEDE',
				replacementEstimateId: 'estimate-new'
			})
		).toEqual({
			...estimate,
			state: 'SUPERSEDED',
			supersededByEstimateId: 'estimate-new'
		});
	});

	it('voids a valid estimate only with an authorized actor and a reason', async () => {
		const lifecycle = await getLifecycle();
		if (!lifecycle) return;
		const estimate = { id: 'estimate-1', state: 'VALID' as const };
		expect(
			lifecycle.transitionEstimateLifecycle(estimate, {
				type: 'VOID',
				authorized: true,
				actorId: 'staff-1',
				reason: 'Calculation input was corrupted',
				at: '2026-11-03T10:00:00.000Z'
			})
		).toMatchObject({
			state: 'VOIDED',
			voidReason: 'Calculation input was corrupted',
			voidedBy: 'staff-1',
			voidedAt: '2026-11-03T10:00:00.000Z'
		});
		expect(() =>
			lifecycle.transitionEstimateLifecycle(estimate, {
				type: 'VOID',
				authorized: false,
				actorId: 'staff-1',
				reason: 'forbidden',
				at: '2026-11-03T10:00:00.000Z'
			})
		).toThrow(lifecycle.EstimateLifecycleError);
		expect(() =>
			lifecycle.transitionEstimateLifecycle(estimate, {
				type: 'VOID',
				authorized: true,
				actorId: 'staff-1',
				reason: '   ',
				at: '2026-11-03T10:00:00.000Z'
			})
		).toThrow(lifecycle.EstimateLifecycleError);
		expect(() =>
			lifecycle.transitionEstimateLifecycle(estimate, {
				type: 'VOID',
				authorized: true,
				actorId: 'staff-1',
				reason: 'invalid timestamp',
				at: 'not-a-timestamp'
			})
		).toThrow(lifecycle.EstimateLifecycleError);
	});

	it('rejects a self-supersession and every transition out of a terminal estimate', async () => {
		const lifecycle = await getLifecycle();
		if (!lifecycle) return;
		expect(() =>
			lifecycle.transitionEstimateLifecycle({ id: 'estimate-1', state: 'VALID' }, {
				type: 'SUPERSEDE',
				replacementEstimateId: 'estimate-1'
			})
		).toThrow(lifecycle.EstimateLifecycleError);
		expect(() =>
			lifecycle.transitionEstimateLifecycle({ id: 'estimate-1', state: 'VOIDED' }, {
				type: 'SUPERSEDE',
				replacementEstimateId: 'estimate-2'
			})
		).toThrow(lifecycle.EstimateLifecycleError);
		expect(() =>
			lifecycle.transitionEstimateLifecycle({ id: 'estimate-1', state: 'SUPERSEDED' }, {
				type: 'VOID',
				authorized: true,
				actorId: 'staff-1',
				reason: 'later change',
				at: '2026-11-03T10:00:00.000Z'
			})
		).toThrow(lifecycle.EstimateLifecycleError);
	});
});
