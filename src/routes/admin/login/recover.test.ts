import { describe, expect, it } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { actions } from './recover/+page.server';

function makeEvent(options: { email: string; origin?: string; authError?: boolean; search?: string }) {
	const url = new URL(`https://goataccounting.co.za/admin/login/recover${options.search ?? ''}`);
	const form = new FormData();
	form.set('email', options.email);
	const calls: Array<{ name: string; args?: unknown }> = [];
	const client = {
		auth: {
			resetPasswordForEmail: async (...args: unknown[]) => {
				calls.push({ name: 'resetPasswordForEmail', args });
				return options.authError ? { error: { message: 'sensitive provider detail' } } : { error: null };
			}
		}
	};
	const request = new Request(url, {
		method: 'POST',
		headers: options.origin ? { origin: options.origin } : undefined,
		body: form
	});
	return {
		url,
		request,
		locals: { supabase: client },
		setHeaders: () => undefined,
		calls
	} as unknown as RequestEvent & { calls: typeof calls };
}

describe('staff password recovery request', () => {
	it('uses the fixed recovery callback and returns an account-neutral result', async () => {
		const event = makeEvent({ email: 'staff@example.invalid', origin: 'https://goataccounting.co.za' });

		const result = await actions.default!(event as never);

		expect(result).toMatchObject({
			submitted: true,
			message: 'If an invited staff account matches that address, a reset email will be sent.'
		});
		expect(event.calls).toContainEqual({
			name: 'resetPasswordForEmail',
			args: ['staff@example.invalid', { redirectTo: 'https://goataccounting.co.za/admin/auth/callback?flow=recovery' }]
		});
	});

	it('keeps the response the same when Auth returns an error', async () => {
		const event = makeEvent({ email: 'unknown@example.invalid', origin: 'https://goataccounting.co.za', authError: true });

		const result = await actions.default!(event as never);

		expect(result).toMatchObject({
			submitted: true,
			message: 'If an invited staff account matches that address, a reset email will be sent.'
		});
		expect(JSON.stringify(result)).not.toContain('sensitive provider detail');
	});

	it('rejects invalid email input and untrusted origins before asking Auth to send mail', async () => {
		const invalidEmail = makeEvent({ email: 'not-an-email', origin: 'https://goataccounting.co.za' });
		const badOrigin = makeEvent({ email: 'staff@example.invalid', origin: 'https://attacker.invalid' });

		const invalidResult = await actions.default!(invalidEmail as never);
		const originResult = await actions.default!(badOrigin as never);

		expect(invalidResult).toMatchObject({ status: 400 });
		expect(originResult).toMatchObject({ status: 403 });
		expect(invalidEmail.calls).toEqual([]);
		expect(badOrigin.calls).toEqual([]);
	});

	it('ignores untrusted redirect parameters from the request URL', async () => {
		const event = makeEvent({
			email: 'staff@example.invalid',
			origin: 'https://goataccounting.co.za',
			search: '?next=https%3A%2F%2Fattacker.invalid'
		});

		await actions.default!(event as never);

		expect(event.calls[0]).toMatchObject({
			name: 'resetPasswordForEmail',
			args: ['staff@example.invalid', { redirectTo: 'https://goataccounting.co.za/admin/auth/callback?flow=recovery' }]
		});
	});
});
