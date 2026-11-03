import { describe, expect, it } from 'bun:test';

async function getDependencies() {
	const [model, corpus, ruleSchema, questions] = await Promise.all([
		import('./model').catch(() => null),
		import('./test-corpus').catch(() => null),
		import('./rule-schema').catch(() => null),
		import('../estimator/questions').catch(() => null)
	]);
	expect(model).not.toBeNull();
	expect(corpus).not.toBeNull();
	expect(ruleSchema).not.toBeNull();
	expect(questions).not.toBeNull();
	return model && corpus && ruleSchema && questions ? { ...model, ...corpus, ...ruleSchema, ...questions } : null;
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

	it('bounds model rule counts and nested answer-option collections', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const oversizedModel = structuredClone(dependencies.TEST_PRICING_MODEL);
		oversizedModel.rules = Array.from(
			{ length: 129 },
			() => structuredClone(dependencies.TEST_PRICING_MODEL.rules[0])
		);
		expect(dependencies.PricingModelSchema.safeParse(oversizedModel).success).toBe(false);

		const volumeRule = dependencies.TEST_PRICING_MODEL.rules.find(
			(rule) => rule.type === 'BAND_RANGE' && rule.inputKey === 'business.monthlyTransactionVolume'
		);
		if (!volumeRule || volumeRule.type !== 'BAND_RANGE') throw new Error('fixture must include volume bands');
		const oversizedRule = structuredClone(volumeRule);
		const firstBand = oversizedRule.bands[0];
		if (!firstBand) throw new Error('volume fixture must include a band');
		const maxOptionCount = Math.max(...Object.values(dependencies.ANSWER_OPTION_VALUES).map((values) => values.length));
		oversizedRule.bands = Array.from(
			{ length: maxOptionCount + 1 },
			() => structuredClone(firstBand)
		);
		expect(dependencies.PricingRuleSchema.safeParse(oversizedRule).success).toBe(false);
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

	it('requires unknown transaction volume to cover the known workload range', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		const volumeRule = input.rules.find(
			(rule) => rule.type === 'BAND_RANGE' && rule.inputKey === 'business.monthlyTransactionVolume'
		);
		if (!volumeRule || volumeRule.type !== 'BAND_RANGE') throw new Error('fixture must include volume bands');
		const unknown = volumeRule.bands.find((band) => band.value === 'not_sure');
		if (!unknown) throw new Error('volume fixture must contain an unknown band');
		unknown.range = { minCents: 20, maxCents: 159 };

		expect(() => dependencies.validatePricingModel(input)).toThrow(/unknown workload range/i);
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

	it('requires numeric confidence rules to penalize a missing count', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		const countRule = input.rules.find((rule) => rule.code === 'BIZ-ENTITY-COUNT-UNCERTAINTY');
		if (!countRule || countRule.type !== 'CONFIDENCE_WEIGHT') throw new Error('fixture must include a count confidence rule');
		countRule.missingPoints = 0;

		expect(() => dependencies.validatePricingModel(input)).toThrow(/positive missing-count confidence weight/i);
	});

	it('rejects models that remove mandatory professional-review or confidence safeguards', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;

		for (const safeguard of dependencies.TEST_PRICING_MODEL.rules.filter((rule) => rule.type === 'REVIEW_TRIGGER')) {
			const input = structuredClone(dependencies.TEST_PRICING_MODEL);
			input.rules = input.rules.filter((rule) => rule.code !== safeguard.code);
			expect(() => dependencies.validatePricingModel(input)).toThrow(/mandatory.*professional-review/i);
		}

		for (const safeguard of dependencies.TEST_PRICING_MODEL.rules.filter((rule) => rule.type === 'CONFIDENCE_WEIGHT')) {
			const input = structuredClone(dependencies.TEST_PRICING_MODEL);
			input.rules = input.rules.filter((rule) => rule.code !== safeguard.code);
			expect(() => dependencies.validatePricingModel(input)).toThrow(/mandatory.*confidence/i);
		}

		const neutralizedReview = structuredClone(dependencies.TEST_PRICING_MODEL);
		const volumeReview = neutralizedReview.rules.find((rule) => rule.code === 'high_transaction_volume');
		if (!volumeReview || volumeReview.type !== 'REVIEW_TRIGGER') throw new Error('fixture must include high-volume review');
		volumeReview.condition = { type: 'ANSWER_EQUALS', inputKey: 'business.employeeCount', value: 'none' };
		expect(() => dependencies.validatePricingModel(neutralizedReview)).toThrow(/mandatory.*professional-review/i);

		const neutralizedConfidence = structuredClone(dependencies.TEST_PRICING_MODEL);
		const volumeWeight = neutralizedConfidence.rules.find((rule) => rule.code === 'BIZ-VOLUME-UNCERTAINTY');
		if (!volumeWeight || volumeWeight.type !== 'CONFIDENCE_WEIGHT') throw new Error('fixture must include unknown-volume confidence weight');
		volumeWeight.pointsByValue[0]!.points = 0;
		expect(() => dependencies.validatePricingModel(neutralizedConfidence)).toThrow(/mandatory.*confidence/i);

		const neutralizedThresholds = structuredClone(dependencies.TEST_PRICING_MODEL);
		neutralizedThresholds.confidenceThresholds = { highMaxPoints: 10_000, goodMaxPoints: 10_000 };
		expect(() => dependencies.validatePricingModel(neutralizedThresholds)).toThrow(/confidence threshold/i);
	});

	it('requires PER_UNIT_RANGE rules to price missing entity and outstanding-year counts safely', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;

		for (const code of ['BIZ-ENTITY-COUNT', 'PERSONAL-OUTSTANDING-YEARS']) {
			const input = structuredClone(dependencies.TEST_PRICING_MODEL);
			const countRule = input.rules.find((rule) => rule.code === code);
			if (!countRule || countRule.type !== 'PER_UNIT_RANGE') throw new Error(`fixture must include ${code}`);
			delete countRule.unknownRange;
			expect(() => dependencies.validatePricingModel(input)).toThrow(/unknown.*range/i);
		}
	});

	it('requires books-status period bands to cover accepted outstanding-month counts', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		const periodRule = input.rules.find((rule) => rule.code === 'BIZ-BOOKS-PERIODS');
		if (!periodRule || periodRule.type !== 'PER_PERIOD_RANGE') throw new Error('fixture must include books-period pricing');
		const yearBand = periodRule.periodsByValue.find((period) => period.value === '1_to_2_years');
		if (!yearBand) throw new Error('fixture must include a one-to-two-year band');
		yearBand.maxPeriods = 18;

		expect(() => dependencies.validatePricingModel(input)).toThrow(/cover accepted outstanding-month counts/i);
	});

	it('rejects out-of-range or weakened numeric review thresholds', async () => {
		const dependencies = await getDependencies();
		if (!dependencies) return;
		const input = structuredClone(dependencies.TEST_PRICING_MODEL);
		const reviewRule = input.rules.find(
			(rule) => rule.type === 'REVIEW_TRIGGER' && rule.condition.type === 'NUMERIC_AT_LEAST' && rule.condition.inputKey === 'business.entityCount'
		);
		if (!reviewRule || reviewRule.type !== 'REVIEW_TRIGGER' || reviewRule.condition.type !== 'NUMERIC_AT_LEAST') {
			throw new Error('fixture must include an entity-count review trigger');
		}
		reviewRule.condition.value = 1001;
		expect(() => dependencies.validatePricingModel(input)).toThrow(/exceeds the accepted maximum/i);

		reviewRule.condition.value = 1000;
		expect(() => dependencies.validatePricingModel(input)).toThrow(/mandatory professional-review safeguards/i);

		reviewRule.condition.value = 5;
		expect(() => dependencies.validatePricingModel(input)).not.toThrow();
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
