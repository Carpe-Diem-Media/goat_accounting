import { expect, test } from 'bun:test';
import { createOperationalEvent, logOperationalEvent } from './observability';

test('operational logs drop unapproved fields and invalid values', () => {
  const event = createOperationalEvent({ route: 'estimate_create', outcome: 'failure', request_id: 'bad@example.com', error_code: 'private@example.com', provider_latency_ms: 12, answers: 'private', url: '?token=secret' });
  expect(event).toEqual({ route: 'estimate_create', outcome: 'failure', provider_latency_ms: 12 });
});
test('logging failure never interrupts the request', () => {
  expect(() => logOperationalEvent({ route: 'estimate_create', outcome: 'success' }, () => { throw new Error('unavailable'); })).not.toThrow();
});

import { observeResponse } from './observability';
test('observation preserves the response and emits no request data', async () => {
  const events: unknown[] = [];
  const response = new Response('saved', { status: 201 });
  expect(await observeResponse('estimate_create', Promise.resolve(response), (event) => events.push(event))).toBe(response);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ route: 'estimate_create', outcome: 'success' });
});
