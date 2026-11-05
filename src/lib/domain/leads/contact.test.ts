import { describe, expect, test } from 'bun:test';
import { contactInputSchema } from './contact';

describe('contactInputSchema', () => {
	const valid = {
		fullName: '  Ada Lovelace  ',
		email: ' ada@example.com ',
		preferredContactMethod: 'email',
		contactConsent: true,
		requestedContact: true,
		requestedEstimateEmail: false
	};

	test('trims required fields and normalizes empty optional fields to null', () => {
		expect(contactInputSchema.parse({ ...valid, phone: '   ', businessName: '' })).toEqual({
			fullName: 'Ada Lovelace',
			email: 'ada@example.com',
			phone: null,
			businessName: null,
			preferredContactMethod: 'email',
			contactConsent: true,
			requestedContact: true,
			requestedEstimateEmail: false
		});
	});

	test('rejects unknown keys and non-consented or no-action requests', () => {
		for (const input of [
			{ ...valid, marketingConsent: true },
			{ ...valid, contactConsent: false },
			{ ...valid, requestedContact: false, requestedEstimateEmail: false }
		]) expect(contactInputSchema.safeParse(input).success).toBe(false);
	});

	test('reports missing actions alongside empty required fields and missing consent', () => {
		const result = contactInputSchema.safeParse({ ...valid, fullName: '', email: '', contactConsent: false, requestedContact: false });
		expect(result.success).toBe(false);
		if (result.success) throw new Error('Empty contact input must fail.');
		expect(new Set(result.error.issues.map((issue) => issue.path[0]))).toEqual(new Set(['fullName', 'email', 'contactConsent', 'requestedContact']));
	});

	test('requires a phone number for phone preference and validates international-safe digits', () => {
		expect(contactInputSchema.safeParse({ ...valid, preferredContactMethod: 'phone' }).success).toBe(false);
		expect(contactInputSchema.safeParse({ ...valid, preferredContactMethod: 'phone', phone: '+27 (82) 123-4567' }).success).toBe(true);
		expect(contactInputSchema.safeParse({ ...valid, phone: '12 ext 34' }).success).toBe(false);
		expect(contactInputSchema.safeParse({ ...valid, phone: '+123456' }).success).toBe(false);
		expect(contactInputSchema.safeParse({ ...valid, phone: '+1234567890123456' }).success).toBe(false);
	});

	test('enforces trimmed field bounds and email validity', () => {
		expect(contactInputSchema.safeParse({ ...valid, fullName: '   ' }).success).toBe(false);
		expect(contactInputSchema.safeParse({ ...valid, fullName: 'x'.repeat(251) }).success).toBe(false);
		expect(contactInputSchema.safeParse({ ...valid, email: 'bad' }).success).toBe(false);
		expect(contactInputSchema.safeParse({ ...valid, email: `${'x'.repeat(309)}@example.com` }).success).toBe(false);
		expect(contactInputSchema.safeParse({ ...valid, businessName: 'x'.repeat(251) }).success).toBe(false);
	});
});
