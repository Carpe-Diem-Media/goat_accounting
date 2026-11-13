import { expect, test } from 'bun:test';

test('pricing administration release requires the exact enabled binding', async () => {
 const release = await import('./pricing-admin-release').catch(() => undefined);
 expect(release).toBeDefined();
 if (!release) return;
 expect(release.pricingAdminReleaseEnabled(undefined)).toBe(false);
 expect(release.pricingAdminReleaseEnabled({})).toBe(false);
 expect(release.pricingAdminReleaseEnabled({ PRICING_ADMIN_RELEASE_ENABLED: 'false' })).toBe(false);
 expect(release.pricingAdminReleaseEnabled({ PRICING_ADMIN_RELEASE_ENABLED: 'TRUE' })).toBe(false);
 expect(release.pricingAdminReleaseEnabled({ PRICING_ADMIN_RELEASE_ENABLED: 'true' })).toBe(true);
});
