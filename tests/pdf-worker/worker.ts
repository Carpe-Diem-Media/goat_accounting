import { createEstimatePdfResponse } from '../../src/lib/server/pdf/estimate-pdf-handler';
import type { EstimateDocumentModel } from '../../src/lib/server/pdf/estimate-pdf';

const publicRef = 'd'.repeat(32);
const document: EstimateDocumentModel = {
	publicRef,
	state: 'VALID',
	calculatorType: 'business',
	createdAt: '2026-11-05T10:00:00.000Z',
	pricingModelVersion: 'fixture-1',
	engineVersion: 'fixture-1',
	catchup: {
		minCents: 125_000,
		maxCents: 275_000,
		lineItems: [{ label: 'Synthetic catch-up bookkeeping', minCents: 125_000, maxCents: 275_000 }]
	},
	ongoing: { minCents: 45_000, maxCents: 80_000, lineItems: [] },
	confidence: 'preliminary',
	manualReviewRequired: true,
	assumptions: [{ label: 'Business type', value: 'Synthetic sole proprietor fixture' }]
};

export default {
	fetch(request: Request): Promise<Response> | Response {
		const match = new URL(request.url).pathname.match(/^\/api\/estimates\/([a-f0-9]{32})\/pdf$/);
		if (!match) return new Response(null, { status: 404 });
		return createEstimatePdfResponse(match[1], {
			ESTIMATE_READ_ENABLED: 'true',
			ADVISOR_EMAIL: 'estimate-test@example.test'
		}, {
			getEstimateDocument: async (ref) => ref === publicRef ? document : null
		});
	}
};
