import { contactInputSchema, type ContactInput } from '../../domain/leads/contact';
import { ContactUnavailableError } from './errors';
import type { TurnstileResult } from './turnstile';

export class ContactValidationError extends Error {
 constructor() { super('Invalid contact request.'); this.name = 'ContactValidationError'; }
}
export class ContactVerificationError extends Error {
 constructor(public readonly unavailable = false) { super('Contact verification failed.'); this.name = 'ContactVerificationError'; }
}
export type ContactDependencies = Readonly<{
 verify: (token: string) => Promise<TurnstileResult>;
 findEstimateId: (publicRef: string) => Promise<string | null>;
	createContactLead: (estimateId: string, input: ContactInput) => Promise<string | null | void>;
	afterCommit?: (saved: SavedContactContext) => Promise<void> | void;
}>;

export type SavedContactContext = Readonly<{ leadId: string | null; estimateId: string }>;

/** The RPC persists the lead and intents. The optional callback runs after that commit. */
export async function createLeadFromEstimate(publicRef: string, body: unknown, dependencies: ContactDependencies): Promise<SavedContactContext> {
 if (!/^[a-f0-9]{32}$/.test(publicRef) || !body || typeof body !== 'object' || Array.isArray(body)) throw new ContactValidationError();
 const { turnstileToken, ...contact } = body as Record<string, unknown>;
 const parsed = contactInputSchema.safeParse(contact);
 if (!parsed.success || typeof turnstileToken !== 'string' || !turnstileToken.trim() || turnstileToken.length > 2048) throw new ContactValidationError();
 const verification = await dependencies.verify(turnstileToken);
 if (!verification.success) throw new ContactVerificationError(verification.reason === 'unavailable');
 const estimateId = await dependencies.findEstimateId(publicRef);
 if (!estimateId) throw new ContactUnavailableError();
 // A matching retry remains valid after estimate invalidation. The RPC owns that decision.
	const returnedLeadId = await dependencies.createContactLead(estimateId, parsed.data);
 const saved = { leadId: typeof returnedLeadId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(returnedLeadId) ? returnedLeadId : null, estimateId };
	try { await dependencies.afterCommit?.(saved); } catch { /* Notification work cannot change an acknowledged save. */ }
	return saved;
}
