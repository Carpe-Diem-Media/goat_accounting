import { describe, expect, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { TEST_PRICING_MODEL } from '../../../lib/domain/pricing/test-corpus';
import { editableFields } from '../../../lib/domain/pricing/editable-fields';
import { actions } from './[id]/+page.server';

const actor='10000000-0000-4000-8000-000000000001', id='20000000-0000-4000-8000-000000000001';
const model={...structuredClone(TEST_PRICING_MODEL),id,state:'DRAFT' as const};
const rows=model.rules.map((rule,index)=>{
 const {type,scope,category,code,label,explanation,...rest}=rule;
 const parts=rest as Record<string,unknown>; const {inputKey,when,condition,...parameters}=parts;
 return {id:`30000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,rule_type:type,scope,category,code,label,explanation,input_key:inputKey??null,conditions:when?{when}:condition?{condition}:{},parameters,enabled:true,sort_order:index};
});
const persisted={id,version:model.version,engine_contract_version:model.engineVersion,currency:'ZAR',state:'DRAFT',confidence_high_max_points:0,confidence_good_max_points:1,draft_revision:3,pricing_rules:rows};
function event(role='admin',aal='aal2',revision='3') {
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{user_id:actor,role,state:'ACTIVE'},error:null})};
 const form=new FormData(); form.set('revision',revision); editableFields(model).forEach((field,index)=>form.set(`field.${index}`,String(field.value))); model.rules.forEach((_rule,index)=>form.set(`enabled.${index}`,'on'));
 return {params:{id},locals:{supabase:{auth:{getClaims:async()=>({data:{claims:{sub:actor,aal}},error:null}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal,nextLevel:'aal2'},error:null})}},from:()=>query}},platform:{env:{SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_SECRET_KEY:'test-only-key'}},request:new Request('https://goat.test/admin/pricing/test?/save',{method:'POST',body:form})} as unknown as RequestEvent;
}
const save=actions.save as (event:RequestEvent)=>Promise<unknown>;
async function outcome(value:RequestEvent) {try{return await save(value);}catch(cause){return cause as {status:number};}}
describe('draft save action',()=>{
 test('denies viewer, advisor and AAL1 before using privileged client',async()=>{
  let calls=0;const original=globalThis.fetch;globalThis.fetch=(async()=>{calls++;throw new Error('unexpected');}) as unknown as typeof fetch;
  try {for(const e of [event('viewer'),event('advisor'),event('admin','aal1')]) expect([303,403]).toContain((await outcome(e) as {status:number}).status);expect(calls).toBe(0);} finally {globalThis.fetch=original;}
 });
 test('uses verified actor and rejects stale revisions before saving',async()=>{
  let writes=0;let actorUsed:unknown;const original=globalThis.fetch;
  globalThis.fetch=(async(input,init)=>{const url=String(input);if(url.includes('/rpc/save_pricing_draft')){writes++;actorUsed=JSON.parse(String(init?.body)).p_actor_user_id;return new Response('4',{headers:{'content-type':'application/json'}});}return new Response(JSON.stringify(persisted),{headers:{'content-type':'application/json'}});}) as typeof fetch;
  try {expect((await outcome(event('admin','aal2','2')) as {status:number}).status).toBe(409);expect(writes).toBe(0);expect((await outcome(event()) as {status:number}).status).toBe(303);expect(writes).toBe(1);expect(actorUsed).toBe(actor);} finally {globalThis.fetch=original;}
 });
});
