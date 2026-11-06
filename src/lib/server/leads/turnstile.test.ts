import { describe, expect, test } from 'bun:test';
import { verifyTurnstile } from './turnstile';

const now = Date.parse('2026-11-05T12:00:00Z');
const config = { secret: 'synthetic-secret', hostname: 'example.invalid' };
const valid = { success: true, hostname: 'example.invalid', action: 'estimate_contact', challenge_ts: new Date(now - 1000).toISOString() };
const verify = (body: unknown, token = 'fresh-token') => verifyTurnstile(token, config, {
 now: () => now,
 fetch: async () => Response.json(body)
});

describe('server Turnstile verification', () => {
 test('posts token and secret only to canonical Siteverify, without reusable idempotency authorization', async () => {
  let calls = 0;
  expect(await verifyTurnstile('fresh-token', config, { now: () => now, fetch: async (url, init) => {
   calls++;
   expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
   expect(init?.method).toBe('POST');
   const body = new URLSearchParams(String(init?.body));
   expect(Object.fromEntries(body)).toEqual({ secret: 'synthetic-secret', response: 'fresh-token' });
   expect(init?.signal).toBeDefined();
   return Response.json(valid);
  }})).toEqual({ success: true });
  expect(calls).toBe(1);
 });
 test('requires literal success, expected hostname and action', async () => {
  for (const body of [null, {}, { ...valid, success: 'true' }, { ...valid, success: false }, { ...valid, hostname: 'attacker.invalid' }, { ...valid, action: 'another_action' }, { ...valid, action: undefined }]) {
   expect(await verify(body)).toEqual({ success: false, reason: 'rejected' });
  }
 });
 test('rejects expiry, invalid timestamps and future challenges', async () => {
  for (const timestamp of [undefined, 'bad', new Date(now - 300_000).toISOString(), new Date(now + 1).toISOString()]) {
   expect(await verify({ ...valid, challenge_ts: timestamp })).toEqual({ success: false, reason: 'rejected' });
  }
 });
 test('rejects expired or replayed tokens without caching previous success', async () => {
  let calls = 0;
  const fetcher = async () => Response.json(calls++ === 0 ? valid : { success: false, 'error-codes': ['timeout-or-duplicate'] });
  expect(await verifyTurnstile('same-token', config, { now: () => now, fetch: fetcher })).toEqual({ success: true });
  expect(await verifyTurnstile('same-token', config, { now: () => now, fetch: fetcher })).toEqual({ success: false, reason: 'rejected' });
  expect(calls).toBe(2);
 });
 test('fails closed on network, non-JSON and upstream failures', async () => {
  for (const fetcher of [async () => { throw new Error('sensitive upstream detail'); }, async () => new Response('not json'), async () => new Response('', { status: 503 })]) {
   expect(await verifyTurnstile('fresh', config, { fetch: fetcher })).toEqual({ success: false, reason: 'unavailable' });
  }
 });
 test('treats provider and server-secret errors as unavailable without exposing details', async () => {
  for (const code of ['internal-error', 'missing-input-secret', 'invalid-input-secret']) {
   expect(await verify({ success: false, 'error-codes': [code] })).toEqual({ success: false, reason: 'unavailable' });
  }
 });
 test('rejects invalid token and absent server config before network access', async () => {
  const fetcher = async () => { throw new Error('must not call'); };
  for (const token of ['', ' ', 'a'.repeat(2049)]) expect(await verifyTurnstile(token, config, { fetch: fetcher })).toEqual({ success: false, reason: 'rejected' });
  expect(await verifyTurnstile('fresh', { secret: '', hostname: 'example.invalid' }, { fetch: fetcher })).toEqual({ success: false, reason: 'unavailable' });
  expect(await verifyTurnstile('fresh', { secret: 'secret', hostname: '' }, { fetch: fetcher })).toEqual({ success: false, reason: 'unavailable' });
 });
});
