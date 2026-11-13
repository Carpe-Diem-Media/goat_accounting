import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildPasswordRecoveryRedirect, hasTrustedRequestOrigin } from '$lib/server/auth/password-link';

export const load: PageServerLoad = async (event) => ({ configured: Boolean(event.locals.supabase) });

export const actions: Actions = {
	default: async (event) => {
		if (!hasTrustedRequestOrigin(event)) {
			return fail(403, { message: 'This request could not be verified.' });
		}

		const client = event.locals.supabase;
		if (!client) return fail(503, { message: 'Password recovery is temporarily unavailable.' });

		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { message: 'Enter a valid work email address.' });
		}

		const redirectTo = buildPasswordRecoveryRedirect(event.url);
		if (!redirectTo) return fail(403, { message: 'This request could not be verified.' });

		try {
			await client.auth.resetPasswordForEmail(email, { redirectTo });
		} catch {
			// Return the same result for every address so the page cannot reveal account membership.
		}

		return {
			submitted: true,
			message: 'If an invited staff account matches that address, a reset email will be sent.'
		};
	}
};
