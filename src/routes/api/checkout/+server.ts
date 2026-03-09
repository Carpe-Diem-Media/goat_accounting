import { LeadSchema } from '$lib/domain/lead_schema';
import { sendLeadNotification } from '$lib/external/mailer_api';
import type { RequestHandler } from './$types';

export const prerender = false;

type ExternalErrorLike = {
	code?: string;
	message?: string;
};

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store'
		}
	});
}

function mapExternalErrorToStatus(error: ExternalErrorLike): number {
	switch (error.code) {
		case 'VALIDATION_ERROR':
			return 400;
		case 'TIMEOUT_ERROR':
			return 504;
		case 'NETWORK_ERROR':
		case 'PROVIDER_ERROR':
			return 502;
		case 'CONFIG_ERROR':
		case 'UNKNOWN_ERROR':
		default:
			return 500;
	}
}

export const POST: RequestHandler = async ({ request, platform }) => {
	let requestBody: unknown;
	try {
		requestBody = await request.json();
	} catch {
		return json({ ok: false, error: 'Request body must be valid JSON' }, 400);
	}

	const parsedLead = LeadSchema.safeParse(requestBody);
	if (!parsedLead.success) {
		return json(
			{
				ok: false,
				error: 'Invalid lead payload',
				details: parsedLead.error.flatten()
			},
			400
		);
	}

	const lead = parsedLead.data;

	const mailResult = await sendLeadNotification(lead, platform?.env);
	if (!mailResult.ok) {
		return json(
			{
				ok: false,
				error: {
					code: mailResult.error.code,
					message: mailResult.error.message
				}
			},
			mapExternalErrorToStatus(mailResult.error)
		);
	}

	return json(
		{
			ok: true,
			appointment_start_iso: lead.appointment_start_iso,
			notification: mailResult.data
		},
		201
	);
};
