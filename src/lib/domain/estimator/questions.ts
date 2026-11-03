export type EstimatorQuestionId =
	| 'B1'
	| 'B2'
	| 'B3'
	| 'B4'
	| 'B5'
	| 'B6'
	| 'B7'
	| 'B8'
	| 'COMPLEXITY'
	| 'URGENCY'
	| 'P1'
	| 'P2'
	| 'P3'
	| 'P4'
	| 'P5';

export type EstimatorOption = Readonly<{ value: string; label: string }>;

export type EstimatorQuestion = Readonly<{
	id: EstimatorQuestionId;
	question: string;
	type: 'single' | 'multi';
	options: readonly EstimatorOption[];
	helperText?: string;
	followUps?: readonly string[];
}>;

const options = <const T extends readonly (readonly [string, string])[]>(
	items: T
): readonly EstimatorOption[] => items.map(([value, label]) => ({ value, label }));

export const BUSINESS_QUESTIONS = [
	{
		id: 'B1',
		question: 'What type of business/entity is this?',
		type: 'single',
		options: options([
			['sole_proprietor', 'Sole proprietor'],
			['pty_ltd', 'Pty Ltd / Close Corporation'],
			['partnership', 'Partnership'],
			['trust', 'Trust'],
			['non_profit', 'Non-profit / PBO / NPO'],
			['multiple_entities', 'Multiple entities'],
			['other_not_sure', 'Other / not sure']
		]),
		followUps: ['entityCount']
	},
	{
		id: 'B2',
		question: 'How up to date are your books/accounting records?',
		type: 'single',
		options: options([
			['current_and_reconciled', 'Fully current and reconciled'],
			['less_than_3_months', 'Less than 3 months behind'],
			['3_to_6_months', '3–6 months behind'],
			['6_to_12_months', '6–12 months behind'],
			['1_to_2_years', '1–2 years behind'],
			['over_2_years', 'More than 2 years behind'],
			['not_sure', 'I’m not sure']
		]),
		followUps: ['outstandingMonths']
	},
	{
		id: 'B3',
		question: 'What condition are the existing records in?',
		type: 'single',
		options: options([
			['clean_software', 'Accounting software is current/reasonably clean'],
			['software_needs_reconciliation', 'Accounting software exists but needs correction/reconciliation'],
			['organised_spreadsheets', 'Mainly organised spreadsheets'],
			['statements_and_source_docs', 'Bank statements plus invoices/receipts'],
			['bank_statements_only', 'Bank statements only'],
			['incomplete_or_messy', 'Records are incomplete or messy'],
			['not_sure', 'I’m not sure']
		]),
		followUps: ['bankStatementsAvailableForFullPeriod']
	},
	{
		id: 'B4',
		question: 'Roughly how many transactions go through the business each month?',
		type: 'single',
		helperText: 'Think bank transactions, card payments, customer receipts and supplier payments.',
		options: options([
			['under_50', 'Under 50'],
			['50_to_150', '50–150'],
			['151_to_300', '151–300'],
			['301_to_750', '301–750'],
			['over_750', 'More than 750'],
			['not_sure', 'I’m not sure']
		])
	},
	{
		id: 'B5',
		question: 'How many financial accounts need to be reconciled?',
		type: 'single',
		helperText:
			'Include bank accounts, business credit cards and payment accounts/gateways that require separate reconciliation.',
		options: options([
			['one', '1'],
			['2_to_3', '2–3'],
			['4_to_6', '4–6'],
			['7_plus', '7+'],
			['not_sure', 'I’m not sure']
		])
	},
	{
		id: 'B6',
		question: 'How many employees are on payroll?',
		type: 'single',
		options: options([
			['none', 'None'],
			['1_to_5', '1–5'],
			['6_to_15', '6–15'],
			['16_to_30', '16–30'],
			['31_plus', '31+'],
			['not_sure', 'I’m not sure']
		])
	},
	{
		id: 'B7',
		question: 'Which best describes your current tax/compliance position?',
		type: 'single',
		options: options([
			['all_current', 'Everything is submitted/current'],
			['some_submissions_outstanding', 'Some submissions are outstanding'],
			['multiple_periods_outstanding', 'Multiple periods/years are outstanding'],
			['sars_issue', 'SARS has raised penalties, verification, audit or another issue'],
			['not_sure', 'I’m not sure']
		]),
		followUps: ['outstandingComplianceAreas']
	},
	{
		id: 'B8',
		question: 'What would you like Goat Accounting to handle going forward?',
		type: 'multi',
		options: options([
			['monthly_bookkeeping', 'Monthly bookkeeping/accounting'],
			['bank_reconciliations', 'Bank reconciliations'],
			['payroll', 'Payroll'],
			['vat', 'VAT'],
			['annual_financial_statements', 'Annual financial statements'],
			['company_income_tax', 'Company income tax'],
			['owner_personal_tax', 'Personal tax for owner/director'],
			['cipc_compliance', 'CIPC/company compliance'],
			['management_reporting', 'Monthly/quarterly management reporting'],
			['financial_advisory', 'Financial management/advisory']
		])
	}
] as const satisfies readonly EstimatorQuestion[];

export const BUSINESS_COMPLEXITY_QUESTION = {
	id: 'COMPLEXITY',
	question: 'Does your business involve any of the following?',
	type: 'multi',
	options: options([
		['inventory', 'Stock/inventory'],
		['ecommerce_payment_gateways', 'Ecommerce or payment gateways'],
		['imports_exports', 'Imports/exports'],
		['foreign_currencies', 'Foreign currencies'],
		['multiple_branches', 'Multiple branches'],
		['multiple_entities', 'Multiple companies/entities'],
		['construction_project_accounting', 'Construction/project accounting'],
		['rental_portfolio', 'Rental properties/property portfolio'],
		['trust_structures', 'Trust structures'],
		['manufacturing', 'Manufacturing'],
		['none', 'None of these'],
		['not_sure', 'I’m not sure']
	]),
	followUps: ['entityCount', 'paymentPlatformCount', 'inventorySystem', 'branchCount']
} as const satisfies EstimatorQuestion;

export const URGENCY_QUESTION = {
	id: 'URGENCY',
	question: 'How soon do you need help?',
	type: 'single',
	options: options([
		['no_urgent_deadline', 'No urgent deadline'],
		['within_3_months', 'Within 3 months'],
		['within_30_days', 'Within 30 days'],
		['within_14_days', 'Within 14 days'],
		['deadline_missed', 'Urgent / deadline already missed']
	])
} as const satisfies EstimatorQuestion;

export const PERSONAL_QUESTIONS = [
	{
		id: 'P1',
		question: 'What best describes your current tax status?',
		type: 'single',
		options: options([
			['current', 'Current'],
			['one_year_outstanding', 'One tax year outstanding'],
			['multiple_years_outstanding', 'Multiple tax years outstanding'],
			['sars_issue', 'SARS issue/verification/audit/penalties'],
			['not_sure', 'I’m not sure']
		]),
		followUps: ['outstandingYears']
	},
	{
		id: 'P2',
		question: 'Which income or activity sources apply to you?',
		type: 'multi',
		options: options([
			['salary', 'Salary/remuneration'],
			['business_income', 'Sole-proprietor/business income'],
			['rental_property', 'Rental property'],
			['investments', 'Investments/dividends/interest'],
			['capital_gains', 'Capital gains/disposals'],
			['provisional_tax', 'Provisional tax'],
			['trust_distributions', 'Trust distributions'],
			['foreign_income', 'Foreign income/assets'],
			['crypto_assets', 'Cryptocurrency/digital assets'],
			['other', 'Other']
		])
	},
	{
		id: 'P3',
		question: 'A few details about the selected income or outstanding years',
		type: 'multi',
		options: [],
		followUps: [
			'rentalPropertyCount',
			'foreignIncomePresent',
			'capitalGainsOccurred',
			'outstandingYears'
		]
	},
	{
		id: 'P4',
		question: 'Which best describes your SARS position?',
		type: 'single',
		options: options([
			['normal_filing', 'Normal filing only'],
			['verification_query', 'Verification/query'],
			['audit', 'Audit'],
			['objection_appeal', 'Objection/appeal likely'],
			['tax_debt', 'Tax debt/payment arrangement'],
			['not_sure', 'Not sure']
		])
	},
	{
		id: 'P5',
		question: 'What ongoing personal tax support do you need?',
		type: 'multi',
		options: options([
			['annual_tax_return', 'Annual personal tax return'],
			['provisional_tax', 'Provisional tax'],
			['tax_planning', 'Tax planning'],
			['sars_correspondence', 'SARS correspondence'],
			['dispute_support', 'Dispute/objection support']
		])
	}
] as const satisfies readonly EstimatorQuestion[];

export const ESTIMATOR_QUESTION_IDS = [
	'B1',
	'B2',
	'B3',
	'B4',
	'B5',
	'B6',
	'B7',
	'B8',
	'COMPLEXITY',
	'URGENCY',
	'P1',
	'P2',
	'P3',
	'P4',
	'P5'
] as const satisfies readonly EstimatorQuestionId[];

export const ESTIMATOR_QUESTION_CATALOG = [
	...BUSINESS_QUESTIONS,
	BUSINESS_COMPLEXITY_QUESTION,
	URGENCY_QUESTION,
	...PERSONAL_QUESTIONS
] as const satisfies readonly EstimatorQuestion[];

export const ANSWER_OPTION_VALUES = {
	'urgency': ['no_urgent_deadline', 'within_3_months', 'within_30_days', 'within_14_days', 'deadline_missed'],
	'business.entityType': ['sole_proprietor', 'pty_ltd', 'partnership', 'trust', 'non_profit', 'multiple_entities', 'other_not_sure'],
	'business.booksStatus': ['current_and_reconciled', 'less_than_3_months', '3_to_6_months', '6_to_12_months', '1_to_2_years', 'over_2_years', 'not_sure'],
	'business.recordCondition': ['clean_software', 'software_needs_reconciliation', 'organised_spreadsheets', 'statements_and_source_docs', 'bank_statements_only', 'incomplete_or_messy', 'not_sure'],
	'business.monthlyTransactionVolume': ['under_50', '50_to_150', '151_to_300', '301_to_750', 'over_750', 'not_sure'],
	'business.financialAccounts': ['one', '2_to_3', '4_to_6', '7_plus', 'not_sure'],
	'business.employeeCount': ['none', '1_to_5', '6_to_15', '16_to_30', '31_plus', 'not_sure'],
	'business.taxPosition': ['all_current', 'some_submissions_outstanding', 'multiple_periods_outstanding', 'sars_issue', 'not_sure'],
	'business.ongoingServices': ['monthly_bookkeeping', 'bank_reconciliations', 'payroll', 'vat', 'annual_financial_statements', 'company_income_tax', 'owner_personal_tax', 'cipc_compliance', 'management_reporting', 'financial_advisory'],
	'business.complexityFactors': ['inventory', 'ecommerce_payment_gateways', 'imports_exports', 'foreign_currencies', 'multiple_branches', 'multiple_entities', 'construction_project_accounting', 'rental_portfolio', 'trust_structures', 'manufacturing', 'none', 'not_sure'],
	'business.bankStatementsAvailableForFullPeriod': ['yes', 'no', 'not_sure'],
	'business.outstandingComplianceAreas': ['company_income_tax', 'personal_income_tax', 'vat', 'payroll', 'cipc', 'other'],
	'personal.currentStatus': ['current', 'one_year_outstanding', 'multiple_years_outstanding', 'sars_issue', 'not_sure'],
	'personal.incomeSources': ['salary', 'business_income', 'rental_property', 'investments', 'capital_gains', 'provisional_tax', 'trust_distributions', 'foreign_income', 'crypto_assets', 'other'],
	'personal.sarsPosition': ['normal_filing', 'verification_query', 'audit', 'objection_appeal', 'tax_debt', 'not_sure'],
	'personal.ongoingRequirements': ['annual_tax_return', 'provisional_tax', 'tax_planning', 'sars_correspondence', 'dispute_support'],
	'personal.rentalPropertyCount': ['one', '2_to_3', '4_plus', 'not_sure'],
	'personal.foreignIncomePresent': ['yes', 'no', 'not_sure'],
	'personal.capitalGainsOccurred': ['yes', 'no', 'not_sure']
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type PricingInputKey = keyof typeof ANSWER_OPTION_VALUES | 'business.entityCount' | 'business.outstandingMonths' | 'personal.outstandingYears';

export const PRICING_INPUT_KEYS = [
	'urgency',
	'business.entityType',
	'business.booksStatus',
	'business.recordCondition',
	'business.monthlyTransactionVolume',
	'business.financialAccounts',
	'business.employeeCount',
	'business.taxPosition',
	'business.ongoingServices',
	'business.complexityFactors',
	'business.bankStatementsAvailableForFullPeriod',
	'business.outstandingComplianceAreas',
	'personal.currentStatus',
	'personal.incomeSources',
	'personal.sarsPosition',
	'personal.ongoingRequirements',
	'personal.rentalPropertyCount',
	'personal.foreignIncomePresent',
	'personal.capitalGainsOccurred',
	'business.entityCount',
	'business.outstandingMonths',
	'personal.outstandingYears'
] as const satisfies readonly [PricingInputKey, ...PricingInputKey[]];

export const getAllowedValuesForInputKey = (inputKey: string): readonly string[] | undefined =>
	ANSWER_OPTION_VALUES[inputKey as keyof typeof ANSWER_OPTION_VALUES];
