import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/staff-guard';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async (event) => {
	await requireStaff(event);
	const { locals, url } = event;
	const client = locals.supabase;
	if (!client) throw error(503, 'Estimate records are temporarily unavailable.');

	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const start = (page - 1) * PAGE_SIZE;
	if (!Number.isSafeInteger(start) || start > 10_000_000) throw error(400, 'Page number is out of range.');

	const { data, error: queryError } = await client
		.from('estimates')
		.select(`
			id, public_ref, calculator_type, state, catchup_min_cents, catchup_max_cents,
			ongoing_min_cents, ongoing_max_cents, confidence, manual_review_required, created_at
		`)
		.order('created_at', { ascending: false })
		.range(start, start + PAGE_SIZE);
	if (queryError) throw error(503, 'Estimate records are temporarily unavailable.');

	const rows = data ?? [];
	return {
		estimates: rows.slice(0, PAGE_SIZE),
		page,
		hasNext: rows.length > PAGE_SIZE
	};
};
