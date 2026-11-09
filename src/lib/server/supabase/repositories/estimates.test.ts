import { describe, expect, it } from 'bun:test';
import type { EstimateSnapshotWrite } from './estimates';

async function getEstimatesRepositoryModule() {
	const [repository, errors] = await Promise.all([
		import('./estimates').catch(() => null),
		import('../../estimator/errors').catch(() => null)
	]);
	expect(repository).not.toBeNull();
	expect(errors).not.toBeNull();
	return repository && errors ? { ...repository, ...errors } : null;
}

type QueryCall = { table: string; action: string; value?: unknown; column?: string; selection?: string };

function clientWithResponses(responses: Array<{ data: unknown; error: unknown }>) {
	const calls: QueryCall[] = [];
	let responseIndex = 0;
	class Query implements PromiseLike<{ data: unknown; error: unknown }> {
		constructor(private readonly table: string) {}
		insert(value: unknown) { calls.push({ table: this.table, action: 'insert', value }); return this; }
		select(selection: string) { calls.push({ table: this.table, action: 'select', selection }); return this; }
		eq(column: string, value: unknown) { calls.push({ table: this.table, action: 'eq', column, value }); return this; }
		single() { return Promise.resolve(responses[responseIndex++] ?? { data: null, error: null }); }
		maybeSingle() { return Promise.resolve(responses[responseIndex++] ?? { data: null, error: null }); }
		then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
			onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		): PromiseLike<TResult1 | TResult2> {
			return Promise.resolve(responses[responseIndex++] ?? { data: null, error: null }).then(onfulfilled, onrejected);
		}
	}
	return {
		calls,
		client: { from: (table: string) => new Query(table) } as never
	};
}

const HASH = 'a'.repeat(64);
const FINGERPRINT = 'b'.repeat(64);
const CREATED_AT = '2026-11-05T10:00:00.000Z';

function write(): EstimateSnapshotWrite {
	return {
		calculator_type: 'business',
		pricing_model_id: 'model-id',
		pricing_model_version: '1.0.0',
		engine_version: '1.0.0',
		answers_snapshot: { calculatorType: 'business', answers: {} },
		calculation_snapshot: { catchup: { minCents: 0, maxCents: 0, lineItems: [] }, ongoing: { minCents: 0, maxCents: 0, lineItems: [] } },
		catchup_min_cents: 0,
		catchup_max_cents: 0,
		ongoing_min_cents: 0,
		ongoing_max_cents: 0,
		confidence: 'good',
		manual_review_required: false,
		review_reasons: [],
		review_flag_codes: [],
		free_text: 'Optional context',
		idempotency_key_hash: HASH,
		request_fingerprint_hash: FINGERPRINT
	};
}

function savedRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'internal-id',
		public_ref: 'd'.repeat(32),
		calculator_type: 'business',
		state: 'VALID',
		created_at: CREATED_AT,
		pricing_model_version: '1.0.0',
		engine_version: '1.0.0',
		calculation_snapshot: write().calculation_snapshot,
		catchup_min_cents: 0,
		catchup_max_cents: 0,
		ongoing_min_cents: 0,
		ongoing_max_cents: 0,
		idempotency_key_hash: HASH,
		request_fingerprint_hash: FINGERPRINT,
		...overrides
	};
}

describe('estimate persistence repository', () => {
	it('inserts one snapshot and leaves line-item materialization to PostgreSQL', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const mock = clientWithResponses([{ data: savedRow(), error: null }]);
		const repository = module.createEstimatesRepository(mock.client);

		const row = await repository.createEstimateSnapshot(write());

		expect(row.public_ref).toBe('d'.repeat(32));
		expect(mock.calls.filter((call) => call.action === 'insert')).toHaveLength(1);
		expect(mock.calls[0]?.table).toBe('estimates');
		expect(mock.calls[0]?.value).toMatchObject({ idempotency_key_hash: HASH, request_fingerprint_hash: FINGERPRINT });
		expect(mock.calls.some((call) => call.table === 'estimate_line_items')).toBe(false);
	});

	it('returns the original snapshot for an identical retry within 24 hours', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const mock = clientWithResponses([
			{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "estimates_idempotency_key_hash_uidx"' } },
			{ data: savedRow(), error: null }
		]);
		const repository = module.createEstimatesRepository(mock.client, {
			now: () => new Date(Date.parse(CREATED_AT) + 24 * 60 * 60 * 1000 - 1)
		});

		const row = await repository.createEstimateSnapshot(write());

		expect(row.public_ref).toBe('d'.repeat(32));
		expect(mock.calls.filter((call) => call.action === 'insert')).toHaveLength(1);
		expect(mock.calls.some((call) => call.action === 'eq' && call.column === 'idempotency_key_hash' && call.value === HASH)).toBe(true);
	});

	it('looks up a matching idempotency key before calculation or persistence', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const mock = clientWithResponses([{ data: savedRow(), error: null }]);
		const repository = module.createEstimatesRepository(mock.client, {
			now: () => new Date(Date.parse(CREATED_AT) + 24 * 60 * 60 * 1000 - 1)
		});

		const row = await repository.findByIdempotencyKey(HASH, FINGERPRINT);

		expect(row?.public_ref).toBe('d'.repeat(32));
		expect(mock.calls.filter((call) => call.action === 'insert')).toHaveLength(0);
		expect(mock.calls.some((call) => call.action === 'eq' && call.column === 'idempotency_key_hash' && call.value === HASH)).toBe(true);
	});

	it('rejects a reused key when its request fingerprint differs', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const mock = clientWithResponses([
			{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "estimates_idempotency_key_hash_uidx"' } },
			{ data: savedRow({ request_fingerprint_hash: 'e'.repeat(64) }), error: null }
		]);
		const repository = module.createEstimatesRepository(mock.client);

		await expect(repository.createEstimateSnapshot(write())).rejects.toBeInstanceOf(module.IdempotencyPayloadMismatchError);
	});

	for (const operation of ['createEstimateSnapshot', 'findByIdempotencyKey'] as const) {
		it(`rejects a matching key at exactly 24 hours via ${operation}`, async () => {
			const module = await getEstimatesRepositoryModule();
			if (!module) return;
			const mock = clientWithResponses([
				...(operation === 'createEstimateSnapshot'
					? [{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "estimates_idempotency_key_hash_uidx"' } }]
					: []),
				{ data: savedRow(), error: null }
			]);
			const repository = module.createEstimatesRepository(mock.client, {
				now: () => new Date(Date.parse(CREATED_AT) + 24 * 60 * 60 * 1000)
			});

			const result = operation === 'createEstimateSnapshot'
				? repository.createEstimateSnapshot(write())
				: repository.findByIdempotencyKey(HASH, FINGERPRINT);

			await expect(result).rejects.toBeInstanceOf(module.IdempotencyWindowExpiredError);
		});
	}

	it('rejects a matching key after the retry window expires', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const oldRow = savedRow({ created_at: '2026-11-01T00:00:00.000Z' });
		const mock = clientWithResponses([
			{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "estimates_idempotency_key_hash_uidx"' } },
			{ data: oldRow, error: null }
		]);
		const repository = module.createEstimatesRepository(mock.client, { now: () => new Date('2026-11-05T10:00:00.000Z') });

		await expect(repository.createEstimateSnapshot(write())).rejects.toBeInstanceOf(module.IdempotencyWindowExpiredError);
	});

	it('retries only a proven public-reference collision', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const mock = clientWithResponses([
			{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "estimates_public_ref_key"' } },
			{ data: savedRow(), error: null }
		]);
		const repository = module.createEstimatesRepository(mock.client);

		await repository.createEstimateSnapshot(write());
		expect(mock.calls.filter((call) => call.action === 'insert')).toHaveLength(2);
	});

	it('does not retry unrelated unique violations', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const mock = clientWithResponses([
			{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "estimates_other_unique_key"' } }
		]);
		const repository = module.createEstimatesRepository(mock.client);

		await expect(repository.createEstimateSnapshot(write())).rejects.toBeInstanceOf(module.EstimatePersistenceError);
		expect(mock.calls.filter((call) => call.action === 'insert')).toHaveLength(1);
	});

	it('looks up public references with a narrow projection', async () => {
		const module = await getEstimatesRepositoryModule();
		if (!module) return;
		const mock = clientWithResponses([{ data: savedRow(), error: null }]);
		const repository = module.createEstimatesRepository(mock.client);

		await repository.findByPublicRef('d'.repeat(32));

		expect(mock.calls.find((call) => call.action === 'eq')).toMatchObject({ column: 'public_ref', value: 'd'.repeat(32) });
		const selection = mock.calls.find((call) => call.action === 'select')?.selection ?? '';
		expect(selection).toContain('calculation_snapshot');
		expect(selection).not.toContain('free_text');
		expect(selection).not.toContain('answers_snapshot');
	});
});
