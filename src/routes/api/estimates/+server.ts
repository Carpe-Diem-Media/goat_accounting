import { logOperationalEvent, newCorrelationId, observeResponse } from '$lib/server/observability';
import { env as workerEnv } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { createEstimate } from '$lib/server/estimator/create-estimate';
import { handleEstimatePost } from '$lib/server/estimator/estimate-api';
import { createEstimatorServiceClient } from '$lib/server/supabase/client.server';
import { createEstimatesRepository } from '$lib/server/supabase/repositories/estimates';
import { createEstimatorRepository } from '$lib/server/supabase/repository.server';

export const prerender = false;

function unavailable(): Response {
	return new Response(JSON.stringify({ error: { code: 'ESTIMATE_UNAVAILABLE', message: 'The estimate could not be saved right now.' } }), {
		status: 503,
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' }
	});
}

function withRequestKey(body: unknown, idempotencyKey: string): unknown {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
	return { ...body, idempotencyKey };
}

export const POST: RequestHandler = async ({ request, platform }) => {
	// The Cloudflare Workers adapter exposes bindings through the runtime module, not event.platform.
	const bindings = platform?.env ?? workerEnv;
	if (bindings?.ESTIMATOR_ENABLED !== 'true') return unavailable();

	const requestId = newCorrelationId();
	try {
		const client = createEstimatorServiceClient(bindings);
		const pricingRepository = createEstimatorRepository(client);
		const estimatesRepository = createEstimatesRepository(client);
		return observeResponse('estimate_create', handleEstimatePost(request, (body, idempotencyKey) =>
			createEstimate(withRequestKey(body, idempotencyKey), {
				getActivePricingModel: () => pricingRepository.getActivePricingModel(),
				findByIdempotencyKey: (keyHash, fingerprintHash) => estimatesRepository.findByIdempotencyKey(keyHash, fingerprintHash),
				persistEstimate: async (snapshot) => {
					const saved = await estimatesRepository.createEstimateSnapshot(snapshot);
					const calculation = saved.calculation_snapshot;
					const manualReview = calculation && typeof calculation === 'object' && !Array.isArray(calculation)
						? calculation.manualReviewRequired : undefined;
					logOperationalEvent({ route: 'estimate_create', outcome: 'success', request_id: requestId,
						pricing_version: saved.pricing_model_version, engine_version: saved.engine_version,
						manual_review: manualReview });
					return saved;
				}
		})
		), undefined, requestId);
	} catch {
		return unavailable();
	}
};
