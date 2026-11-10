import { describe, expect, test } from 'bun:test';
import { createEstimatorEvent, trackEstimatorEvent, createEstimatorOnceTracker } from './estimator-analytics';

describe('estimator analytics privacy boundary', () => {
  test('keeps only explicitly allowed metadata and enum values', () => {
    const event = createEstimatorEvent('estimate_completed', {
      calculator_type: 'business', catch_up: true, manual_review: false,
      email: 'private@example.com', public_ref: 'secret', amount: 1234,
      page_location: 'https://example.com/estimate/secret?email=private'
    });
    expect(event).toEqual({ event: 'estimate_completed', calculator_type: 'business', catch_up: true, manual_review: false });
    expect(createEstimatorEvent('estimate_completed', { calculator_type: 'private@example.com', confidence: 'token', catch_up: 'true' })).toEqual({ event: 'estimate_completed' });
  });
  test('rejects unknown event names', () => {
    expect(createEstimatorEvent('private_event', { email: 'private@example.com' })).toBeNull();
  });
  test('delivery exceptions never escape', () => {
    expect(() => trackEstimatorEvent('estimate_started', {}, () => { throw new Error('provider failed'); })).not.toThrow();
  });
});

test('a successful operation emits at most once for a mounted journey', () => {
  const events: unknown[] = [];
  const trackOnce = createEstimatorOnceTracker((event) => events.push(event));
  trackOnce('estimate_completed');
  trackOnce('estimate_completed');
  trackOnce('estimate_contact_submitted');
  expect(events).toEqual([{ event: 'estimate_completed' }, { event: 'estimate_contact_submitted' }]);
});
