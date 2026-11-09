import { contentDigest, loadEstimateMailConfiguration, sendEstimateMail } from '../../src/lib/server/email/estimate-mailer';

const content = {
	publicOrigin: 'https://example.test',
	approvalReference: 'TEST-ONLY reference',
	disclaimer: 'TEST-ONLY disclaimer',
	contactName: 'TEST-ONLY contact',
	contactEmail: 'contact@example.test'
};
const deliveryId = '65000000-0000-4000-8000-000000000001';
const providerId = '66000000-0000-4000-8000-000000000001';
const message = { subject: 'TEST-ONLY saved estimate', html: '<p>TEST-ONLY saved summary</p>', text: 'TEST-ONLY saved summary' };

export default {
	async fetch(request: Request): Promise<Response> {
		const scenario = new URL(request.url).pathname;
		if (request.method !== 'POST' || !['/accepted', '/timeout', '/disabled'].includes(scenario)) {
			return new Response(null, { status: 404 });
		}
		const enabled = scenario !== '/disabled';
		const bindings = {
			ESTIMATE_NOTIFICATIONS_ENABLED: enabled ? 'true' : 'false',
			ESTIMATE_EMAIL_CONTENT: JSON.stringify(content),
			ESTIMATE_EMAIL_CONTENT_SHA256: await contentDigest(content),
			ESTIMATE_EMAIL_FROM: 'from@example.test',
			ESTIMATE_EMAIL_INTERNAL_TO: 'internal@example.test',
			RESEND_API_KEY: 'TEST_ONLY_NOT_A_REAL_KEY'
		};
		const loaded = await loadEstimateMailConfiguration(bindings, true);
		if (loaded.status !== 'ready') return Response.json({ status: loaded.status });

		const injectedFetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			if (!init?.signal) throw new Error('Expected the mailer to pass an abort signal.');
			if (scenario === '/timeout') {
				return new Response(new ReadableStream<Uint8Array>({
					start() {},
					cancel() {}
				}));
			}
			return Response.json({ id: providerId });
		};
		const result = await sendEstimateMail(loaded.config, deliveryId, 'customer@example.test', message, {
			fetch: injectedFetch,
			timeoutMs: scenario === '/timeout' ? 20 : undefined
		});
		return Response.json(result);
	}
};
