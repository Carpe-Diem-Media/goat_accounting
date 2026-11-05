import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	const client = locals.supabase;
	if (!client) throw error(503, 'Lead records are temporarily unavailable.');

	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const start = (page - 1) * PAGE_SIZE;
	if (!Number.isSafeInteger(start) || start > 10_000_000) throw error(400, 'Page number is out of range.');

	const { data, error: queryError } = await client
		.from('leads')
		.select('id, estimate_id, state, full_name, email, business_name, created_at')
		.order('created_at', { ascending: false })
		.range(start, start + PAGE_SIZE);
	if (queryError) throw error(503, 'Lead records are temporarily unavailable.');

	const rows = data ?? [];
	return {
		leads: rows.slice(0, PAGE_SIZE),
		page,
		hasNext: rows.length > PAGE_SIZE
	};
};
