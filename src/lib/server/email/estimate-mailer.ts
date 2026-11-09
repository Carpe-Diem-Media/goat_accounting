import { z } from 'zod';
import { classifyAttemptOutcome, type AttemptOutcome } from '../../domain/notifications/lifecycle';
import { loadEmailContent, type EmailContent } from './content';
import type { RenderedEmail } from './templates/shared';

export type EstimateMailBindings = Readonly<{
 ESTIMATE_NOTIFICATIONS_ENABLED?: string;
 ESTIMATE_EMAIL_CONTENT?: string;
 ESTIMATE_EMAIL_CONTENT_SHA256?: string;
 ESTIMATE_EMAIL_FROM?: string;
 ESTIMATE_EMAIL_INTERNAL_TO?: string;
 RESEND_API_KEY?: string;
}>;
export type EstimateMailConfiguration = Readonly<{
 content: EmailContent;
 from: string;
 internalTo: string;
 apiKey: string;
 testOnly: boolean;
}>;
export type MailConfigurationResult =
 | { status: 'disabled' | 'configuration_error' }
 | { status: 'ready'; config: EstimateMailConfiguration };
export type EstimateMailResult = AttemptOutcome & { providerId: string | null };
export type MailFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const address = z.string().email().max(320);
const uuid = z.uuid();
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_MESSAGE_BYTES = 128 * 1024;
const PROVIDER_TIMEOUT_MS = 5000;

/** Hash the validated, normalized content, so approval covers the exact configured wording. */
export async function contentDigest(content: EmailContent): Promise<string> {
 const validated = loadEmailContent(content);
 if (!validated) throw new Error('Email content is invalid.');
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(validated)));
 return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** testOnly permits labelled fixtures only with an injected HTTP mock in sendEstimateMail. */
export async function loadEstimateMailConfiguration(bindings: EstimateMailBindings, testOnly = false): Promise<MailConfigurationResult> {
 if (bindings.ESTIMATE_NOTIFICATIONS_ENABLED !== 'true') return { status: 'disabled' };
 if (!bindings.ESTIMATE_EMAIL_CONTENT || bindings.ESTIMATE_EMAIL_CONTENT.length > 8192) return { status: 'configuration_error' };
 const content = loadEmailContent(bindings.ESTIMATE_EMAIL_CONTENT);
 const from = address.safeParse(bindings.ESTIMATE_EMAIL_FROM);
 const internalTo = address.safeParse(bindings.ESTIMATE_EMAIL_INTERNAL_TO);
 const key = bindings.RESEND_API_KEY;
 if (!content || !from.success || !internalTo.success || !key || !/^[A-Za-z0-9_-]{1,512}$/.test(key) ||
     !/^[a-f0-9]{64}$/.test(bindings.ESTIMATE_EMAIL_CONTENT_SHA256 ?? '')) return { status: 'configuration_error' };
 if (!testOnly && /TEST[ -_]ONLY/i.test(JSON.stringify(content))) return { status: 'configuration_error' };
 if (await contentDigest(content) !== bindings.ESTIMATE_EMAIL_CONTENT_SHA256) return { status: 'configuration_error' };
 return { status: 'ready', config: { content, from: from.data, internalTo: internalTo.data, apiKey: key, testOnly } };
}

function failure(code: string): EstimateMailResult {
 return { classification: 'uncertain', code, providerId: null, retryNotBefore: null, reconciliationRequired: true };
}
function invalidRequest(): EstimateMailResult {
 return { classification: 'permanent', code: 'PROVIDER_REJECTED', providerId: null, retryNotBefore: null, reconciliationRequired: false };
}

/** One bounded provider request. This transport neither claims records nor retries requests. */
export async function sendEstimateMail(
 config: EstimateMailConfiguration,
 deliveryId: string,
 recipient: string,
 message: RenderedEmail,
 options: { fetch?: MailFetch; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<EstimateMailResult> {
 const http = options.fetch ?? globalThis.fetch;
 if ((config.testOnly && (!options.fetch || http === globalThis.fetch)) ||
     !uuid.safeParse(deliveryId).success || !address.safeParse(recipient).success ||
     !address.safeParse(config.from).success || !/^[A-Za-z0-9_-]{1,512}$/.test(config.apiKey) ||
     !message.subject || message.subject.length > 200 || /[\r\n\u0000]/.test(message.subject) ||
     typeof message.html !== 'string' || typeof message.text !== 'string') return invalidRequest();
 const payload = JSON.stringify({ from: config.from, to: [recipient], subject: message.subject, html: message.html, text: message.text });
 if (new TextEncoder().encode(payload).byteLength > MAX_MESSAGE_BYTES) return invalidRequest();
 if (options.signal?.aborted) return failure('PROVIDER_TIMEOUT');
 const controller = new AbortController();
 let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
 let timer: ReturnType<typeof setTimeout> | undefined;
 let rejectDeadline: ((reason: Error) => void) | undefined;
 const abort = () => {
  controller.abort();
  if (reader) void reader.cancel().catch(() => {});
  rejectDeadline?.(new Error('deadline'));
 };
 const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
 options.signal?.addEventListener('abort', abort, { once: true });
 const requestedTimeout = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
 const timeout = Number.isFinite(requestedTimeout) ? Math.max(1, Math.min(PROVIDER_TIMEOUT_MS, requestedTimeout)) : PROVIDER_TIMEOUT_MS;
 timer = setTimeout(abort, timeout);
 try {
  const operation = async (): Promise<EstimateMailResult> => {
   if (controller.signal.aborted) return failure('PROVIDER_TIMEOUT');
   const response = await http('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: controller.signal,
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `goat-estimate/${deliveryId}` },
    body: payload
   });
   if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return failure('PROVIDER_TIMEOUT'); }
   const length = response.headers.get('content-length');
   if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    return failure('PROVIDER_RESPONSE_INVALID');
   }
   const chunks: Uint8Array[] = [];
   let size = 0;
   if (response.body) {
    reader = response.body.getReader();
    while (true) {
     const result = await reader.read();
     if (controller.signal.aborted) return failure('PROVIDER_TIMEOUT');
     if (result.done) break;
     size += result.value.byteLength;
     if (size > MAX_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); return failure('PROVIDER_RESPONSE_INVALID'); }
     chunks.push(result.value);
    }
   }
   const bytes = new Uint8Array(size);
   let offset = 0;
   for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
   let body: unknown = null;
   try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { /* Untrusted provider data never enters errors or logs. */ }
   const object = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
   const acceptedId = uuid.safeParse(object.id);
   const providerCode = object.name === 'invalid_idempotent_request' || object.name === 'concurrent_idempotent_requests' ? object.name : undefined;
   const outcome = classifyAttemptOutcome({ kind: 'http', status: response.status, errorCode: providerCode,
    retryAfter: response.headers.get('retry-after'), receivedAtMs: Date.now(), validAcceptance: acceptedId.success });
   return { ...outcome, providerId: outcome.classification === 'accepted' && acceptedId.success ? acceptedId.data : null };
  };
  return await Promise.race([operation(), deadline]);
 } catch {
  return controller.signal.aborted ? failure('PROVIDER_TIMEOUT') : failure('PROVIDER_NETWORK_ERROR');
 } finally {
  if (timer) clearTimeout(timer);
  options.signal?.removeEventListener('abort', abort);
  try { reader?.releaseLock(); } catch { /* Cancellation can complete a pending read after the deadline. */ }
 }
}
