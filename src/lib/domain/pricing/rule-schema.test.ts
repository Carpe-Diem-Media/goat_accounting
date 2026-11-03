import { describe, expect, it } from 'bun:test';

async function getDependencies() {
	const [model, corpus] = await Promise.all([
		import('./model').catch(() => null),
		import('./test-corpus').catch(() => null)
	]);
	expect(model).not.toBeNull();
	expect(corpus).not.toBeNull();
	return model && corpus ? { ...model, ...corpus } : null;
}

describe('bounded pricing rule schemas', () => {
	it('accepts only the eight approved rule types', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const types = new Set(dependencies.TEST_PRICING_MODEL.rules.map((rule) => rule.type));
		expect(types).toEqual(
			new Set([
				'FIXED_RANGE',
				'BAND_RANGE',
				'PER_UNIT_RANGE',
				'PER_PERIOD_RANGE',
				'SERVICE_ADDON_RANGE',
				'COMPLEXITY_SCORE',
				'CONFIDENCE_WEIGHT',
				'REVIEW_TRIGGER'
			])
		);
	});

	it('rejects unknown rule types and arbitrary expression fields', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const fixedRule = dependencies.TEST_PRICING_MODEL.rules.find((rule) => rule.type === 'FIXED_RANGE');
		if (!fixedRule) throw new Error('fixture must include FIXED_RANGE');

		expect(dependencies.PricingRuleSchema.safeParse({ ...fixedRule, type: 'EXPRESSION' }).success).toBe(false);
		expect(
			dependencies.PricingRuleSchema.safeParse({ ...fixedRule, expression: 'answers.amount * 1.4' }).success
		).toBe(false);
	});

	it('rejects fractional, negative, unsafe and inverted money ranges', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const fixedRule = dependencies.TEST_PRICING_MODEL.rules.find((rule) => rule.type === 'FIXED_RANGE');
		if (!fixedRule || fixedRule.type !== 'FIXED_RANGE') throw new Error('fixture must include FIXED_RANGE');

		for (const range of [
			{ minCents: -1, maxCents: 10 },
			{ minCents: 1.5, maxCents: 10 },
			{ minCents: 11, maxCents: 10 },
			{ minCents: Number.MAX_SAFE_INTEGER + 1, maxCents: Number.MAX_SAFE_INTEGER + 1 }
		]) {
			expect(dependencies.PricingRuleSchema.safeParse({ ...fixedRule, range }).success).toBe(false);
		}
	});

	it('rejects incomplete or non-monotone workload bands', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		const volumeRule = input.rules.find((rule) => rule.type === 'BAND_RANGE' && rule.inputKey === 'business.monthlyTransactionVolume');
		if (!volumeRule || volumeRule.type !== 'BAND_RANGE') throw new Error('fixture must include volume bands');

		const low = volumeRule.bands.find((band) => band.value === 'under_50');
		const high = volumeRule.bands.find((band) => band.value === 'over_750');
		if (!low || !high) throw new Error('volume fixture must contain workload boundaries');
		high.range = { minCents: low.range.minCents - 1, maxCents: low.range.maxCents - 1 };
		expect(() => dependencies.validatePricingModel(input)).toThrow();

		const incomplete = structuredClone(dependencies.TEST_PRICING_MODEL);
		const incompleteVolume = incomplete.rules.find(
			(rule) => rule.type === 'BAND_RANGE' && rule.inputKey === 'business.monthlyTransactionVolume'
		);
		if (!incompleteVolume || incompleteVolume.type !== 'BAND_RANGE') throw new Error('fixture must include volume bands');
		incompleteVolume.bands = incompleteVolume.bands.filter((band) => band.value !== 'not_sure');
		expect(() => dependencies.validatePricingModel(incomplete)).toThrow();
	});

	it('rejects answer values that are not in the question contract', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		const volumeRule = input.rules.find((rule) => rule.type === 'BAND_RANGE' && rule.inputKey === 'business.monthlyTransactionVolume');
		if (!volumeRule || volumeRule.type !== 'BAND_RANGE') throw new Error('fixture must include volume bands');
		volumeRule.bands[0].value = 'millions';
		expect(() => dependencies.validatePricingModel(input)).toThrow();
	});

	it('requires V1 workload, service, complexity and branch coverage', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		input.rules = input.rules.filter((rule) => rule.code !== 'BIZ-TRANSACTION-VOLUME');
		expect(() => dependencies.validatePricingModel(input)).toThrow(/mandatory V1/i);
	});

	it('does not allow urgency to drive a monetary rule', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		const volumeRule = input.rules.find((rule) => rule.code === 'BIZ-TRANSACTION-VOLUME');
		if (!volumeRule || volumeRule.type !== 'BAND_RANGE') throw new Error('fixture must include transaction-volume bands');
		volumeRule.inputKey = 'urgency';
		volumeRule.bands = [
			{ value: 'no_urgent_deadline', range: { minCents: 0, maxCents: 0 } },
			{ value: 'within_3_months', range: { minCents: 1, maxCents: 1 } },
			{ value: 'within_30_days', range: { minCents: 2, maxCents: 2 } },
			{ value: 'within_14_days', range: { minCents: 3, maxCents: 3 } },
			{ value: 'deadline_missed', range: { minCents: 4, maxCents: 4 } }
		];
		expect(() => dependencies.validatePricingModel(input)).toThrow(/urgency cannot affect a price/i);
	});
});
