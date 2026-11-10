import { describe, expect, it } from 'bun:test';
import { shouldReloadForAdminTransition } from './admin-document-boundary';

describe('shouldReloadForAdminTransition', () => {
	it('requires a full document load when a same-origin navigation enters admin', () => {
		expect(
			shouldReloadForAdminTransition(
				new URL('https://goat.test/services'),
				new URL('https://goat.test/admin/login')
			)
		).toBe(true);
		expect(
			shouldReloadForAdminTransition(
				new URL('https://goat.test/contact'),
				new URL('https://goat.test/admin')
			)
		).toBe(true);
	});

	it('requires a full document load when leaving admin so public tracking initializes again', () => {
		expect(
			shouldReloadForAdminTransition(
				new URL('https://goat.test/admin/leads'),
				new URL('https://goat.test/services')
			)
		).toBe(true);
	});

	it('does not reload within admin or for paths that only begin with the same letters', () => {
		expect(
			shouldReloadForAdminTransition(
				new URL('https://goat.test/admin/estimates'),
				new URL('https://goat.test/admin/leads')
			)
		).toBe(false);
		expect(
			shouldReloadForAdminTransition(
				new URL('https://goat.test/services'),
				new URL('https://goat.test/administrator')
			)
		).toBe(false);
	});

	it('does not treat external or incomplete navigation as an admin entry', () => {
		expect(
			shouldReloadForAdminTransition(
				new URL('https://marketing.test/'),
				new URL('https://goat.test/admin/login')
			)
		).toBe(false);
		expect(shouldReloadForAdminTransition(null, new URL('https://goat.test/admin/login'))).toBe(false);
		expect(shouldReloadForAdminTransition(new URL('https://goat.test/'), null)).toBe(false);
	});
});

describe('estimator privacy document boundary', () => {
  it('unloads public tracking when entering or leaving the estimator', () => {
    expect(shouldReloadForAdminTransition(new URL('https://goat.test/services'), new URL('https://goat.test/estimate'))).toBe(true);
    expect(shouldReloadForAdminTransition(new URL('https://goat.test/estimate/abc'), new URL('https://goat.test/services'))).toBe(true);
    expect(shouldReloadForAdminTransition(new URL('https://goat.test/estimate'), new URL('https://goat.test/estimate/abc'))).toBe(false);
  });
});
