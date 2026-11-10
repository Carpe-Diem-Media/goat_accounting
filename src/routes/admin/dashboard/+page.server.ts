import { error } from '@sveltejs/kit';
import { requireStaff } from '$lib/server/auth/staff-guard';
import { dashboardPeriod } from '$lib/server/analytics/dashboard';
import { loadDashboardMetrics } from '$lib/server/supabase/repositories/dashboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  await requireStaff(event);
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const period = dashboardPeriod(event.url.searchParams.get('days'));
  if (!event.locals.supabase) throw error(503, 'Dashboard is temporarily unavailable.');
  try {
    const metrics = await loadDashboardMetrics(event.locals.supabase, period);
    return { metrics, period };
  } catch {
    throw error(503, 'Dashboard is temporarily unavailable. Please try again.');
  }
};
