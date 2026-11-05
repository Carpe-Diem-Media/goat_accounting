import { describe, expect, it } from 'bun:test';

async function getEstimateApiModule() {
	const [api, errors] = await Promise.all([
		import('./estimate-api').catch(() => null),
		import('./errors').catch(() => null)
	]);
	expect(api).not.toBeNull();
	expect(errors).not.toBeNull();
	return api && errors ? { ...api, ...errors } : null;
}

const KEY = 'D'.repeat(43);
const estimateResult = {
	publicRef: 'a'.repeat(32),
	calculatorType: 'business',
	state: 'VALID',
	createdAt: '2026-11-05T10:00:00.000Z',
	catchup: { minCents: 10, maxCents: 20, lineItems: [] },
	ongoing: { minCents: 30, maxCents: 40, lineItems: [] },
	confidence: 'good',
	confidenceReasons: [],
	manualReviewRequired: false,
	reviewReasons: [],
	reviewFlags: []
};

const request = (body: string, key = KEY) => new Request('https://goat.example/api/estimates', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
	body
});

describe('estimate creation HTTP handler', () => {
	it('returns a private no-store response and forwards the request key separately', async () => {
		const module = await getEstimateApiModule();
		if (!module) return;
		let receivedKey = '';
		const response = await module.handleEstimatePost(request('{"calculatorType":"business"}'), async (_body: unknown, key: string) => {
			receivedKey = key;
			return estimateResult;
		});

		expect(response.status).toBe(201);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(receivedKey).toBe(KEY);
		expect(await response.json()).toEqual({ estimate: estimateResult });
	});

	it('rejects malformed JSON and missing or malformed idempotency keys', async () => {
		const module = await getEstimateApiModule();
		if (!module) return;
		const create = async () => estimateResult;

		expect((await module.handleEstimatePost(request('{'), create)).status).toBe(400);
		expect((await module.handleEstimatePost(request('{}', ''), create)).status).toBe(400);
		expect((await module.handleEstimatePost(request('{}', 'short'), create)).status).toBe(400);
		expect((await module.handleEstimatePost(request('{"idempotencyKey":"' + KEY + '"}'), create)).status).toBe(400);
		expect((await module.handleEstimatePost(new Request('https://goat.example/api/estimates', {
			method: 'POST',
			headers: { 'content-type': 'application/jsonx', 'idempotency-key': KEY },
			body: '{}'
		}), create)).status).toBe(400);
	});

	it('rejects oversized bodies before calling the service', async () => {
		const module = await getEstimateApiModule();
		if (!module) return;
		let calls = 0;
		const oversized = new Request('https://goat.example/api/estimates', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'idempotency-key': KEY, 'content-length': String(module.MAX_ESTIMATE_REQUEST_BYTES + 1) },
			body: '{}'
		});

		const response = await module.handleEstimatePost(oversized, async () => { calls += 1; return estimateResult; });
		expect(response.status).toBe(413);
		expect(calls).toBe(0);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('maps typed request conflicts and infrastructure errors without exposing exception details', async () => {
		const module = await getEstimateApiModule();
		if (!module) return;
		const mismatch = await module.handleEstimatePost(request('{}'), async () => { throw new module.IdempotencyPayloadMismatchError(); });
		const unavailable = await module.handleEstimatePost(request('{}'), async () => { throw new Error('postgres-secret-detail'); });

		expect(mismatch.status).toBe(409);
		expect(unavailable.status).toBe(503);
		expect(await unavailable.text()).not.toContain('postgres-secret-detail');
	});
});
