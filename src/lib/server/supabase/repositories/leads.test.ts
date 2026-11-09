import { describe, expect, test } from 'bun:test';
import { createLeadsRepository } from './leads';
import type { ContactInput } from '../../../domain/leads/contact';
import { ContactConflictError, ContactPersistenceError, ContactUnavailableError } from '../../leads/errors';
import type { EstimatorServiceClient } from '../repository.server';

function fakeClient(result: { data: unknown; error: unknown }) {
	const calls: unknown[] = [];
	const client = {
		from(table: string) {
			calls.push(['from', table]);
			return {
				select(columns: string) {
					calls.push(['select', columns]);
					return {
					eq(column: string, value: string) {
						calls.push(['eq', column, value]);
						return { maybeSingle: async () => result };
					}
				};
				}
			};
		},
		rpc(name: string, args: unknown) {
			calls.push(['rpc', name, args]);
			return Promise.resolve(result);
		}
	};
	return { client: client as unknown as EstimatorServiceClient, calls };
}

const input = {
	fullName: 'Ada Lovelace', email: 'ada@example.com', phone: null, businessName: null,
	preferredContactMethod: 'email' as const, contactConsent: true,
	requestedContact: true, requestedEstimateEmail: false
} satisfies ContactInput;

describe('createLeadsRepository', () => {
	test('looks up only the estimate id by public reference', async () => {
		const { client, calls } = fakeClient({ data: { id: 'estimate-1' }, error: null });
		await expect(createLeadsRepository(client).findEstimateId('public-1')).resolves.toBe('estimate-1');
		expect(calls).toEqual([
			['from', 'estimates'], ['select', 'id'], ['eq', 'public_ref', 'public-1']
		]);
	});

	test('writes through the atomic contact RPC with the normalized DTO', async () => {
		const { client, calls } = fakeClient({ data: '40000000-0000-4000-8000-000000000001', error: null });
		await createLeadsRepository(client).createContactLead('estimate-1', input);
		expect(calls).toEqual([['rpc', 'create_contact_lead', {
			p_estimate_id: 'estimate-1', p_full_name: 'Ada Lovelace', p_email: 'ada@example.com',
			p_phone: null, p_business_name: null, p_preferred_contact_method: 'email',
			p_contact_consent: true, p_requested_contact: true, p_requested_estimate_email: false
		}]]);
	});

	test('accepts the returned UUID for initial submissions and matching retries without exposing it', async () => {
		const { client, calls } = fakeClient({ data: '40000000-0000-4000-8000-000000000001', error: null });
		const repository = createLeadsRepository(client);
		await expect(repository.createContactLead('estimate-1', input)).resolves.toBe('40000000-0000-4000-8000-000000000001');
		await expect(repository.createContactLead('estimate-1', input)).resolves.toBe('40000000-0000-4000-8000-000000000001');
		expect(calls.filter((call) => Array.isArray(call) && call[0] === 'rpc')).toHaveLength(2);
	});

	test('returns null for absent or malformed successful RPC results', async () => {
		for (const data of [null, undefined, '', 'lead-1', '40000000-0000-4000-8000-00000000000Z', 42, {}, ['40000000-0000-4000-8000-000000000001']]) {
			const { client } = fakeClient({ data, error: null });
			await expect(createLeadsRepository(client).createContactLead('estimate-1', input)).resolves.toBeNull();
		}
	});

	test('maps known database outcomes to safe errors', async () => {
		for (const [code, ErrorType] of [
			['23505', ContactConflictError], ['P0002', ContactUnavailableError], ['22023', ContactPersistenceError]
		] as const) {
			const { client } = fakeClient({ data: null, error: { code, message: 'private database detail' } });
			await expect(createLeadsRepository(client).createContactLead('estimate-1', input)).rejects.toBeInstanceOf(ErrorType);
			try {
				await createLeadsRepository(client).createContactLead('estimate-1', input);
			} catch (error) {
				expect((error as Error).message).not.toContain('private database detail');
			}
		}
	});
});
