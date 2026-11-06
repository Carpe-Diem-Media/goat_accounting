import { z } from 'zod';

const optionalText = (maxLength: number) => z.string().trim().max(maxLength).optional()
	.transform((value) => value || null);

const optionalPhone = z.string().trim().max(64).optional()
	.superRefine((value, context) => {
		if (value === undefined || value === '') return;
		const digits = value.replace(/\D/g, '');
		if (!/^\+?[0-9() .-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
			context.addIssue({ code: 'custom', message: 'Enter a valid phone number.' });
		}
	})
	.transform((value) => value || null);

export const contactInputSchema = z.object({
	fullName: z.string().trim().min(1).max(250),
	email: z.string().trim().min(3).max(320).email(),
	phone: optionalPhone,
	businessName: optionalText(250),
	preferredContactMethod: z.enum(['email', 'phone']),
	contactConsent: z.literal(true),
	requestedContact: z.boolean(),
	requestedEstimateEmail: z.boolean()
}).strict().refine((input) => input.requestedContact || input.requestedEstimateEmail, {
	path: ['requestedContact'],
	message: 'Choose at least one contact action.',
	// Missing consent must not suppress feedback about independent action selections.
	when: ({ value }) => {
		if (!value || typeof value !== 'object') return false;
		const input = value as Record<string, unknown>;
		return typeof input.requestedContact === 'boolean' && typeof input.requestedEstimateEmail === 'boolean';
	}
}).superRefine((input, context) => {
	if (input.preferredContactMethod === 'phone' && !input.phone) {
		context.addIssue({
			code: 'custom',
			path: ['phone'],
			message: 'A phone number is required when phone is preferred.'
		});
	}
});

export type ContactInput = z.output<typeof contactInputSchema>;
