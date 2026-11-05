import { describe, expect, it } from 'bun:test';
import { calculateEstimate } from '../../domain/estimator/estimate';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';

async function getPublicEstimateModule() {
	const module = await import('./get-public-estimate').catch(() => null);
	expect(module).not.toBeNull();
	return module;
}

const REF = 'c'.repeat(32);
function getBaseline() {
	const scenario = CANONICAL_PRICING_TEST_CORPUS.find((entry) => entry.id === 'simple-current-sole-proprietor');
	if (!scenario) throw new Error('Synthetic business answer fixture is required.');
	return scenario;
}
const baseline = getBaseline();
const calculation = calculateEstimate(baseline.answers, TEST_PRICING_MODEL);

function savedRow(state: 'VALID' | 'SUPERSEDED' | 'VOIDED' = 'VALID') {
	return {
		id: 'internal-database-id',
		public_ref: REF,
		calculator_type: baseline.answers.calculatorType,
		state,
		created_at: '2026-11-05T10:00:00.000Z',
		calculation_snapshot: JSON.parse(JSON.stringify(calculation)),
		catchup_min_cents: calculation.catchup.minCents,
		catchup_max_cents: calculation.catchup.maxCents,
		ongoing_min_cents: calculation.ongoing.minCents,
		ongoing_max_cents: calculation.ongoing.maxCents,
		free_text: 'private note',
		answers_snapshot: baseline.answers,
		pricing_model_id: TEST_PRICING_MODEL.id,
		pricing_model_version: TEST_PRICING_MODEL.version,
		engine_version: TEST_PRICING_MODEL.engineVersion,
		void_reason: state === 'VOIDED' ? 'internal audit note' : null
	};
}

describe('public estimate retrieval', () => {
	it('returns null for a missing or malformed public reference', async () => {
		const module = await getPublicEstimateModule();
		if (!module) return;
		let lookups = 0;
		const repository = { findByPublicRef: async () => { lookups += 1; return null; } };

		expect(await module.getPublicEstimate(REF, repository)).toBeNull();
		expect(await module.getPublicEstimate('not-a-public-ref', repository)).toBeNull();
		expect(lookups).toBe(1);
	});

	it('serves the saved snapshot while excluding private and pricing-internal fields', async () => {
		const module = await getPublicEstimateModule();
		if (!module) return;
		let lookups = 0;
		const repository = {
			findByPublicRef: async () => {
				lookups += 1;
				return savedRow();
			}
		};

		const result = await module.getPublicEstimate(REF, repository);
		if (!result) throw new Error('Saved public estimate should be returned.');
		const serialized = JSON.stringify(result);

		expect(result.publicRef).toBe(REF);
		expect(result.catchup).toMatchObject({ minCents: calculation.catchup.minCents, maxCents: calculation.catchup.maxCents });
		expect(result.ongoing).toMatchObject({ minCents: calculation.ongoing.minCents, maxCents: calculation.ongoing.maxCents });
		expect(result.confidence).toBe(calculation.confidence);
		expect(lookups).toBe(1);
		for (const forbidden of ['internal-database-id', 'private note', 'internal audit note', 'pricingModelId', 'ruleCode', 'sourceAnswers']) {
			expect(serialized).not.toContain(forbidden);
		}
	});

	it('preserves lifecycle state for VALID, SUPERSEDED, and VOIDED snapshots', async () => {
		const module = await getPublicEstimateModule();
		if (!module) return;
		for (const state of ['VALID', 'SUPERSEDED', 'VOIDED'] as const) {
			const result = await module.getPublicEstimate(REF, { findByPublicRef: async () => savedRow(state) });
			expect(result?.state).toBe(state);
		}
	});

	it('rejects a saved snapshot whose totals do not match the estimate columns', async () => {
		const module = await getPublicEstimateModule();
		if (!module) return;
		const row = { ...savedRow(), catchup_min_cents: calculation.catchup.minCents + 1 };

		await expect(module.getPublicEstimate(REF, { findByPublicRef: async () => row })).rejects.toBeInstanceOf(
			module.EstimateSnapshotIntegrityError
		);
	});
});
