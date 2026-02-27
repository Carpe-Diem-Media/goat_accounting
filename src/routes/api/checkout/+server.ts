import { LeadSchema } from '$lib/domain/lead_schema';
import { createCalendarEvent } from '$lib/external/calendar_api';
import { sendLeadNotification } from '$lib/external/mailer_api';
import type { RequestHandler } from './$types';

export const prerender = false;

const LOCK_TTL_SECONDS = 30;

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
	const kv = platform?.env.BOOKING_STATE;
	if (!kv) {
		return json({ ok: false, error: 'BOOKING_STATE binding is not configured' }, 500);
	}

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
	const lockKey = `lock:booking:${lead.appointment_start_iso}`;
	const dayKey = `avail:${lead.appointment_start_iso.slice(0, 10)}`;

	const existingLock = await kv.get(lockKey);
	if (existingLock) {
		return json(
			{
				ok: false,
				error: 'Selected slot is currently being booked by another request. Please retry shortly.'
			},
			409
		);
	}

	await kv.put(lockKey, JSON.stringify({ created_at: new Date().toISOString() }), {
		expirationTtl: LOCK_TTL_SECONDS
	});

	try {
		const calendarResult = await createCalendarEvent(lead, platform?.env);
		if (!calendarResult.ok) {
			return json(
				{
					ok: false,
					error: {
						code: calendarResult.error.code,
						message: calendarResult.error.message
					}
				},
				mapExternalErrorToStatus(calendarResult.error)
			);
		}

		// Immediate cache invalidation after successful calendar write.
		await kv.delete(dayKey);

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

		// Post-mutation cache bypass/invalidation (idempotent).
		await kv.delete(dayKey);

		return json(
			{
				ok: true,
				appointment_start_iso: lead.appointment_start_iso,
				calendar_event: calendarResult.data,
				notification: mailResult.data
			},
			201
		);
	} finally {
		await kv.delete(lockKey);
	}
};
