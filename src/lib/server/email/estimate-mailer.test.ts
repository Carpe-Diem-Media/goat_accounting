import { describe, expect, test } from 'bun:test';
import { contentDigest, loadEstimateMailConfiguration, sendEstimateMail } from './estimate-mailer';

// TEST-ONLY business wording and credentials. Every HTTP request below uses an injected mock.
const content = { publicOrigin: 'https://example.test', approvalReference: 'TEST-ONLY reference', disclaimer: 'TEST-ONLY disclaimer', contactName: 'TEST-ONLY contact', contactEmail: 'contact@example.test' };
const id = '65000000-0000-4000-8000-000000000001';
const providerId = '66000000-0000-4000-8000-000000000001';
const message = { subject: 'TEST-ONLY saved estimate', html: '<p>TEST-ONLY saved summary</p>', text: 'TEST-ONLY saved summary' };
async function configuration() {
 const env = { ESTIMATE_NOTIFICATIONS_ENABLED: 'true', ESTIMATE_EMAIL_CONTENT: JSON.stringify(content), ESTIMATE_EMAIL_CONTENT_SHA256: await contentDigest(content), RESEND_API_KEY: 'TEST_ONLY_NOT_A_REAL_KEY', ESTIMATE_EMAIL_FROM: 'from@example.test', ESTIMATE_EMAIL_INTERNAL_TO: 'internal@example.test' };
 const loaded = await loadEstimateMailConfiguration(env, true);
 if (loaded.status !== 'ready') throw new Error('TEST-ONLY configuration fixture unavailable');
 return { env, config: loaded.config };
}

describe('estimator-only Resend transport', () => {
 test('keeps real delivery disabled and requires matching approved content configuration', async () => {
  expect((await loadEstimateMailConfiguration({})).status).toBe('disabled');
  const { env } = await configuration();
  expect((await loadEstimateMailConfiguration(env)).status).toBe('configuration_error');
  expect((await loadEstimateMailConfiguration({ ...env, ESTIMATE_EMAIL_CONTENT_SHA256: 'a'.repeat(64) }, true)).status).toBe('configuration_error');
  expect((await loadEstimateMailConfiguration({ ...env, ESTIMATE_EMAIL_FROM: undefined }, true)).status).toBe('configuration_error');
 });
 test('accepts an exact approved-content digest without requiring test mode', async () => {
  // TEST-ONLY fixture simulates approval; it is never used with a real HTTP implementation.
  const TEST_ONLY_APPROVED_COPY = { ...content, disclaimer: 'Synthetic isolated fixture disclaimer.', contactName: 'Synthetic fixture contact', approvalReference: 'fixture-approval-0001' };
  const { env } = await configuration();
  const loaded = await loadEstimateMailConfiguration({ ...env, ESTIMATE_EMAIL_CONTENT: JSON.stringify(TEST_ONLY_APPROVED_COPY), ESTIMATE_EMAIL_CONTENT_SHA256: await contentDigest(TEST_ONLY_APPROVED_COPY) });
  expect(loaded.status).toBe('ready');
 });
 test('uses identical payloads and stable delivery keys for repeated attempts', async () => {
  const { config } = await configuration();
  const requests: RequestInit[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
   expect(url).toBe('https://api.resend.com/emails'); requests.push(init!);
   return Response.json({ id: providerId });
  };
  const one = await sendEstimateMail(config, id, 'customer@example.test', message, { fetch: fetcher });
  const two = await sendEstimateMail(config, id, 'customer@example.test', message, { fetch: fetcher });
  expect(one.classification).toBe('accepted'); expect(one.providerId).toBe(providerId); expect(two.providerId).toBe(providerId);
  expect(requests[0].body).toBe(requests[1].body);
  expect(new Headers(requests[0].headers).get('Idempotency-Key')).toBe('goat-estimate/' + id);
  expect(requests[0].redirect).toBe('error');
  expect(JSON.parse(String(requests[0].body))).not.toHaveProperty('attachments');
 });
 test('classifies provider conflicts, rate limits, auth failures and malformed acceptance safely', async () => {
  const { config } = await configuration();
  for (const [status, body, expected] of [
   [503, {}, 'retryable'], [429, {}, 'retryable'], [401, {}, 'permanent'],
   [409, { name: 'concurrent_idempotent_requests' }, 'retryable'],
   [409, { name: 'invalid_idempotent_request' }, 'permanent'], [200, {}, 'uncertain']
  ] as const) {
   const result = await sendEstimateMail(config, id, 'customer@example.test', message, { fetch: async () => Response.json(body, { status, headers: { 'Retry-After': '60' } }) });
   expect(result.classification).toBe(expected);
   expect(JSON.stringify(result)).not.toContain('customer@example.test');
  }
 });
 test('bounds response bytes and includes body consumption in the deadline', async () => {
  const { config } = await configuration();
  const oversized = await sendEstimateMail(config, id, 'customer@example.test', message, { fetch: async () => new Response('x'.repeat(17000)) });
  expect(oversized.classification).toBe('uncertain');
  let cancelled = false;
  const stalled = await sendEstimateMail(config, id, 'customer@example.test', message, {
   timeoutMs: 10,
   fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }))
  });
  expect(stalled.code).toBe('PROVIDER_TIMEOUT'); expect(cancelled).toBe(true);
 });
 test('does not use real fetch with TEST-ONLY configuration or start an already aborted request', async () => {
  const { config } = await configuration();
  expect((await sendEstimateMail(config, id, 'customer@example.test', message)).code).toBe('PROVIDER_REJECTED');
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await sendEstimateMail(config, id, 'customer@example.test', message, { signal: controller.signal, fetch: async () => { calls++; return Response.json({ id: providerId }); } });
  expect(calls).toBe(0);
 });
});
