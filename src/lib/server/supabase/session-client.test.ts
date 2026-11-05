import { describe, expect, it } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { createSessionClient } from './session-client';

function requestEvent(jar: Map<string, string>): RequestEvent {
	return {
		url: new URL('http://127.0.0.1:5173/admin/estimates'),
		cookies: {
			getAll: () => [...jar].map(([name, value]) => ({ name, value })),
			set: (name: string, value: string) => jar.set(name, value)
		},
		setHeaders: () => undefined
	} as unknown as RequestEvent;
}

function encodedSession(userId: string): string {
	const payload = {
		access_token: `header.${Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated' })).toString('base64url')}.signature`,
		refresh_token: 'local-test-refresh-token',
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		user: {
			id: userId,
			aud: 'authenticated',
			app_metadata: {},
			user_metadata: {},
			created_at: new Date().toISOString()
		}
	};
	return `base64-${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

describe('createSessionClient', () => {
	it('creates a separate cookie-backed auth client for each Worker request', async () => {
		const firstUser = '10000000-0000-4000-8000-000000000001';
		const firstJar = new Map<string, string>();
		const secondJar = new Map<string, string>();
		const config = {
			supabaseUrl: 'http://127.0.0.1:54321',
			publishableKey: 'local-publishable-key'
		};
		const firstClient = createSessionClient(requestEvent(firstJar), config);
		const secondClient = createSessionClient(requestEvent(secondJar), config);
		expect(firstClient).not.toBeNull();
		expect(secondClient).not.toBeNull();
		expect(firstClient).not.toBe(secondClient);
		if (!firstClient || !secondClient) return;

		const firstAuth = firstClient.auth as unknown as {
			storageKey: string;
			storage: { getItem(key: string): Promise<string | null> };
		};
		const secondAuth = secondClient.auth as unknown as {
			storageKey: string;
			storage: { getItem(key: string): Promise<string | null> };
		};
		firstJar.set(firstAuth.storageKey, encodedSession(firstUser));
		const firstSession = await firstAuth.storage.getItem(firstAuth.storageKey);
		const secondSession = await secondAuth.storage.getItem(secondAuth.storageKey);

		expect(JSON.parse(firstSession ?? '{}').user.id).toBe(firstUser);
		expect(secondSession).toBeNull();
	});

	it('does not create a client when local Supabase configuration is missing', () => {
		expect(createSessionClient(requestEvent(new Map()), { supabaseUrl: 'http://127.0.0.1:54321' })).toBeNull();
		expect(createSessionClient(requestEvent(new Map()), { publishableKey: 'local-key' })).toBeNull();
	});

	it('keeps remote Supabase disabled until the explicit project ref is configured', () => {
		const event = requestEvent(new Map());
		const remote = {
			supabaseUrl: 'https://goat-staging-ref.supabase.co',
			publishableKey: 'publishable-key'
		};
		expect(createSessionClient(event, remote)).toBeNull();
		expect(
			createSessionClient(event, {
				...remote,
				staffAuthEnabled: 'true',
				expectedProjectRef: 'another-project-ref'
			})
		).toBeNull();
		expect(
			createSessionClient(event, {
				...remote,
				staffAuthEnabled: 'true',
				expectedProjectRef: 'goat-staging-ref'
			})
		).not.toBeNull();
	});
});
