import { SITE_URL } from '$lib/config/site.js';

export const STAFF_AUTH_CALLBACK_PATH = '/admin/auth/callback';
export const SET_PASSWORD_PATH = '/admin/login/set-password';
export const PASSWORD_SETUP_COOKIE = 'goat-password-link';

export type StaffAuthCallback =
	| { kind: 'pkce'; code: string }
	| { kind: 'token_hash'; tokenHash: string; type: 'invite' | 'recovery' };

const localOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
const trustedSearchKeys = new Set(['code', 'flow', 'token_hash', 'type']);

export function buildPasswordRecoveryRedirect(url: URL): string | null {
	const origin = getTrustedStaffOrigin(url);
	if (!origin) return null;

	const redirect = new URL(STAFF_AUTH_CALLBACK_PATH, origin);
	redirect.searchParams.set('flow', 'recovery');
	return redirect.toString();
}

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

	const code = url.searchParams.getAll('code');
	const tokenHash = url.searchParams.getAll('token_hash');
	const type = url.searchParams.getAll('type');
	const flow = url.searchParams.getAll('flow');

	if (code.length === 1 && tokenHash.length === 0 && type.length === 0 && flow.length === 1 && flow[0] === 'recovery') {
		return code[0].length > 0 && code[0].length <= 4096 ? { kind: 'pkce', code: code[0] } : null;
	}

	if (code.length > 0 || tokenHash.length !== 1 || type.length !== 1) return null;
	const value = tokenHash[0];
	if (!value || value.length > 512) return null;

	if (type[0] === 'invite' && flow.length === 0) {
		return { kind: 'token_hash', tokenHash: value, type: 'invite' };
	}
	if (type[0] === 'recovery' && (flow.length === 0 || (flow.length === 1 && flow[0] === 'recovery'))) {
		return { kind: 'token_hash', tokenHash: value, type: 'recovery' };
	}

	return null;
}
