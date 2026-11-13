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
const cloneAction = actions.clone as (event: RequestEvent) => Promise<unknown>;
async function outcome(e: RequestEvent) { try { return await cloneAction(e); } catch (x) { return x as {status:number}; } }

describe('pricing clone action', () => {
 test('returns 404 while the release binding is disabled before using the privileged client', async () => {
  let calls = 0; const original = globalThis.fetch;
  globalThis.fetch = (async () => { calls++; throw new Error('unexpected'); }) as unknown as typeof fetch;
  try {
   const result = await outcome(event('admin','ACTIVE','aal2','1.2.3',false)) as {status:number};
   expect(result.status).toBe(404); expect(calls).toBe(0);
  } finally { globalThis.fetch = original; }
 });
 test('denies non-admin, inactive and AAL1 before invoking privileged client', async () => {
  for (const e of [event('viewer'),event('advisor'),event('admin','SUSPENDED'),event('admin','ACTIVE','aal1')]) {
   const result = await outcome(e); expect([303,403]).toContain((result as {status:number}).status);
  }
 });
 test('uses the verified actor and rejects invalid versions before invoking RPC', async () => {
  let calls = 0; let payload: Record<string,unknown> = {};
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => { calls++; payload=JSON.parse(String(init?.body)); return new Response(JSON.stringify(resultId),{headers:{'content-type':'application/json'}}); }) as typeof fetch;
  try {
   expect((await outcome(event('admin','ACTIVE','aal2','bad')) as {status:number}).status).toBe(400);
   expect(calls).toBe(0);
   expect((await outcome(event()) as {status:number}).status).toBe(303);
   expect(calls).toBe(1); expect(payload.p_actor_user_id).toBe(actor); expect(payload.p_source_id).toBe(source);
  } finally { globalThis.fetch=original; }
 });
 test('reports duplicate versions as a conflict without exposing database details', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ code: '23505', message: 'private database detail' }), {status:409,headers:{'content-type':'application/json'}})) as unknown as typeof fetch;
  try {
   const result = await outcome(event()) as { status: number; data?: { message?: string } };
   expect(result.status).toBe(409);
   expect(result.data?.message).not.toContain('private database detail');
  } finally { globalThis.fetch = original; }
 });
});
