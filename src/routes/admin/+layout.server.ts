import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getStaffAccess, requireStaff } from '$lib/server/auth/staff-guard';
import { requirePricingAdminRelease } from '$lib/server/pricing/pricing-admin-release';

export const prerender = false;

export const load: LayoutServerLoad = async (event) => {
	const passwordFlowRoute =
		event.url.pathname === '/admin/auth/callback' ||
		event.url.pathname === '/admin/login/set-password';
	const loginLayoutData = {
		identity: null,
		dashboardEnabled: false,
		pricingNavigationVisible: false,
		accessLabel: null
	};

	if (event.url.pathname === '/admin/auth/callback') return loginLayoutData;

	if (event.url.pathname.startsWith('/admin/login')) {
		if (!passwordFlowRoute) {
			const access = await getStaffAccess(event);
			if (access.kind === 'authorized') throw redirect(303, '/admin/estimates');
			if (access.kind === 'setup' || access.kind === 'challenge' || access.kind === 'invited') {
				if (!event.url.pathname.startsWith('/admin/login/mfa')) {
					throw redirect(303, '/admin/login/mfa');
				}
			}
		}
		return loginLayoutData;
	}
	if (event.url.pathname === '/admin/pricing' || event.url.pathname.startsWith('/admin/pricing/')) {
		requirePricingAdminRelease(event.locals.pricingAdminEnabled);
	}

	const identity = await requireStaff(event);
	return {
		identity: { userId: identity.userId, role: identity.role },
		dashboardEnabled: event.locals.dashboardEnabled === true,
		pricingNavigationVisible: identity.role === 'admin' && event.locals.pricingAdminEnabled === true,
		accessLabel:
			identity.role === 'admin'
				? 'Administrator access'
				: identity.role === 'advisor'
					? 'Advisor access'
					: 'Read-only access'
	};
};
