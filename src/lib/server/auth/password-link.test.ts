import { describe, expect, it } from 'bun:test';
import {
	getTrustedStaffOrigin,
	parseStaffAuthCallback,
	hasTrustedRequestOrigin
} from './password-link';

describe('staff password link handling', () => {
	it('allows only the canonical site and exact local development origins', () => {
		expect(getTrustedStaffOrigin(new URL('https://goataccounting.co.za/admin/auth/callback')))
			.toBe('https://goataccounting.co.za');
		expect(getTrustedStaffOrigin(new URL('http://127.0.0.1:5173/admin/auth/callback')))
			.toBe('http://127.0.0.1:5173');
		expect(getTrustedStaffOrigin(new URL('http://localhost:5173/admin/auth/callback')))
			.toBe('http://localhost:5173');
		for (const origin of [
			'https://www.goataccounting.co.za',
			'https://goataccounting.co.za.attacker.invalid',
			'http://goataccounting.co.za',
			'http://127.0.0.1:3000'
		]) {
			expect(getTrustedStaffOrigin(new URL(`${origin}/admin/auth/callback`))).toBeNull();
		}
	});

	it('accepts only same-origin form posts on an approved site origin', () => {
		const url = new URL('https://goataccounting.co.za/admin/auth/callback');
		expect(hasTrustedRequestOrigin({
			url,
			request: new Request(url, { method: 'POST', headers: { origin: url.origin } })
		})).toBe(true);
		expect(hasTrustedRequestOrigin({
			url,
			request: new Request(url, { method: 'POST', headers: { origin: 'https://attacker.invalid' } })
		})).toBe(false);
		expect(hasTrustedRequestOrigin({
			url,
			request: new Request(url, { method: 'POST' })
		})).toBe(false);
	});

	it('parses only one invitation token hash', () => {
		expect(parseStaffAuthCallback(new URL('https://goataccounting.co.za/admin/auth/callback?token_hash=invite-hash&type=invite')))
			.toEqual({ kind: 'token_hash', tokenHash: 'invite-hash', type: 'invite' });
	});

	it('rejects recovery callbacks while self-service password recovery is deferred', () => {
		for (const search of [
			'?flow=recovery&code=pkce-code',
			'?flow=recovery&token_hash=recovery-hash&type=recovery',
			'?token_hash=recovery-hash&type=recovery'
		]) {
			expect(parseStaffAuthCallback(new URL(`https://goataccounting.co.za/admin/auth/callback${search}`)))
				.toBeNull();
		}
	});

	it('rejects missing, mixed, unsupported, duplicate, and redirect-bearing callback parameters', () => {
		for (const search of [
			'',
			'?code=one',
			'?flow=recovery&code=one&token_hash=two&type=recovery',
			'?token_hash=hash&type=signup',
			'?token_hash=one&token_hash=two&type=invite',
			'?token_hash=hash&type=invite&next=https%3A%2F%2Fattacker.invalid'
		]) {
			expect(parseStaffAuthCallback(new URL(`https://goataccounting.co.za/admin/auth/callback${search}`)))
				.toBeNull();
		}
	});
});
