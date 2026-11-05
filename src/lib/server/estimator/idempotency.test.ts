import { describe, expect, it } from 'bun:test';

async function getIdempotencyModule() {
	const module = await import('./idempotency').catch(() => null);
	expect(module).not.toBeNull();
	return module;
}

describe('estimate request idempotency', () => {
	it('hashes the key and canonical request without storing the raw key', async () => {
		const module = await getIdempotencyModule();
		if (!module) return;

		const idempotencyKey = 'A'.repeat(43);
		const hashes = await module.createEstimateIdempotencyHashes(idempotencyKey, {
			calculatorType: 'business',
			answers: { calculatorType: 'business', business: { entityType: 'sole_proprietor' } }
		});

		expect(hashes.idempotencyKeyHash).toMatch(/^[a-f0-9]{64}$/);
		expect(hashes.requestFingerprintHash).toMatch(/^[a-f0-9]{64}$/);
		expect(hashes.idempotencyKeyHash).not.toBe(idempotencyKey);
	});

	it('uses stable canonical JSON and distinguishes a changed payload', async () => {
		const module = await getIdempotencyModule();
		if (!module) return;

		const key = 'B'.repeat(43);
		const first = await module.createEstimateIdempotencyHashes(key, { a: 1, b: { x: 'y', z: 3 } });
		const reordered = await module.createEstimateIdempotencyHashes(key, { b: { z: 3, x: 'y' }, a: 1 });
		const changed = await module.createEstimateIdempotencyHashes(key, { a: 1, b: { x: 'changed', z: 3 } });

		expect(reordered.requestFingerprintHash).toBe(first.requestFingerprintHash);
		expect(changed.requestFingerprintHash).not.toBe(first.requestFingerprintHash);
		expect(module.ESTIMATE_IDEMPOTENCY_RETRY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
	});
});
