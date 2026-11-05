import { error } from '@sveltejs/kit';
import { env as workerEnv } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';
import { getPublicEstimate } from '$lib/server/estimator/get-public-estimate';
import { createEstimatorServiceClient } from '$lib/server/supabase/client.server';
import { createEstimatesRepository } from '$lib/server/supabase/repositories/estimates';

export const prerender = false;

export const load: PageServerLoad = async ({ params, setHeaders, platform }) => {
	setHeaders({ 'cache-control': 'private, no-store' });

	let estimate;
	try {
		const bindings = platform?.env ?? workerEnv;
		const client = createEstimatorServiceClient(bindings);
		const repository = createEstimatesRepository(client);
		estimate = await getPublicEstimate(params.publicRef, repository);
	} catch {
		throw error(503, 'Estimate results are temporarily unavailable.');
	}

	if (!estimate) throw error(404, 'Estimate not found.');
	return { estimate };
};
