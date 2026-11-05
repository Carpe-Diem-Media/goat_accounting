import { describe, expect, test } from 'bun:test';
import { handleContactPost } from './contact-api';
import { createLeadFromEstimate, type ContactDependencies } from './create-lead';
import { ContactConflictError, ContactPersistenceError, ContactUnavailableError } from './errors';

const ref = 'a'.repeat(32);
const input = { fullName: 'Synthetic Prospect', email: 'synthetic@example.invalid', preferredContactMethod: 'email', contactConsent: true, requestedContact: true, requestedEstimateEmail: false, turnstileToken: 'fresh-token' };
function request(body: unknown = input, headers: Record<string, string> = {}) {
 return new Request(`https://example.invalid/api/estimates/${ref}/contact`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.invalid', ...headers }, body: JSON.stringify(body) });
}
function setup() {
 const calls: string[] = [];
 const used = new Set<string>();
 const dependencies: ContactDependencies = {
  verify: async (token: string) => { calls.push('verify'); if (used.has(token)) return { success: false as const, reason: 'rejected' as const }; used.add(token); return { success: true as const }; },
  findEstimateId: async () => { calls.push('lookup'); return 'synthetic-estimate-id'; },
  createContactLead: async () => { calls.push('persist'); }
 };
 return { calls, dependencies, create: (body: unknown) => createLeadFromEstimate(ref, body, dependencies) };
}

describe('contact boundary', () => {
 test('verifies before lookup and persistence, returns no contact data or internal IDs', async () => {
  const fixture = setup();
  const response = await handleContactPost(request(), fixture.create);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ saved: true });
  expect(fixture.calls).toEqual(['verify', 'lookup', 'persist']);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
 });
 test('a used token cannot authorize another request or action', async () => {
  const fixture = setup();
  expect((await handleContactPost(request(), fixture.create)).status).toBe(200);
  expect((await handleContactPost(request({ ...input, requestedEstimateEmail: true }), fixture.create)).status).toBe(403);
  expect(fixture.calls.filter((call) => call === 'persist')).toHaveLength(1);
 });
 test('a fresh token permits a matching retry through the atomic RPC', async () => {
  const fixture = setup();
  await handleContactPost(request(), fixture.create);
  const response = await handleContactPost(request({ ...input, turnstileToken: 'second-fresh-token' }), fixture.create);
  expect(response.status).toBe(200);
  expect(fixture.calls).toEqual(['verify', 'lookup', 'persist', 'verify', 'lookup', 'persist']);
 });
 test('invalid ref, consent, extra server fields and missing tokens never persist', async () => {
  for (const body of [{ ...input, contactConsent: false }, { ...input, turnstileToken: '' }, { ...input, contactConsentAt: 'yesterday' }, { ...input, marketingConsent: true }, { ...input, requestedContact: false }, { ...input, email: 'bad' }, { ...input, turnstileToken: 'x'.repeat(2049) }]) {
   const fixture = setup();
   expect((await handleContactPost(request(body), fixture.create)).status).toBe(400);
   expect(fixture.calls).toEqual([]);
  }
  const fixture = setup();
  await expect(createLeadFromEstimate('invalid-ref', input, fixture.dependencies)).rejects.toThrow();
  expect(fixture.calls).toEqual([]);
 });
 test('failed verification and verifier outage cannot reach persistence', async () => {
  for (const reason of ['rejected', 'unavailable'] as const) {
   const fixture = setup();
   const dependencies = { ...fixture.dependencies, verify: async () => ({ success: false as const, reason }) };
   const response = await handleContactPost(request(), (body) => createLeadFromEstimate(ref, body, dependencies));
   expect(response.status).toBe(reason === 'rejected' ? 403 : 503);
   expect(fixture.calls).toEqual([]);
  }
 });
 test('unknown estimate returns a safe unavailable response', async () => {
  const fixture = setup();
  const response = await handleContactPost(request(), (body) => createLeadFromEstimate(ref, body, { ...fixture.dependencies, findEstimateId: async () => null }));
  expect(response.status).toBe(404);
  expect(fixture.calls).toEqual(['verify']);
 });
 test('rejects cross-origin and non-JSON requests before processing', async () => {
  for (const headers of [{ origin: 'https://attacker.invalid' }, { 'content-type': 'text/plain' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
   const response = await handleContactPost(request(input, headers), async () => { throw new Error('must not call'); });
   expect([400, 403]).toContain(response.status);
  }
 });
 test('bounds declared and streamed bodies even with a false content-length', async () => {
  const fixture = setup();
  expect((await handleContactPost(request(input, { 'content-length': '20000' }), fixture.create)).status).toBe(413);
  expect((await handleContactPost(request({ padding: 'x'.repeat(17000) }, { 'content-length': '1' }), fixture.create)).status).toBe(413);
  expect(fixture.calls).toEqual([]);
 });
 test('rejects throttled requests before verification or persistence', async () => {
  for (const outcome of ['limited', 'unavailable'] as const) {
   const fixture = setup();
   const response = await handleContactPost(request(), fixture.create, async () => outcome);
   expect(response.status).toBe(outcome === 'limited' ? 429 : 503);
   if (outcome === 'limited') expect(response.headers.get('retry-after')).toBe('60');
   expect(fixture.calls).toEqual([]);
  }
 });
 test('rejects malformed UTF-8 and JSON', async () => {
  const fixture = setup();
  for (const body of ['{', new Uint8Array([255])]) {
   const response = await handleContactPost(new Request('https://example.invalid/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body }), fixture.create);
   expect(response.status).toBe(400);
  }
  expect(fixture.calls).toEqual([]);
 });
 test('maps conflicts and persistence failures without returning error details or PII', async () => {
  for (const [error, status] of [[new ContactConflictError(), 409], [new ContactUnavailableError(), 404], [new ContactPersistenceError(), 503], [new Error('synthetic@example.invalid secret internal-id'), 503]] as const) {
   const response = await handleContactPost(request(), async () => { throw error; });
   expect(response.status).toBe(status);
   const body = await response.text();
   expect(body).not.toContain('synthetic@example.invalid');
   expect(body).not.toContain('secret');
   expect(body).not.toContain('internal-id');
  }
 });
});
