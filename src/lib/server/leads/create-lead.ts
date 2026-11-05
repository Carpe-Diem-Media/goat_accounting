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
 createContactLead: (estimateId: string, input: ContactInput) => Promise<void>;
}>;

/** Only the atomic RPC persists the lead and pending deliveries. This service never sends mail. */
export async function createLeadFromEstimate(publicRef: string, body: unknown, dependencies: ContactDependencies): Promise<void> {
 if (!/^[a-f0-9]{32}$/.test(publicRef) || !body || typeof body !== 'object' || Array.isArray(body)) throw new ContactValidationError();
 const { turnstileToken, ...contact } = body as Record<string, unknown>;
 const parsed = contactInputSchema.safeParse(contact);
 if (!parsed.success || typeof turnstileToken !== 'string' || !turnstileToken.trim() || turnstileToken.length > 2048) throw new ContactValidationError();
 const verification = await dependencies.verify(turnstileToken);
 if (!verification.success) throw new ContactVerificationError(verification.reason === 'unavailable');
 const estimateId = await dependencies.findEstimateId(publicRef);
 if (!estimateId) throw new ContactUnavailableError();
 // A matching retry remains valid after estimate invalidation. The RPC owns that decision.
 await dependencies.createContactLead(estimateId, parsed.data);
}
