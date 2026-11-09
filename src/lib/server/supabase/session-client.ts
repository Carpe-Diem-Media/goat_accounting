import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type StaffSessionClient = SupabaseClient<Database, 'estimator'>;

export function createSessionClient(
	event: RequestEvent,
	config: Readonly<{
		supabaseUrl?: string;
		publishableKey?: string;
		staffAuthEnabled?: string;
		expectedProjectRef?: string;
	}>
): StaffSessionClient | null {
	if (!config.supabaseUrl || !config.publishableKey || !isAllowedSessionUrl(config)) return null;

	const secure = event.url.protocol === 'https:';
	const appliedHeaders = new Set<string>();

	return createServerClient<Database, 'estimator'>(
		config.supabaseUrl,
		config.publishableKey,
		{
			db: { schema: 'estimator' },
			cookieOptions: {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure
			},
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll(cookiesToSet, headers) {
					for (const { name, value, options } of cookiesToSet) {
						event.cookies.set(name, value, {
							...options,
							path: '/',
							httpOnly: true,
							sameSite: 'lax',
							secure
						});
					}

					for (const [name, value] of Object.entries(headers ?? {})) {
						const key = name.toLowerCase();
						if (!appliedHeaders.has(key)) {
							event.setHeaders({ [name]: value });
							appliedHeaders.add(key);
						}
					}
				}
			}
		}
	);
}

function isAllowedSessionUrl(config: {
	supabaseUrl?: string;
	staffAuthEnabled?: string;
	expectedProjectRef?: string;
}): boolean {
	if (!config.supabaseUrl) return false;
	try {
		const url = new URL(config.supabaseUrl);
		if (url.username || url.password) return false;
		const hostname = url.hostname.toLowerCase();
		if (
			url.protocol === 'http:' &&
			(hostname === 'localhost' ||
				hostname === '127.0.0.1' ||
				hostname === '[::1]' ||
				hostname === 'host.docker.internal' ||
				hostname.endsWith('.localhost'))
		) {
			return true;
		}

		return (
			url.protocol === 'https:' &&
			config.staffAuthEnabled === 'true' &&
			typeof config.expectedProjectRef === 'string' &&
			hostname === `${config.expectedProjectRef.toLowerCase()}.supabase.co`
		);
	} catch {
		return false;
	}
}
