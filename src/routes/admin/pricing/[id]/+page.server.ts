import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/staff-guard';
import { createEstimatorServiceClient, type EstimatorServerEnv } from '$lib/server/supabase/client.server';
import { createPricingRepository, PricingDraftConflictError } from '$lib/server/supabase/repositories/pricing';
import { DraftFieldError, parseDraftForm } from '$lib/server/pricing/draft-form';
import { updatePricingDraft } from '$lib/server/pricing/update-pricing-draft';
import { fingerprintDraft, runPricingCorpus } from '$lib/server/pricing/run-pricing-corpus';
import { editableFields } from '$lib/domain/pricing/editable-fields';

async function repository(event: Pick<RequestEvent, 'platform'>) {
 const env=(event.platform?.env ?? (await import('cloudflare:workers')).env) as EstimatorServerEnv;
 return createPricingRepository(createEstimatorServiceClient(env));
}
const validId=(id:string)=>z.uuid().safeParse(id).success;
export const load: PageServerLoad = async event => {
 await requireStaff(event,['admin']);
 if(!validId(event.params.id)) throw error(404,'Pricing model not found.');
 try {
  const repo=await repository(event); const draft=await repo.readDraft(event.params.id);
  if(!draft) throw error(404,'Pricing model not found.');
  return {draft,fields:editableFields(draft.model),fingerprint:draft.model.state==='DRAFT'?await fingerprintDraft(draft.model,draft.rules.map(rule=>rule.enabled)):null};
 } catch(cause) {
  if(typeof cause==='object' && cause!==null && 'status' in cause && cause.status===404) throw cause;
  throw error(503,'Pricing model is temporarily unavailable.');
 }
};
export const actions: Actions = {
 save: async event => {
  const actor=await requireStaff(event,['admin']);
  if(!validId(event.params.id)) throw error(404,'Pricing model not found.');
  let form:FormData; try {form=await event.request.formData();} catch {return fail(400,{message:'Unable to read the draft.'});}
  const revisions=form.getAll('revision'); const raw=revisions[0];
  if(revisions.length!==1 || typeof raw!=='string' || !/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw))) return fail(400,{message:'Invalid draft revision.'});
  let repo:Awaited<ReturnType<typeof repository>>;
  try {repo=await repository(event);} catch {throw error(503,'Pricing models are temporarily unavailable.');}
  let current; try {current=await repo.readDraft(event.params.id);} catch {throw error(503,'Pricing models are temporarily unavailable.');}
  if(!current) throw error(404,'Pricing model not found.');
  if(current.model.state!=='DRAFT') return fail(409,{message:'Only draft models can be edited.'});
  if(current.revision!==Number(raw)) return fail(409,{message:'This draft changed. Refresh before editing again.'});
  try {
   const update=parseDraftForm(current.model,form);
   await updatePricingDraft(repo,event.params.id,Number(raw),update.model,update.enabled,actor.userId);
  } catch(cause) {
   if(cause instanceof PricingDraftConflictError || (cause instanceof Error && cause.message==='Pricing draft changed.')) return fail(409,{message:'This draft changed. Refresh before editing again.'});
   if(cause instanceof Error && cause.message==='Unable to save pricing draft.') throw error(503,'Pricing models are temporarily unavailable.');
   if(cause instanceof DraftFieldError) return fail(400,{message:'Review the highlighted field.',field:cause.field,fieldMessage:cause.message});
   return fail(400,{message:'The draft contains invalid or incomplete values. Review the fields and try again.'});
  }
  throw redirect(303,`/admin/pricing/${event.params.id}`);
 },
 test: async event => {
  await requireStaff(event,['admin']);
  if(!validId(event.params.id)) throw error(404,'Pricing model not found.');
  let form:FormData; try {form=await event.request.formData();} catch {return fail(400,{message:'Unable to read the scenario manifest.'});}
  const raw=form.get('manifest'); if(typeof raw!=='string' || raw.length>131072 || new TextEncoder().encode(raw).byteLength>131072) return fail(400,{message:'Enter a manifest of at most 128 KiB.'});
  let draft; try {draft=await (await repository(event)).readDraft(event.params.id);} catch {throw error(503,'Pricing models are temporarily unavailable.');}
  if(!draft || draft.model.state!=='DRAFT') return fail(409,{message:'Only a draft can be tested.'});
  try {
   const report=await runPricingCorpus(draft.model,JSON.parse(raw),draft.rules.map(rule=>rule.enabled));
   return {report};
  } catch {return fail(400,{message:'The manifest is invalid, incomplete, or does not match this draft.'});}
 }
};
