import {
	enforceNoticePeriod,
	generateBaseSlots,
	removeBusySlots
} from '#lib/domain/booking_rules.js';
import { fetchBusySlots } from '$lib/external/calendar_api';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';

export const prerender = false;

const AVAILABILITY_TTL_SECONDS = 300;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type AvailabilityPayload = {
	date: string;
	open_slots: string[];
	generated_at: string;
};

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

function resolveAvailabilityDate(request: Request): string | null {
	const date = new URL(request.url).searchParams.get('date');
	if (!date || !ISO_DATE_REGEX.test(date)) return null;
	return date;
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

export const GET: RequestHandler = async ({ request }) => {
	const kv = env.BOOKING_STATE;
	if (!kv) {
		return json({ ok: false, error: 'BOOKING_STATE binding is not configured' }, 500);
	}

	const date = resolveAvailabilityDate(request);
	if (!date) {
		return json({ ok: false, error: 'Query param "date" must be in YYYY-MM-DD format' }, 400);
	}

	const cacheKey = `avail:${date}`;
	const cached = await kv.get(cacheKey);
	if (cached) {
		try {
			const payload = JSON.parse(cached) as AvailabilityPayload;
			return json({ ok: true, source: 'kv-cache', ...payload });
		} catch {
			await kv.delete(cacheKey);
		}
	}

	const dayStart = new Date(`${date}T00:00:00+02:00`);
	const dayEnd = new Date(`${date}T23:59:59+02:00`);
	const busyResult = await fetchBusySlots(dayStart, dayEnd, env);
	if (!busyResult.ok) {
		return json(
			{
				ok: false,
				error: {
					code: busyResult.error.code,
					message: busyResult.error.message
				}
			},
			mapExternalErrorToStatus(busyResult.error)
		);
	}

	const baseSlots = generateBaseSlots(date);
	const noticeFilteredSlots = enforceNoticePeriod(baseSlots);
	const openSlots = removeBusySlots(
		noticeFilteredSlots,
		busyResult.data.map((slot) => ({
			start: slot.start_iso,
			end: slot.end_iso
		}))
	);
	const payload: AvailabilityPayload = {
		date,
		open_slots: openSlots,
		generated_at: new Date().toISOString()
	};

	await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: AVAILABILITY_TTL_SECONDS });

	return json({
		ok: true,
		source: 'calendar-api',
		...payload
	});
};
