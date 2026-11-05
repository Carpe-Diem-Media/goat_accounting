import { env as workerEnv } from 'cloudflare:workers';
import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { createSessionClient } from '$lib/server/supabase/session-client';

export const handle: Handle = async ({ event, resolve }) => {
	const bindings = event.platform?.env ?? (building ? undefined : workerEnv);

	// The client and cookie adapter belong to this request. Never share auth state
	// between Worker requests or use a service key for staff reads. Local URLs
	// work for isolated development; remote access requires an explicit enable
	// flag and an exact Supabase project ref match.
	event.locals.supabase = createSessionClient(event, {
		supabaseUrl: bindings?.SUPABASE_URL,
		publishableKey: bindings?.SUPABASE_PUBLISHABLE_KEY,
		staffAuthEnabled: bindings?.SUPABASE_STAFF_AUTH_ENABLED,
		expectedProjectRef: bindings?.GOAT_STAFF_SUPABASE_PROJECT_REF
	});

	const response = await resolve(event);
	if (!event.url.pathname.startsWith('/admin')) return response;

	const headers = new Headers(response.headers);
	headers.set('Cache-Control', 'private, no-store, max-age=0');
	headers.set('Pragma', 'no-cache');
	headers.set('X-Robots-Tag', 'noindex, nofollow');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
};
