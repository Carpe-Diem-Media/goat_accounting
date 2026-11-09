import { ContactConflictError, ContactPersistenceError, ContactUnavailableError } from './errors';
import { ContactValidationError, ContactVerificationError } from './create-lead';

const MAX_CONTACT_BYTES = 8 * 1024;

export function contactResponse(body: unknown, status: number): Response {
 return new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow, noarchive'
 }});
}

export function contactUnavailable(): Response {
 return contactResponse({ error: { code: 'CONTACT_UNAVAILABLE', message: 'Your request could not be saved right now. Please try again.' } }, 503);
}

export async function handleContactPost(request: Request, create: (body: unknown) => Promise<unknown>, checkLimit?: () => Promise<'allowed' | 'limited' | 'unavailable'>): Promise<Response> {
 const origin = request.headers.get('origin');
 if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
  return contactResponse({ error: { code: 'INVALID_ORIGIN', message: 'Submit your request from the estimate page.' } }, 403);
 }
 const failBody = (status: number) => contactResponse({ error: { code: status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST', message: 'Check your contact details and selections.' } }, status);
 if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !request.body) return failBody(400);
 const length = request.headers.get('content-length');
 if (length && /^\d+$/.test(length) && Number(length) > MAX_CONTACT_BYTES) return failBody(413);
 const reader = request.body.getReader();
 const chunks: Uint8Array[] = [];
 let size = 0;
 let body: unknown;
 try {
  while (true) {
   const { done, value } = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > MAX_CONTACT_BYTES) { await reader.cancel(); return failBody(413); }
   chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
 } catch { return failBody(400); }
 finally { reader.releaseLock(); }
 try {
  if (checkLimit) {
   const outcome = await checkLimit();
   if (outcome === 'unavailable') return contactUnavailable();
   if (outcome === 'limited') {
    const response = contactResponse({ error: { code: 'CONTACT_RATE_LIMITED', message: 'Too many requests. Wait a minute before trying again.' } }, 429);
    response.headers.set('retry-after', '60');
    return response;
   }
  }
  await create(body);
  return contactResponse({ saved: true }, 200);
 } catch (error) {
  if (error instanceof ContactValidationError) return failBody(400);
  if (error instanceof ContactVerificationError) {
   if (error.unavailable) return contactUnavailable();
   return contactResponse({ error: { code: 'VERIFICATION_REQUIRED', message: 'Complete a fresh security check and try again.' } }, 403);
  }
  if (error instanceof ContactConflictError) return contactResponse({ error: { code: 'CONTACT_CONFLICT', message: 'A different request has already been saved for this estimate. Its original selections cannot be changed.' } }, 409);
  if (error instanceof ContactUnavailableError) return contactResponse({ error: { code: 'ESTIMATE_UNAVAILABLE', message: 'This estimate is unavailable for a new request.' } }, 404);
  if (error instanceof ContactPersistenceError) return contactUnavailable();
  return contactUnavailable();
 }
}
