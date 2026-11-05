import {
	CreateEstimateValidationError,
	EstimatePersistenceError,
	IdempotencyPayloadMismatchError,
	IdempotencyWindowExpiredError,
	InvalidIdempotencyKeyError,
	NoActivePricingModelError,
	PricingModelUnavailableError
} from './errors';
import { ESTIMATE_IDEMPOTENCY_KEY_PATTERN } from './idempotency';

export const MAX_ESTIMATE_REQUEST_BYTES = 16 * 1024;

export type EstimateCreator = (body: unknown, idempotencyKey: string) => Promise<unknown>;

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'private, no-store'
		}
	});
}

async function readBoundedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
	const contentLength = request.headers.get('content-length');
	if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_ESTIMATE_REQUEST_BYTES) {
		return { ok: false, status: 413 };
	}
	const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
	if (mediaType !== 'application/json') {
		return { ok: false, status: 400 };
	}
	if (!request.body) return { ok: false, status: 400 };

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			byteLength += value.byteLength;
			if (byteLength > MAX_ESTIMATE_REQUEST_BYTES) {
				await reader.cancel();
				return { ok: false, status: 413 };
			}
			chunks.push(value);
		}
	} catch {
		return { ok: false, status: 400 };
	}

	const body = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown };
	} catch {
		return { ok: false, status: 400 };
	}
}

function mapError(error: unknown): { status: number; code: string; message: string } {
	if (error instanceof CreateEstimateValidationError || error instanceof InvalidIdempotencyKeyError) {
		return { status: 400, code: 'INVALID_ESTIMATE_REQUEST', message: 'Check the estimate answers and try again.' };
	}
	if (error instanceof IdempotencyPayloadMismatchError) {
		return { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used for different answers.' };
	}
	if (error instanceof IdempotencyWindowExpiredError) {
		return { status: 409, code: 'IDEMPOTENCY_EXPIRED', message: 'Start a new estimate attempt to continue.' };
	}
	if (error instanceof NoActivePricingModelError || error instanceof PricingModelUnavailableError || error instanceof EstimatePersistenceError) {
		return { status: 503, code: 'ESTIMATE_UNAVAILABLE', message: 'The estimate could not be saved right now.' };
	}
	return { status: 503, code: 'ESTIMATE_UNAVAILABLE', message: 'The estimate could not be saved right now.' };
}

export async function handleEstimatePost(request: Request, create: EstimateCreator): Promise<Response> {
	const idempotencyKey = request.headers.get('idempotency-key');
	if (!idempotencyKey || !ESTIMATE_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
		return jsonResponse({ error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Start a new estimate attempt and try again.' } }, 400);
	}

	const parsedBody = await readBoundedJson(request);
	if (!parsedBody.ok) {
		return jsonResponse(
			{ error: { code: parsedBody.status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON', message: 'The estimate request is invalid.' } },
			parsedBody.status
		);
	}
	if (
		parsedBody.value &&
		typeof parsedBody.value === 'object' &&
		!Array.isArray(parsedBody.value) &&
		Object.hasOwn(parsedBody.value, 'idempotencyKey')
	) {
		return jsonResponse({ error: { code: 'INVALID_ESTIMATE_REQUEST', message: 'The estimate request is invalid.' } }, 400);
	}
	try {
		const estimate = await create(parsedBody.value, idempotencyKey);
		return jsonResponse({ estimate }, 201);
	} catch (error) {
		const mapped = mapError(error);
		return jsonResponse({ error: { code: mapped.code, message: mapped.message } }, mapped.status);
	}
}
