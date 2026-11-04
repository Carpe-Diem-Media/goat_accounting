import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

export type EstimatorServiceClient = SupabaseClient<Database, 'estimator'>;
type PricingModelValidator = (input: unknown) => unknown;

export const PRICING_ACTIVATION_INTEGRATION_BLOCKER =
	'Pricing activation is disabled until the PR 2 validator and approved candidate acceptance runner are integrated.';

type PricingRuleActivationRecord = Pick<
	Database['estimator']['Tables']['pricing_rules']['Row'],
	| 'code'
	| 'label'
	| 'scope'
	| 'category'
	| 'rule_type'
	| 'input_key'
	| 'explanation'
	| 'conditions'
	| 'parameters'
	| 'enabled'
	| 'sort_order'
>;

type PricingModelActivationRecord = Pick<
	Database['estimator']['Tables']['pricing_models']['Row'],
	'id' | 'version' | 'engine_contract_version' | 'currency' | 'state' | 'confidence_high_max_points' | 'confidence_good_max_points'
> & { pricing_rules: PricingRuleActivationRecord[] };

const pricingModelSelection = `
	id, version, engine_contract_version, currency, state,
	confidence_high_max_points, confidence_good_max_points,
	pricing_rules (
		code, label, scope, category, rule_type, input_key, explanation,
		conditions, parameters, enabled, sort_order
	)
`;

function jsonObject(value: Json, field: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Persisted pricing rule ${field} must be a JSON object.`);
	}
	return value as Record<string, unknown>;
}

function toDomainPricingModel(row: PricingModelActivationRecord): Record<string, unknown> {
	const rules = row.pricing_rules
		.filter((rule) => rule.enabled)
		.sort((left, right) => left.sort_order - right.sort_order)
		.map((rule) => {
			const typedRule: Record<string, unknown> = {
				type: rule.rule_type,
				scope: rule.scope,
				category: rule.category,
				code: rule.code,
				label: rule.label,
				explanation: rule.explanation
			};
			if (rule.input_key !== null) typedRule.inputKey = rule.input_key;

			for (const field of [
				jsonObject(rule.conditions, 'conditions'),
				jsonObject(rule.parameters, 'parameters')
			]) {
				for (const [key, value] of Object.entries(field)) {
					if (Object.hasOwn(typedRule, key)) {
						throw new Error(`Persisted pricing rule repeats the ${key} field.`);
					}
					typedRule[key] = value;
				}
			}
			return typedRule;
		});

	return {
		id: row.id,
		version: row.version,
		engineVersion: row.engine_contract_version,
		currency: row.currency,
		state: row.state,
		confidenceThresholds: {
			highMaxPoints: row.confidence_high_max_points,
			goodMaxPoints: row.confidence_good_max_points
		},
		rules
	};
}

export function createEstimatorRepository(client: EstimatorServiceClient) {
	return {
		async getActivePricingModel(validatePricingModel: PricingModelValidator) {
			const { data, error } = await client
				.from('pricing_models')
				.select(pricingModelSelection)
				.eq('state', 'ACTIVE')
				.eq('pricing_rules.enabled', true)
				.order('sort_order', { referencedTable: 'pricing_rules' })
				.maybeSingle();

			if (error) throw error;
			return data
				? validatePricingModel(toDomainPricingModel(data as unknown as PricingModelActivationRecord))
				: null;
		},

		/** Call only after the server has verified the staff session and AAL2. */
		getEstimateSnapshotForStaff(estimateId: string) {
			return client
				.from('estimates')
				.select(
					`id, public_ref, calculator_type, state, pricing_model_id, pricing_model_version,
					engine_version, answers_snapshot, calculation_snapshot, catchup_min_cents,
					catchup_max_cents, ongoing_min_cents, ongoing_max_cents, confidence,
					manual_review_required, review_reasons, review_flag_codes, created_at,
					estimate_line_items (
						id, estimate_id, pricing_rule_id, item_code, rule_code, label, category,
						branch, min_cents, max_cents, quantity, unit, explanation, sort_order
					)`
				)
				.order('sort_order', { referencedTable: 'estimate_line_items' })
				.eq('id', estimateId)
				.maybeSingle();
		},

		/**
		 * Activation remains closed until PR 2's validator and candidate acceptance runner are
		 * available in this branch. Do not accept a caller-supplied validator here.
		 */
		async activatePricingModel(_modelId: string, _actorUserId: string): Promise<never> {
			throw new Error(PRICING_ACTIVATION_INTEGRATION_BLOCKER);
		},

		/** Call only after the server has verified the actor's authenticated session, AAL2, and staff role. */
		transitionLead(input: {
			leadId: string;
			toState: Database['estimator']['Enums']['lead_state'];
			actorUserId: string;
			reasonCode?: string;
			note?: string;
		}) {
			return client.rpc('transition_lead', {
				p_lead_id: input.leadId,
				p_to_state: input.toState,
				p_actor_user_id: input.actorUserId,
				p_reason_code: input.reasonCode,
				p_note: input.note
			});
		}
	};
}
