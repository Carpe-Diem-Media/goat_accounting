import { handleAnalyticsEvent } from '$lib/server/analytics/event-relay';
import type { RequestHandler } from './$types';

export const prerender = false;
// No production destination, activation flag or limiter has been approved.
// This endpoint remains disabled until a reviewed configuration supplies all three.
export const POST: RequestHandler = ({ request }) => handleAnalyticsEvent(request, {
  enabled: false,
  limit: async () => false,
  deliver: async () => { throw new Error('Relay disabled'); }
});
