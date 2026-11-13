import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getStaffAccess, type StaffAccess } from '$lib/server/auth/staff-guard';
import {
	hasTrustedRequestOrigin,
	PASSWORD_SETUP_COOKIE,
	SET_PASSWORD_PATH
} from '$lib/server/auth/password-link';

const INVALID_LINK_PATH = '/admin/login?link=invalid';
const eligibleAccess = (access: StaffAccess) =>
	access.kind === 'invited' ||
	access.kind === 'setup' ||
	access.kind === 'challenge' ||
	access.kind === 'authorized';

function clearSetupCookie(event: Parameters<Actions['default']>[0]) {
	event.cookies.delete(PASSWORD_SETUP_COOKIE, { path: SET_PASSWORD_PATH });
}

async function rejectIneligible(event: Parameters<Actions['default']>[0]): Promise<never> {
	clearSetupCookie(event);
	await event.locals.supabase?.auth.signOut({ scope: 'local' });
	throw redirect(303, INVALID_LINK_PATH);
}

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
	if (!event.locals.supabase || event.cookies.get(PASSWORD_SETUP_COOKIE) !== '1') {
		clearSetupCookie(event);
		throw redirect(303, INVALID_LINK_PATH);
	}

	const access = await getStaffAccess(event);
	if (access.kind === 'unavailable') throw error(503, 'Staff access is temporarily unavailable.');
	if (!eligibleAccess(access)) return rejectIneligible(event);

	return { state: access.kind };
};

export const actions: Actions = {
	default: async (event) => {
		event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
		if (!hasTrustedRequestOrigin(event)) return fail(403, { message: 'This request could not be verified.' });

		const client = event.locals.supabase;
		if (!client || event.cookies.get(PASSWORD_SETUP_COOKIE) !== '1') {
			clearSetupCookie(event);
			throw redirect(303, INVALID_LINK_PATH);
		}

		const access = await getStaffAccess(event);
		if (access.kind === 'unavailable') return fail(503, { message: 'Staff access is temporarily unavailable.' });
		if (!eligibleAccess(access)) return rejectIneligible(event);

		const form = await event.request.formData();
		const password = String(form.get('password') ?? '');
		const confirmation = String(form.get('confirmation') ?? '');
		if (!password || !confirmation || password.length > 1024 || confirmation.length > 1024) {
			return fail(400, { message: 'Enter and confirm a password up to 1024 characters.' });
		}
		if (password !== confirmation) return fail(400, { message: 'The passwords do not match.' });

		try {
			const { error: updateError } = await client.auth.updateUser({ password });
			if (updateError) return fail(400, { message: 'The password was not accepted. Check it and try again.' });
		} catch {
			return fail(400, { message: 'The password could not be changed. Try again or request a new link.' });
		}

		clearSetupCookie(event);
		throw redirect(303, '/admin/login/mfa');
	}
};
