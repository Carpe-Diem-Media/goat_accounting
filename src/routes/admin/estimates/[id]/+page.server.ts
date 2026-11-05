import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/staff-guard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async (event) => {
	await requireStaff(event);
	const { locals, params } = event;
	if (!UUID.test(params.id)) throw error(404, 'Estimate not found.');
	const client = locals.supabase;
	if (!client) throw error(503, 'Estimate records are temporarily unavailable.');

	const { data: estimate, error: estimateError } = await client
		.from('estimates')
		.select(`
			id, public_ref, calculator_type, state, pricing_model_id, pricing_model_version,
			engine_version, answers_snapshot, calculation_snapshot, free_text,
			catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
			confidence, manual_review_required, review_reasons, review_flag_codes, created_at,
			estimate_line_items (
				id, item_code, rule_code, label, category, branch, min_cents, max_cents,
				quantity, unit, explanation, sort_order
			)
		`)
		.eq('id', params.id)
		.order('sort_order', { referencedTable: 'estimate_line_items', ascending: true })
		.maybeSingle();
	if (estimateError) throw error(503, 'Estimate records are temporarily unavailable.');
	if (!estimate) throw error(404, 'Estimate not found.');

	const { data: lead, error: leadError } = await client
		.from('leads')
		.select('id, state, full_name, email, business_name, created_at')
		.eq('estimate_id', estimate.id)
		.maybeSingle();
	if (leadError) throw error(503, 'Estimate records are temporarily unavailable.');

	return { estimate, lead };
};
