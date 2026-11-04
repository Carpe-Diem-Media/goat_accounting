import { describe, expect, it } from 'bun:test';

import {
	createEstimatorRepository,
	PRICING_ACTIVATION_INTEGRATION_BLOCKER,
	type EstimatorServiceClient
} from '../../src/lib/server/supabase/repository.server';
import { PricingModelValidationError, validatePricingModel } from '../../src/lib/domain/pricing/model';
import { TEST_PRICING_MODEL } from '../../src/lib/domain/pricing/test-corpus';
import type { PricingRule } from '../../src/lib/domain/pricing/rule-schema';

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

function createClientHarness(events: string[], model: unknown = draft) {
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

type PersistedPricingRule = {
	code: string;
	label: string;
	scope: PricingRule['scope'];
	category: PricingRule['category'];
	rule_type: PricingRule['type'];
	input_key: string | null;
	explanation: string;
	conditions: Record<string, unknown>;
	parameters: Record<string, unknown>;
	enabled: boolean;
	sort_order: number;
};

type PersistedPricingModel = {
	id: string;
	version: string;
	engine_contract_version: string;
	currency: 'ZAR';
	state: 'ACTIVE';
	confidence_high_max_points: number;
	confidence_good_max_points: number;
	pricing_rules: PersistedPricingRule[];
};

function databaseRuleCode(code: string): string {
	return code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function persistTestRule(rule: PricingRule, sortOrder: number): PersistedPricingRule {
	const conditions: Record<string, unknown> = {};
	const parameters: Record<string, unknown> = {};
	let input_key: string | null = null;

	switch (rule.type) {
		case 'FIXED_RANGE':
			parameters.range = rule.range;
			break;
		case 'BAND_RANGE':
			input_key = rule.inputKey;
			parameters.bands = rule.bands;
			if (rule.when) conditions.when = rule.when;
			break;
		case 'PER_UNIT_RANGE':
			input_key = rule.inputKey;
			parameters.unitLabel = rule.unitLabel;
			parameters.unitRange = rule.unitRange;
			if (rule.unknownRange) parameters.unknownRange = rule.unknownRange;
			if (rule.when) conditions.when = rule.when;
			break;
		case 'PER_PERIOD_RANGE':
			input_key = rule.inputKey;
			parameters.periodLabel = rule.periodLabel;
			parameters.periodsByValue = rule.periodsByValue;
			parameters.unitRange = rule.unitRange;
			if (rule.periodCountInputKey) parameters.periodCountInputKey = rule.periodCountInputKey;
			if (rule.unknownRange) parameters.unknownRange = rule.unknownRange;
			break;
		case 'SERVICE_ADDON_RANGE':
			input_key = rule.inputKey;
			parameters.addOns = rule.addOns;
			break;
		case 'COMPLEXITY_SCORE':
			input_key = rule.inputKey;
			parameters.pointsByValue = rule.pointsByValue;
			break;
		case 'CONFIDENCE_WEIGHT':
			input_key = rule.inputKey;
			parameters.pointsByValue = rule.pointsByValue;
			parameters.missingPoints = rule.missingPoints;
			if (rule.when) conditions.when = rule.when;
			break;
		case 'REVIEW_TRIGGER':
			conditions.condition = rule.condition;
			break;
	}

	return {
		code: databaseRuleCode(rule.code),
		label: rule.label,
		scope: rule.scope,
		category: rule.category,
		rule_type: rule.type,
		input_key,
		explanation: rule.explanation,
		conditions,
		parameters,
		enabled: true,
		sort_order: sortOrder
	};
}

function persistedTestPricingModel(): PersistedPricingModel {
	return {
		id: modelId,
		version: '1.0.0',
		engine_contract_version: TEST_PRICING_MODEL.engineVersion,
		currency: TEST_PRICING_MODEL.currency,
		state: 'ACTIVE',
		confidence_high_max_points: TEST_PRICING_MODEL.confidenceThresholds.highMaxPoints,
		confidence_good_max_points: TEST_PRICING_MODEL.confidenceThresholds.goodMaxPoints,
		pricing_rules: TEST_PRICING_MODEL.rules.map(persistTestRule)
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

		// The candidate-acceptance runner and approved manifest are not available yet.
		// Activation fails closed before reading a candidate or reaching the RPC.
		expect(events).toEqual([]);
		expect(harness.rpcCount).toBe(0);
	});

	it('rebuilds typed rule JSONB and validates the active DTO with the PR 2 domain validator', async () => {
		const events: string[] = [];
		const persistedModel = persistedTestPricingModel();
		persistedModel.pricing_rules.push({
			...persistTestRule(TEST_PRICING_MODEL.rules[0], persistedModel.pricing_rules.length),
			code: 'disabled_test_rule',
			enabled: false
		});
		const harness = createClientHarness(events, persistedModel);
		const repository = createEstimatorRepository(harness.client);
		const activeModel = await repository.getActivePricingModel();
		const expectedModel = validatePricingModel({
			...TEST_PRICING_MODEL,
			id: modelId,
			version: '1.0.0',
			state: 'ACTIVE',
			rules: TEST_PRICING_MODEL.rules.map((rule) => ({ ...rule, code: databaseRuleCode(rule.code) }))
		});

		expect(events).toEqual(['from:pricing_models', 'active:loaded']);
		expect(activeModel).toEqual(expectedModel);
		expect(activeModel).not.toHaveProperty('name');
	});

	it('rejects an invalid persisted active model instead of allowing caller-supplied validation', async () => {
		const events: string[] = [];
		const invalidModel = { ...persistedTestPricingModel(), pricing_rules: [] };
		const harness = createClientHarness(events, invalidModel);
		const repository = createEstimatorRepository(harness.client);

		await expect(repository.getActivePricingModel()).rejects.toBeInstanceOf(PricingModelValidationError);
	});

});
