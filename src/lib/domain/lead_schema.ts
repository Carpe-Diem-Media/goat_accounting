import { z } from 'zod';

const southAfricanPhoneRegex = /^(?:\+27|0)(?:[ -]?\d){9}$/;
const sastIsoRegex = /(?:\+02:00)$/;

export const PrimaryInterestSchema = z.enum([
	'Retirement',
	'Investments',
	'Risk Cover',
	'General'
]);

export const LeadSchema = z.object({
	client_name: z.string().min(2, 'client_name must be at least 2 characters'),
	client_email: z.string().email('client_email must be a valid email address'),
	client_phone: z
		.string()
		.regex(
			southAfricanPhoneRegex,
			'client_phone must be a valid South African phone number (0XXXXXXXXX or +27XXXXXXXXX)'
		),
	primary_interest: PrimaryInterestSchema,
	appointment_start_iso: z
		.string()
		.datetime({ offset: true })
		.regex(sastIsoRegex, 'appointment_start_iso must be in SAST (+02:00)')
});

export type Lead = z.infer<typeof LeadSchema>;
export type PrimaryInterest = z.infer<typeof PrimaryInterestSchema>;
