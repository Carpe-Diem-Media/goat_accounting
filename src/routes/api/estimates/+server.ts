import { observeResponse } from '$lib/server/observability';
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

	try {
		const client = createEstimatorServiceClient(bindings);
		const pricingRepository = createEstimatorRepository(client);
		const estimatesRepository = createEstimatesRepository(client);
		return observeResponse('estimate_create', handleEstimatePost(request, (body, idempotencyKey) =>
			createEstimate(withRequestKey(body, idempotencyKey), {
				getActivePricingModel: () => pricingRepository.getActivePricingModel(),
				findByIdempotencyKey: (keyHash, fingerprintHash) => estimatesRepository.findByIdempotencyKey(keyHash, fingerprintHash),
				persistEstimate: (snapshot) => estimatesRepository.createEstimateSnapshot(snapshot)
		})
		));
	} catch {
		return unavailable();
	}
};
