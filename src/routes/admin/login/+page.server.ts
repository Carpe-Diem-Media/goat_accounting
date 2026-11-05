import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getStaffAccess } from '$lib/server/auth/staff-guard';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.supabase) return { configured: false };

	const access = await getStaffAccess(event);
	if (access.kind === 'authorized') throw redirect(303, '/admin/estimates');
	if (access.kind === 'setup' || access.kind === 'challenge' || access.kind === 'invited') {
		throw redirect(303, '/admin/login/mfa');
	}
	return { configured: true };
};

export const actions: Actions = {
	default: async (event) => {
		const client = event.locals.supabase;
		if (!client) return fail(503, { message: 'Staff sign-in is not configured.' });

		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!email || !password || email.length > 320 || password.length > 1024) {
			return fail(400, { message: 'Enter your work email and password.' });
		}

		const { error: signInError } = await client.auth.signInWithPassword({ email, password });
		if (signInError) return fail(400, { message: 'Sign-in failed. Check your details and try again.' });

		const access = await getStaffAccess(event);
		switch (access.kind) {
			case 'authorized':
				throw redirect(303, '/admin/estimates');
			case 'setup':
			case 'challenge':
			case 'invited':
				throw redirect(303, '/admin/login/mfa');
			case 'denied':
			case 'forbidden':
				await client.auth.signOut({ scope: 'local' });
				return fail(400, { message: 'Sign-in failed. Check your details and try again.' });
			case 'unauthenticated':
				return fail(400, { message: 'Sign-in failed. Check your details and try again.' });
			case 'unavailable':
				return fail(503, { message: 'Staff access is temporarily unavailable. Try again shortly.' });
		}
	}
};
