import { describe, expect, test } from 'bun:test';
import { CanonicalEstimatorAnswersSchema } from '../../src/lib/domain/estimator/answer-schema';
import { calculateConfidence } from '../../src/lib/domain/estimator/confidence';
import { calculateReviewFlags } from '../../src/lib/domain/estimator/review-flags';
import { validatePricingModel } from '../../src/lib/domain/pricing/model';
import { evaluateDraftPricingRules } from '../../src/lib/domain/pricing/engine';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT } from '../pricing-candidates/goat-accounting-starter-v1';

describe('GOAT starter pricing candidate', () => {
	test('uses rule codes accepted by the committed PostgreSQL constraint', async () => {
		const migration = await Bun.file(new URL('../migrations/20261103183011_estimator_core.sql', import.meta.url)).text();
		const constraint = migration.match(/pricing_rules_code_format\s+CHECK\s+\(code\s+~\s+'([^']+)'\)/);
		expect(constraint).not.toBeNull();
		if (!constraint) throw new Error('The committed pricing rule code constraint was not found.');

		const databasePattern = new RegExp(constraint[1]!);
		const invalidCodes = GOAT_ACCOUNTING_STARTER_V1_DRAFT.rules.map(({ code }) => code).filter((code) => !databasePattern.test(code));
		expect(invalidCodes).toEqual([]);
	});

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
		const bookkeeping = rule('biz_bookkeeping_monthly');
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

		const payroll = rule('biz_payroll_monthly');
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
		expect(payroll.bands).toContainEqual({ value: '31_plus', range: { minCents: 380000, maxCents: 650000 } });

		const catchup = rule('biz_books_periods');
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

		expect(addon('biz_ongoing_service', 'vat')).toEqual({ minCents: 0, maxCents: 0 });
		expect(addon('biz_ongoing_service', 'annual_financial_statements')).toEqual({ minCents: 29167, maxCents: 54167 });
		expect(addon('biz_ongoing_service', 'company_income_tax')).toEqual({ minCents: 14167, maxCents: 25000 });
		expect(addon('biz_ongoing_service', 'management_reporting')).toEqual({ minCents: 70000, maxCents: 150000 });
		expect(addon('biz_ongoing_service', 'financial_advisory')).toEqual({ minCents: 120000, maxCents: 260000 });
		expect(addon('biz_compliance_area', 'company_income_tax')).toEqual({ minCents: 170000, maxCents: 300000 });
		expect(addon('biz_compliance_area', 'vat')).toEqual({ minCents: 45000, maxCents: 85000 });
		expect(addon('biz_compliance_area', 'cipc')).toEqual({ minCents: 60000, maxCents: 120000 });
		expect(band('personal_status_base', 'current')).toEqual({ minCents: 75000, maxCents: 140000 });
		expect(addon('personal_income_source', 'rental_property')).toEqual({ minCents: 32500, maxCents: 65000 });
		expect(addon('personal_income_source', 'provisional_tax')).toEqual({ minCents: 32500, maxCents: 65000 });
		expect(addon('personal_income_source', 'foreign_income')).toEqual({ minCents: 87500, maxCents: 170000 });
		expect(addon('personal_income_source', 'capital_gains')).toEqual({ minCents: 87500, maxCents: 170000 });
		const extraYears = model.rules.find((candidate) => candidate.code === 'personal_outstanding_years');
		if (extraYears?.type !== 'PER_UNIT_RANGE') throw new Error('Outstanding-years rule is missing.');
		expect(extraYears.unitRange).toEqual({ minCents: 75000, maxCents: 150000 });
		expect(addon('personal_ongoing_service', 'annual_tax_return')).toEqual({ minCents: 6250, maxCents: 11667 });
		expect(addon('personal_ongoing_service', 'provisional_tax')).toEqual({ minCents: 23333, maxCents: 45000 });

		const businessCompliance = model.rules.find((candidate) => candidate.code === 'biz_ongoing_service');
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

	test('requires review for standalone bank reconciliations and uncovered owner personal tax', () => {
		const businessAnswers = (ongoingServices: string[]) => CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices, complexityFactors: ['none']
			}
		});
		const standaloneServices = [
			{ service: 'bank_reconciliations', flag: 'standalone_bank_reconciliations_needs_review' },
			{ service: 'owner_personal_tax', flag: 'uncovered_owner_personal_tax_needs_review' }
		];

		for (const { service, flag } of standaloneServices) {
			const answers = businessAnswers([service]);
			const pricing = evaluateDraftPricingRules(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT);
			const reviewFlags = calculateReviewFlags(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT);
			expect(pricing.ongoing).toMatchObject({ minCents: 0, maxCents: 0 });
			expect(reviewFlags.map(({ code }) => code)).toContain(flag);
			expect(calculateConfidence(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT, reviewFlags).confidence).toBe('preliminary');
		}

		const bookkeepingWithReconciliations = businessAnswers(['monthly_bookkeeping', 'bank_reconciliations']);
		expect(calculateReviewFlags(bookkeepingWithReconciliations, GOAT_ACCOUNTING_STARTER_V1_DRAFT).map(({ code }) => code)).not.toContain(
			'standalone_bank_reconciliations_needs_review'
		);

		const coveredOwnerTax = CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'both', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['owner_personal_tax'], complexityFactors: ['none']
			},
			personal: {
				currentStatus: 'current', incomeSources: ['salary'], sarsPosition: 'normal_filing',
				ongoingRequirements: ['annual_tax_return']
			}
		});
		expect(calculateReviewFlags(coveredOwnerTax, GOAT_ACCOUNTING_STARTER_V1_DRAFT).map(({ code }) => code)).not.toContain(
			'uncovered_owner_personal_tax_needs_review'
		);
	});

	test('requires manual review when multiple personal tax years are selected without a count', () => {
		const answers = CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'personal', urgency: 'no_urgent_deadline',
			personal: {
				currentStatus: 'multiple_years_outstanding', incomeSources: ['salary'],
				sarsPosition: 'normal_filing', ongoingRequirements: ['annual_tax_return']
			}
		});
		const reviewFlags = calculateReviewFlags(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT);
		expect(reviewFlags.map(({ code }) => code)).toContain('unknown_personal_tax_year_count_needs_review');
		expect(calculateConfidence(answers, GOAT_ACCOUNTING_STARTER_V1_DRAFT, reviewFlags).confidence).toBe('preliminary');
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
		expect(withoutPayroll.ongoing.lineItems.map(({ code }) => code)).not.toContain('biz_payroll_monthly');
		expect(withPayroll.ongoing.lineItems.map(({ code }) => code)).toContain('biz_payroll_monthly');

		const largePayroll = CanonicalEstimatorAnswersSchema.parse({
			...business,
			business: { ...business.business, employeeCount: '31_plus', ongoingServices: ['payroll'] }
		});
		const largePayrollEstimate = evaluateDraftPricingRules(largePayroll, GOAT_ACCOUNTING_STARTER_V1_DRAFT);
		expect(largePayrollEstimate.ongoing).toMatchObject({ minCents: 380000, maxCents: 650000 });
		expect(calculateReviewFlags(largePayroll, GOAT_ACCOUNTING_STARTER_V1_DRAFT).map(({ code }) => code)).toContain('payroll_over_30_needs_quote');

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
