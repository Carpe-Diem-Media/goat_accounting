import { SITE_URL } from '$lib/config/site.js';

export const SET_PASSWORD_PATH = '/admin/login/set-password';
export const PASSWORD_SETUP_COOKIE = 'goat-password-link';
export const PASSWORD_LINK_MAX_AGE_SECONDS = 10 * 60;

export type StaffAuthCallback = {
	kind: 'token_hash';
	tokenHash: string;
	type: 'invite';
};

const localOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
const trustedSearchKeys = new Set(['token_hash', 'type']);

export function getTrustedStaffOrigin(url: URL): string | null {
	if (url.username || url.password) return null;

	const siteOrigin = new URL(SITE_URL).origin;
	if (url.protocol === 'https:' && url.origin === siteOrigin) return siteOrigin;
	if (localOrigins.has(url.origin)) return url.origin;
	return null;
}

export function hasTrustedRequestOrigin(event: { url: URL; request: Request }): boolean {
	const origin = event.request.headers.get('origin');
	return Boolean(origin && origin === event.url.origin && getTrustedStaffOrigin(event.url));
}

export function parseStaffAuthCallback(url: URL): StaffAuthCallback | null {
	for (const key of url.searchParams.keys()) {
		if (!trustedSearchKeys.has(key)) return null;
	}

	const tokenHash = url.searchParams.getAll('token_hash');
	const type = url.searchParams.getAll('type');
	if (tokenHash.length !== 1 || type.length !== 1) return null;

	const value = tokenHash[0];
	if (type[0] !== 'invite' || !value || value.length > 512) return null;

	return { kind: 'token_hash', tokenHash: value, type: 'invite' };
}
