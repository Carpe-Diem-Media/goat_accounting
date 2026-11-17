import { describe, expect, test } from 'bun:test';
import { CanonicalEstimatorAnswersSchema } from '../../src/lib/domain/estimator/answer-schema';
import { CANONICAL_PRICING_TEST_CORPUS } from '../../src/lib/domain/pricing/test-corpus';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT } from '../pricing-candidates/goat-accounting-starter-v1';
import { fingerprintDraft, runPricingCorpus } from '../../src/lib/server/pricing/run-pricing-corpus';

type ExpectedCandidateResult = {
	catchup: { minCents: number; maxCents: number };
	ongoing: { minCents: number; maxCents: number };
	ruleCodes: string[];
	confidence: 'high' | 'good' | 'preliminary';
	manualReviewRequired: boolean;
	reviewFlagCodes: string[];
};

const expected = (
	catchup: [number, number],
	ongoing: [number, number],
	ruleCodes: string[],
	confidence: ExpectedCandidateResult['confidence'],
	reviewFlagCodes: string[] = []
): ExpectedCandidateResult => ({
	catchup: { minCents: catchup[0], maxCents: catchup[1] },
	ongoing: { minCents: ongoing[0], maxCents: ongoing[1] },
	ruleCodes: [...new Set(ruleCodes.map((code) => code.split('.')[0]))],
	confidence,
	manualReviewRequired: reviewFlagCodes.length > 0,
	reviewFlagCodes
});

// These amounts were summed by hand from the owner-approved ranges in the candidate README.
// Scenario inputs reuse only the canonical synthetic answer cases, never their fixture prices.
const expectedById: Record<string, ExpectedCandidateResult> = {
	'simple-current-sole-proprietor': expected(
		[0, 0], [110000, 170000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'high'
	),
	'current-pty-ltd-with-vat': expected(
		[0, 0], [245000, 395000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.vat'],
		'high'
	),
	'current-sme-ten-employees': expected(
		[0, 400000], [725000, 1160000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-PAYROLL-MONTHLY', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.payroll', 'BIZ-ONGOING-SERVICE.vat'],
		'high'
	),
	'six-months-behind-clean-records': expected(
		[240000, 840000], [110000, 170000],
		['BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'high'
	),
	'unknown-business-backlog-duration': expected(
		[0, 14000000], [110000, 170000],
		['BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'preliminary', ['unknown_bookkeeping_backlog_needs_review']
	),
	'eighteen-months-incomplete-records': expected(
		[1485000, 3005000], [385000, 585000],
		['BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-COMPLIANCE-AREA.vat', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.vat'],
		'preliminary', ['multi_year_incomplete_records', 'incomplete_records_without_full_statements', 'large_bookkeeping_backlog_needs_review', 'record_cleanup_needs_review']
	),
	'eighteen-months-incomplete-records-statements-available': expected(
		[1440000, 2920000], [200000, 310000],
		['BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'preliminary', ['multi_year_incomplete_records', 'large_bookkeeping_backlog_needs_review', 'record_cleanup_needs_review']
	),
	'ecommerce-multiple-gateways': expected(
		[0, 0], [340000, 500000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.bank_reconciliations'],
		'high'
	),
	'multiple-entities': expected(
		[0, 0], [200000, 310000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-ENTITY-COUNT', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'preliminary', ['multiple_entities_require_review']
	),
	'multiple-entities-unknown-count': expected(
		[0, 0], [200000, 310000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-ENTITY-COUNT', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'preliminary', ['multiple_entities_require_review', 'multiple_entities_without_count']
	),
	'personal-salaried-taxpayer': expected(
		[75000, 140000], [6250, 11667],
		['PERSONAL-STATUS-BASE', 'PERSONAL-INCOME-SOURCE.salary', 'PERSONAL-SARS-POSITION', 'PERSONAL-ONGOING-SERVICE.annual_tax_return'],
		'high'
	),
	'rental-and-provisional-tax': expected(
		[140000, 270000], [29583, 56667],
		['PERSONAL-STATUS-BASE', 'PERSONAL-INCOME-SOURCE.rental_property', 'PERSONAL-INCOME-SOURCE.provisional_tax', 'PERSONAL-RENTAL-COUNT', 'PERSONAL-SARS-POSITION', 'PERSONAL-ONGOING-SERVICE.annual_tax_return', 'PERSONAL-ONGOING-SERVICE.provisional_tax'],
		'high'
	),
	'high-risk-sars-dispute': expected(
		[0, 0], [6250, 11667],
		['PERSONAL-STATUS-BASE', 'PERSONAL-INCOME-SOURCE.salary', 'PERSONAL-INCOME-SOURCE.business_income', 'PERSONAL-SARS-POSITION', 'PERSONAL-ONGOING-SERVICE.annual_tax_return', 'PERSONAL-ONGOING-SERVICE.dispute_support'],
		'preliminary', ['personal_high_risk_sars_position', 'personal_business_income_needs_review', 'urgent_deadline', 'dispute_support_needs_review']
	),
	'unknown-transaction-volume': expected(
		[0, 0], [110000, 1500000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'preliminary', ['unknown_monthly_volume']
	),
	'unknown-volume-with-major-backlog': expected(
		[560000, 1680000], [110000, 1500000],
		['BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'preliminary', ['unknown_volume_with_major_backlog', 'unknown_monthly_volume', 'large_bookkeeping_backlog_needs_review']
	),
	'moderate-uncertainty-good-confidence': expected(
		[0, 0], [110000, 170000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'],
		'good'
	),
	'high-volume-boundary': expected(
		[0, 0], [950000, 1500000],
		['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.bank_reconciliations'],
		'preliminary', ['high_transaction_volume']
	)
};

const combinedAnswers = CanonicalEstimatorAnswersSchema.parse({
	calculatorType: 'both',
	urgency: 'no_urgent_deadline',
	business: {
		entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
		monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
		ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
	},
	personal: { currentStatus: 'current', incomeSources: ['salary'], sarsPosition: 'normal_filing', ongoingRequirements: ['annual_tax_return'] }
});

describe('GOAT starter pricing acceptance expectations', () => {
	test('passes all 17 required named scenarios plus combined estimate coverage', async () => {
		const scenarios = [
			...CANONICAL_PRICING_TEST_CORPUS.map(({ id, answers }) => ({ id, answers, expected: expectedById[id] })),
			{
				id: 'combined-business-and-personal',
				answers: combinedAnswers,
				expected: expected(
					[75000, 140000], [116250, 181667],
					['BIZ-ENTITY-TYPE', 'BIZ-RECORD-CLEANUP', 'BIZ-TAX-POSITION', 'PERSONAL-STATUS-BASE', 'PERSONAL-INCOME-SOURCE.salary', 'PERSONAL-SARS-POSITION', 'BIZ-VOLUME-REQUIRED', 'BIZ-BOOKKEEPING-MONTHLY', 'BIZ-ACCOUNTS-REQUIRED', 'BIZ-EMPLOYEE-REQUIRED', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'PERSONAL-ONGOING-SERVICE.annual_tax_return'],
					'high'
				)
			}
		];
		expect(CANONICAL_PRICING_TEST_CORPUS).toHaveLength(17);
		expect(scenarios).toHaveLength(18);
		expect(scenarios.every((scenario) => scenario.expected !== undefined)).toBe(true);

		const definitionFingerprint = await fingerprintDraft(GOAT_ACCOUNTING_STARTER_V1_DRAFT);
		const report = await runPricingCorpus(GOAT_ACCOUNTING_STARTER_V1_DRAFT, {
			modelId: GOAT_ACCOUNTING_STARTER_V1_DRAFT.id,
			definitionFingerprint,
			revision: 'goat-starter-v1-owner-provisional',
			scenarios
		});

		expect(report.requiredScenarioCount).toBe(17);
		expect(report.scenarios.filter((scenario) => !scenario.passed).map(({ id, failures }) => ({ id, failures }))).toEqual([]);
		expect(report.passed).toBe(true);
	});
});
