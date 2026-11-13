import { env as workerEnv } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { createEstimatePdfResponse, type EstimatePdfBindings } from '$lib/server/pdf/estimate-pdf-handler';
import { createEstimateDocumentRepository, toEstimateDocumentModel } from '$lib/server/pdf/estimate-document';
import { createEstimatorServiceClient, type EstimatorServerEnv } from '$lib/server/supabase/client.server';
import { observeResponse } from '$lib/server/observability';

export const prerender = false;

export const GET: RequestHandler = async ({ params, platform }) => {
	const bindings = (platform?.env ?? workerEnv) as EstimatePdfBindings & EstimatorServerEnv;
	return observeResponse('estimate_pdf', createEstimatePdfResponse(params.publicRef, bindings, {
		getEstimateDocument: async (publicRef) => {
			const client = createEstimatorServiceClient(bindings);
			const repository = createEstimateDocumentRepository(client);
			const record = await repository.findDocumentByPublicRef(publicRef);
			return record ? toEstimateDocumentModel(record) : null;
		}
	}));
};
