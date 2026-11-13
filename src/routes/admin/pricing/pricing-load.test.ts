import { expect, test } from 'bun:test';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { load } from './+page.server';
import { load as loadDraft } from './[id]/+page.server';
const actor='10000000-0000-4000-8000-000000000001';
function request(path: string, pricingAdminEnabled = true) {
 let range:number[]=[];
 const rows=Array.from({length:26},(_,i)=>({id:String(i),version:`1.0.${i}`,name:'fixture',state:'DRAFT',created_at:'2026-01-01',activated_at:null,retired_at:null,checksum:null}));
 const staff={select:()=>staff,eq:()=>staff,maybeSingle:async()=>({data:{user_id:actor,role:'admin',state:'ACTIVE'},error:null})};
 const query={select:()=>query,order:()=>query,range:async(a:number,b:number)=>{range=[a,b];return {data:rows,error:null};}};
 const event={url:new URL(`https://goat.test${path}`),params:{id:'20000000-0000-4000-8000-000000000001'},locals:{pricingAdminEnabled,supabase:{auth:{getClaims:async()=>({data:{claims:{sub:actor,aal:'aal2'}},error:null}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null})}},from:(table:string)=>table==='staff_users'?staff:query}}} as unknown as ServerLoadEvent;
 return {event,getRange:()=>range};
}
test('pricing list bounds pages and returns the next-page flag',async()=>{
 const {event,getRange}=request('/admin/pricing?page=2');
 const loadPage=load as (event:ServerLoadEvent)=>Promise<{models:unknown[];page:number;hasNext:boolean}>;
 const result=await loadPage(event);expect(getRange()).toEqual([25,50]);expect(result.models).toHaveLength(25);expect(result.page).toBe(2);expect(result.hasNext).toBe(true);
});

test('pricing list returns 404 while its release binding is disabled',async()=>{
 const {event,getRange}=request('/admin/pricing',false);
 try { await (load as (event:ServerLoadEvent)=>Promise<unknown>)(event); }
 catch (cause) { expect(cause).toMatchObject({status:404}); expect(getRange()).toEqual([]); return; }
 throw new Error('Expected pricing listing to be unavailable.');
});

test('pricing editor returns 404 while its release binding is disabled',async()=>{
 const {event,getRange}=request('/admin/pricing/20000000-0000-4000-8000-000000000001',false);
 try { await (loadDraft as (event:ServerLoadEvent)=>Promise<unknown>)(event); }
 catch (cause) { expect(cause).toMatchObject({status:404}); expect(getRange()).toEqual([]); return; }
 throw new Error('Expected pricing editor to be unavailable.');
});
