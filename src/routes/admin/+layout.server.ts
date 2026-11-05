import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getStaffAccess, requireStaff } from '$lib/server/auth/staff-guard';

export const prerender = false;

export const load: LayoutServerLoad = async (event) => {
	if (event.url.pathname.startsWith('/admin/login')) {
		const access = await getStaffAccess(event);
		if (access.kind === 'authorized') throw redirect(303, '/admin/estimates');
		if (access.kind === 'setup' || access.kind === 'challenge') {
			if (!event.url.pathname.startsWith('/admin/login/mfa')) {
				throw redirect(303, '/admin/login/mfa');
			}
		}
		return { identity: null };
	}

	const identity = await requireStaff(event);
	return { identity: { userId: identity.userId, role: identity.role } };
};
