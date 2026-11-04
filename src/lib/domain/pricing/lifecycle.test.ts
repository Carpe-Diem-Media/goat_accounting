import { describe, expect, it } from 'bun:test';
import type { PricingModelLifecycleRecord } from './lifecycle';

async function getLifecycle() {
	const module = await import('./lifecycle').catch(() => null);
	expect(module).not.toBeNull();
	return module ?? null;
}

const passedActivation = {
	authorized: true,
	schemaValid: true,
	mandatoryRulesPresent: true,
	testCorpusPassed: true
} as const;

describe('pricing model lifecycle guards', () => {
	it('exposes model-state changes only through guarded collection activation', async () => {
		const lifecycle = await getLifecycle();
		if (!lifecycle) return;
		expect(Object.keys(lifecycle)).not.toContain('transitionPricingModelState');
	});

	it('activates a valid draft and retires the previous active model as one transition', async () => {
		const lifecycle = await getLifecycle();
		if (!lifecycle) return;
		const models: PricingModelLifecycleRecord[] = [
			{ id: 'model-old', state: 'ACTIVE' as const },
			{ id: 'model-new', state: 'DRAFT' as const }
		];
		const result = lifecycle.activatePricingModel(
			models,
			'model-new',
			passedActivation
		);

		expect(result).toEqual([
			{ id: 'model-old', state: 'RETIRED' },
			{ id: 'model-new', state: 'ACTIVE' }
		]);
		expect(models).toEqual([
			{ id: 'model-old', state: 'ACTIVE' },
			{ id: 'model-new', state: 'DRAFT' }
		]);
		const firstModel: PricingModelLifecycleRecord[] = [{ id: 'first-model', state: 'DRAFT' }];
		expect(
			lifecycle.activatePricingModel(firstModel, 'first-model', passedActivation)
		).toEqual([{ id: 'first-model', state: 'ACTIVE' }]);
	});

	it('rejects draft activation when any activation guard fails', async () => {
		const lifecycle = await getLifecycle();
		if (!lifecycle) return;
		expect(() =>
			lifecycle.activatePricingModel(
				[
					{ id: 'model-old', state: 'ACTIVE' },
					{ id: 'model-new', state: 'DRAFT' }
				],
				'model-new',
				{ ...passedActivation, testCorpusPassed: false }
			)
		).toThrow(lifecycle.PricingModelLifecycleError);
	});

	it('rejects multiple active models and keeps retired models terminal', async () => {
		const lifecycle = await getLifecycle();
		if (!lifecycle) return;
		expect(() =>
			lifecycle.activatePricingModel(
				[
					{ id: 'model-a', state: 'ACTIVE' },
					{ id: 'model-b', state: 'ACTIVE' },
					{ id: 'model-c', state: 'DRAFT' }
				],
				'model-c',
				passedActivation
			)
		).toThrow(lifecycle.PricingModelLifecycleError);
		expect(() =>
			lifecycle.activatePricingModel(
				[
					{ id: 'same-id', state: 'ACTIVE' },
					{ id: 'same-id', state: 'DRAFT' }
				],
				'same-id',
				passedActivation
			)
		).toThrow(lifecycle.PricingModelLifecycleError);
		expect(() =>
			lifecycle.activatePricingModel([{ id: 'retired-model', state: 'RETIRED' }], 'retired-model', passedActivation)
		).toThrow(lifecycle.PricingModelLifecycleError);
	});
});
