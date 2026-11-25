import { CanonicalEstimatorAnswersSchema } from '../../src/lib/domain/estimator/answer-schema';
import { CANONICAL_PRICING_TEST_CORPUS } from '../../src/lib/domain/pricing/test-corpus';

export const GOAT_STARTER_V1_MANIFEST_REVISION = 'goat-starter-v1-owner-provisional';

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
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'high'
	),
	'current-pty-ltd-with-vat': expected(
		[0, 0], [200000, 310000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping', 'biz_ongoing_service.vat'],
		'preliminary', ['vat_filing_frequency_needs_review']
	),
	'current-sme-ten-employees': expected(
		[0, 400000], [680000, 1075000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_payroll_monthly', 'biz_ongoing_service.monthly_bookkeeping', 'biz_ongoing_service.payroll', 'biz_ongoing_service.vat'],
		'preliminary', ['vat_filing_frequency_needs_review']
	),
	'six-months-behind-clean-records': expected(
		[240000, 840000], [110000, 170000],
		['biz_entity_type', 'biz_books_periods', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'high'
	),
	'unknown-business-backlog-duration': expected(
		[0, 14000000], [110000, 170000],
		['biz_entity_type', 'biz_books_periods', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'preliminary', ['unknown_bookkeeping_backlog_needs_review']
	),
	'eighteen-months-incomplete-records': expected(
		[1485000, 3005000], [340000, 500000],
		['biz_entity_type', 'biz_books_periods', 'biz_record_cleanup', 'biz_tax_position', 'biz_compliance_area.vat', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping', 'biz_ongoing_service.vat'],
		'preliminary', ['multi_year_incomplete_records', 'incomplete_records_without_full_statements', 'large_bookkeeping_backlog_needs_review', 'record_cleanup_needs_review', 'vat_filing_frequency_needs_review']
	),
	'eighteen-months-incomplete-records-statements-available': expected(
		[1440000, 2920000], [200000, 310000],
		['biz_entity_type', 'biz_books_periods', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'preliminary', ['multi_year_incomplete_records', 'large_bookkeeping_backlog_needs_review', 'record_cleanup_needs_review']
	),
	'ecommerce-multiple-gateways': expected(
		[0, 0], [340000, 500000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping', 'biz_ongoing_service.bank_reconciliations'],
		'high'
	),
	'multiple-entities': expected(
		[0, 0], [200000, 310000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_entity_count', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'preliminary', ['multiple_entities_require_review']
	),
	'multiple-entities-unknown-count': expected(
		[0, 0], [200000, 310000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_entity_count', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'preliminary', ['multiple_entities_require_review', 'multiple_entities_without_count']
	),
	'personal-salaried-taxpayer': expected(
		[75000, 140000], [6250, 11667],
		['personal_status_base', 'personal_income_source.salary', 'personal_sars_position', 'personal_ongoing_service.annual_tax_return'],
		'high'
	),
	'rental-and-provisional-tax': expected(
		[140000, 270000], [29583, 56667],
		['personal_status_base', 'personal_income_source.rental_property', 'personal_income_source.provisional_tax', 'personal_rental_count', 'personal_sars_position', 'personal_ongoing_service.annual_tax_return', 'personal_ongoing_service.provisional_tax'],
		'high'
	),
	'high-risk-sars-dispute': expected(
		[0, 0], [6250, 11667],
		['personal_status_base', 'personal_income_source.salary', 'personal_income_source.business_income', 'personal_sars_position', 'personal_ongoing_service.annual_tax_return', 'personal_ongoing_service.dispute_support'],
		'preliminary', ['personal_high_risk_sars_position', 'personal_business_income_needs_review', 'urgent_deadline', 'dispute_support_needs_review']
	),
	'unknown-transaction-volume': expected(
		[0, 0], [110000, 1500000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'preliminary', ['unknown_monthly_volume']
	),
	'unknown-volume-with-major-backlog': expected(
		[560000, 1680000], [110000, 1500000],
		['biz_entity_type', 'biz_books_periods', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'preliminary', ['unknown_volume_with_major_backlog', 'unknown_monthly_volume', 'large_bookkeeping_backlog_needs_review']
	),
	'moderate-uncertainty-good-confidence': expected(
		[0, 0], [110000, 170000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping'],
		'good'
	),
	'high-volume-boundary': expected(
		[0, 0], [950000, 1500000],
		['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping', 'biz_ongoing_service.bank_reconciliations'],
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

export const GOAT_STARTER_V1_SCENARIOS = [
	...CANONICAL_PRICING_TEST_CORPUS.map(({ id, answers }) => ({ id, answers, expected: expectedById[id] })),
	...([
		['monthly', 245000, 395000],
		['two_monthly', 222500, 352500],
		['unknown', 200000, 310000]
	] as const).map(([frequency, minCents, maxCents]) => {
		const source = CANONICAL_PRICING_TEST_CORPUS.find(({ id }) => id === 'current-pty-ltd-with-vat')!.answers;
		if (source.calculatorType !== 'business') throw new Error('Expected business fixture');
		const baseline = expectedById['current-pty-ltd-with-vat'];
		return {
			id: `vat-filing-${frequency}`,
			answers: { ...source, business: { ...source.business, vatFilingFrequency: frequency } },
			expected: expected([0, 0], [minCents, maxCents], [...baseline.ruleCodes, 'biz_vat_monthly_equivalent'], frequency === 'unknown' ? 'preliminary' : 'high',
				frequency === 'unknown' ? ['vat_filing_frequency_needs_review'] : [])
		};
	}),
	{
		id: 'combined-business-and-personal',
		answers: combinedAnswers,
		expected: expected(
			[75000, 140000], [116250, 181667],
			['biz_entity_type', 'biz_record_cleanup', 'biz_tax_position', 'personal_status_base', 'personal_income_source.salary', 'personal_sars_position', 'biz_volume_required', 'biz_bookkeeping_monthly', 'biz_accounts_required', 'biz_employee_required', 'biz_ongoing_service.monthly_bookkeeping', 'personal_ongoing_service.annual_tax_return'],
			'high'
		)
	}
];
