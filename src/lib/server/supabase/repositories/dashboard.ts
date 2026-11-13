import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { parseDashboardMetrics } from '../../analytics/dashboard';

/** Use the authenticated staff client so database RLS remains authoritative. */
export async function loadDashboardMetrics(client: SupabaseClient<Database, 'estimator'>, period: { start: string; end: string }) {
  const { data, error } = await client.rpc('dashboard_metrics', { p_start: period.start, p_end: period.end });
  if (error) throw new Error('Dashboard metrics unavailable');
  return parseDashboardMetrics(data);
}
