import { z } from 'zod';

const EmailContentSchema = z.object({
	disclaimer: z.string().trim().min(1).max(500),
	contactName: z.string().trim().min(1).max(120),
	contactEmail: z.string().trim().email().max(254),
	contactPhone: z.string().trim().min(1).max(40).optional(),
	title: z.string().trim().min(1).max(120).optional(),
	approvalReference: z.string().trim().min(1).max(120),
	publicOrigin: z.string().url().max(255)
}).strict().superRefine((value, context) => {
	if (/[\u0000-\u001f\u007f]/.test(value.title ?? '')) context.addIssue({ code: 'custom', path: ['title'], message: 'Title cannot contain control characters.' });
	const url = new URL(value.publicOrigin);
	if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
		context.addIssue({ code: 'custom', path: ['publicOrigin'], message: 'Expected an HTTPS origin.' });
	}
});

export type EmailContent = Readonly<z.infer<typeof EmailContentSchema>>;

export function parseEmailContent(config: unknown): EmailContent | null {
	let candidate = config;
	if (typeof config === 'string') {
		try {
			candidate = JSON.parse(config);
		} catch {
			return null;
		}
	}
	const parsed = EmailContentSchema.safeParse(candidate);
	return parsed.success ? { ...parsed.data, publicOrigin: new URL(parsed.data.publicOrigin).origin } : null;
}

export function requireEmailContent(config: unknown): EmailContent {
	const content = parseEmailContent(config);
	if (!content) throw new Error('Approved email content is unavailable.');
	return content;
}

export const loadEmailContent = parseEmailContent;
