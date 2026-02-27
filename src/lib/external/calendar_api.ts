import { LeadSchema, type Lead } from '$lib/domain/lead_schema';

const REQUEST_TIMEOUT_MS = 5_000;
const EVENT_DURATION_MINUTES = 60;
const GOOGLE_CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3';

export type PlatformEnv = Record<string, string | undefined>;

export type BusySlot = {
	start_iso: string;
	end_iso: string;
};

export type CalendarEventInfo = {
	provider: 'google';
	event_id: string;
	event_url?: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: ExternalApiError };

export class ExternalApiError extends Error {
	constructor(
		public readonly code:
			| 'CONFIG_ERROR'
			| 'VALIDATION_ERROR'
			| 'TIMEOUT_ERROR'
			| 'NETWORK_ERROR'
			| 'PROVIDER_ERROR'
			| 'UNKNOWN_ERROR',
		message: string,
		public readonly details?: unknown
	) {
		super(message);
		this.name = 'ExternalApiError';
	}
}

function toExternalApiError(error: unknown): ExternalApiError {
	if (error instanceof ExternalApiError) return error;
	if (error instanceof Error) return new ExternalApiError('UNKNOWN_ERROR', error.message);
	return new ExternalApiError('UNKNOWN_ERROR', 'Unknown error');
}

function resolveEnv(env: any): PlatformEnv {
	if (env) return env as PlatformEnv;
	throw new ExternalApiError(
		'CONFIG_ERROR',
		'platform.env is required. Pass event.platform?.env from a SvelteKit server handler.'
	);
}

function requireAny(env: PlatformEnv, keys: string[], errorMessage: string): string {
	for (const key of keys) {
		const value = env[key];
		if (value) return value;
	}
	throw new ExternalApiError('CONFIG_ERROR', errorMessage);
}

function ensureValidDate(date: Date, label: string): Date {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		throw new ExternalApiError('VALIDATION_ERROR', `${label} must be a valid Date`);
	}
	return date;
}

function formatSastIso(ms: number): string {
	const sastMs = ms + 2 * 60 * 60 * 1000;
	const d = new Date(sastMs);
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	const hh = String(d.getUTCHours()).padStart(2, '0');
	const mi = String(d.getUTCMinutes()).padStart(2, '0');
	const ss = String(d.getUTCSeconds()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+02:00`;
}

function normalizeIsoToSast(isoLike: string): string {
	const parsed = Date.parse(isoLike);
	if (Number.isNaN(parsed)) {
		throw new ExternalApiError('PROVIDER_ERROR', `Invalid datetime returned by Google Calendar: ${isoLike}`);
	}
	return formatSastIso(parsed);
}

function buildGoogleUrl(path: string, apiKey?: string): string {
	if (!apiKey) return `${GOOGLE_CALENDAR_BASE_URL}${path}`;
	const delimiter = path.includes('?') ? '&' : '?';
	return `${GOOGLE_CALENDAR_BASE_URL}${path}${delimiter}key=${encodeURIComponent(apiKey)}`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new ExternalApiError('TIMEOUT_ERROR', `Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
		}
		throw new ExternalApiError('NETWORK_ERROR', 'Network request failed', error);
	} finally {
		clearTimeout(timeoutId);
	}
}

async function parseResponseJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function buildGoogleHeaders(accessToken?: string): HeadersInit {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (accessToken) {
		headers.Authorization = `Bearer ${accessToken}`;
	}
	return headers;
}

function resolveCalendarConfig(env: PlatformEnv): {
	calendarId: string;
	accessToken?: string;
	apiKey?: string;
} {
	const calendarId = requireAny(
		env,
		['CALENDAR_ID', 'GOOGLE_CALENDAR_ID'],
		'Missing required platform.env value: CALENDAR_ID'
	);
	const accessToken = env.CALENDAR_ACCESS_TOKEN ?? env.GOOGLE_CALENDAR_ACCESS_TOKEN;
	const apiKey = env.CALENDAR_API_KEY;

	if (!accessToken && !apiKey) {
		throw new ExternalApiError(
			'CONFIG_ERROR',
			'Missing authentication. Provide CALENDAR_ACCESS_TOKEN (or GOOGLE_CALENDAR_ACCESS_TOKEN) or CALENDAR_API_KEY.'
		);
	}

	return { calendarId, accessToken, apiKey };
}

export async function fetchBusySlots(
	startDate: Date,
	endDate: Date,
	env: any
): Promise<Result<BusySlot[]>> {
	try {
		const platformEnv = resolveEnv(env);
		const { calendarId, accessToken, apiKey } = resolveCalendarConfig(platformEnv);
		const start = ensureValidDate(startDate, 'startDate');
		const end = ensureValidDate(endDate, 'endDate');

		if (end.getTime() <= start.getTime()) {
			throw new ExternalApiError('VALIDATION_ERROR', 'endDate must be after startDate');
		}

		const response = await fetchWithTimeout(buildGoogleUrl('/freeBusy', apiKey), {
			method: 'POST',
			headers: buildGoogleHeaders(accessToken),
			body: JSON.stringify({
				timeMin: start.toISOString(),
				timeMax: end.toISOString(),
				items: [{ id: calendarId }]
			})
		});

		const payload = (await parseResponseJson(response)) as
			| { calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }> }
			| null;

		if (!response.ok) {
			throw new ExternalApiError('PROVIDER_ERROR', `Google freeBusy API returned ${response.status}`, payload);
		}

		const busy = payload?.calendars?.[calendarId]?.busy ?? [];
		const slots = busy
			.filter((slot) => slot.start && slot.end)
			.map((slot) => ({
				start_iso: normalizeIsoToSast(slot.start as string),
				end_iso: normalizeIsoToSast(slot.end as string)
			}));

		return { ok: true, data: slots };
	} catch (error) {
		return { ok: false, error: toExternalApiError(error) };
	}
}

export async function createCalendarEvent(
	leadData: Lead,
	env: any
): Promise<Result<CalendarEventInfo>> {
	try {
		const platformEnv = resolveEnv(env);
		const { calendarId, accessToken, apiKey } = resolveCalendarConfig(platformEnv);
		const parsedLead = LeadSchema.safeParse(leadData);
		if (!parsedLead.success) {
			throw new ExternalApiError('VALIDATION_ERROR', 'Lead payload failed validation', parsedLead.error.flatten());
		}

		const lead = parsedLead.data;
		const startMs = Date.parse(lead.appointment_start_iso);
		if (Number.isNaN(startMs)) {
			throw new ExternalApiError('VALIDATION_ERROR', 'appointment_start_iso is not a valid ISO datetime');
		}

		const endMs = startMs + EVENT_DURATION_MINUTES * 60 * 1000;
		const startIso = formatSastIso(startMs);
		const endIso = formatSastIso(endMs);

		const description = [
			`Name: ${lead.client_name}`,
			`Email: ${lead.client_email}`,
			`Phone: ${lead.client_phone}`,
			`Primary Interest: ${lead.primary_interest}`,
			`Requested Booking Time (SAST): ${startIso}`
		].join('\n');

		const response = await fetchWithTimeout(
			buildGoogleUrl(`/calendars/${encodeURIComponent(calendarId)}/events`, apiKey),
			{
				method: 'POST',
				headers: buildGoogleHeaders(accessToken),
				body: JSON.stringify({
					summary: `Consultation: ${lead.client_name} - ${lead.primary_interest}`,
					description,
					start: {
						dateTime: startIso,
						timeZone: 'Africa/Johannesburg'
					},
					end: {
						dateTime: endIso,
						timeZone: 'Africa/Johannesburg'
					}
				})
			}
		);

		const payload = (await parseResponseJson(response)) as { id?: string; htmlLink?: string } | null;
		if (!response.ok) {
			throw new ExternalApiError(
				'PROVIDER_ERROR',
				`Google calendar events API returned ${response.status}`,
				payload
			);
		}
		if (!payload?.id) {
			throw new ExternalApiError('PROVIDER_ERROR', 'Google API did not return an event id', payload);
		}

		return {
			ok: true,
			data: {
				provider: 'google',
				event_id: payload.id,
				event_url: payload.htmlLink
			}
		};
	} catch (error) {
		return { ok: false, error: toExternalApiError(error) };
	}
}
