import { logOperationalEvent, newCorrelationId, observeProvider, observeResponse } from '$lib/server/observability';
import { env as workerEnv } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { createEstimatorServiceClient } from '$lib/server/supabase/client.server';
import { createLeadsRepository } from '$lib/server/supabase/repositories/leads';
import { createLeadFromEstimate } from '$lib/server/leads/create-lead';
import { contactUnavailable, handleContactPost } from '$lib/server/leads/contact-api';
import { checkContactRateLimit } from '$lib/server/leads/rate-limit';
import { verifyTurnstile } from '$lib/server/leads/turnstile';
import { createNotificationsRepository } from '$lib/server/supabase/repositories/notifications';
import { deliverContactNotifications } from '$lib/server/notifications/deliver';

export const prerender = false;

export const POST: RequestHandler = async ({ request, params, platform }) => {
 const bindings = platform?.env ?? workerEnv;
 if (bindings?.ESTIMATE_CONTACT_ENABLED !== 'true' || !bindings.TURNSTILE_SECRET_KEY || !bindings.TURNSTILE_HOSTNAME) return contactUnavailable();
 const requestId = newCorrelationId();
 try {
  const repository = createLeadsRepository(createEstimatorServiceClient(bindings));
  return await observeResponse('estimate_contact', handleContactPost(request, (body) => createLeadFromEstimate(params.publicRef, body, {
   ...repository,
   afterCommit: async (saved) => {
    try {
     const notificationRepository = createNotificationsRepository(createEstimatorServiceClient(bindings));
     await deliverContactNotifications(saved, bindings, { repository: notificationRepository,
      report: (item) => logOperationalEvent({ route: 'estimate_contact', request_id: requestId,
       outcome: item.state === 'SENT' ? 'success' : 'failure',
       ...(item.state === 'SENT' ? {} : { error_code: 'provider_failed' }) })
     });
    } catch { logOperationalEvent({ route: 'estimate_contact', request_id: requestId, outcome: 'failure', error_code: 'unavailable' }); }
   },
   verify: (token) => observeProvider('estimate_contact', requestId, () => verifyTurnstile(token, {
    secret: bindings.TURNSTILE_SECRET_KEY!, hostname: bindings.TURNSTILE_HOSTNAME!
   }))
  }), () => checkContactRateLimit(bindings.CONTACT_RATE_LIMITER, params.publicRef, request.headers.get('cf-connecting-ip'))), undefined, requestId);
 } catch { return contactUnavailable(); }
};
