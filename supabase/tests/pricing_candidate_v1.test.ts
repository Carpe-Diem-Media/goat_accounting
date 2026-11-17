import { describe, expect, test } from 'bun:test';
import { CanonicalEstimatorAnswersSchema } from '../../src/lib/domain/estimator/answer-schema';
import { calculateReviewFlags } from '../../src/lib/domain/estimator/review-flags';
import { validatePricingModel } from '../../src/lib/domain/pricing/model';
import { evaluateDraftPricingRules } from '../../src/lib/domain/pricing/engine';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT } from '../pricing-candidates/goat-accounting-starter-v1';

describe('GOAT starter pricing candidate', () => {
	test('stores a validated DRAFT with the approved V1 schedule', async () => {
		const model = validatePricingModel(GOAT_ACCOUNTING_STARTER_V1_DRAFT);
		expect(model).toMatchObject({
			id: 'c10877a6-0d58-4ea8-ae03-c5b5cf9cf023',
			version: '1.0.0',
			engineVersion: '1.0.0',
			currency: 'ZAR',
			state: 'DRAFT',
			confidenceThresholds: { highMaxPoints: 0, goodMaxPoints: 1 }
		});

		const rule = (code: string) => model.rules.find((candidate) => candidate.code === code);
		const bookkeeping = rule('BIZ-BOOKKEEPING-MONTHLY');
		expect(bookkeeping?.type).toBe('BAND_RANGE');
		if (bookkeeping?.type !== 'BAND_RANGE') throw new Error('Monthly bookkeeping rule is missing.');
		expect(bookkeeping.when).toEqual({
			type: 'ARRAY_CONTAINS',
			inputKey: 'business.ongoingServices',
			value: 'monthly_bookkeeping'
		});
		expect(bookkeeping.bands).toEqual([
			{ value: 'under_50', range: { minCents: 110000, maxCents: 170000 } },
			{ value: '50_to_150', range: { minCents: 200000, maxCents: 310000 } },
			{ value: '151_to_300', range: { minCents: 340000, maxCents: 500000 } },
			{ value: '301_to_750', range: { minCents: 590000, maxCents: 900000 } },
			{ value: 'over_750', range: { minCents: 950000, maxCents: 1500000 } },
			{ value: 'not_sure', range: { minCents: 110000, maxCents: 1500000 } }
		]);

		const payroll = rule('BIZ-PAYROLL-MONTHLY');
		expect(payroll?.type).toBe('BAND_RANGE');
		if (payroll?.type !== 'BAND_RANGE') throw new Error('Payroll rule is missing.');
		expect(payroll.when).toEqual({
			type: 'ARRAY_CONTAINS',
			inputKey: 'business.ongoingServices',
			value: 'payroll'
		});
		expect(payroll.bands).toContainEqual({ value: '1_to_5', range: { minCents: 45000, maxCents: 85000 } });
		expect(payroll.bands).toContainEqual({ value: '6_to_15', range: { minCents: 90000, maxCents: 175000 } });
		expect(payroll.bands).toContainEqual({ value: '16_to_30', range: { minCents: 190000, maxCents: 350000 } });
		expect(payroll.bands).toContainEqual({ value: '31_plus', range: { minCents: 190000, maxCents: 350000 } });

		const catchup = rule('BIZ-BOOKS-PERIODS');
		expect(catchup?.type).toBe('PER_PERIOD_RANGE');
		if (catchup?.type !== 'PER_PERIOD_RANGE') throw new Error('Bookkeeping catch-up rule is missing.');
		expect(catchup.unitRange).toEqual({ minCents: 80000, maxCents: 140000 });
		expect(catchup.unknownRange).toEqual({ minCents: 0, maxCents: 14000000 });

		const urgencyPrices = model.rules.filter(
			(candidate) => candidate.type !== 'REVIEW_TRIGGER' && 'inputKey' in candidate && candidate.inputKey === 'urgency'
		);
		expect(urgencyPrices).toEqual([]);
	});

	test('covers the approved service ranges and monthly billing assumptions', () => {
		const model = GOAT_ACCOUNTING_STARTER_V1_DRAFT;
		const band = (code: string, value: string) => {
			const rule = model.rules.find((candidate) => candidate.code === code);
			if (rule?.type !== 'BAND_RANGE') throw new Error(`${code} is not a band rule.`);
			return rule.bands.find((entry) => entry.value === value)?.range;
		};
		const addon = (code: string, value: string) => {
			const rule = model.rules.find((candidate) => candidate.code === code);
			if (rule?.type !== 'SERVICE_ADDON_RANGE') throw new Error(`${code} is not an add-on rule.`);
			return rule.addOns.find((entry) => entry.value === value)?.range;
		};

		expect(addon('BIZ-ONGOING-SERVICE', 'vat')).toEqual({ minCents: 45000, maxCents: 85000 });
		expect(addon('BIZ-ONGOING-SERVICE', 'annual_financial_statements')).toEqual({ minCents: 29167, maxCents: 54167 });
		expect(addon('BIZ-ONGOING-SERVICE', 'company_income_tax')).toEqual({ minCents: 14167, maxCents: 25000 });
		expect(addon('BIZ-ONGOING-SERVICE', 'management_reporting')).toEqual({ minCents: 70000, maxCents: 150000 });
		expect(addon('BIZ-ONGOING-SERVICE', 'financial_advisory')).toEqual({ minCents: 120000, maxCents: 260000 });
		expect(addon('BIZ-COMPLIANCE-AREA', 'company_income_tax')).toEqual({ minCents: 170000, maxCents: 300000 });
		expect(addon('BIZ-COMPLIANCE-AREA', 'vat')).toEqual({ minCents: 45000, maxCents: 85000 });
		expect(addon('BIZ-COMPLIANCE-AREA', 'cipc')).toEqual({ minCents: 60000, maxCents: 120000 });
		expect(band('PERSONAL-STATUS-BASE', 'current')).toEqual({ minCents: 75000, maxCents: 140000 });
		expect(addon('PERSONAL-INCOME-SOURCE', 'rental_property')).toEqual({ minCents: 32500, maxCents: 65000 });
		expect(addon('PERSONAL-INCOME-SOURCE', 'provisional_tax')).toEqual({ minCents: 32500, maxCents: 65000 });
		expect(addon('PERSONAL-INCOME-SOURCE', 'foreign_income')).toEqual({ minCents: 87500, maxCents: 170000 });
		expect(addon('PERSONAL-INCOME-SOURCE', 'capital_gains')).toEqual({ minCents: 87500, maxCents: 170000 });
		const extraYears = model.rules.find((candidate) => candidate.code === 'PERSONAL-OUTSTANDING-YEARS');
		if (extraYears?.type !== 'PER_UNIT_RANGE') throw new Error('Outstanding-years rule is missing.');
		expect(extraYears.unitRange).toEqual({ minCents: 75000, maxCents: 150000 });
		expect(addon('PERSONAL-ONGOING-SERVICE', 'annual_tax_return')).toEqual({ minCents: 6250, maxCents: 11667 });
		expect(addon('PERSONAL-ONGOING-SERVICE', 'provisional_tax')).toEqual({ minCents: 23333, maxCents: 45000 });

		const businessCompliance = model.rules.find((candidate) => candidate.code === 'BIZ-ONGOING-SERVICE');
		if (businessCompliance?.type !== 'SERVICE_ADDON_RANGE') throw new Error('Business service rule is missing.');
		expect(businessCompliance.explanation).toContain('one return per month');
		expect(businessCompliance.explanation).toContain('over 12 months');
	});

	test('urgency changes review flags but never changes the estimate amount', () => {
		const answers = CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business',
			urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		});
		const urgentAnswers = CanonicalEstimatorAnswersSchema.parse({ ...answers, urgency: 'within_14_days' });
		const estimate = evaluateDraftPricingRules(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT);
		const urgentEstimate = evaluateDraftPricingRules(urgentAnswers, GOAT_ACCOUNTING_STARTER_V1_DRAFT);

		expect(urgentEstimate.catchup).toMatchObject({ minCents: estimate.catchup.minCents, maxCents: estimate.catchup.maxCents });
		expect(urgentEstimate.ongoing).toMatchObject({ minCents: estimate.ongoing.minCents, maxCents: estimate.ongoing.maxCents });
		expect(calculateReviewFlags(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT).map(({ code }) => code)).not.toContain('urgent_deadline');
		expect(calculateReviewFlags(urgentAnswers, GOAT_ACCOUNTING_STARTER_V1_DRAFT).map(({ code }) => code)).toContain('urgent_deadline');
	});

	test('requires a manual count for multiple outstanding compliance periods', () => {
		const answers = CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'pty_ltd', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none',
				taxPosition: 'multiple_periods_outstanding', outstandingComplianceAreas: ['vat'],
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		});
		expect(calculateReviewFlags(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT).map(({ code }) => code)).toContain('multiple_compliance_periods_need_review');
	});

	test('adds payroll only when selected and keeps combined personal tiers within their provisional ranges', () => {
		const business = CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: '6_to_15', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		});
		const withoutPayroll = evaluateDraftPricingRules(business, GOAT_ACCOUNTING_STARTER_V1_DRAFT);
		const withPayroll = evaluateDraftPricingRules(
			CanonicalEstimatorAnswersSchema.parse({ ...business, business: { ...business.business, ongoingServices: ['monthly_bookkeeping', 'payroll'] } }),
			GOAT_ACCOUNTING_STARTER_V1_DRAFT
		);
		expect(withoutPayroll.ongoing).toMatchObject({ minCents: 110000, maxCents: 170000 });
		expect(withPayroll.ongoing).toMatchObject({ minCents: 200000, maxCents: 345000 });
		expect(withoutPayroll.ongoing.lineItems.map(({ code }) => code)).not.toContain('BIZ-PAYROLL-MONTHLY');
		expect(withPayroll.ongoing.lineItems.map(({ code }) => code)).toContain('BIZ-PAYROLL-MONTHLY');

		const personal = CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'personal', urgency: 'no_urgent_deadline',
			personal: {
				currentStatus: 'current', incomeSources: ['salary', 'foreign_income', 'capital_gains'],
				foreignIncomePresent: 'yes', capitalGainsOccurred: 'yes', sarsPosition: 'normal_filing',
				ongoingRequirements: ['annual_tax_return']
			}
		});
		const personalEstimate = evaluateDraftPricingRules(personal, GOAT_ACCOUNTING_STARTER_V1_DRAFT);
		expect(personalEstimate.catchup).toMatchObject({ minCents: 250000, maxCents: 480000 });
		expect(personalEstimate.ongoing).toMatchObject({ minCents: 6250, maxCents: 11667 });
	});
});
