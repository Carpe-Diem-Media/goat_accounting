export type PricingModelState = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export type PricingLifecycleGuards = Readonly<{
	authorized?: boolean;
	schemaValid?: boolean;
	mandatoryRulesPresent?: boolean;
	testCorpusPassed?: boolean;
	replacementActivationSucceeded?: boolean;
}>;

export type PricingModelLifecycleRecord = Readonly<{ id: string; state: PricingModelState }>;

export class PricingModelLifecycleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PricingModelLifecycleError';
	}
}

export function transitionPricingModelState(
	from: PricingModelState,
	to: PricingModelState,
	guards: PricingLifecycleGuards = {}
): PricingModelState {
	if (from === 'DRAFT' && to === 'ACTIVE') {
		const missing = [
			['authorization', guards.authorized],
			['valid schema', guards.schemaValid],
			['mandatory rule coverage', guards.mandatoryRulesPresent],
			['passing pricing corpus', guards.testCorpusPassed]
		].filter(([, passed]) => passed !== true).map(([name]) => name);
		if (missing.length > 0) {
			throw new PricingModelLifecycleError(`Activation requires ${missing.join(', ')}.`);
		}
		return 'ACTIVE';
	}

	if (from === 'ACTIVE' && to === 'RETIRED') {
		if (guards.replacementActivationSucceeded !== true) {
			throw new PricingModelLifecycleError('Retirement is only allowed after a replacement activates successfully.');
		}
		return 'RETIRED';
	}

	throw new PricingModelLifecycleError(`Pricing model transition ${from} -> ${to} is not allowed.`);
}

export function activatePricingModel<T extends PricingModelLifecycleRecord>(
	models: readonly T[],
	targetModelId: string,
	guards: PricingLifecycleGuards
): T[] {
	const ids = models.map((model) => model.id);
	if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
		throw new PricingModelLifecycleError('Pricing model IDs must be nonempty and unique.');
	}
	const activeModels = models.filter((model) => model.state === 'ACTIVE');
	if (activeModels.length > 1) throw new PricingModelLifecycleError('At most one pricing model may be active.');
	const targetMatches = models.filter((model) => model.id === targetModelId);
	if (targetMatches.length !== 1) throw new PricingModelLifecycleError('Target pricing model must exist exactly once.');
	const target = targetMatches[0];
	if (target.state !== 'DRAFT') throw new PricingModelLifecycleError('Only a draft pricing model can be activated.');

	// Validate the complete transition before producing any changed model values.
	transitionPricingModelState('DRAFT', 'ACTIVE', guards);
	if (activeModels[0]) {
		transitionPricingModelState('ACTIVE', 'RETIRED', { replacementActivationSucceeded: true });
	}

	return models.map((model) => {
		if (model.id === targetModelId) return { ...model, state: 'ACTIVE' };
		if (model.state === 'ACTIVE') return { ...model, state: 'RETIRED' };
		return { ...model };
	});
}
