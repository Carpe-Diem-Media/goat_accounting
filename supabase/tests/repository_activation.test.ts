import { describe, expect, it } from 'bun:test';

import {
	createEstimatorRepository,
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
	it('loads and validates the persisted DTO before calling the activation RPC', async () => {
		const events: string[] = [];
		const harness = createClientHarness(events);
		let validatedInput: unknown;
		const validatePricingModel = (input: unknown) => {
			events.push('domain:validated');
			validatedInput = input;
			return input;
		};
		const repository = createEstimatorRepository(harness.client);
		const activate = repository.activatePricingModel as unknown as (
			modelId: string,
			actorUserId: string,
			validator: (input: unknown) => unknown
		) => Promise<unknown>;

		await activate(modelId, actorId, validatePricingModel);

		expect(events).toEqual(['from:pricing_models', 'draft:loaded', 'domain:validated', 'rpc']);
		expect(validatedInput).toEqual({
			id: modelId,
			version: '1.0.0',
			engineVersion: '1.0.0',
			currency: 'ZAR',
			state: 'DRAFT',
			confidenceThresholds: { highMaxPoints: 0, goodMaxPoints: 1 },
			rules: [
				{
					type: 'FIXED_RANGE',
					code: 'core_test',
					label: 'Core rule',
					explanation: 'Core explanation',
					scope: 'business',
					category: 'catchup',
					range: { minCents: 100, maxCents: 200 }
				}
			]
		});
		expect(harness.rpcCall?.name).toBe('activate_pricing_model');
		expect(harness.rpcCall?.args.p_validated_model).toEqual(validatedInput);
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

	it('does not call activation when domain validation rejects the persisted model', async () => {
		const events: string[] = [];
		const harness = createClientHarness(events);
		const repository = createEstimatorRepository(harness.client);
		const activate = repository.activatePricingModel as unknown as (
			modelId: string,
			actorUserId: string,
			validator: (input: unknown) => unknown
		) => Promise<unknown>;

		await expect(
			activate(modelId, actorId, () => {
				throw new Error('invalid pricing model');
			})
		).rejects.toThrow('invalid pricing model');
		expect(harness.rpcCount).toBe(0);
	});
});
