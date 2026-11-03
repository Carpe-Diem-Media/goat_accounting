import { CanonicalEstimatorAnswersSchema, type CanonicalEstimatorAnswers } from '../estimator/answer-schema';
import { validatePricingModel } from './model';
import type { MoneyRange, PricingRuleInput } from './rule-schema';

export const NON_PRODUCTION_PRICING_FIXTURE_NOTICE =
	'This test-only synthetic cents fixture is not approved for production pricing and must never be shown as a live quote.';

const range = (minCents: number, maxCents: number): MoneyRange => ({ minCents, maxCents });

const businessEntityBands = [
	{ value: 'sole_proprietor', range: range(0, 0) },
	{ value: 'pty_ltd', range: range(10, 20) },
	{ value: 'partnership', range: range(15, 30) },
	{ value: 'trust', range: range(25, 50) },
	{ value: 'non_profit', range: range(10, 20) },
	{ value: 'multiple_entities', range: range(20, 40) },
	{ value: 'other_not_sure', range: range(10, 100) }
];

const recordConditionBands = [
	{ value: 'clean_software', range: range(0, 0) },
	{ value: 'software_needs_reconciliation', range: range(10, 25) },
	{ value: 'organised_spreadsheets', range: range(20, 40) },
	{ value: 'statements_and_source_docs', range: range(30, 60) },
	{ value: 'bank_statements_only', range: range(50, 100) },
	{ value: 'incomplete_or_messy', range: range(75, 150) },
	{ value: 'not_sure', range: range(30, 120) }
];

const transactionVolumeBands = [
	{ value: 'under_50', range: range(10, 20) },
	{ value: '50_to_150', range: range(20, 40) },
	{ value: '151_to_300', range: range(30, 60) },
	{ value: '301_to_750', range: range(40, 80) },
	{ value: 'over_750', range: range(80, 160) },
	{ value: 'not_sure', range: range(10, 160) }
];

const accountBands = [
	{ value: 'one', range: range(0, 10) },
	{ value: '2_to_3', range: range(10, 20) },
	{ value: '4_to_6', range: range(20, 30) },
	{ value: '7_plus', range: range(30, 50) },
	{ value: 'not_sure', range: range(10, 40) }
];

const employeeBands = [
	{ value: 'none', range: range(0, 0) },
	{ value: '1_to_5', range: range(10, 20) },
	{ value: '6_to_15', range: range(20, 40) },
	{ value: '16_to_30', range: range(40, 80) },
	{ value: '31_plus', range: range(80, 160) },
	{ value: 'not_sure', range: range(10, 100) }
];

const complianceBands = [
	{ value: 'all_current', range: range(0, 0) },
	{ value: 'some_submissions_outstanding', range: range(25, 50) },
	{ value: 'multiple_periods_outstanding', range: range(50, 100) },
	{ value: 'sars_issue', range: range(100, 200) },
	{ value: 'not_sure', range: range(25, 150) }
];

const businessServiceAddons = [
	{ value: 'monthly_bookkeeping', label: 'Monthly bookkeeping/accounting', range: range(30, 50) },
	{ value: 'bank_reconciliations', label: 'Bank reconciliations', range: range(5, 10) },
	{ value: 'payroll', label: 'Payroll', range: range(10, 20) },
	{ value: 'vat', label: 'VAT', range: range(5, 15) },
	{ value: 'annual_financial_statements', label: 'Annual financial statements', range: range(5, 10) },
	{ value: 'company_income_tax', label: 'Company income tax', range: range(5, 10) },
	{ value: 'owner_personal_tax', label: 'Personal tax for owner/director', range: range(5, 10) },
	{ value: 'cipc_compliance', label: 'CIPC/company compliance', range: range(5, 10) },
	{ value: 'management_reporting', label: 'Monthly/quarterly management reporting', range: range(15, 25) },
	{ value: 'financial_advisory', label: 'Financial management/advisory', range: range(20, 40) }
];

const personalStatusBands = [
	{ value: 'current', range: range(0, 0) },
	{ value: 'one_year_outstanding', range: range(20, 30) },
	{ value: 'multiple_years_outstanding', range: range(40, 80) },
	{ value: 'sars_issue', range: range(100, 200) },
	{ value: 'not_sure', range: range(20, 100) }
];

const personalIncomeAddons = [
	{ value: 'salary', label: 'Salary/remuneration', range: range(0, 0) },
	{ value: 'business_income', label: 'Sole-proprietor/business income', range: range(10, 20) },
	{ value: 'rental_property', label: 'Rental property', range: range(10, 20) },
	{ value: 'investments', label: 'Investments/dividends/interest', range: range(5, 10) },
	{ value: 'capital_gains', label: 'Capital gains/disposals', range: range(15, 30) },
	{ value: 'provisional_tax', label: 'Provisional tax', range: range(5, 10) },
	{ value: 'trust_distributions', label: 'Trust distributions', range: range(20, 40) },
	{ value: 'foreign_income', label: 'Foreign income/assets', range: range(20, 50) },
	{ value: 'crypto_assets', label: 'Cryptocurrency/digital assets', range: range(20, 50) },
	{ value: 'other', label: 'Other income/activity', range: range(30, 100) }
];

const personalSarsBands = [
	{ value: 'normal_filing', range: range(0, 0) },
	{ value: 'verification_query', range: range(10, 20) },
	{ value: 'audit', range: range(50, 100) },
	{ value: 'objection_appeal', range: range(100, 250) },
	{ value: 'tax_debt', range: range(50, 150) },
	{ value: 'not_sure', range: range(10, 200) }
];

const personalRentalCountBands = [
	{ value: 'one', range: range(0, 0) },
	{ value: '2_to_3', range: range(10, 20) },
	{ value: '4_plus', range: range(20, 50) },
	{ value: 'not_sure', range: range(10, 100) }
];

const personalOngoingAddons = [
	{ value: 'annual_tax_return', label: 'Annual personal tax return', range: range(10, 20) },
	{ value: 'provisional_tax', label: 'Provisional tax', range: range(5, 10) },
	{ value: 'tax_planning', label: 'Tax planning', range: range(10, 25) },
	{ value: 'sars_correspondence', label: 'SARS correspondence', range: range(10, 25) },
	{ value: 'dispute_support', label: 'Dispute/objection support', range: range(25, 60) }
];

const complexityPoints = [
	{ value: 'inventory', points: 3 },
	{ value: 'ecommerce_payment_gateways', points: 2 },
	{ value: 'imports_exports', points: 2 },
	{ value: 'foreign_currencies', points: 2 },
	{ value: 'multiple_branches', points: 2 },
	{ value: 'multiple_entities', points: 3 },
	{ value: 'construction_project_accounting', points: 3 },
	{ value: 'rental_portfolio', points: 2 },
	{ value: 'trust_structures', points: 3 },
	{ value: 'manufacturing', points: 3 },
	{ value: 'none', points: 0 },
	{ value: 'not_sure', points: 1 }
];

const personalComplexityPoints = [
	{ value: 'salary', points: 0 },
	{ value: 'business_income', points: 2 },
	{ value: 'rental_property', points: 2 },
	{ value: 'investments', points: 1 },
	{ value: 'capital_gains', points: 2 },
	{ value: 'provisional_tax', points: 1 },
	{ value: 'trust_distributions', points: 3 },
	{ value: 'foreign_income', points: 3 },
	{ value: 'crypto_assets', points: 3 },
	{ value: 'other', points: 2 }
];

const rules: PricingRuleInput[] = [
	{
		type: 'FIXED_RANGE', code: 'BIZ-BASE-CATCHUP', label: 'Business setup and handover', explanation: 'Synthetic test fixture base for business catch-up.',
		scope: 'business', category: 'catchup', range: range(50, 100)
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-ENTITY-TYPE', label: 'Entity structure', explanation: 'Synthetic test fixture range by entity structure.',
		scope: 'business', category: 'catchup', inputKey: 'business.entityType', bands: businessEntityBands
	},
	{
		type: 'PER_PERIOD_RANGE', code: 'BIZ-BOOKS-PERIODS', label: 'Historical bookkeeping periods', explanation: 'Synthetic test fixture amount per outstanding bookkeeping period.',
		scope: 'business', category: 'catchup', inputKey: 'business.booksStatus', periodCountInputKey: 'business.outstandingMonths', periodLabel: 'month',
		periodsByValue: [
			{ value: 'current_and_reconciled', minPeriods: 0, maxPeriods: 0 },
			{ value: 'less_than_3_months', minPeriods: 1, maxPeriods: 2 },
			{ value: '3_to_6_months', minPeriods: 3, maxPeriods: 6 },
			{ value: '6_to_12_months', minPeriods: 7, maxPeriods: 12 },
			{ value: '1_to_2_years', minPeriods: 13, maxPeriods: 24 },
			{ value: 'over_2_years', minPeriods: 25, maxPeriods: 100 },
			{ value: 'not_sure', minPeriods: null, maxPeriods: null }
		], unitRange: range(5, 10), unknownRange: range(20, 100)
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-RECORD-CONDITION', label: 'Record cleanup', explanation: 'Synthetic test fixture cleanup range by record condition.',
		scope: 'business', category: 'catchup', inputKey: 'business.recordCondition', bands: recordConditionBands
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-TRANSACTION-VOLUME', label: 'Monthly bookkeeping workload', explanation: 'Synthetic test fixture ongoing workload range by transaction-volume band.',
		scope: 'business', category: 'ongoing', inputKey: 'business.monthlyTransactionVolume', bands: transactionVolumeBands
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-FINANCIAL-ACCOUNTS', label: 'Financial account reconciliation', explanation: 'Synthetic test fixture reconciliation range by account band.',
		scope: 'business', category: 'ongoing', inputKey: 'business.financialAccounts', bands: accountBands
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-EMPLOYEE-COUNT', label: 'Payroll workload', explanation: 'Synthetic test fixture payroll range by employee band.',
		scope: 'business', category: 'ongoing', inputKey: 'business.employeeCount', bands: employeeBands
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-PAYROLL-CATCHUP', label: 'Historical payroll compliance', explanation: 'Synthetic test fixture payroll remediation range when books are behind.',
		scope: 'business', category: 'catchup', inputKey: 'business.employeeCount',
		bands: [
			{ value: 'none', range: range(0, 0) },
			{ value: '1_to_5', range: range(20, 40) },
			{ value: '6_to_15', range: range(40, 80) },
			{ value: '16_to_30', range: range(80, 140) },
			{ value: '31_plus', range: range(160, 300) },
			{ value: 'not_sure', range: range(20, 200) }
		],
		when: {
			type: 'ANSWER_IN', inputKey: 'business.booksStatus',
			values: ['less_than_3_months', '3_to_6_months', '6_to_12_months', '1_to_2_years', 'over_2_years', 'not_sure']
		}
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-TAX-POSITION', label: 'Compliance remediation', explanation: 'Synthetic test fixture remediation range by compliance status.',
		scope: 'business', category: 'catchup', inputKey: 'business.taxPosition', bands: complianceBands
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'BIZ-COMPLIANCE-AREA', label: 'Outstanding compliance area', explanation: 'Synthetic test fixture remediation range for each selected outstanding compliance area.',
		scope: 'business', category: 'catchup', inputKey: 'business.outstandingComplianceAreas',
		addOns: [
			{ value: 'company_income_tax', label: 'Company income tax remediation', range: range(5, 10) },
			{ value: 'personal_income_tax', label: 'Personal income tax remediation', range: range(5, 10) },
			{ value: 'vat', label: 'VAT remediation', range: range(10, 20) },
			{ value: 'payroll', label: 'Payroll remediation', range: range(10, 20) },
			{ value: 'cipc', label: 'CIPC remediation', range: range(5, 10) },
			{ value: 'other', label: 'Other compliance remediation', range: range(20, 50) }
		]
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'BIZ-ONGOING-SERVICE', label: 'Selected business services', explanation: 'Synthetic test fixture range for each selected ongoing service.',
		scope: 'business', category: 'ongoing', inputKey: 'business.ongoingServices', addOns: businessServiceAddons
	},
	{
		type: 'PER_UNIT_RANGE', code: 'BIZ-ENTITY-COUNT', label: 'Additional entity workload', explanation: 'Synthetic test fixture range per additional entity.',
		scope: 'business', category: 'catchup', inputKey: 'business.entityCount', unitLabel: 'entity', unitRange: range(10, 20), unknownRange: range(20, 100),
		when: { inputKey: 'business.entityType', value: 'multiple_entities' }
	},
	{
		type: 'COMPLEXITY_SCORE', code: 'BIZ-COMPLEXITY-SCORE', label: 'Business complexity score', explanation: 'Structured points from selected business complexity factors.',
		scope: 'business', category: 'score', inputKey: 'business.complexityFactors', pointsByValue: complexityPoints
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-VOLUME-UNCERTAINTY', label: 'Volume confidence weight', explanation: 'Unknown monthly volume leaves a major workload driver unresolved.',
		scope: 'business', category: 'score', inputKey: 'business.monthlyTransactionVolume', pointsByValue: [{ value: 'not_sure', points: 2 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-RECORD-UNCERTAINTY', label: 'Record confidence weight', explanation: 'Unknown record condition reduces estimate confidence.',
		scope: 'business', category: 'score', inputKey: 'business.recordCondition', pointsByValue: [{ value: 'not_sure', points: 1 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-BOOKS-UNCERTAINTY', label: 'Backlog confidence weight', explanation: 'Unknown bookkeeping status leaves the historical workload uncertain.',
		scope: 'business', category: 'score', inputKey: 'business.booksStatus', pointsByValue: [{ value: 'not_sure', points: 1 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-ACCOUNT-UNCERTAINTY', label: 'Account confidence weight', explanation: 'Unknown account count leaves reconciliation workload less certain.',
		scope: 'business', category: 'score', inputKey: 'business.financialAccounts', pointsByValue: [{ value: 'not_sure', points: 1 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-EMPLOYEE-UNCERTAINTY', label: 'Employee confidence weight', explanation: 'Unknown employee count leaves payroll workload less certain.',
		scope: 'business', category: 'score', inputKey: 'business.employeeCount', pointsByValue: [{ value: 'not_sure', points: 1 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-TAX-UNCERTAINTY', label: 'Compliance confidence weight', explanation: 'Unknown compliance status reduces estimate confidence.',
		scope: 'business', category: 'score', inputKey: 'business.taxPosition', pointsByValue: [{ value: 'not_sure', points: 2 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-ENTITY-COUNT-UNCERTAINTY', label: 'Entity-count confidence weight', explanation: 'Unconfirmed entity count leaves multi-entity workload uncertain.',
		scope: 'business', category: 'score', inputKey: 'business.entityCount', missingPoints: 2,
		when: { inputKey: 'business.entityType', value: 'multiple_entities' }
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-PERIOD-COUNT-UNCERTAINTY', label: 'Backlog-period confidence weight', explanation: 'An unconfirmed multi-year backlog length reduces confidence.',
		scope: 'business', category: 'score', inputKey: 'business.outstandingMonths', missingPoints: 1,
		when: { inputKey: 'business.booksStatus', value: '1_to_2_years' }
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'BIZ-OLDER-PERIOD-COUNT-UNCERTAINTY', label: 'Backlog-period confidence weight', explanation: 'An unconfirmed multi-year backlog length reduces confidence.',
		scope: 'business', category: 'score', inputKey: 'business.outstandingMonths', missingPoints: 1,
		when: { inputKey: 'business.booksStatus', value: 'over_2_years' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'unknown_entity_type', label: 'Entity type needs review', explanation: 'An unknown or unsupported entity type needs a professional review.',
		scope: 'business', category: 'review', condition: { type: 'ANSWER_EQUALS', inputKey: 'business.entityType', value: 'other_not_sure' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'multiple_entities_without_count', label: 'Entity count needs confirmation', explanation: 'Multiple entities were selected without a confirmed entity count.',
		scope: 'business', category: 'review', condition: { type: 'MULTIPLE_ENTITIES_WITHOUT_COUNT' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'unresolved_multi_year_backlog', label: 'Backlog length needs confirmation', explanation: 'A multi-year bookkeeping backlog has no confirmed period count.',
		scope: 'business', category: 'review', condition: { type: 'UNRESOLVED_MULTI_YEAR_BACKLOG' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'multi_year_incomplete_records', label: 'Multi-year incomplete records need review', explanation: 'A multi-year backlog with incomplete or bank-statement-only records needs professional review.',
		scope: 'business', category: 'review', condition: { type: 'MULTI_YEAR_INCOMPLETE_RECORDS' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'incomplete_records_without_full_statements', label: 'Record availability needs review', explanation: 'Incomplete records and unavailable or uncertain full-period statements require review.',
		scope: 'business', category: 'review', condition: { type: 'INCOMPLETE_RECORDS_WITHOUT_FULL_STATEMENTS' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'high_transaction_volume', label: 'High transaction volume needs review', explanation: 'Transaction volume exceeds the supported upper band.',
		scope: 'business', category: 'review', condition: { type: 'HIGH_VOLUME_SELECTED' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'unknown_volume_with_major_backlog', label: 'Volume and backlog need review', explanation: 'Unknown transaction volume combined with a major backlog needs professional review.',
		scope: 'business', category: 'review', condition: { type: 'UNKNOWN_VOLUME_WITH_MAJOR_BACKLOG' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'unpriceable_complexity', label: 'Complexity needs review', explanation: 'The selected complexity information is not specific enough for safe automated pricing.',
		scope: 'business', category: 'review', condition: { type: 'UNPRICEABLE_COMPLEXITY_SELECTED' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'large_payroll_needs_review', label: 'Large payroll needs review', explanation: 'A payroll of 31 or more employees requires professional review.',
		scope: 'business', category: 'review', condition: { type: 'ANSWER_EQUALS', inputKey: 'business.employeeCount', value: '31_plus' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'complex_trust_needs_review', label: 'Trust structure needs review', explanation: 'Trust structures require professional review before a fixed quote.',
		scope: 'business', category: 'review', condition: { type: 'ARRAY_CONTAINS', inputKey: 'business.complexityFactors', value: 'trust_structures' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'large_entity_group_needs_review', label: 'Large entity group needs review', explanation: 'Groups of five or more entities require professional review.',
		scope: 'business', category: 'review', condition: { type: 'NUMERIC_AT_LEAST', inputKey: 'business.entityCount', value: 5 }
	},
	{
		type: 'FIXED_RANGE', code: 'PERSONAL-BASE-CATCHUP', label: 'Personal tax preparation', explanation: 'Synthetic test fixture base for personal tax catch-up.',
		scope: 'personal', category: 'catchup', range: range(10, 20)
	},
	{
		type: 'FIXED_RANGE', code: 'PERSONAL-BASE-ONGOING', label: 'Personal tax ongoing base', explanation: 'Synthetic test fixture base for recurring personal tax support.',
		scope: 'personal', category: 'ongoing', range: range(5, 10)
	},
	{
		type: 'BAND_RANGE', code: 'PERSONAL-CURRENT-STATUS', label: 'Personal return catch-up', explanation: 'Synthetic test fixture range by personal tax status.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.currentStatus', bands: personalStatusBands
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'PERSONAL-INCOME-SOURCE', label: 'Income-source preparation', explanation: 'Synthetic test fixture catch-up range for each selected income source.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.incomeSources', addOns: personalIncomeAddons
	},
	{
		type: 'BAND_RANGE', code: 'PERSONAL-RENTAL-COUNT', label: 'Rental-property count', explanation: 'Synthetic test fixture range by rental-property count.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.rentalPropertyCount', bands: personalRentalCountBands
	},
	{
		type: 'BAND_RANGE', code: 'PERSONAL-SARS-POSITION', label: 'SARS assistance', explanation: 'Synthetic test fixture range by SARS position.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.sarsPosition', bands: personalSarsBands
	},
	{
		type: 'PER_UNIT_RANGE', code: 'PERSONAL-OUTSTANDING-YEARS', label: 'Outstanding personal tax years', explanation: 'Synthetic test fixture amount per outstanding personal tax year.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.outstandingYears', unitLabel: 'tax year', unitRange: range(10, 20), unknownRange: range(20, 100),
		when: { inputKey: 'personal.currentStatus', value: 'multiple_years_outstanding' }
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'PERSONAL-ONGOING-SERVICE', label: 'Selected personal tax support', explanation: 'Synthetic test fixture range for each selected ongoing personal tax service.',
		scope: 'personal', category: 'ongoing', inputKey: 'personal.ongoingRequirements', addOns: personalOngoingAddons
	},
	{
		type: 'COMPLEXITY_SCORE', code: 'PERSONAL-COMPLEXITY-SCORE', label: 'Personal income complexity score', explanation: 'Structured points from selected personal income and activity sources.',
		scope: 'personal', category: 'score', inputKey: 'personal.incomeSources', pointsByValue: personalComplexityPoints
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'PERSONAL-STATUS-UNCERTAINTY', label: 'Personal status confidence weight', explanation: 'Unknown current tax status reduces estimate confidence.',
		scope: 'personal', category: 'score', inputKey: 'personal.currentStatus', pointsByValue: [{ value: 'not_sure', points: 2 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'PERSONAL-SARS-UNCERTAINTY', label: 'Personal SARS confidence weight', explanation: 'Unknown SARS position reduces estimate confidence.',
		scope: 'personal', category: 'score', inputKey: 'personal.sarsPosition', pointsByValue: [{ value: 'not_sure', points: 2 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'PERSONAL-RENTAL-UNCERTAINTY', label: 'Rental-property count confidence weight', explanation: 'An unknown rental-property count leaves scope less certain.',
		scope: 'personal', category: 'score', inputKey: 'personal.rentalPropertyCount', pointsByValue: [{ value: 'not_sure', points: 1 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'PERSONAL-FOREIGN-INCOME-UNCERTAINTY', label: 'Foreign-income confidence weight', explanation: 'Uncertain foreign-income details reduce estimate confidence.',
		scope: 'personal', category: 'score', inputKey: 'personal.foreignIncomePresent', pointsByValue: [{ value: 'not_sure', points: 1 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'PERSONAL-CAPITAL-GAINS-UNCERTAINTY', label: 'Capital-gains confidence weight', explanation: 'Uncertain capital-gains details reduce estimate confidence.',
		scope: 'personal', category: 'score', inputKey: 'personal.capitalGainsOccurred', pointsByValue: [{ value: 'not_sure', points: 1 }]
	},
	{
		type: 'CONFIDENCE_WEIGHT', code: 'PERSONAL-YEAR-COUNT-UNCERTAINTY', label: 'Outstanding tax-year confidence weight', explanation: 'An unconfirmed personal tax-year count reduces confidence.',
		scope: 'personal', category: 'score', inputKey: 'personal.outstandingYears', missingPoints: 1,
		when: { inputKey: 'personal.currentStatus', value: 'multiple_years_outstanding' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'personal_high_risk_sars_position', label: 'SARS position needs review', explanation: 'An audit, objection, debt or SARS issue needs professional review.',
		scope: 'personal', category: 'review', condition: { type: 'PERSONAL_HIGH_RISK_SELECTED' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'unpriceable_personal_income_source', label: 'Income source needs review', explanation: 'An unspecified personal income source needs professional review.',
		scope: 'personal', category: 'review', condition: { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'other' }
	},
	{
		type: 'REVIEW_TRIGGER', code: 'urgent_deadline', label: 'Urgent deadline needs review', explanation: 'Urgent or missed deadlines should be prioritised and reviewed by staff.',
		scope: 'shared', category: 'review', condition: { type: 'ANSWER_IN', inputKey: 'urgency', values: ['within_14_days', 'deadline_missed'] }
	}
];

export const TEST_PRICING_MODEL = validatePricingModel({
	id: 'test-only-synthetic-v1',
	version: 'test-only-1',
	engineVersion: '1.0.0',
	currency: 'ZAR',
	state: 'ACTIVE',
	confidenceThresholds: { highMaxPoints: 0, goodMaxPoints: 1 },
	rules
});

export const CANONICAL_PRICING_TEST_CORPUS = [
	{
		id: 'simple-current-sole-proprietor',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 50, maxCents: 100, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 40, maxCents: 80, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'current-pty-ltd-with-vat',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'within_3_months',
			business: {
				entityType: 'pty_ltd', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: '50_to_150', financialAccounts: '2_to_3', employeeCount: '1_to_5', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping', 'vat'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 60, maxCents: 120, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 75, maxCents: 145, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.vat'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'current-sme-ten-employees',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'pty_ltd', booksStatus: 'current_and_reconciled', recordCondition: 'software_needs_reconciliation',
				monthlyTransactionVolume: '301_to_750', financialAccounts: '4_to_6', employeeCount: '6_to_15', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping', 'payroll', 'vat'], complexityFactors: ['inventory']
			}
		}),
		expected: {
			catchup: { minCents: 70, maxCents: 145, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 125, maxCents: 235, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.payroll', 'BIZ-ONGOING-SERVICE.vat'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'six-months-behind-clean-records',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: '3_to_6_months', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 65, maxCents: 160, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CONDITION', 'BIZ-PAYROLL-CATCHUP', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 40, maxCents: 80, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'unknown-business-backlog-duration',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'not_sure', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 70, maxCents: 200, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CONDITION', 'BIZ-PAYROLL-CATCHUP', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 40, maxCents: 80, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'good', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'eighteen-months-incomplete-records',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'within_30_days',
			business: {
				entityType: 'pty_ltd', booksStatus: '1_to_2_years', outstandingMonths: 18,
				recordCondition: 'incomplete_or_messy', bankStatementsAvailableForFullPeriod: 'no',
				monthlyTransactionVolume: '151_to_300', financialAccounts: '2_to_3', employeeCount: '1_to_5',
				taxPosition: 'some_submissions_outstanding', outstandingComplianceAreas: ['vat'],
				ongoingServices: ['monthly_bookkeeping', 'vat'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 280, maxCents: 560, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CONDITION', 'BIZ-PAYROLL-CATCHUP', 'BIZ-TAX-POSITION', 'BIZ-COMPLIANCE-AREA.vat'] },
			ongoing: { minCents: 85, maxCents: 165, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.vat'] },
			confidence: 'preliminary', manualReviewRequired: true, reviewFlagCodes: ['multi_year_incomplete_records', 'incomplete_records_without_full_statements']
		}
	},
	{
		id: 'eighteen-months-incomplete-records-statements-available',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'pty_ltd', booksStatus: '1_to_2_years', outstandingMonths: 18,
				recordCondition: 'incomplete_or_messy', bankStatementsAvailableForFullPeriod: 'yes',
				monthlyTransactionVolume: '50_to_150', financialAccounts: '2_to_3', employeeCount: '1_to_5', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 245, maxCents: 490, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CONDITION', 'BIZ-PAYROLL-CATCHUP', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 70, maxCents: 130, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'preliminary', manualReviewRequired: true, reviewFlagCodes: ['multi_year_incomplete_records']
		}
	},
	{
		id: 'ecommerce-multiple-gateways',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'pty_ltd', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: '151_to_300', financialAccounts: '4_to_6', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping', 'bank_reconciliations'], complexityFactors: ['ecommerce_payment_gateways']
			}
		}),
		expected: {
			catchup: { minCents: 60, maxCents: 120, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 85, maxCents: 150, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.bank_reconciliations'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'multiple-entities',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'multiple_entities', entityCount: 3, booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: '50_to_150', financialAccounts: '2_to_3', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['multiple_entities']
			}
		}),
		expected: {
			catchup: { minCents: 100, maxCents: 200, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION', 'BIZ-ENTITY-COUNT'] },
			ongoing: { minCents: 60, maxCents: 110, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'multiple-entities-unknown-count',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'multiple_entities', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: '50_to_150', financialAccounts: '2_to_3', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['multiple_entities']
			}
		}),
		expected: {
			catchup: { minCents: 90, maxCents: 240, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION', 'BIZ-ENTITY-COUNT'] },
			ongoing: { minCents: 60, maxCents: 110, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'preliminary', manualReviewRequired: true, reviewFlagCodes: ['multiple_entities_without_count']
		}
	},
	{
		id: 'personal-salaried-taxpayer',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'personal', urgency: 'no_urgent_deadline',
			personal: {
				currentStatus: 'current', incomeSources: ['salary'], sarsPosition: 'normal_filing', ongoingRequirements: ['annual_tax_return']
			}
		}),
		expected: {
			catchup: { minCents: 10, maxCents: 20, lineItemCodes: ['PERSONAL-BASE-CATCHUP', 'PERSONAL-CURRENT-STATUS', 'PERSONAL-INCOME-SOURCE.salary', 'PERSONAL-SARS-POSITION'] },
			ongoing: { minCents: 15, maxCents: 30, lineItemCodes: ['PERSONAL-BASE-ONGOING', 'PERSONAL-ONGOING-SERVICE.annual_tax_return'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'rental-and-provisional-tax',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'personal', urgency: 'no_urgent_deadline',
			personal: {
				currentStatus: 'current', incomeSources: ['rental_property', 'provisional_tax'], rentalPropertyCount: '2_to_3',
				sarsPosition: 'normal_filing', ongoingRequirements: ['annual_tax_return', 'provisional_tax']
			}
		}),
		expected: {
			catchup: { minCents: 35, maxCents: 70, lineItemCodes: ['PERSONAL-BASE-CATCHUP', 'PERSONAL-CURRENT-STATUS', 'PERSONAL-INCOME-SOURCE.rental_property', 'PERSONAL-INCOME-SOURCE.provisional_tax', 'PERSONAL-RENTAL-COUNT', 'PERSONAL-SARS-POSITION'] },
			ongoing: { minCents: 20, maxCents: 40, lineItemCodes: ['PERSONAL-BASE-ONGOING', 'PERSONAL-ONGOING-SERVICE.annual_tax_return', 'PERSONAL-ONGOING-SERVICE.provisional_tax'] },
			confidence: 'high', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'high-risk-sars-dispute',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'personal', urgency: 'within_14_days',
			personal: {
				currentStatus: 'sars_issue', incomeSources: ['salary', 'business_income'], sarsPosition: 'objection_appeal',
				ongoingRequirements: ['annual_tax_return', 'dispute_support']
			}
		}),
		expected: {
			catchup: { minCents: 220, maxCents: 490, lineItemCodes: ['PERSONAL-BASE-CATCHUP', 'PERSONAL-CURRENT-STATUS', 'PERSONAL-INCOME-SOURCE.salary', 'PERSONAL-INCOME-SOURCE.business_income', 'PERSONAL-SARS-POSITION'] },
			ongoing: { minCents: 40, maxCents: 90, lineItemCodes: ['PERSONAL-BASE-ONGOING', 'PERSONAL-ONGOING-SERVICE.annual_tax_return', 'PERSONAL-ONGOING-SERVICE.dispute_support'] },
			confidence: 'preliminary', manualReviewRequired: true, reviewFlagCodes: ['personal_high_risk_sars_position', 'urgent_deadline']
		}
	},
	{
		id: 'unknown-transaction-volume',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'not_sure', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 50, maxCents: 100, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 40, maxCents: 220, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'preliminary', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'unknown-volume-with-major-backlog',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: '6_to_12_months', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'not_sure', financialAccounts: 'one', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 85, maxCents: 220, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-BOOKS-PERIODS', 'BIZ-RECORD-CONDITION', 'BIZ-PAYROLL-CATCHUP', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 40, maxCents: 220, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'preliminary', manualReviewRequired: true, reviewFlagCodes: ['unknown_volume_with_major_backlog']
		}
	},
	{
		id: 'moderate-uncertainty-good-confidence',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'sole_proprietor', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'under_50', financialAccounts: 'not_sure', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping'], complexityFactors: ['none']
			}
		}),
		expected: {
			catchup: { minCents: 50, maxCents: 100, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 50, maxCents: 110, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping'] },
			confidence: 'good', manualReviewRequired: false, reviewFlagCodes: []
		}
	},
	{
		id: 'high-volume-boundary',
		answers: CanonicalEstimatorAnswersSchema.parse({
			calculatorType: 'business', urgency: 'no_urgent_deadline',
			business: {
				entityType: 'pty_ltd', booksStatus: 'current_and_reconciled', recordCondition: 'clean_software',
				monthlyTransactionVolume: 'over_750', financialAccounts: '7_plus', employeeCount: 'none', taxPosition: 'all_current',
				ongoingServices: ['monthly_bookkeeping', 'bank_reconciliations'], complexityFactors: ['ecommerce_payment_gateways']
			}
		}),
		expected: {
			catchup: { minCents: 60, maxCents: 120, lineItemCodes: ['BIZ-BASE-CATCHUP', 'BIZ-ENTITY-TYPE', 'BIZ-RECORD-CONDITION', 'BIZ-TAX-POSITION'] },
			ongoing: { minCents: 145, maxCents: 270, lineItemCodes: ['BIZ-TRANSACTION-VOLUME', 'BIZ-FINANCIAL-ACCOUNTS', 'BIZ-EMPLOYEE-COUNT', 'BIZ-ONGOING-SERVICE.monthly_bookkeeping', 'BIZ-ONGOING-SERVICE.bank_reconciliations'] },
			confidence: 'preliminary', manualReviewRequired: true, reviewFlagCodes: ['high_transaction_volume']
		}
	}
] satisfies readonly {
	id: string;
	answers: CanonicalEstimatorAnswers;
	expected: {
		catchup: { minCents: number; maxCents: number; lineItemCodes: readonly string[] };
		ongoing: { minCents: number; maxCents: number; lineItemCodes: readonly string[] };
		confidence: 'high' | 'good' | 'preliminary';
		manualReviewRequired: boolean;
		reviewFlagCodes: readonly string[];
	};
}[];

export type CanonicalPricingTestScenario = (typeof CANONICAL_PRICING_TEST_CORPUS)[number];
