import { expect, test } from 'bun:test';
import { dashboardPeriod } from './dashboard';

test('period is restricted to supported bounded windows', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  expect(dashboardPeriod('7', now)).toEqual({ days: 7, start: '2026-11-03T12:00:00.000Z', end: '2026-11-10T12:00:00.000Z' });
  expect(dashboardPeriod('999999', now).days).toBe(30);
  expect(dashboardPeriod(null, now).days).toBe(30);
});

import { parseDashboardMetrics } from './dashboard';

test('dashboard metrics accept aggregates and reject malformed provider responses', () => {
  const metrics = { completed: 2, today: 1, with_contact: 1, manual_review: 0, new_leads: 1, failed_notifications: null, catchup_min_cents: '10000', catchup_max_cents: '20000', ongoing_min_cents: '0', ongoing_max_cents: '10000' };
  expect(parseDashboardMetrics(metrics)).toEqual(metrics);
  expect(() => parseDashboardMetrics({ ...metrics, catchup_min_cents: '1e3' })).toThrow();
  expect(() => parseDashboardMetrics({ ...metrics, with_contact: 3 })).toThrow();
});
