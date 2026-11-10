import { expect, test } from 'bun:test';
import { createOperationalEvent, logOperationalEvent, observeProvider, observeResponse } from './observability';

test('operational logs drop unapproved fields and invalid values', () => {
  const event = createOperationalEvent({ route: 'estimate_create', outcome: 'failure', request_id: 'bad@example.com', error_code: 'private@example.com', provider_latency_ms: 12, answers: 'private', url: '?token=secret' });
  expect(event).toEqual({ route: 'estimate_create', outcome: 'failure', provider_latency_ms: 12 });
});
test('logging failure never interrupts the request', () => {
  expect(() => logOperationalEvent({ route: 'estimate_create', outcome: 'success' }, () => { throw new Error('unavailable'); })).not.toThrow();
});

test('observation preserves the response and emits no request data', async () => {
  const events: unknown[] = [];
  const response = new Response('saved', { status: 201 });
  expect(await observeResponse('estimate_create', Promise.resolve(response), (event) => events.push(event))).toBe(response);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ route: 'estimate_create', outcome: 'success' });
});

test('provider observation preserves the result and correlates a safe latency event', async () => {
  const events: unknown[] = [];
  const result = { success: false, reason: 'unavailable', private: 'not logged' };
  expect(await observeProvider('estimate_contact', 'c0ffee00-0000-4000-8000-000000000000', async () => result, (event) => events.push(event))).toBe(result);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ route: 'estimate_contact', outcome: 'failure', request_id: 'c0ffee00-0000-4000-8000-000000000000', error_code: 'provider_failed' });
  expect(JSON.stringify(events)).not.toContain('not logged');
});
test('provider observation preserves thrown failures when logging also fails', async () => {
  const failure = new Error('provider exception');
  await expect(observeProvider('estimate_contact', undefined, async () => { throw failure; }, () => { throw new Error('logger failure'); })).rejects.toBe(failure);
});
test('response observation logs rejections without leaking the exception or changing it', async () => {
  const events: unknown[] = [];
  const failure = new Error('private@example.invalid?token=secret');
  await expect(observeResponse('estimate_create', Promise.reject(failure), (event) => events.push(event), 'c0ffee00-0000-4000-8000-000000000000')).rejects.toBe(failure);
  expect(events).toEqual([{ route: 'estimate_create', outcome: 'failure', request_id: 'c0ffee00-0000-4000-8000-000000000000', error_code: 'unavailable' }]);
  expect(JSON.stringify(events)).not.toContain('private');
});
