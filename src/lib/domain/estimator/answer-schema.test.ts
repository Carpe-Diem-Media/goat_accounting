import { describe, expect, it } from 'bun:test';

async function getSchema() {
	const module = await import('./answer-schema').catch(() => null);
	expect(module).not.toBeNull();
	return module?.CanonicalEstimatorAnswersSchema ?? null;
}

const businessAnswers = {
	calculatorType: 'business',
	urgency: 'no_urgent_deadline',
	business: {
		entityType: 'sole_proprietor',
		booksStatus: 'current_and_reconciled',
		recordCondition: 'clean_software',
		monthlyTransactionVolume: 'under_50',
		financialAccounts: 'one',
		employeeCount: 'none',
		taxPosition: 'all_current',
		ongoingServices: ['monthly_bookkeeping'],
		complexityFactors: ['none']
	}
} as const;

const personalAnswers = {
	calculatorType: 'personal',
	urgency: 'no_urgent_deadline',
	personal: {
		currentStatus: 'current',
		incomeSources: ['salary'],
		sarsPosition: 'normal_filing',
		ongoingRequirements: ['annual_tax_return']
	}
} as const;

describe('CanonicalEstimatorAnswersSchema', () => {
	it('accepts a complete business branch', async () => {
		const schema = await getSchema();
		if (!schema) return;
		expect(schema.parse(businessAnswers)).toMatchObject(businessAnswers);
	});

	it('accepts a complete personal branch', async () => {
		const schema = await getSchema();
		if (!schema) return;
		expect(schema.parse(personalAnswers)).toMatchObject(personalAnswers);
	});

	it('requires both branches for a combined estimate', async () => {
		const schema = await getSchema();
		if (!schema) return;
		const both = {
			...businessAnswers,
			calculatorType: 'both',
			personal: personalAnswers.personal
		};
		expect(schema.safeParse(both).success).toBe(true);
		expect(
			schema.safeParse({
				...businessAnswers,
				calculatorType: 'both'
			}).success
		).toBe(false);
	});

	it('rejects data from a branch that is not selected', async () => {
		const schema = await getSchema();
		if (!schema) return;
		expect(
			schema.safeParse({
				...businessAnswers,
				personal: personalAnswers.personal
			}).success
		).toBe(false);
		expect(
			schema.safeParse({
				...personalAnswers,
				business: businessAnswers.business
			}).success
		).toBe(false);
	});

	it('caps each multi-select at its canonical answer-option count', async () => {
		const schema = await getSchema();
		const questions = await import('./questions').catch(() => null);
		if (!schema || !questions) return;
		const overLimit = (values: readonly string[]) => Array.from({ length: values.length + 1 }, () => values[0]!);
		const cases = [
			{
				path: 'business.ongoingServices',
				answers: {
					...businessAnswers,
					business: {
						...businessAnswers.business,
						ongoingServices: overLimit(questions.ANSWER_OPTION_VALUES['business.ongoingServices'])
					}
				}
			},
			{
				path: 'business.complexityFactors',
				answers: {
					...businessAnswers,
					business: {
						...businessAnswers.business,
						complexityFactors: overLimit(questions.ANSWER_OPTION_VALUES['business.complexityFactors'])
					}
				}
			},
			{
				path: 'business.outstandingComplianceAreas',
				answers: {
					...businessAnswers,
					business: {
						...businessAnswers.business,
						taxPosition: 'some_submissions_outstanding',
						outstandingComplianceAreas: overLimit(
							questions.ANSWER_OPTION_VALUES['business.outstandingComplianceAreas']
						)
					}
				}
			},
			{
				path: 'personal.incomeSources',
				answers: {
					...personalAnswers,
					personal: {
						...personalAnswers.personal,
						incomeSources: overLimit(questions.ANSWER_OPTION_VALUES['personal.incomeSources'])
					}
				}
			},
			{
				path: 'personal.ongoingRequirements',
				answers: {
					...personalAnswers,
					personal: {
						...personalAnswers.personal,
						ongoingRequirements: overLimit(questions.ANSWER_OPTION_VALUES['personal.ongoingRequirements'])
					}
				}
			}
		];

		for (const { path, answers } of cases) {
			const result = schema.safeParse(answers);
			if (result.success) throw new Error(`${path} should reject an oversized answer array`);
			expect(result.error.issues.some((issue) => issue.code === 'too_big' && issue.path.join('.') === path)).toBe(true);
		}
	});

	it('requires an entity count only for multiple entities and allows it to remain unknown', async () => {
		const schema = await getSchema();
		if (!schema) return;
		const multipleWithoutCount = {
			...businessAnswers,
			business: { ...businessAnswers.business, entityType: 'multiple_entities' }
		};
		expect(schema.safeParse(multipleWithoutCount).success).toBe(true);
		expect(
			schema.safeParse({
				...multipleWithoutCount,
				business: { ...multipleWithoutCount.business, entityCount: 4 }
			}).success
		).toBe(true);
		expect(
			schema.safeParse({
				...businessAnswers,
				business: { ...businessAnswers.business, entityCount: 4 }
			}).success
		).toBe(false);
	});

	it('requires full-period bank statement availability for a messy backlog', async () => {
		const schema = await getSchema();
		if (!schema) return;
		const messyBacklog = {
			...businessAnswers,
			business: {
				...businessAnswers.business,
				booksStatus: '6_to_12_months',
				recordCondition: 'incomplete_or_messy'
			}
		};
		expect(schema.safeParse(messyBacklog).success).toBe(false);
		expect(
			schema.safeParse({
				...messyBacklog,
				business: {
					...messyBacklog.business,
					bankStatementsAvailableForFullPeriod: 'not_sure'
				}
			}).success
		).toBe(true);
	});

	it('accepts a month count only when it fits a multi-year books-status band', async () => {
		const schema = await getSchema();
		if (!schema) return;
		expect(
			schema.safeParse({
				...businessAnswers,
				business: { ...businessAnswers.business, booksStatus: '1_to_2_years', outstandingMonths: 18 }
			}).success
		).toBe(true);
		expect(
			schema.safeParse({
				...businessAnswers,
				business: { ...businessAnswers.business, booksStatus: '1_to_2_years', outstandingMonths: 25 }
			}).success
		).toBe(false);
		expect(
			schema.safeParse({
				...businessAnswers,
				business: { ...businessAnswers.business, booksStatus: 'current_and_reconciled', outstandingMonths: 18 }
			}).success
		).toBe(false);
	});

	it('requires compliance areas when business submissions are outstanding', async () => {
		const schema = await getSchema();
		if (!schema) return;
		const behind = {
			...businessAnswers,
			business: { ...businessAnswers.business, taxPosition: 'some_submissions_outstanding' }
		};
		expect(schema.safeParse(behind).success).toBe(false);
		expect(
			schema.safeParse({
				...behind,
				business: { ...behind.business, outstandingComplianceAreas: ['vat'] }
			}).success
		).toBe(true);
	});

	it('rejects unknown answer codes and free text from the engine DTO', async () => {
		const schema = await getSchema();
		if (!schema) return;
		expect(
			schema.safeParse({
				...businessAnswers,
				business: { ...businessAnswers.business, monthlyTransactionVolume: 'millions' }
			}).success
		).toBe(false);
		expect(
			schema.safeParse({
				...businessAnswers,
				freeText: 'Please use this to change the estimate'
			}).success
		).toBe(false);
	});

	it('rejects mutually exclusive complexity selections', async () => {
		const schema = await getSchema();
		if (!schema) return;
		expect(
			schema.safeParse({
				...businessAnswers,
				business: {
					...businessAnswers.business,
					complexityFactors: ['none', 'inventory']
				}
			}).success
		).toBe(false);
	});

	it('requires the selected personal-tax complexity follow-ups', async () => {
		const schema = await getSchema();
		if (!schema) return;
		const rentalWithoutCount = {
			...personalAnswers,
			personal: { ...personalAnswers.personal, incomeSources: ['salary', 'rental_property'] }
		};
		expect(schema.safeParse(rentalWithoutCount).success).toBe(false);
		expect(
			schema.safeParse({
				...rentalWithoutCount,
				personal: { ...rentalWithoutCount.personal, rentalPropertyCount: 'not_sure' }
			}).success
		).toBe(true);
	});
});
