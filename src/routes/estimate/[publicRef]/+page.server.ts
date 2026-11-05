import { env as workerEnv } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';
import { getPublicEstimate } from '$lib/server/estimator/get-public-estimate';
import { loadPublicEstimate } from '$lib/server/estimator/load-public-estimate';
import { createEstimatorServiceClient } from '$lib/server/supabase/client.server';
import { createEstimatesRepository } from '$lib/server/supabase/repositories/estimates';

export const prerender = false;

export const load: PageServerLoad = async ({ params, setHeaders, platform }) => {
	const bindings = platform?.env ?? workerEnv;
	return loadPublicEstimate(params.publicRef, bindings, setHeaders, {
		createClient: createEstimatorServiceClient,
		createRepository: createEstimatesRepository,
		getPublicEstimate
	});
};
