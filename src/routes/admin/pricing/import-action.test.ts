import { describe, expect, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { actions } from './+page.server';

const actor = '10000000-0000-4000-8000-000000000001';
const source = '20000000-0000-4000-8000-000000000001';
const resultId = '30000000-0000-4000-8000-000000000001';

function event(role = 'admin', state = 'ACTIVE', aal = 'aal2', version = '1.2.3', pricingAdminEnabled = true) {
 const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: {user_id: actor, role, state}, error: null }) };
 const form = new FormData(); form.set('sourceId', source); form.set('version', version); form.set('actor', 'forged');
 return { locals: { pricingAdminEnabled, supabase: { auth: { getClaims: async () => ({data:{claims:{sub:actor,aal}},error:null}), mfa:{getAuthenticatorAssuranceLevel:async () => ({data:{currentLevel:aal,nextLevel:'aal2'},error:null})} }, from: () => query } }, platform:{env:{SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_SECRET_KEY:'test-only-key'}}, request:new Request('https://goat.test/admin/pricing?/clone',{method:'POST',body:form}) } as unknown as RequestEvent;
}
const importAction = actions.importStarter as (event: RequestEvent) => Promise<unknown>;
async function outcome(e: RequestEvent) { try { return await importAction(e); } catch (x) { return x as {status:number}; } }

describe('first pricing import', () => {
 test('denies disabled release, non-admin, inactive and AAL1 requests', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => { count++; throw new Error('unexpected RPC'); }) as unknown as typeof fetch;
  try {
   for (const e of [event('viewer'), event('admin','SUSPENDED'), event('admin','ACTIVE','aal1'), event('admin','ACTIVE','aal2','',false)]) {
    expect([303,403,404]).toContain((await outcome(e) as {status:number}).status);
   }
   expect(count).toBe(0);
  } finally { globalThis.fetch = original; }
 });
 test('imports the server-selected DRAFT for the authenticated actor only', async () => {
  const original = globalThis.fetch;
  let payload: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
   payload = JSON.parse(String(init?.body));
   return Response.json(resultId);
  }) as unknown as typeof fetch;
  try {
   expect((await outcome(event()) as {status:number}).status).toBe(303);
   expect(payload.p_actor_user_id).toBe(actor);
   expect(payload.p_model).toMatchObject({ state: 'DRAFT', currency: 'ZAR' });
   expect(payload.p_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  } finally { globalThis.fetch = original; }
 });
});
