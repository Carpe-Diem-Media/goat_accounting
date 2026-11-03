import { describe, expect, it } from 'bun:test';

async function getEngineDependencies() {
	const [answerSchema, estimate, corpus] = await Promise.all([
		import('../estimator/answer-schema').catch(() => null),
		import('../estimator/estimate').catch(() => null),
		import('./test-corpus').catch(() => null)
	]);
	expect(answerSchema).not.toBeNull();
	expect(estimate).not.toBeNull();
	expect(corpus).not.toBeNull();
	return answerSchema && estimate && corpus ? { ...answerSchema, ...estimate, ...corpus } : null;
}

describe('pure pricing engine', () => {
	it('uses only clearly marked non-production money fixtures', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		expect(domain.NON_PRODUCTION_PRICING_FIXTURE_NOTICE).toMatch(/test-only/i);
		expect(domain.NON_PRODUCTION_PRICING_FIXTURE_NOTICE).toMatch(/not approved/i);
		expect(domain.TEST_PRICING_MODEL.id).toMatch(/^test-only-/);
	});

	it('matches every canonical scenario in the pricing test corpus', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		for (const scenario of domain.CANONICAL_PRICING_TEST_CORPUS) {
			const result = domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL);
			expect(result.catchup.minCents).toBe(scenario.expected.catchup.minCents);
			expect(result.catchup.maxCents).toBe(scenario.expected.catchup.maxCents);
			expect(result.ongoing.minCents).toBe(scenario.expected.ongoing.minCents);
			expect(result.ongoing.maxCents).toBe(scenario.expected.ongoing.maxCents);
			expect(result.confidence).toBe(scenario.expected.confidence);
			expect(result.manualReviewRequired).toBe(scenario.expected.manualReviewRequired);
			expect(result.catchup.lineItems.map((item) => item.code)).toEqual(
				scenario.expected.catchup.lineItemCodes
			);
			expect(result.ongoing.lineItems.map((item) => item.code)).toEqual(
				scenario.expected.ongoing.lineItemCodes
			);
			expect(result.reviewFlags.map((flag) => flag.code)).toEqual(scenario.expected.reviewFlagCodes);
		}
	});

	it('keeps every corpus total safe, nonnegative, ordered and equal to its line items', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		for (const scenario of domain.CANONICAL_PRICING_TEST_CORPUS) {
			const result = domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL);
			for (const total of [result.catchup, result.ongoing]) {
				expect(Number.isSafeInteger(total.minCents)).toBe(true);
				expect(Number.isSafeInteger(total.maxCents)).toBe(true);
				expect(total.minCents).toBeGreaterThanOrEqual(0);
				expect(total.maxCents).toBeGreaterThanOrEqual(total.minCents);
				expect(total.minCents).toBe(total.lineItems.reduce((sum, item) => sum + item.minCents, 0));
				expect(total.maxCents).toBe(total.lineItems.reduce((sum, item) => sum + item.maxCents, 0));
			}
		}
	});

	it('composes business and personal amounts and line items for both', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const business = domain.CANONICAL_PRICING_TEST_CORPUS.find((scenario) => scenario.id === 'simple-current-sole-proprietor');
		const personal = domain.CANONICAL_PRICING_TEST_CORPUS.find((scenario) => scenario.id === 'personal-salaried-taxpayer');
		if (!business || !personal) throw new Error('corpus must contain business and personal baselines');

		const businessResult = domain.calculateEstimate(business.answers, domain.TEST_PRICING_MODEL);
		const personalResult = domain.calculateEstimate(personal.answers, domain.TEST_PRICING_MODEL);
		const bothAnswers = domain.CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'both',
			urgency: 'no_urgent_deadline',
			business: business.answers.business,
			personal: personal.answers.personal
		});
		const bothResult = domain.calculateEstimate(bothAnswers, domain.TEST_PRICING_MODEL);

		expect(bothResult.catchup.minCents).toBe(
			businessResult.catchup.minCents + personalResult.catchup.minCents
		);
		expect(bothResult.catchup.maxCents).toBe(
			businessResult.catchup.maxCents + personalResult.catchup.maxCents
		);
		expect(bothResult.ongoing.minCents).toBe(
			businessResult.ongoing.minCents + personalResult.ongoing.minCents
		);
		expect(bothResult.ongoing.maxCents).toBe(
			businessResult.ongoing.maxCents + personalResult.ongoing.maxCents
		);
		expect(bothResult.catchup.lineItems.map((item) => item.code)).toEqual([
			...businessResult.catchup.lineItems.map((item) => item.code),
			...personalResult.catchup.lineItems.map((item) => item.code)
		]);
	});

	it('keeps urgency out of prices while allowing urgent review flags', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const baseline = domain.CANONICAL_PRICING_TEST_CORPUS.find((scenario) => scenario.id === 'simple-current-sole-proprietor');
		if (!baseline || baseline.answers.calculatorType !== 'business') throw new Error('business baseline is required');
		const urgent = domain.CanonicalEstimatorAnswersSchema.parse({
			...baseline.answers,
			urgency: 'within_14_days'
		});

		const normalResult = domain.calculateEstimate(baseline.answers, domain.TEST_PRICING_MODEL);
		const urgentResult = domain.calculateEstimate(urgent, domain.TEST_PRICING_MODEL);
		expect(urgentResult.catchup.minCents).toBe(normalResult.catchup.minCents);
		expect(urgentResult.catchup.maxCents).toBe(normalResult.catchup.maxCents);
		expect(urgentResult.ongoing.minCents).toBe(normalResult.ongoing.minCents);
		expect(urgentResult.ongoing.maxCents).toBe(normalResult.ongoing.maxCents);
		expect(urgentResult.reviewFlags.map((flag) => flag.code)).toContain('urgent_deadline');
	});

	it('reports structured complexity scores separately from price ranges', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const scenario = domain.CANONICAL_PRICING_TEST_CORPUS.find((item) => item.id === 'ecommerce-multiple-gateways');
		if (!scenario) throw new Error('corpus must include the ecommerce complexity scenario');
		const result = domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL);
		expect(result.complexityScores.business).toBe(2);
		expect(result.manualReviewRequired).toBe(false);
	});

	it('classifies unknown high-impact answers as preliminary without invalid money', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const unknown = domain.CANONICAL_PRICING_TEST_CORPUS.find((scenario) => scenario.id === 'unknown-transaction-volume');
		if (!unknown) throw new Error('corpus must include unknown volume');
		const result = domain.calculateEstimate(unknown.answers, domain.TEST_PRICING_MODEL);

		expect(result.confidence).toBe('preliminary');
		for (const total of [result.catchup, result.ongoing]) {
			expect(Number.isSafeInteger(total.minCents)).toBe(true);
			expect(Number.isSafeInteger(total.maxCents)).toBe(true);
			expect(total.minCents).toBeGreaterThanOrEqual(0);
			expect(total.maxCents).toBeGreaterThanOrEqual(total.minCents);
			expect(total.minCents).toBe(
				total.lineItems.reduce((sum, item) => sum + item.minCents, 0)
			);
			expect(total.maxCents).toBe(
				total.lineItems.reduce((sum, item) => sum + item.maxCents, 0)
			);
		}
	});

	it('reduces confidence when an optional numeric backlog count is missing', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const answersWithoutYearCount = domain.CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'personal',
			urgency: 'no_urgent_deadline',
			personal: {
				currentStatus: 'multiple_years_outstanding',
				incomeSources: ['salary'],
				sarsPosition: 'normal_filing',
				ongoingRequirements: ['annual_tax_return']
			}
		});
		const answersWithYearCount = domain.CanonicalEstimatorAnswersSchema.parse({
			...answersWithoutYearCount,
			personal: { ...answersWithoutYearCount.personal, outstandingYears: 3 }
		});

		const withoutCount = domain.calculateEstimate(answersWithoutYearCount, domain.TEST_PRICING_MODEL);
		const withCount = domain.calculateEstimate(answersWithYearCount, domain.TEST_PRICING_MODEL);

		expect(withoutCount.reviewFlags).toEqual([]);
		expect(withoutCount.confidencePoints.personal).toBe(1);
		expect(withoutCount.confidence).toBe('good');
		expect(withoutCount.catchup.lineItems).toContainEqual(
			expect.objectContaining({ code: 'PERSONAL-OUTSTANDING-YEARS', minCents: 20, maxCents: 100, unit: 'tax year' })
		);
		expect(withCount.confidencePoints.personal).toBe(0);
		expect(withCount.confidence).toBe('high');
	});

	it('prices missing entity counts with the declared unknown range and requires review', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const scenario = domain.CANONICAL_PRICING_TEST_CORPUS.find((item) => item.id === 'multiple-entities-unknown-count');
		if (!scenario) throw new Error('corpus must include multiple entities with an unknown count');

		const result = domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL);
		const entityCountItem = result.catchup.lineItems.find((item) => item.code === 'BIZ-ENTITY-COUNT');

		expect(entityCountItem).toMatchObject({ minCents: 20, maxCents: 100, unit: 'entity' });
		expect(result.manualReviewRequired).toBe(true);
		expect(result.confidence).toBe('preliminary');
	});

	it('keeps an unknown business backlog duration uncertain', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const scenario = domain.CANONICAL_PRICING_TEST_CORPUS.find((item) => item.id === 'unknown-business-backlog-duration');
		if (!scenario) throw new Error('corpus must include unknown business backlog duration');

		const result = domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL);

		expect(result.confidence).toBe('good');
		expect(result.confidence).not.toBe('high');
		expect(result.manualReviewRequired).toBe(false);
		expect(result.catchup.lineItems).toContainEqual(
			expect.objectContaining({ code: 'BIZ-BOOKS-PERIODS', minCents: 20, maxCents: 100 })
		);
	});

	it('does not permit high confidence for high-risk inputs when their review trigger is removed', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const scenario = domain.CANONICAL_PRICING_TEST_CORPUS.find((item) => item.id === 'high-volume-boundary');
		if (!scenario) throw new Error('corpus must include high transaction volume');
		const guarded = domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL);
		expect(guarded.manualReviewRequired).toBe(true);
		expect(guarded.confidence).toBe('preliminary');

		const withoutReview = structuredClone(domain.TEST_PRICING_MODEL);
		withoutReview.rules = withoutReview.rules.filter((rule) => rule.code !== 'high_transaction_volume');

		expect(() => domain.calculateEstimate(scenario.answers, withoutReview as typeof domain.TEST_PRICING_MODEL)).toThrow(/mandatory.*review/i);
	});

	it('returns identical snapshots for identical canonical inputs', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const scenario = domain.CANONICAL_PRICING_TEST_CORPUS[0];
		expect(domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL)).toEqual(
			domain.calculateEstimate(scenario.answers, domain.TEST_PRICING_MODEL)
		);
	});

	it('rejects inactive models and rejects overflow in money arithmetic', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const inactive = { ...domain.TEST_PRICING_MODEL, state: 'DRAFT' as const };
		expect(() => domain.calculateEstimate(domain.CANONICAL_PRICING_TEST_CORPUS[0].answers, inactive)).toThrow();

		const overflowModel = {
			...domain.TEST_PRICING_MODEL,
			rules: domain.TEST_PRICING_MODEL.rules.map((rule) =>
				rule.code === 'BIZ-ENTITY-COUNT'
					? {
							...rule,
							unitRange: {
								minCents: Number.MAX_SAFE_INTEGER,
								maxCents: Number.MAX_SAFE_INTEGER
							}
						}
					: rule
			)
		};
		const multiEntity = domain.CANONICAL_PRICING_TEST_CORPUS.find((scenario) => scenario.id === 'multiple-entities');
		if (!multiEntity) throw new Error('corpus must include multiple entities');
		expect(() => domain.calculateEstimate(multiEntity.answers, overflowModel as typeof domain.TEST_PRICING_MODEL)).toThrow();
	});

	it('rejects a pricing model for an unsupported engine version', async () => {
		const domain = await getEngineDependencies();
		if (!domain) return;
		const unsupportedModel = { ...domain.TEST_PRICING_MODEL, engineVersion: '9.9.9' };
		expect(() =>
			domain.calculateEstimate(
				domain.CANONICAL_PRICING_TEST_CORPUS[0].answers,
				unsupportedModel as typeof domain.TEST_PRICING_MODEL
			)
		).toThrow(/unsupported pricing engine version/i);
	});
});
