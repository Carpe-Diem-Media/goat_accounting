import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/staff-guard';
import { cloneInput, clonePricingModel } from '$lib/server/pricing/clone-pricing-model';
import { createEstimatorServiceClient, type EstimatorServerEnv } from '$lib/server/supabase/client.server';
import { createPricingRepository, PricingVersionConflictError } from '$lib/server/supabase/repositories/pricing';

export const load: PageServerLoad = async (event) => {
 await requireStaff(event, ['admin']);
 const client=event.locals.supabase;
 if(!client) throw error(503,'Pricing models are temporarily unavailable.');
 const requested=Number(event.url.searchParams.get('page') ?? '1');
 const page=Number.isSafeInteger(requested) && requested>0 ? requested : 1;
 const start=(page-1)*25;
 if(!Number.isSafeInteger(start) || start>10_000_000) throw error(400,'Page number is out of range.');
 const {data,error:queryError}=await client.from('pricing_models').select('id,version,name,state,created_at,activated_at,retired_at,checksum').order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+25);
 if(queryError) throw error(503,'Pricing models are temporarily unavailable.');
 const rows=data ?? [];
 return {models:rows.slice(0,25),page,hasNext:rows.length>25};
};

export const actions: Actions = {
 clone: async (event) => {
  const actor = await requireStaff(event, ['admin']);
  let form: FormData;
  try { form = await event.request.formData(); }
  catch { return fail(400, { message: 'The pricing request could not be read.' }); }
  const input = cloneInput.safeParse([form.get('sourceId'), form.get('version'), actor.userId]);
  if (!input.success) return fail(400, { message: 'Choose a pricing model and enter a valid version.' });
  try {
   const env = (event.platform?.env ?? (await import('cloudflare:workers')).env) as EstimatorServerEnv;
   const repository = createPricingRepository(createEstimatorServiceClient(env));
   await clonePricingModel(repository, ...input.data);
  } catch (cause) {
   if (cause instanceof PricingVersionConflictError) return fail(409, { message: 'That version is already in use. Choose another version.' });
   throw error(503, 'The pricing model could not be cloned. Check the source and version before retrying.');
  }
  throw redirect(303, '/admin/pricing');
 }
};
