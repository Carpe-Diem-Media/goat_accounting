import { expect, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { loadDashboardMetrics } from './dashboard';

const metrics = { completed: 2, today: 1, with_contact: 1, manual_review: 0, new_leads: 1, failed_notifications: null, catchup_min_cents: '100', catchup_max_cents: '200', ongoing_min_cents: '0', ongoing_max_cents: '0' };
test('dashboard repository sends only the bounded RPC arguments and parses aggregates', async () => {
  const calls: unknown[] = [];
  const client = { rpc: async (...args: unknown[]) => { calls.push(args); return { data: metrics, error: null }; } } as unknown as SupabaseClient<Database, 'estimator'>;
  const period = { start: '2026-11-01T00:00:00.000Z', end: '2026-11-08T00:00:00.000Z' };
  expect(await loadDashboardMetrics(client, period)).toEqual(metrics);
  expect(calls).toEqual([['dashboard_metrics', { p_start: period.start, p_end: period.end }]]);
});
test('dashboard repository fails closed on provider errors and malformed results', async () => {
  const period = { start: '2026-11-01T00:00:00.000Z', end: '2026-11-08T00:00:00.000Z' };
  const failure = { rpc: async () => ({ data: null, error: { message: 'private provider detail' } }) } as unknown as SupabaseClient<Database, 'estimator'>;
  await expect(loadDashboardMetrics(failure, period)).rejects.toThrow('Dashboard metrics unavailable');
  const malformed = { rpc: async () => ({ data: { ...metrics, email: 'private@example.invalid' }, error: null }) } as unknown as SupabaseClient<Database, 'estimator'>;
  await expect(loadDashboardMetrics(malformed, period)).rejects.toThrow();
});
