import { describe, expect, it } from 'bun:test';

import {
	createEstimatorRepository,
	PRICING_ACTIVATION_INTEGRATION_BLOCKER,
	type EstimatorServiceClient
} from '../../src/lib/server/supabase/repository.server';

const modelId = '20000000-0000-4000-8000-000000000001';
const actorId = '10000000-0000-4000-8000-000000000001';

const draft = {
	id: modelId,
	version: '1.0.0',
	name: 'Admin-only model name',
	state: 'DRAFT',
	engine_contract_version: '1.0.0',
	currency: 'ZAR',
	confidence_high_max_points: 0,
	confidence_good_max_points: 1,
	pricing_rules: [
		{
			id: '30000000-0000-4000-8000-000000000001',
			pricing_model_id: modelId,
			code: 'core_test',
			label: 'Core rule',
			scope: 'business',
			category: 'catchup',
			rule_type: 'FIXED_RANGE',
			input_key: null,
			explanation: 'Core explanation',
			conditions: {},
			parameters: { range: { minCents: 100, maxCents: 200 } },
			enabled: true,
			sort_order: 1
		},
		{
			id: '30000000-0000-4000-8000-000000000002',
			pricing_model_id: modelId,
			code: 'disabled_rule',
			label: 'Disabled rule',
			scope: 'business',
			category: 'catchup',
			rule_type: 'FIXED_RANGE',
			input_key: null,
			explanation: 'Disabled explanation',
			conditions: {},
			parameters: { range: { minCents: 0, maxCents: 0 } },
			enabled: false,
			sort_order: 2
		}
	]
};

function createClientHarness(events: string[], model = draft) {
	let rpcCall: { name: string; args: Record<string, unknown> } | undefined;
	let rpcCount = 0;
	const query = {
		select() {
			return this;
		},
		eq() {
			return this;
		},
		order() {
			return this;
		},
		single() {
			events.push('draft:loaded');
			return Promise.resolve({ data: model, error: null });
		},
		maybeSingle() {
			events.push('active:loaded');
			return Promise.resolve({ data: model, error: null });
		}
	};
	const client = {
		from(table: string) {
			events.push(`from:${table}`);
			return query;
		},
		rpc(name: string, args: Record<string, unknown>) {
			events.push('rpc');
			rpcCount += 1;
			rpcCall = { name, args };
			return Promise.resolve({ data: null, error: null });
		}
	} as unknown as EstimatorServiceClient;
	return {
		client,
		get rpcCall() {
			return rpcCall;
		},
		get rpcCount() {
			return rpcCount;
		}
	};
}

describe('pricing model activation repository', () => {
	it('fails closed before reading a draft or invoking the activation RPC', async () => {
		const events: string[] = [];
		const invalidMandatoryRuleDraft = { ...draft, pricing_rules: [] };
		expect(invalidMandatoryRuleDraft.pricing_rules).toHaveLength(0);
		const harness = createClientHarness(events, invalidMandatoryRuleDraft);
		const repository = createEstimatorRepository(harness.client);

		await expect(repository.activatePricingModel(modelId, actorId)).rejects.toThrow(
			PRICING_ACTIVATION_INTEGRATION_BLOCKER
		);

		// PR2's validator and candidate-acceptance runner are not present on this branch.
		// Activation fails closed before reading a candidate or reaching the RPC.
		expect(events).toEqual([]);
		expect(harness.rpcCount).toBe(0);
	});

	it('rebuilds an active domain DTO and excludes disabled database rules', async () => {
		const events: string[] = [];
		const harness = createClientHarness(events, { ...draft, state: 'ACTIVE' });
		let validatedInput: unknown;
		const validatePricingModel = (input: unknown) => {
			events.push('domain:validated');
			validatedInput = input;
			return input;
		};
		const repository = createEstimatorRepository(harness.client);
		const getActive = repository.getActivePricingModel as unknown as (
			validator: (input: unknown) => unknown
		) => Promise<unknown>;

		await getActive(validatePricingModel);

		expect(events).toEqual(['from:pricing_models', 'active:loaded', 'domain:validated']);
		expect(validatedInput).toMatchObject({
			id: modelId,
			engineVersion: '1.0.0',
			currency: 'ZAR',
			state: 'ACTIVE',
			rules: [{ code: 'core_test', explanation: 'Core explanation' }]
		});
		expect(validatedInput).not.toHaveProperty('name');
	});

});
