import { env as workerEnv } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { createEstimatorServiceClient } from '$lib/server/supabase/client.server';
import { createLeadsRepository } from '$lib/server/supabase/repositories/leads';
import { createLeadFromEstimate } from '$lib/server/leads/create-lead';
import { contactUnavailable, handleContactPost } from '$lib/server/leads/contact-api';
import { checkContactRateLimit } from '$lib/server/leads/rate-limit';
import { verifyTurnstile } from '$lib/server/leads/turnstile';

export const prerender = false;

export const POST: RequestHandler = async ({ request, params, platform }) => {
 const bindings = platform?.env ?? workerEnv;
 if (bindings?.ESTIMATE_CONTACT_ENABLED !== 'true' || !bindings.TURNSTILE_SECRET_KEY || !bindings.TURNSTILE_HOSTNAME) return contactUnavailable();
 try {
  const repository = createLeadsRepository(createEstimatorServiceClient(bindings));
  return await handleContactPost(request, (body) => createLeadFromEstimate(params.publicRef, body, {
   ...repository,
   verify: (token) => verifyTurnstile(token, {
    secret: bindings.TURNSTILE_SECRET_KEY!, hostname: bindings.TURNSTILE_HOSTNAME!
   })
  }), () => checkContactRateLimit(bindings.CONTACT_RATE_LIMITER, params.publicRef, request.headers.get('cf-connecting-ip')));
 } catch { return contactUnavailable(); }
};
