import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(303, '/admin/estimates');
};

export const actions: Actions = {
	default: async ({ locals }) => {
		if (!locals.supabase) throw error(503, 'Staff sign-out is temporarily unavailable.');
		const { error: signOutError } = await locals.supabase.auth.signOut({ scope: 'local' });
		if (signOutError) throw error(503, 'Staff sign-out is temporarily unavailable.');
		throw redirect(303, '/admin/login');
	}
};
