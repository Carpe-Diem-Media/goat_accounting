import { error } from '@sveltejs/kit';

export function pricingAdminReleaseEnabled(
	bindings: { PRICING_ADMIN_RELEASE_ENABLED?: string } | undefined
): boolean {
	return bindings?.PRICING_ADMIN_RELEASE_ENABLED === 'true';
}

export function requirePricingAdminRelease(enabled: boolean): void {
	if (enabled !== true) throw error(404, 'Not found.');
}
