import { describe, expect, it } from 'bun:test';

const loadQuestions = async () => import('./questions').catch(() => null);

describe('V1 estimator question contract', () => {
	it('publishes the canonical business, complexity, urgency and personal question IDs', () => {
		return loadQuestions().then((questions) => {
			expect(questions).not.toBeNull();
			if (!questions) return;
			expect(questions.ESTIMATOR_QUESTION_IDS).toEqual([
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
			]);
			expect(questions.ESTIMATOR_QUESTION_CATALOG.map((question) => question.id)).toEqual(
				questions.ESTIMATOR_QUESTION_IDS
			);
		});
	});

	it('encodes the exact B1-B8 answer choices and conditional questions', async () => {
		const questions = await loadQuestions();
		expect(questions).not.toBeNull();
		if (!questions) return;
		expect(questions.BUSINESS_QUESTIONS).toHaveLength(8);
		expect(questions.BUSINESS_QUESTIONS[0].options.map((option) => option.label)).toEqual([
			'Sole proprietor',
			'Pty Ltd / Close Corporation',
			'Partnership',
			'Trust',
			'Non-profit / PBO / NPO',
			'Multiple entities',
			'Other / not sure'
		]);
		expect(questions.BUSINESS_QUESTIONS[3].options.map((option) => option.label)).toEqual([
			'Under 50',
			'50–150',
			'151–300',
			'301–750',
			'More than 750',
			'I’m not sure'
		]);
			expect(questions.BUSINESS_QUESTIONS[1].options.map((option) => option.label)).toEqual([
				'Fully current and reconciled',
				'Less than 3 months behind',
				'3–6 months behind',
				'6–12 months behind',
				'1–2 years behind',
				'More than 2 years behind',
				'I’m not sure'
			]);
			expect(questions.BUSINESS_QUESTIONS[2].options.map((option) => option.label)).toEqual([
				'Accounting software is current/reasonably clean',
				'Accounting software exists but needs correction/reconciliation',
				'Mainly organised spreadsheets',
				'Bank statements plus invoices/receipts',
				'Bank statements only',
				'Records are incomplete or messy',
				'I’m not sure'
			]);
			expect(questions.BUSINESS_QUESTIONS[4].options.map((option) => option.label)).toEqual([
				'1', '2–3', '4–6', '7+', 'I’m not sure'
			]);
			expect(questions.BUSINESS_QUESTIONS[5].options.map((option) => option.label)).toEqual([
				'None', '1–5', '6–15', '16–30', '31+', 'I’m not sure'
			]);
			expect(questions.BUSINESS_QUESTIONS[6].options.map((option) => option.label)).toEqual([
				'Everything is submitted/current',
				'Some submissions are outstanding',
				'Multiple periods/years are outstanding',
				'SARS has raised penalties, verification, audit or another issue',
				'I’m not sure'
			]);
			expect(questions.BUSINESS_QUESTIONS[7].options.map((option) => option.label)).toEqual([
				'Monthly bookkeeping/accounting',
				'Bank reconciliations',
				'Payroll',
				'VAT',
				'Annual financial statements',
				'Company income tax',
				'Personal tax for owner/director',
				'CIPC/company compliance',
				'Monthly/quarterly management reporting',
				'Financial management/advisory'
			]);
		expect(questions.BUSINESS_QUESTIONS[7].options.map((option) => option.label)).toContain(
			'Financial management/advisory'
		);
		expect(questions.BUSINESS_QUESTIONS[0].followUps).toContain('entityCount');
	});

	it('keeps complexity and urgency answer choices separate from the pricing branches', async () => {
		const questions = await loadQuestions();
		expect(questions).not.toBeNull();
		if (!questions) return;
		expect(questions.BUSINESS_COMPLEXITY_QUESTION.options.map((option) => option.label)).toEqual([
			'Stock/inventory',
			'Ecommerce or payment gateways',
			'Imports/exports',
			'Foreign currencies',
			'Multiple branches',
			'Multiple companies/entities',
			'Construction/project accounting',
			'Rental properties/property portfolio',
			'Trust structures',
			'Manufacturing',
			'None of these',
			'I’m not sure'
		]);
		expect(questions.URGENCY_QUESTION.options.map((option) => option.label)).toEqual([
			'No urgent deadline',
			'Within 3 months',
			'Within 30 days',
			'Within 14 days',
			'Urgent / deadline already missed'
		]);
	});

	it('encodes P1-P5 without making free text a structured pricing question', async () => {
		const questions = await loadQuestions();
		expect(questions).not.toBeNull();
		if (!questions) return;
		expect(questions.PERSONAL_QUESTIONS).toHaveLength(5);
		expect(questions.PERSONAL_QUESTIONS[0].options.map((option) => option.label)).toEqual([
			'Current',
			'One tax year outstanding',
			'Multiple tax years outstanding',
			'SARS issue/verification/audit/penalties',
			'I’m not sure'
		]);
		expect(questions.PERSONAL_QUESTIONS[1].options.map((option) => option.label)).toEqual([
			'Salary/remuneration',
			'Sole-proprietor/business income',
			'Rental property',
			'Investments/dividends/interest',
			'Capital gains/disposals',
			'Provisional tax',
			'Trust distributions',
			'Foreign income/assets',
			'Cryptocurrency/digital assets',
			'Other'
		]);
		expect(questions.PERSONAL_QUESTIONS[3].options.map((option) => option.label)).toEqual([
			'Normal filing only',
			'Verification/query',
			'Audit',
			'Objection/appeal likely',
			'Tax debt/payment arrangement',
			'Not sure'
		]);
		expect(questions.PERSONAL_QUESTIONS[4].options.map((option) => option.label)).toEqual([
			'Annual personal tax return',
			'Provisional tax',
			'Tax planning',
			'SARS correspondence',
			'Dispute/objection support'
		]);
		expect(questions.PERSONAL_QUESTIONS[2].followUps).toEqual([
			'rentalPropertyCount',
			'foreignIncomePresent',
			'capitalGainsOccurred',
			'outstandingYears'
		]);
		expect(questions.ESTIMATOR_QUESTION_CATALOG.some((question) => question.id === 'FREE_TEXT')).toBe(false);
	});
});
