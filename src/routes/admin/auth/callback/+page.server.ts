import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getStaffAccess } from '$lib/server/auth/staff-guard';
import {
	parseStaffAuthCallback,
	PASSWORD_SETUP_COOKIE,
	SET_PASSWORD_PATH,
	hasTrustedRequestOrigin
} from '$lib/server/auth/password-link';

const INVALID_LINK_PATH = '/admin/login?link=invalid';
const COOKIE_OPTIONS = { path: SET_PASSWORD_PATH };

function clearSetupCookie(event: Parameters<Actions['default']>[0]) {
	event.cookies.delete(PASSWORD_SETUP_COOKIE, COOKIE_OPTIONS);
}

function rejectLink(event: Parameters<Actions['default']>[0]): never {
	clearSetupCookie(event);
	throw redirect(303, INVALID_LINK_PATH);
}

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
	clearSetupCookie(event);

	const callback = parseStaffAuthCallback(event.url);
	if (!callback) throw redirect(303, INVALID_LINK_PATH);

	return { kind: callback.kind === 'pkce' ? 'recovery' : callback.type };
};

export const actions: Actions = {
	default: async (event) => {
		event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
		clearSetupCookie(event);
		if (!hasTrustedRequestOrigin(event)) return fail(403, { message: 'This request could not be verified.' });

		const callback = parseStaffAuthCallback(event.url);
		if (!callback) return rejectLink(event);

		const client = event.locals.supabase;
		if (!client) return rejectLink(event);

		let verified = false;
		try {
			const result = callback.kind === 'pkce'
				? await client.auth.exchangeCodeForSession(callback.code)
				: await client.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
			verified = !result.error && Boolean(result.data.session);
		} catch {
			return rejectLink(event);
		}
		if (!verified) return rejectLink(event);

		const access = await getStaffAccess(event);
		if (access.kind === 'unavailable') {
			return fail(503, { message: 'Staff access is temporarily unavailable. Request a new link and try again.' });
		}
		if (!['invited', 'setup', 'challenge', 'authorized'].includes(access.kind)) {
			await client.auth.signOut({ scope: 'local' });
			return rejectLink(event);
		}

		event.cookies.set(PASSWORD_SETUP_COOKIE, '1', {
			path: SET_PASSWORD_PATH,
			httpOnly: true,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:',
			maxAge: 10 * 60
		});
		throw redirect(303, SET_PASSWORD_PATH);
	}
};
