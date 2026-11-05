import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!UUID.test(params.id)) throw error(404, 'Lead not found.');
	const client = locals.supabase;
	if (!client) throw error(503, 'Lead records are temporarily unavailable.');

	const { data: lead, error: leadError } = await client
		.from('leads')
		.select('id, estimate_id, state, full_name, email, phone, business_name, preferred_contact_method, contact_consent_at, created_at')
		.eq('id', params.id)
		.maybeSingle();
	if (leadError) throw error(503, 'Lead records are temporarily unavailable.');
	if (!lead) throw error(404, 'Lead not found.');

	const { data: estimate, error: estimateError } = await client
		.from('estimates')
		.select('id, public_ref, calculator_type, state, catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents, created_at')
		.eq('id', lead.estimate_id)
		.maybeSingle();
	if (estimateError) throw error(503, 'Lead records are temporarily unavailable.');

	return { lead, estimate };
};
