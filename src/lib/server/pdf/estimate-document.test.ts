import { describe, expect, it } from 'bun:test';
import { calculateEstimate } from '../../domain/estimator/estimate';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';

async function loadDocumentModule() {
	return import('./estimate-document').catch(() => null);
}

const scenario = CANONICAL_PRICING_TEST_CORPUS.find((entry) => entry.id === 'simple-current-sole-proprietor')!;
if (!scenario || scenario.answers.calculatorType !== 'business') {
	throw new Error('Synthetic business estimate fixture is required.');
}
const businessAnswers = scenario.answers;
const savedCalculation = calculateEstimate(scenario.answers, TEST_PRICING_MODEL);

function savedRecord(
	state: 'VALID' | 'SUPERSEDED' | 'VOIDED' = 'VALID',
	answers = scenario.answers,
	publicRef = 'b'.repeat(32)
) {
	const calculation = calculateEstimate(answers, TEST_PRICING_MODEL);
	return {
		public_ref: publicRef,
		calculator_type: answers.calculatorType,
		state,
		created_at: '2026-11-05T10:00:00.000Z',
		pricing_model_version: TEST_PRICING_MODEL.version,
		engine_version: TEST_PRICING_MODEL.engineVersion,
		answers_snapshot: answers,
		calculation_snapshot: JSON.parse(JSON.stringify(calculation)),
		catchup_min_cents: calculation.catchup.minCents,
		catchup_max_cents: calculation.catchup.maxCents,
		ongoing_min_cents: calculation.ongoing.minCents,
		ongoing_max_cents: calculation.ongoing.maxCents,
		free_text: 'private note must never enter a customer document',
		void_reason: state === 'VOIDED' ? 'internal correction note' : null
	};
}

describe('estimate PDF document projection', () => {
	it('uses saved values and maps only canonical customer-safe assumptions', async () => {
		const module = await loadDocumentModule();
		expect(module).not.toBeNull();
		if (!module) return;

		const model = module.toEstimateDocumentModel(savedRecord());
		const serialized = JSON.stringify(model);

		expect(model.publicRef).toBe('b'.repeat(32));
		expect(model.catchup.minCents).toBe(savedCalculation.catchup.minCents);
		expect(model.catchup.maxCents).toBe(savedCalculation.catchup.maxCents);
		expect(model.ongoing.minCents).toBe(savedCalculation.ongoing.minCents);
		expect(model.ongoing.maxCents).toBe(savedCalculation.ongoing.maxCents);
		expect(model.pricingModelVersion).toBe(TEST_PRICING_MODEL.version);
		expect(model.engineVersion).toBe(TEST_PRICING_MODEL.engineVersion);
		expect(model.assumptions.some((entry) => entry.value === 'Sole proprietor')).toBe(true);
		expect(model.assumptions.every((entry) => entry.label.length <= 80 && entry.value.length <= 180)).toBe(true);
		expect(serialized).not.toContain('private note');
		expect(serialized).not.toContain('internal correction note');
		expect(serialized).not.toContain('complexityScores');
	});

	it('maps saved personal and combined assumptions to customer-safe labels', async () => {
		const module = await loadDocumentModule();
		expect(module).not.toBeNull();
		if (!module) return;
		const personalScenario = CANONICAL_PRICING_TEST_CORPUS.find((entry) => entry.id === 'rental-and-provisional-tax')!;
		if (!personalScenario || personalScenario.answers.calculatorType !== 'personal') {
			throw new Error('Synthetic personal estimate fixture is required.');
		}
		const personalModel = module.toEstimateDocumentModel(savedRecord('VALID', personalScenario.answers, 'f'.repeat(32)));
		const combinedAnswers = {
			calculatorType: 'both' as const,
			urgency: 'within_30_days' as const,
			business: businessAnswers.business,
			personal: personalScenario.answers.personal
		};
		const combinedModel = module.toEstimateDocumentModel(savedRecord('VALID', combinedAnswers, 'd'.repeat(32)));

		expect(personalModel.assumptions).toContainEqual({ label: 'Rental properties', value: '2 to 3 properties' });
		expect(personalModel.assumptions).toContainEqual({ label: 'Income or activity sources', value: 'Rental property; Provisional tax' });
		expect(combinedModel.calculatorType).toBe('both');
		expect(combinedModel.assumptions.some((entry) => entry.label === 'Business type')).toBe(true);
		expect(combinedModel.assumptions.some((entry) => entry.label === 'Personal tax status')).toBe(true);
	});

	it('caps multi-selection assumptions from the saved answer snapshot', async () => {
		const module = await loadDocumentModule();
		expect(module).not.toBeNull();
		if (!module) return;
		const ongoingServices: typeof businessAnswers.business.ongoingServices = [
			'monthly_bookkeeping', 'bank_reconciliations', 'payroll', 'vat', 'annual_financial_statements',
			'company_income_tax', 'owner_personal_tax', 'cipc_compliance', 'management_reporting', 'financial_advisory'
		];
		const answers = {
			...businessAnswers,
			business: { ...businessAnswers.business, ongoingServices }
		};
		const model = module.toEstimateDocumentModel(savedRecord('VALID', answers, '9'.repeat(32)));
		const services = model.assumptions.find((entry) => entry.label === 'Ongoing services');

		expect(services).toBeDefined();
		expect(services!.value.length).toBeLessThanOrEqual(180);
		expect(services!.value.endsWith('...')).toBe(true);
	});

	it('preserves the saved voided state without exposing its internal reason', async () => {
		const module = await loadDocumentModule();
		expect(module).not.toBeNull();
		if (!module) return;

		const model = module.toEstimateDocumentModel(savedRecord('VOIDED'));

		expect(model.state).toBe('VOIDED');
		expect(JSON.stringify(model)).not.toContain('internal correction note');
	});

	it('rejects corrupt answer snapshots and never recalculates or reads active pricing', async () => {
		const module = await loadDocumentModule();
		expect(module).not.toBeNull();
		if (!module) return;

		expect(() => module.toEstimateDocumentModel({ ...savedRecord(), answers_snapshot: { freeText: 'unsafe' } })).toThrow();
		const source = await Bun.file(new URL('./estimate-document.ts', import.meta.url)).text();
		expect(source).not.toContain('calculateEstimate');
		expect(source).not.toContain('getActivePricingModel');
	});

	it('uses a narrow database projection that excludes free text and internal identifiers', async () => {
		const module = await loadDocumentModule();
		expect(module).not.toBeNull();
		if (!module) return;
		let selectedColumns = '';
		let lookupRef = '';
		const query = {
			select(columns: string) { selectedColumns = columns; return this; },
			eq(column: string, value: string) { expect(column).toBe('public_ref'); lookupRef = value; return this; },
			maybeSingle: async () => ({ data: savedRecord(), error: null })
		};
		const client = { from: (table: string) => { expect(table).toBe('estimates'); return query; } };

		const row = await module.createEstimateDocumentRepository(client as never).findDocumentByPublicRef('b'.repeat(32));

		expect(row?.public_ref).toBe('b'.repeat(32));
		expect(lookupRef).toBe('b'.repeat(32));
		expect(selectedColumns).toContain('answers_snapshot');
		expect(selectedColumns).toContain('calculation_snapshot');
		for (const forbidden of ['free_text', 'void_reason', 'pricing_model_id', 'id']) {
			expect(selectedColumns).not.toContain(forbidden);
		}
	});
});
