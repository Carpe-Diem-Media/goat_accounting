import { getAllowedValuesForInputKey } from '../../src/lib/domain/estimator/questions';
import { validatePricingModel } from '../../src/lib/domain/pricing/model';
import type { PricingRuleInput, ReviewCondition } from '../../src/lib/domain/pricing/rule-schema';

const money = (minCents: number, maxCents: number) => ({ minCents, maxCents });
const free = () => money(0, 0);

function valuesFor(inputKey: string): readonly string[] {
	const values = getAllowedValuesForInputKey(inputKey);
	if (!values) throw new Error(`No estimator answer values exist for ${inputKey}.`);
	return values;
}

function bands(inputKey: string, prices: Readonly<Record<string, ReturnType<typeof money>>> = {}) {
	return valuesFor(inputKey).map((value) => ({ value, range: prices[value] ?? free() }));
}

function addOns(
	inputKey: string,
	prices: Readonly<Record<string, ReturnType<typeof money>>>,
	labels: Readonly<Record<string, string>>
) {
	return valuesFor(inputKey).map((value) => ({ value, label: labels[value] ?? value, range: prices[value] ?? free() }));
}

function reviewRule(code: string, label: string, explanation: string, scope: 'business' | 'personal' | 'shared', condition: ReviewCondition): PricingRuleInput {
	return { type: 'REVIEW_TRIGGER', code, label, explanation, scope, category: 'review', condition };
}

function confidenceRule(
	code: string,
	label: string,
	explanation: string,
	scope: 'business' | 'personal',
	inputKey: string,
	options: { missingPoints?: number; when?: { inputKey: string; value: string } } = {}
): PricingRuleInput {
	const numeric = inputKey.endsWith('entityCount') || inputKey.endsWith('outstandingMonths') || inputKey.endsWith('outstandingYears');
	return {
		type: 'CONFIDENCE_WEIGHT',
		code,
		label,
		explanation,
		scope,
		category: 'score',
		inputKey,
		pointsByValue: numeric ? [] : [{ value: 'not_sure', points: 1 }],
		missingPoints: options.missingPoints ?? (numeric ? 1 : 0),
		...(options.when ? { when: options.when } : {})
	};
}

const businessRulePrices = {
	bookkeeping: {
		under_50: money(110000, 170000),
		'50_to_150': money(200000, 310000),
		'151_to_300': money(340000, 500000),
		'301_to_750': money(590000, 900000),
		over_750: money(950000, 1500000),
		not_sure: money(110000, 1500000)
	},
	payroll: {
		none: free(),
		'1_to_5': money(45000, 85000),
		'6_to_15': money(90000, 175000),
		'16_to_30': money(190000, 350000),
		'31_plus': money(190000, 350000),
		not_sure: money(45000, 350000)
	}
} as const;

const rules: PricingRuleInput[] = [
	{
		type: 'BAND_RANGE', code: 'BIZ-ENTITY-TYPE', label: 'Entity structure',
		explanation: 'No separate entity-type fee is included in this starter model.',
		scope: 'business', category: 'catchup', inputKey: 'business.entityType', bands: bands('business.entityType')
	},
	{
		type: 'PER_PERIOD_RANGE', code: 'BIZ-BOOKS-PERIODS', label: 'Historical bookkeeping catch-up',
		explanation: 'R800–R1,400 per outstanding month. An unknown duration spans zero to the schema limit of 100 months and requires review.',
		scope: 'business', category: 'catchup', inputKey: 'business.booksStatus', periodCountInputKey: 'business.outstandingMonths',
		periodLabel: 'month', unitRange: money(80000, 140000), unknownRange: money(0, 14000000),
		periodsByValue: [
			{ value: 'current_and_reconciled', minPeriods: 0, maxPeriods: 0 },
			{ value: 'less_than_3_months', minPeriods: 1, maxPeriods: 2 },
			{ value: '3_to_6_months', minPeriods: 3, maxPeriods: 6 },
			{ value: '6_to_12_months', minPeriods: 7, maxPeriods: 12 },
			{ value: '1_to_2_years', minPeriods: 13, maxPeriods: 24 },
			{ value: 'over_2_years', minPeriods: 25, maxPeriods: 100 },
			{ value: 'not_sure', minPeriods: null, maxPeriods: null }
		]
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-RECORD-CLEANUP', label: 'One-off record cleanup',
		explanation: 'Separate one-off cleanup allowance of R0–R4,000 for records that are not clean. It does not repeat per backlog month.',
		scope: 'business', category: 'catchup', inputKey: 'business.recordCondition',
		bands: bands('business.recordCondition', { clean_software: free(),
			software_needs_reconciliation: money(0, 400000), organised_spreadsheets: money(0, 400000),
			statements_and_source_docs: money(0, 400000), bank_statements_only: money(0, 400000),
			incomplete_or_messy: money(0, 400000), not_sure: money(0, 400000) })
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-VOLUME-REQUIRED', label: 'Bookkeeping volume price gate',
		explanation: 'The mandatory workload band is zero-priced; the selected bookkeeping service applies the transaction-volume fee once.',
		scope: 'business', category: 'ongoing', inputKey: 'business.monthlyTransactionVolume', bands: bands('business.monthlyTransactionVolume')
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-BOOKKEEPING-MONTHLY', label: 'Monthly bookkeeping',
		explanation: 'Monthly bookkeeping price by transaction volume. Unknown volume uses the full approved low-to-high range and requires manual review.',
		scope: 'business', category: 'ongoing', inputKey: 'business.monthlyTransactionVolume',
		when: { type: 'ARRAY_CONTAINS', inputKey: 'business.ongoingServices', value: 'monthly_bookkeeping' },
		bands: bands('business.monthlyTransactionVolume', businessRulePrices.bookkeeping)
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-ACCOUNTS-REQUIRED', label: 'Financial accounts price gate',
		explanation: 'The transaction-volume fee covers the starter bookkeeping estimate. No separate account-count fee is added.',
		scope: 'business', category: 'ongoing', inputKey: 'business.financialAccounts', bands: bands('business.financialAccounts')
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-EMPLOYEE-REQUIRED', label: 'Payroll price gate',
		explanation: 'Employee count adds no fee unless payroll is selected.',
		scope: 'business', category: 'ongoing', inputKey: 'business.employeeCount', bands: bands('business.employeeCount')
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-PAYROLL-MONTHLY', label: 'Monthly payroll',
		explanation: 'Monthly payroll price applies only when payroll is selected. More than 30 employees uses the highest published band pending a bespoke manual quote.',
		scope: 'business', category: 'ongoing', inputKey: 'business.employeeCount',
		when: { type: 'ARRAY_CONTAINS', inputKey: 'business.ongoingServices', value: 'payroll' },
		bands: bands('business.employeeCount', businessRulePrices.payroll)
	},
	{
		type: 'BAND_RANGE', code: 'BIZ-TAX-POSITION', label: 'Compliance status price gate',
		explanation: 'Tax-position bands add no fee. Selected outstanding return types are priced once below.',
		scope: 'business', category: 'catchup', inputKey: 'business.taxPosition', bands: bands('business.taxPosition')
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'BIZ-COMPLIANCE-AREA', label: 'Outstanding compliance return',
		explanation: 'Catch-up prices are per selected return or CIPC engagement. Official filing and CIPC fees are excluded.',
		scope: 'business', category: 'catchup', inputKey: 'business.outstandingComplianceAreas',
		addOns: addOns('business.outstandingComplianceAreas', {
			company_income_tax: money(170000, 300000), personal_income_tax: free(), vat: money(45000, 85000),
			payroll: free(), cipc: money(60000, 120000), other: free()
		}, {
			company_income_tax: 'Company income tax return, per return', personal_income_tax: 'Personal tax, use the personal branch',
			vat: 'VAT201 preparation, per return', payroll: 'Payroll compliance, manual quote',
			cipc: 'CIPC assistance, excluding official fees', other: 'Other compliance, manual quote'
		})
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'BIZ-ONGOING-SERVICE', label: 'Selected ongoing business services',
		explanation: 'Annual services are shown as monthly equivalents billed evenly over 12 months. VAT assumes one return per month. The monthly bookkeeping and payroll fees are added by their selected-service bands.',
		scope: 'business', category: 'ongoing', inputKey: 'business.ongoingServices',
		addOns: addOns('business.ongoingServices', {
			monthly_bookkeeping: free(), bank_reconciliations: free(), payroll: free(), vat: money(45000, 85000),
			annual_financial_statements: money(29167, 54167), company_income_tax: money(14167, 25000),
			owner_personal_tax: free(), cipc_compliance: free(), management_reporting: money(70000, 150000),
			financial_advisory: money(120000, 260000)
		}, {
			monthly_bookkeeping: 'Monthly bookkeeping, priced by transaction volume', bank_reconciliations: 'Bank reconciliations included in bookkeeping',
			payroll: 'Payroll, priced by employee count', vat: 'VAT201 preparation, one return per month assumption',
			annual_financial_statements: 'Annual financial statements, monthly equivalent over 12 months',
			company_income_tax: 'Company income tax return, monthly equivalent over 12 months',
			owner_personal_tax: 'Owner personal tax is priced in the personal branch',
			cipc_compliance: 'CIPC recurring frequency is not set in V1; manual review required',
			management_reporting: 'Monthly management reporting', financial_advisory: 'Monthly financial advisory'
		})
	},
	{
		type: 'PER_UNIT_RANGE', code: 'BIZ-ENTITY-COUNT', label: 'Additional entity count',
		explanation: 'No automatic multiple-entity surcharge is included. Multiple entities require manual review before a final fee is confirmed.',
		scope: 'business', category: 'catchup', inputKey: 'business.entityCount', unitLabel: 'entity',
		unitRange: free(), unknownRange: free(), when: { inputKey: 'business.entityType', value: 'multiple_entities' }
	},
	{
		type: 'COMPLEXITY_SCORE', code: 'BIZ-COMPLEXITY-SCORE', label: 'Business complexity score',
		explanation: 'Complexity points do not alter the provisional fee schedule.',
		scope: 'business', category: 'score', inputKey: 'business.complexityFactors',
		pointsByValue: valuesFor('business.complexityFactors').map((value) => ({ value, points: 0 }))
	},
	confidenceRule('BIZ-BOOKS-UNCERTAINTY', 'Books-status uncertainty', 'Unknown books status reduces confidence.', 'business', 'business.booksStatus'),
	confidenceRule('BIZ-RECORD-UNCERTAINTY', 'Record-condition uncertainty', 'Unknown record condition reduces confidence.', 'business', 'business.recordCondition'),
	confidenceRule('BIZ-VOLUME-UNCERTAINTY', 'Transaction-volume uncertainty', 'Unknown transaction volume reduces confidence.', 'business', 'business.monthlyTransactionVolume'),
	confidenceRule('BIZ-ACCOUNT-UNCERTAINTY', 'Account-count uncertainty', 'Unknown account count reduces confidence.', 'business', 'business.financialAccounts'),
	confidenceRule('BIZ-EMPLOYEE-UNCERTAINTY', 'Employee-count uncertainty', 'Unknown employee count reduces confidence.', 'business', 'business.employeeCount'),
	confidenceRule('BIZ-TAX-UNCERTAINTY', 'Tax-status uncertainty', 'Unknown tax status reduces confidence.', 'business', 'business.taxPosition'),
	confidenceRule('BIZ-ENTITY-COUNT-UNCERTAINTY', 'Entity-count uncertainty', 'Unknown entity count reduces confidence.', 'business', 'business.entityCount', { when: { inputKey: 'business.entityType', value: 'multiple_entities' } }),
	confidenceRule('BIZ-BACKLOG-COUNT-UNCERTAINTY', 'Backlog-count uncertainty', 'Unknown backlog count reduces confidence.', 'business', 'business.outstandingMonths', { when: { inputKey: 'business.booksStatus', value: '1_to_2_years' } }),
	confidenceRule('BIZ-OLDER-BACKLOG-COUNT-UNCERTAINTY', 'Older backlog-count uncertainty', 'Unknown backlog count reduces confidence.', 'business', 'business.outstandingMonths', { when: { inputKey: 'business.booksStatus', value: 'over_2_years' } }),
	confidenceRule('BIZ-UNKNOWN-BACKLOG-UNCERTAINTY', 'Unknown backlog-duration uncertainty', 'Unknown backlog duration reduces confidence.', 'business', 'business.outstandingMonths', { when: { inputKey: 'business.booksStatus', value: 'not_sure' } }),
	{
		type: 'BAND_RANGE', code: 'PERSONAL-STATUS-BASE', label: 'Personal tax return',
		explanation: 'One current or one-year-outstanding return costs R750–R1,400. Multiple outstanding years are priced per year. SARS issues and unknown status require manual review.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.currentStatus',
		bands: bands('personal.currentStatus', {
			current: money(75000, 140000), one_year_outstanding: money(75000, 140000),
			multiple_years_outstanding: free(), sars_issue: free(), not_sure: free()
		})
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'PERSONAL-INCOME-SOURCE', label: 'Personal return income sources',
		explanation: 'Ranges are per return. The rental/provisional and foreign/capital-gains ranges are split across their two selected source types so the combined cases equal the owner-proposed tier without charging that tier twice.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.incomeSources',
		addOns: addOns('personal.incomeSources', {
			salary: free(), business_income: free(), rental_property: money(32500, 65000), investments: free(),
			capital_gains: money(87500, 170000), provisional_tax: money(32500, 65000), trust_distributions: free(),
			foreign_income: money(87500, 170000), crypto_assets: free(), other: free()
		}, {
			salary: 'Salary return included in the personal base tier', business_income: 'Business income, manual review',
			rental_property: 'Rental/provisional complexity increment', investments: 'Investment income, manual review',
			capital_gains: 'Foreign/capital-gains complexity increment', provisional_tax: 'Rental/provisional complexity increment',
			trust_distributions: 'Trust distributions, manual review', foreign_income: 'Foreign/capital-gains complexity increment',
			crypto_assets: 'Crypto income, manual review', other: 'Other income, manual review'
		})
	},
	{
		type: 'BAND_RANGE', code: 'PERSONAL-RENTAL-COUNT', label: 'Rental-property count price gate',
		explanation: 'The starter rental/provisional tier does not add a separate property-count fee.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.rentalPropertyCount', bands: bands('personal.rentalPropertyCount')
	},
	{
		type: 'BAND_RANGE', code: 'PERSONAL-SARS-POSITION', label: 'SARS position price gate',
		explanation: 'SARS disputes and complications require manual quotation; this band does not add an automatic fee.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.sarsPosition', bands: bands('personal.sarsPosition')
	},
	{
		type: 'PER_UNIT_RANGE', code: 'PERSONAL-OUTSTANDING-YEARS', label: 'Additional outstanding tax years',
		explanation: 'Additional outstanding years cost R750–R1,500 per year. An unknown count covers the schema range of 2–100 years and requires review.',
		scope: 'personal', category: 'catchup', inputKey: 'personal.outstandingYears', unitLabel: 'tax year',
		unitRange: money(75000, 150000), unknownRange: money(150000, 15000000),
		when: { inputKey: 'personal.currentStatus', value: 'multiple_years_outstanding' }
	},
	{
		type: 'SERVICE_ADDON_RANGE', code: 'PERSONAL-ONGOING-SERVICE', label: 'Ongoing personal tax services',
		explanation: 'Annual personal returns are shown as monthly equivalents, assuming one return per year. Provisional tax assumes two returns per year. Other unpriced ongoing support requires manual review.',
		scope: 'personal', category: 'ongoing', inputKey: 'personal.ongoingRequirements',
		addOns: addOns('personal.ongoingRequirements', {
			annual_tax_return: money(6250, 11667), provisional_tax: money(23333, 45000),
			tax_planning: free(), sars_correspondence: free(), dispute_support: free()
		}, {
			annual_tax_return: 'Annual personal return, monthly equivalent over 12 months',
			provisional_tax: 'Provisional tax, monthly equivalent for two returns per year',
			tax_planning: 'Tax planning, manual review', sars_correspondence: 'SARS correspondence, manual review',
			dispute_support: 'SARS dispute support, manual quotation'
		})
	},
	{
		type: 'COMPLEXITY_SCORE', code: 'PERSONAL-COMPLEXITY-SCORE', label: 'Personal complexity score',
		explanation: 'Complexity points do not alter the provisional fee schedule.',
		scope: 'personal', category: 'score', inputKey: 'personal.incomeSources',
		pointsByValue: valuesFor('personal.incomeSources').map((value) => ({ value, points: 0 }))
	},
	confidenceRule('PERSONAL-STATUS-UNCERTAINTY', 'Personal-status uncertainty', 'Unknown personal tax status reduces confidence.', 'personal', 'personal.currentStatus'),
	confidenceRule('PERSONAL-SARS-UNCERTAINTY', 'SARS-position uncertainty', 'Unknown SARS position reduces confidence.', 'personal', 'personal.sarsPosition'),
	confidenceRule('PERSONAL-RENTAL-COUNT-UNCERTAINTY', 'Rental-count uncertainty', 'Unknown rental-property count reduces confidence.', 'personal', 'personal.rentalPropertyCount'),
	confidenceRule('PERSONAL-FOREIGN-UNCERTAINTY', 'Foreign-income uncertainty', 'Unknown foreign-income status reduces confidence.', 'personal', 'personal.foreignIncomePresent'),
	confidenceRule('PERSONAL-CAPITAL-GAINS-UNCERTAINTY', 'Capital-gains uncertainty', 'Unknown capital-gains status reduces confidence.', 'personal', 'personal.capitalGainsOccurred'),
	confidenceRule('PERSONAL-YEAR-COUNT-UNCERTAINTY', 'Outstanding-year-count uncertainty', 'Unknown number of outstanding years reduces confidence.', 'personal', 'personal.outstandingYears', { when: { inputKey: 'personal.currentStatus', value: 'multiple_years_outstanding' } }),
	reviewRule('other_business_entity_needs_review', 'Other business entity needs review', 'This entity type has no approved automatic price.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.entityType', value: 'other_not_sure' }),
	reviewRule('multiple_entities_require_review', 'Multiple entities require review', 'Multiple entities are not automatically priced in this starter schedule.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.entityType', value: 'multiple_entities' }),
	reviewRule('multiple_entities_without_count', 'Entity count needs review', 'The number of entities is missing.', 'business', { type: 'MULTIPLE_ENTITIES_WITHOUT_COUNT' }),
	reviewRule('unresolved_multi_year_backlog', 'Backlog duration needs review', 'The number of outstanding months is missing for a multi-year backlog.', 'business', { type: 'UNRESOLVED_MULTI_YEAR_BACKLOG' }),
	reviewRule('multi_year_incomplete_records', 'Multi-year incomplete records need review', 'Incomplete records across multiple years need professional review.', 'business', { type: 'MULTI_YEAR_INCOMPLETE_RECORDS' }),
	reviewRule('incomplete_records_without_full_statements', 'Missing statements need review', 'Incomplete records without full-period bank statements need professional review.', 'business', { type: 'INCOMPLETE_RECORDS_WITHOUT_FULL_STATEMENTS' }),
	reviewRule('business_sars_issue', 'Business SARS issue needs review', 'Business tax or SARS issues require a manual quotation.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.taxPosition', value: 'sars_issue' }),
	reviewRule('multiple_compliance_periods_need_review', 'Multiple outstanding tax periods need review', 'The questionnaire identifies multiple outstanding tax periods but does not collect their count. Review and quote each selected return type.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.taxPosition', value: 'multiple_periods_outstanding' }),
	reviewRule('high_transaction_volume', 'High transaction volume needs review', 'More than 750 monthly transactions require manual review.', 'business', { type: 'HIGH_VOLUME_SELECTED' }),
	reviewRule('unknown_volume_with_major_backlog', 'Unknown volume with backlog needs review', 'Unknown transaction volume combined with a substantial backlog requires manual review.', 'business', { type: 'UNKNOWN_VOLUME_WITH_MAJOR_BACKLOG' }),
	reviewRule('unknown_monthly_volume', 'Unknown monthly volume needs review', 'The wide transaction-volume range requires manual review.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.monthlyTransactionVolume', value: 'not_sure' }),
	reviewRule('unpriceable_complexity', 'Unpriceable complexity needs review', 'Unspecified business complexity requires manual review.', 'business', { type: 'UNPRICEABLE_COMPLEXITY_SELECTED' }),
	reviewRule('payroll_over_30_needs_quote', 'Payroll over 30 employees needs a quote', 'The displayed top-band amount is indicative only; a bespoke payroll quote is required.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.employeeCount', value: '31_plus' }),
	reviewRule('unknown_employee_count_needs_review', 'Unknown employee count needs review', 'Payroll cannot be priced confidently without an employee count.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.employeeCount', value: 'not_sure' }),
	reviewRule('trust_structures_need_review', 'Trust structures need review', 'Trust structures require professional review.', 'business', { type: 'ARRAY_CONTAINS', inputKey: 'business.complexityFactors', value: 'trust_structures' }),
	reviewRule('five_or_more_entities_need_review', 'Five or more entities need review', 'Five or more entities require manual review.', 'business', { type: 'NUMERIC_AT_LEAST', inputKey: 'business.entityCount', value: 5 }),
	reviewRule('urgent_deadline', 'Urgent deadline needs review', 'Urgent or missed deadlines should be reviewed; urgency does not change the price.', 'shared', { type: 'ANSWER_IN', inputKey: 'urgency', values: ['within_14_days', 'deadline_missed'] }),
	reviewRule('large_bookkeeping_backlog_needs_review', 'Large bookkeeping backlog needs review', 'Six or more outstanding months require manual review.', 'business', { type: 'ANSWER_IN', inputKey: 'business.booksStatus', values: ['6_to_12_months', '1_to_2_years', 'over_2_years'] }),
	reviewRule('unknown_bookkeeping_backlog_needs_review', 'Unknown backlog duration needs review', 'An unknown backlog duration uses a wide range and requires manual review.', 'business', { type: 'ANSWER_EQUALS', inputKey: 'business.booksStatus', value: 'not_sure' }),
	reviewRule('record_cleanup_needs_review', 'Record condition needs review', 'Bank-only, incomplete or unknown records require professional review.', 'business', { type: 'ANSWER_IN', inputKey: 'business.recordCondition', values: ['bank_statements_only', 'incomplete_or_messy', 'not_sure'] }),
	reviewRule('unpriced_personal_compliance_needs_review', 'Personal tax compliance needs review', 'Personal tax compliance inside a business-only estimate uses the personal tax branch or a manual quotation.', 'business', { type: 'ARRAY_CONTAINS', inputKey: 'business.outstandingComplianceAreas', value: 'personal_income_tax' }),
	reviewRule('unpriced_payroll_compliance_needs_review', 'Historical payroll compliance needs review', 'No historical payroll compliance price is approved.', 'business', { type: 'ARRAY_CONTAINS', inputKey: 'business.outstandingComplianceAreas', value: 'payroll' }),
	reviewRule('other_compliance_needs_review', 'Other compliance needs review', 'No automatic fee is approved for other compliance work.', 'business', { type: 'ARRAY_CONTAINS', inputKey: 'business.outstandingComplianceAreas', value: 'other' }),
	reviewRule('cipc_recurring_scope_needs_review', 'CIPC recurring scope needs review', 'The CIPC amount is per engagement; no recurring billing interval is approved.', 'business', { type: 'ARRAY_CONTAINS', inputKey: 'business.ongoingServices', value: 'cipc_compliance' }),
	reviewRule('personal_high_risk_sars_position', 'Personal SARS position needs review', 'A SARS issue, audit, objection or tax debt needs manual quotation.', 'personal', { type: 'PERSONAL_HIGH_RISK_SELECTED' }),
	reviewRule('unpriceable_personal_income_source', 'Personal income source needs review', 'An unspecified personal income source needs professional review.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'other' }),
	reviewRule('personal_business_income_needs_review', 'Personal business income needs review', 'Sole-proprietor income needs a business estimate or manual review.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'business_income' }),
	reviewRule('personal_investments_need_review', 'Investment income needs review', 'No investment-income fee is approved in the starter schedule.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'investments' }),
	reviewRule('personal_trust_income_needs_review', 'Trust distributions need review', 'Trust distributions require a manual quotation.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'trust_distributions' }),
	reviewRule('personal_crypto_income_needs_review', 'Crypto income needs review', 'No automatic crypto-income fee is approved.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'crypto_assets' }),
	reviewRule('personal_foreign_income_needs_review', 'Foreign income needs review', 'Foreign income is priced indicatively and requires professional review.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'foreign_income' }),
	reviewRule('personal_capital_gains_needs_review', 'Capital gains need review', 'Capital-gains pricing is indicative and requires professional review.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'capital_gains' }),
	reviewRule('unknown_personal_status_needs_review', 'Unknown personal status needs review', 'No automatic fee is applied when personal tax status is unknown.', 'personal', { type: 'ANSWER_EQUALS', inputKey: 'personal.currentStatus', value: 'not_sure' }),
	reviewRule('unknown_personal_sars_position_needs_review', 'Unknown SARS position needs review', 'No automatic fee is applied when SARS status is unknown.', 'personal', { type: 'ANSWER_EQUALS', inputKey: 'personal.sarsPosition', value: 'not_sure' }),
	reviewRule('complex_rental_count_needs_review', 'Rental-property count needs review', 'Four or more rental properties or an unknown count need review.', 'personal', { type: 'ANSWER_IN', inputKey: 'personal.rentalPropertyCount', values: ['4_plus', 'not_sure'] }),
	reviewRule('unpriced_personal_ongoing_support_needs_review', 'Personal ongoing support needs review', 'Tax planning, SARS correspondence and dispute support have no automatic monthly price.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.ongoingRequirements', value: 'tax_planning' }),
	reviewRule('sars_correspondence_needs_review', 'SARS correspondence needs review', 'SARS correspondence is manually quoted.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.ongoingRequirements', value: 'sars_correspondence' }),
	reviewRule('dispute_support_needs_review', 'SARS dispute support needs review', 'SARS dispute support is manually quoted.', 'personal', { type: 'ARRAY_CONTAINS', inputKey: 'personal.ongoingRequirements', value: 'dispute_support' })
];

export const GOAT_ACCOUNTING_STARTER_V1_DRAFT = validatePricingModel({
	id: 'c10877a6-0d58-4ea8-ae03-c5b5cf9cf023',
	version: '1.0.0',
	engineVersion: '1.0.0',
	currency: 'ZAR',
	state: 'DRAFT',
	confidenceThresholds: { highMaxPoints: 0, goodMaxPoints: 1 },
	rules
});
