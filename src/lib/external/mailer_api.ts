import { LeadSchema, type Lead } from '$lib/domain/lead_schema';

const REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_FROM_EMAIL = 'bookings@goataccounting.co.za';
const EVENT_DURATION_MINUTES = 60;

export type PlatformEnv = Record<string, string | undefined>;

export type MailSendResult = {
	message_id: string;
};

export type Result<T> =
	| { ok: true; success: true; data: T }
	| { ok: false; success: false; error: ExternalApiError };

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

function resolveEnv(platformEnv?: PlatformEnv): PlatformEnv {
	if (platformEnv) return platformEnv;
	throw new ExternalApiError(
		'CONFIG_ERROR',
		'platform.env is required. Pass event.platform?.env from a SvelteKit server handler.'
	);
}

function requireEnv(env: PlatformEnv, key: string): string {
	const value = env[key];
	if (!value) {
		throw new ExternalApiError('CONFIG_ERROR', `Missing required platform.env value: ${key}`);
	}
	return value;
}

function formatSastDateTime(iso: string): string {
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) return iso;

	const formatter = new Intl.DateTimeFormat('en-ZA', {
		timeZone: 'Africa/Johannesburg',
		dateStyle: 'full',
		timeStyle: 'short'
	});

	return `${formatter.format(parsed)} (SAST, UTC+2)`;
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

function toIcsDateUtc(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	const hh = String(date.getUTCHours()).padStart(2, '0');
	const mm = String(date.getUTCMinutes()).padStart(2, '0');
	const ss = String(date.getUTCSeconds()).padStart(2, '0');
	return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function generateIcsContent(lead: Lead): string {
	const startMs = Date.parse(lead.appointment_start_iso);
	const endMs = startMs + EVENT_DURATION_MINUTES * 60 * 1000;
	const start = new Date(startMs);
	const end = new Date(endMs);
	const now = new Date();
	const uid = `${now.getTime()}-${Math.random().toString(36).slice(2)}@goataccounting.co.za`;

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Goat Accounting//Booking//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:REQUEST',
		'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${toIcsDateUtc(now)}`,
		`DTSTART:${toIcsDateUtc(start)}`,
		`DTEND:${toIcsDateUtc(end)}`,
		`SUMMARY:Consultation: ${lead.client_name} - ${lead.primary_interest}`,
		`DESCRIPTION:Name: ${lead.client_name}\\nEmail: ${lead.client_email}\\nPhone: ${lead.client_phone}\\nPrimary Interest: ${lead.primary_interest}`,
		`ATTENDEE;CN=${lead.client_name};RSVP=TRUE:mailto:${lead.client_email}`,
		'STATUS:TENTATIVE',
		'END:VEVENT',
		'END:VCALENDAR'
	];

	return lines.join('\r\n');
}

export async function sendLeadNotification(
	leadData: Lead,
	env: any
): Promise<Result<MailSendResult>> {
	try {
		const platformEnv = resolveEnv(env as PlatformEnv);
		const resendApiKey = requireEnv(platformEnv, 'RESEND_API_KEY');
		const advisorEmail = requireEnv(platformEnv, 'ADVISOR_EMAIL');
		const resendFromEmail = platformEnv.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;

		const parsedLead = LeadSchema.safeParse(leadData);
		if (!parsedLead.success) {
			throw new ExternalApiError('VALIDATION_ERROR', 'Lead payload failed validation', parsedLead.error.flatten());
		}

		const lead = parsedLead.data;
		const formattedAppointment = formatSastDateTime(lead.appointment_start_iso);
		const textBody = [
			'New consultation request received',
			'',
			`Name: ${lead.client_name}`,
			`Email: ${lead.client_email}`,
			`Phone: ${lead.client_phone}`,
			`Primary interest: ${lead.primary_interest}`,
			`Requested booking time: ${formattedAppointment}`
		].join('\n');

		const htmlBody = [
			'<h2>New consultation request received</h2>',
			'<table style="border-collapse:collapse;">',
			`<tr><td style="padding:4px 12px 4px 0;"><strong>Name</strong></td><td>${lead.client_name}</td></tr>`,
			`<tr><td style="padding:4px 12px 4px 0;"><strong>Email</strong></td><td>${lead.client_email}</td></tr>`,
			`<tr><td style="padding:4px 12px 4px 0;"><strong>Phone</strong></td><td>${lead.client_phone}</td></tr>`,
			`<tr><td style="padding:4px 12px 4px 0;"><strong>Primary Interest</strong></td><td>${lead.primary_interest}</td></tr>`,
			`<tr><td style="padding:4px 12px 4px 0;"><strong>Requested Booking Time</strong></td><td>${formattedAppointment}</td></tr>`,
			'</table>'
		].join('');

		const icsContent = generateIcsContent(lead);
		const icsBase64 = btoa(icsContent);

		const response = await fetchWithTimeout('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${resendApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: resendFromEmail,
				to: [advisorEmail],
				subject: `New Lead: ${lead.client_name} (${lead.primary_interest})`,
				text: textBody,
				html: htmlBody,
				attachments: [
					{
						filename: 'consultation.ics',
						content: icsBase64
					}
				]
			})
		});

		const payload = (await parseResponseJson(response)) as { id?: string } | null;
		if (!response.ok) {
			throw new ExternalApiError('PROVIDER_ERROR', `Resend API returned ${response.status}`, payload);
		}
		if (!payload?.id) {
			throw new ExternalApiError('PROVIDER_ERROR', 'Resend API did not return a message id', payload);
		}

		return { ok: true, success: true, data: { message_id: payload.id } };
	} catch (error) {
		return { ok: false, success: false, error: toExternalApiError(error) };
	}
}
