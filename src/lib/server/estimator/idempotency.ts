import { InvalidIdempotencyKeyError } from './errors';

/** Keep one key for network retries for 24 hours. Create a new 32-byte key for each new attempt. */
export const ESTIMATE_IDEMPOTENCY_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const ESTIMATE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const encoder = new TextEncoder();

function stableJson(value: unknown): string {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') {
		return JSON.stringify(value);
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new TypeError('Canonical request numbers must be finite.');
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
		return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
	}
	throw new TypeError('Canonical estimate requests must contain JSON values only.');
}

function toHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
	return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function createEstimateIdempotencyHashes(
	idempotencyKey: string,
	canonicalRequest: unknown
): Promise<{ idempotencyKeyHash: string; requestFingerprintHash: string }> {
	if (!ESTIMATE_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) throw new InvalidIdempotencyKeyError();

	const hmacKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(idempotencyKey),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const fingerprint = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(stableJson(canonicalRequest)));
	return {
		idempotencyKeyHash: await sha256(idempotencyKey),
		requestFingerprintHash: toHex(fingerprint)
	};
}
