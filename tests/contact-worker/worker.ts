import { handleContactPost } from '../../src/lib/server/leads/contact-api';
import { createLeadFromEstimate } from '../../src/lib/server/leads/create-lead';
import { verifyTurnstile } from '../../src/lib/server/leads/turnstile';
import { checkContactRateLimit, type ContactRateLimiter } from '../../src/lib/server/leads/rate-limit';
import { ContactConflictError } from '../../src/lib/server/leads/errors';
import type { ContactInput } from '../../src/lib/domain/leads/contact';

// Synthetic runtime fixture only. PostgreSQL transaction/RLS proofs remain in supabase/tests.
const publicRef = 'd'.repeat(32);
const redeemed = new Set<string>();
let lead: string | undefined;
let events = 0;
let deliveries = 0;

export default {
 async fetch(request: Request, env: { CONTACT_RATE_LIMITER: ContactRateLimiter }): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/state') return Response.json({ leads: lead ? 1 : 0, events, deliveries });
  if (request.method !== 'POST' || url.pathname !== `/api/estimates/${publicRef}/contact`) return new Response(null, { status: 404 });
  return handleContactPost(request, (body) => createLeadFromEstimate(publicRef, body, {
   verify: (token) => verifyTurnstile(token, { secret: 'synthetic-secret', hostname: 'example.invalid' }, {
    fetch: async (endpoint) => {
     if (endpoint !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') throw new Error('Unexpected verifier endpoint');
     if (token === 'upstream-down') throw new Error('Synthetic unavailable provider');
     if (redeemed.has(token) || token === 'expired') return Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
     redeemed.add(token);
     return Response.json({ success: true, hostname: 'example.invalid', action: 'estimate_contact', challenge_ts: new Date().toISOString() });
    }
   }),
   findEstimateId: async () => 'synthetic-estimate-id',
   createContactLead: async (_id: string, input: ContactInput) => {
    const fingerprint = JSON.stringify(input);
    if (lead && lead !== fingerprint) throw new ContactConflictError();
    if (lead) return;
    lead = fingerprint;
    events++;
    deliveries = Number(input.requestedContact) + Number(input.requestedEstimateEmail);
   }
  }), () => checkContactRateLimit(env.CONTACT_RATE_LIMITER, publicRef, '192.0.2.1'));
 }
};
