import { describe, expect, it } from 'bun:test';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';
import { calculateEstimate, type EstimateCalculation } from '../../domain/estimator/estimate';
import type { EstimateSnapshotWrite } from '../supabase/repositories/estimates';
import type { PublicEstimateRecord } from './public-estimate';

async function getCreateEstimateModule() {
	const module = await import('./create-estimate').catch(() => null);
	expect(module).not.toBeNull();
	return module;
}

const REF = 'a'.repeat(32);
const KEY = 'K'.repeat(43);
const CREATED_AT = '2026-11-05T10:00:00.000Z';
function getBaseline() {
	const scenario = CANONICAL_PRICING_TEST_CORPUS.find((entry) => entry.id === 'simple-current-sole-proprietor');
	if (!scenario) throw new Error('Synthetic business answer fixture is required.');
	return scenario;
}
const baseline = getBaseline();

function savedRecord(): PublicEstimateRecord {
	const calculation = calculateEstimate(baseline.answers, TEST_PRICING_MODEL);
	return {
		public_ref: REF,
		calculator_type: baseline.answers.calculatorType,
		state: 'VALID',
		created_at: CREATED_AT,
		pricing_model_version: calculation.pricingModelVersion,
		engine_version: calculation.engineVersion,
		calculation_snapshot: JSON.parse(JSON.stringify(calculation)),
		catchup_min_cents: calculation.catchup.minCents,
		catchup_max_cents: calculation.catchup.maxCents,
		ongoing_min_cents: calculation.ongoing.minCents,
		ongoing_max_cents: calculation.ongoing.maxCents
	};
}

function dependencies(
	activeModel: typeof TEST_PRICING_MODEL | null = TEST_PRICING_MODEL,
	existingEstimate: PublicEstimateRecord | null = null
) {
	const persisted: unknown[] = [];
	let activeModelReads = 0;
	let idempotencyLookups = 0;
	return {
		persisted,
		get activeModelReads() {
			return activeModelReads;
		},
		get idempotencyLookups() {
			return idempotencyLookups;
		},
	findByIdempotencyKey: async () => {
			idempotencyLookups += 1;
			return existingEstimate;
		},
		getActivePricingModel: async () => {
			activeModelReads += 1;
			return activeModel;
		},
		persistEstimate: async (draft: EstimateSnapshotWrite): Promise<PublicEstimateRecord> => {
			persisted.push(draft);
			const calculation = draft.calculation_snapshot as unknown as EstimateCalculation;
			return {
				public_ref: REF,
				calculator_type: draft.calculator_type,
				state: 'VALID',
				created_at: CREATED_AT,
				pricing_model_version: calculation.pricingModelVersion,
				engine_version: calculation.engineVersion,
				calculation_snapshot: JSON.parse(JSON.stringify(calculation)),
				catchup_min_cents: calculation.catchup.minCents,
				catchup_max_cents: calculation.catchup.maxCents,
				ongoing_min_cents: calculation.ongoing.minCents,
				ongoing_max_cents: calculation.ongoing.maxCents
			};
		}
	};
}

const validInput = {
	calculatorType: baseline.answers.calculatorType,
	answers: baseline.answers,
	idempotencyKey: KEY
};

describe('authoritative estimate creation', () => {
	it('loads one active model, calculates on the server, and persists a complete snapshot', async () => {
		const module = await getCreateEstimateModule();
		if (!module) return;
		const deps = dependencies();

		const result = await module.createEstimate(validInput, deps);

		expect(deps.activeModelReads).toBe(1);
		expect(deps.persisted).toHaveLength(1);
		expect(result.publicRef).toBe(REF);
		expect(result.catchup.minCents).toBe(baseline.expected.catchup.minCents);
		expect(result.ongoing.maxCents).toBe(baseline.expected.ongoing.maxCents);
		expect(result.state).toBe('VALID');
		expect(result).not.toHaveProperty('pricingModelId');
		const snapshot = deps.persisted[0] as EstimateSnapshotWrite;
		expect(snapshot.calculator_type).toBe(baseline.answers.calculatorType);
		expect(snapshot.pricing_model_id).toBe(TEST_PRICING_MODEL.id);
		expect(snapshot.pricing_model_version).toBe(TEST_PRICING_MODEL.version);
		expect(snapshot.engine_version).toBe(TEST_PRICING_MODEL.engineVersion);
		expect(snapshot.answers_snapshot).toEqual(baseline.answers);
		expect(snapshot.calculation_snapshot).toMatchObject({
			catchup: { minCents: baseline.expected.catchup.minCents, maxCents: baseline.expected.catchup.maxCents },
			ongoing: { minCents: baseline.expected.ongoing.minCents, maxCents: baseline.expected.ongoing.maxCents }
		});
	});

	it('rejects browser totals, pricing identifiers, and calculation overrides before reading pricing', async () => {
		const module = await getCreateEstimateModule();
		if (!module) return;
		const deps = dependencies();

		await expect(
			module.createEstimate(
				{
					...validInput,
					pricingModelId: 'forged-model',
					calculationOverride: { catchup: { minCents: 1, maxCents: 1 } },
					catchupTotal: 1
				},
				deps
			)
		).rejects.toBeInstanceOf(module.CreateEstimateValidationError);
		expect(deps.activeModelReads).toBe(0);
		expect(deps.persisted).toHaveLength(0);
	});

	it('fails closed without an active model and performs no estimate insert', async () => {
		const module = await getCreateEstimateModule();
		if (!module) return;
		const deps = dependencies(null);

		await expect(module.createEstimate(validInput, deps)).rejects.toBeInstanceOf(module.NoActivePricingModelError);
		expect(deps.activeModelReads).toBe(1);
		expect(deps.persisted).toHaveLength(0);
	});

	it('returns a matching saved retry before requiring the current active model', async () => {
		const module = await getCreateEstimateModule();
		if (!module) return;
		const deps = dependencies(null, savedRecord());

		const result = await module.createEstimate(validInput, deps);

		expect(result.publicRef).toBe(REF);
		expect(deps.idempotencyLookups).toBe(1);
		expect(deps.activeModelReads).toBe(0);
		expect(deps.persisted).toHaveLength(0);
	});

	it('keeps free text outside pricing and caps it at 2,000 characters', async () => {
		const module = await getCreateEstimateModule();
		if (!module) return;
		const deps = dependencies();
		const note = 'context '.repeat(20);

		await module.createEstimate({ ...validInput, freeText: note }, deps);
		expect((deps.persisted[0] as { free_text: string }).free_text).toBe(note);

		await expect(
			module.createEstimate({ ...validInput, freeText: 'x'.repeat(2001) }, dependencies())
		).rejects.toBeInstanceOf(module.CreateEstimateValidationError);
	});

	it('rejects a calculator type that differs from the canonical answers', async () => {
		const module = await getCreateEstimateModule();
		if (!module) return;
		const deps = dependencies();

		await expect(
			module.createEstimate({ ...validInput, calculatorType: 'personal' }, deps)
		).rejects.toBeInstanceOf(module.CreateEstimateValidationError);
		expect(deps.activeModelReads).toBe(0);
	});
});
