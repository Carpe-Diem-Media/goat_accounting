import { z } from 'zod';
export function dashboardPeriod(value: string | null, now = new Date()): { days: number; start: string; end: string } {
  const days = value === '7' ? 7 : value === '90' ? 90 : 30;
  return { days, start: new Date(now.getTime() - days * 86_400_000).toISOString(), end: now.toISOString() };
}
const count = z.number().int().nonnegative().safe();
const cents = z.string().regex(/^(0|[1-9]\d*)$/).max(40);
const dashboardMetricsSchema = z.object({
  completed: count, today: count, with_contact: count, manual_review: count, new_leads: count,
  failed_notifications: count.nullable(), catchup_min_cents: cents, catchup_max_cents: cents,
  ongoing_min_cents: cents, ongoing_max_cents: cents
}).strict().refine((v) => v.with_contact <= v.completed && v.today <= v.completed && v.manual_review <= v.completed && BigInt(v.catchup_min_cents) <= BigInt(v.catchup_max_cents) && BigInt(v.ongoing_min_cents) <= BigInt(v.ongoing_max_cents));
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;
export function parseDashboardMetrics(value: unknown): DashboardMetrics { return dashboardMetricsSchema.parse(value); }
