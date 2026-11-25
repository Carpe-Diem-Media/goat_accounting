import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/staff-guard';
import { createEstimatorServiceClient, type EstimatorServerEnv } from '$lib/server/supabase/client.server';
import { createPricingRepository, PricingAcceptanceAccessError, PricingAcceptanceDatabaseConflictError, PricingDraftConflictError } from '$lib/server/supabase/repositories/pricing';
import { DraftFieldError, parseDraftForm } from '$lib/server/pricing/draft-form';
import { updatePricingDraft } from '$lib/server/pricing/update-pricing-draft';
import { runPricingCorpus } from '$lib/server/pricing/run-pricing-corpus';
import { editableFields } from '$lib/domain/pricing/editable-fields';
import { inspectPricingAcceptance, PricingAcceptanceConflictError, transitionPricingAcceptance, type AcceptanceAction } from '$lib/server/pricing/pricing-acceptance';
import { requirePricingAdminRelease } from '$lib/server/pricing/pricing-admin-release';

async function repository(event: Pick<RequestEvent, 'platform'>) {
 const env=(event.platform?.env ?? (await import('cloudflare:workers')).env) as EstimatorServerEnv;
 return createPricingRepository(createEstimatorServiceClient(env));
}
const validId=(id:string)=>z.uuid().safeParse(id).success;
export const load: PageServerLoad = async event => {
 requirePricingAdminRelease(event.locals.pricingAdminEnabled);
 await requireStaff(event,['admin']);
 if(!validId(event.params.id)) throw error(404,'Pricing model not found.');
 try {
  const repo=await repository(event); const draft=await repo.readDraft(event.params.id);
  if(!draft) throw error(404,'Pricing model not found.');
  const { summary, report, reviewScenarios, fingerprint, action } = await inspectPricingAcceptance(repo, draft);
  return { draft, fields: editableFields(draft.model), fingerprint, acceptance: { summary, report, reviewScenarios, action } };
 } catch(cause) {
  if(typeof cause==='object' && cause!==null && 'status' in cause && cause.status===404) throw cause;
  throw error(503,'Pricing model is temporarily unavailable.');
 }
};
const acceptanceSelection = z.object({
 revision: z.string().regex(/^(0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().safe().nonnegative()),
 fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
 manifestId: z.union([z.uuid(), z.literal('').transform(() => null)])
}).strict();

function acceptanceAction(action: AcceptanceAction) {
 return async (event: RequestEvent<{ id: string }>) => {
  requirePricingAdminRelease(event.locals.pricingAdminEnabled);
  const actor = await requireStaff(event, ['admin']);
  const session = z.uuid().safeParse(actor.claims.session_id);
  if (!session.success) throw error(403, 'An administrator MFA session is required.');
  if (!validId(event.params.id)) throw error(404, 'Pricing model not found.');
  let form: FormData;
  try { form = await event.request.formData(); }
  catch { return fail(400, { message: 'Unable to read the acceptance selection.' }); }
  const submitted = [...form.entries()];
  const selection = acceptanceSelection.safeParse(Object.fromEntries(submitted));
  if (submitted.length !== 3 || !selection.success) return fail(400, { message: 'Invalid acceptance selection.' });

  try {
   await transitionPricingAcceptance(await repository(event), event.params.id, {
    userId: actor.userId, sessionId: session.data
   }, selection.data, action);
  } catch (cause) {
   if (cause instanceof PricingAcceptanceConflictError || cause instanceof PricingAcceptanceDatabaseConflictError) {
    return fail(409, { message: 'The draft or acceptance revision changed. Refresh and review it again.' });
   }
   if (cause instanceof PricingAcceptanceAccessError) throw error(403, 'An active administrator MFA session is required.');
   throw error(503, 'Pricing acceptance is temporarily unavailable.');
  }
  throw redirect(303, `/admin/pricing/${event.params.id}`);
 };
}

export const actions: Actions = {
 submit: acceptanceAction('submit'),
 approve: acceptanceAction('approve'),
 activate: acceptanceAction('activate'),
 save: async event => {
  requirePricingAdminRelease(event.locals.pricingAdminEnabled);
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
  requirePricingAdminRelease(event.locals.pricingAdminEnabled);
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
