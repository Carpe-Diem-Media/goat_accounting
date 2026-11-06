import { z } from 'zod';
import type { ContactInput } from '../../../domain/leads/contact';
import type { EstimatorServiceClient } from '../repository.server';
import {
	ContactConflictError,
	ContactPersistenceError,
	ContactUnavailableError
} from '../../leads/errors';

type SupabaseError = Readonly<{ code?: string }>;

function contactError(error: SupabaseError): Error {
	if (error.code === '23505') return new ContactConflictError();
	if (error.code === 'P0002') return new ContactUnavailableError();
	return new ContactPersistenceError();
}

export function createLeadsRepository(client: EstimatorServiceClient) {
	return {
		async findEstimateId(publicRef: string): Promise<string | null> {
			const { data, error } = await client
				.from('estimates')
				.select('id')
				.eq('public_ref', publicRef)
				.maybeSingle();

			if (error) throw new ContactPersistenceError();
			return data?.id ?? null;
		},

		async createContactLead(estimateId: string, input: ContactInput): Promise<void> {
			const { data, error } = await client.rpc('create_contact_lead', {
				p_estimate_id: estimateId,
				p_full_name: input.fullName,
				p_email: input.email,
				p_phone: input.phone,
				p_business_name: input.businessName,
				p_preferred_contact_method: input.preferredContactMethod,
				p_contact_consent: input.contactConsent,
				p_requested_contact: input.requestedContact,
				p_requested_estimate_email: input.requestedEstimateEmail
			});

			if (error) throw contactError(error);
			if (!z.uuid().safeParse(data).success) throw new ContactPersistenceError();
		}
	};
}
