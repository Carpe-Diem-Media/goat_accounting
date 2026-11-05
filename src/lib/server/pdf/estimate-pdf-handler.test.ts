import { describe, expect, it } from 'bun:test';
import { PDFDocument } from 'pdf-lib';
import type { EstimateDocumentModel } from './estimate-pdf';

async function loadHandlerModule() {
	return import('./estimate-pdf-handler').catch(() => null);
}

function savedModel(state: 'VALID' | 'SUPERSEDED' | 'VOIDED' = 'VALID'): EstimateDocumentModel {
	return {
		publicRef: 'c'.repeat(32),
		state,
		calculatorType: 'business',
		createdAt: '2026-11-05T10:00:00.000Z',
		pricingModelVersion: '1.0.0',
		engineVersion: '1.0.0',
		catchup: { minCents: 100_000, maxCents: 200_000, lineItems: [] },
		ongoing: { minCents: 30_000, maxCents: 50_000, lineItems: [] },
		confidence: 'good',
		manualReviewRequired: false,
		assumptions: []
	};
}

function expectPrivateHeaders(response: Response): void {
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
	expect(response.headers.get('referrer-policy')).toBe('no-referrer');
}

describe('estimate PDF response', () => {
	it('returns a private PDF attachment from the loaded saved document', async () => {
		const module = await loadHandlerModule();
		expect(module).not.toBeNull();
		if (!module) return;
		let loadedRef = '';

		const response = await module.createEstimatePdfResponse('c'.repeat(32), { ESTIMATE_READ_ENABLED: 'true' }, {
			getEstimateDocument: async (publicRef: string) => {
				loadedRef = publicRef;
				return savedModel();
			}
		});
		const bytes = new Uint8Array(await response.arrayBuffer());
		const document = await PDFDocument.load(bytes);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/pdf');
		expect(response.headers.get('content-disposition')).toBe(`attachment; filename="estimate-${'c'.repeat(32)}.pdf"`);
		expectPrivateHeaders(response);
		expect(loadedRef).toBe('c'.repeat(32));
		expect(document.getTitle()).toContain('c'.repeat(32));
	});

	it('does not query storage while the estimator read environment is disabled', async () => {
		const module = await loadHandlerModule();
		expect(module).not.toBeNull();
		if (!module) return;
		let lookups = 0;

		const response = await module.createEstimatePdfResponse('c'.repeat(32), { ESTIMATE_READ_ENABLED: 'false' }, {
			getEstimateDocument: async () => {
				lookups += 1;
				return savedModel();
			}
		});

		expect(response.status).toBe(503);
		expectPrivateHeaders(response);
		expect(lookups).toBe(0);
	});

	it('returns a private not-found response for a missing or malformed reference', async () => {
		const module = await loadHandlerModule();
		expect(module).not.toBeNull();
		if (!module) return;
		let lookups = 0;
		const deps = { getEstimateDocument: async () => { lookups += 1; return null; } };

		const missing = await module.createEstimatePdfResponse('c'.repeat(32), { ESTIMATE_READ_ENABLED: 'true' }, deps);
		const malformed = await module.createEstimatePdfResponse('not-a-reference', { ESTIMATE_READ_ENABLED: 'true' }, deps);

		expect(missing.status).toBe(404);
		expect(malformed.status).toBe(404);
		expectPrivateHeaders(missing);
		expect(lookups).toBe(1);
	});

	it('renders saved voided estimates with a visible void status', async () => {
		const module = await loadHandlerModule();
		expect(module).not.toBeNull();
		if (!module) return;
		const response = await module.createEstimatePdfResponse('c'.repeat(32), {
			ESTIMATE_READ_ENABLED: 'true',
			ADVISOR_EMAIL: 'estimate-test@example.test'
		}, { getEstimateDocument: async () => savedModel('VOIDED') });
		const document = await PDFDocument.load(await response.arrayBuffer());

		expect(response.status).toBe(200);
		expect(document.getPageCount()).toBe(1);
		expectPrivateHeaders(response);
	});
});
