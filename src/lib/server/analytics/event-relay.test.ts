import { expect, test } from 'bun:test';
import { handleAnalyticsEvent } from './event-relay';

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://goat.test/api/analytics/events', { method: 'POST', headers: { origin: 'https://goat.test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
const valid = { event: 'estimate_completed', calculator_type: 'business' };
test('disabled relay does not send events', async () => {
  let calls = 0;
  const response = await handleAnalyticsEvent(request(valid), { enabled: false, limit: async () => true, deliver: async () => { calls++; } });
  expect(response.status).toBe(503);
  expect(calls).toBe(0);
});
test('accepts only the approved payload and passes no request metadata to a mock destination', async () => {
  const sent: unknown[] = [];
  const response = await handleAnalyticsEvent(request(valid, { referer: 'https://goat.test/estimate/secret?email=private', cookie: 'session=secret' }), { enabled: true, limit: async () => true, deliver: async (event) => { sent.push(event); } });
  expect(response.status).toBe(204);
  expect(sent).toEqual([valid]);
});
test('rejects personal data, identifiers, invalid enums, URLs and unknown fields', async () => {
  for (const payload of [{ ...valid, email: 'private@example.invalid' }, { ...valid, public_ref: 'secret' }, { ...valid, page_location: 'https://goat.test/?token=secret' }, { ...valid, amount: 999 }, { ...valid, calculator_type: 'private@example.invalid' }, { event: 'unknown' }]) {
    let sent = false;
    expect((await handleAnalyticsEvent(request(payload), { enabled: true, limit: async () => true, deliver: async () => { sent = true; } })).status).toBe(400);
    expect(sent).toBe(false);
  }
});
test('rejects cross-origin, oversized and rate-limited requests', async () => {
  const deps = { enabled: true, limit: async () => true, deliver: async () => {} };
  expect((await handleAnalyticsEvent(request(valid, { origin: 'https://attacker.test' }), deps)).status).toBe(403);
  expect((await handleAnalyticsEvent(request({ ...valid, padding: 'x'.repeat(2000) }), deps)).status).toBe(413);
  expect((await handleAnalyticsEvent(request(valid), { ...deps, limit: async () => false })).status).toBe(429);
});
test('destination failures are contained', async () => {
  expect((await handleAnalyticsEvent(request(valid), { enabled: true, limit: async () => true, deliver: async () => { throw new Error('private'); } })).status).toBe(503);
});
test('fails closed on missing origin, incorrect content type, dishonest length and limiter errors', async () => {
  const deps = { enabled: true, limit: async () => true, deliver: async () => {} };
  expect((await handleAnalyticsEvent(new Request('https://goat.test/api/analytics/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) }), deps)).status).toBe(403);
  expect((await handleAnalyticsEvent(request(valid, { 'content-type': 'text/plain' }), deps)).status).toBe(400);
  expect((await handleAnalyticsEvent(request({ ...valid, padding: 'x'.repeat(2000) }, { 'content-length': '1' }), deps)).status).toBe(413);
  expect((await handleAnalyticsEvent(request(valid), { ...deps, limit: async () => { throw new Error('private'); } })).status).toBe(503);
});
