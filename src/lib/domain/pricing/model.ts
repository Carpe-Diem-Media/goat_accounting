import { z } from 'zod';

import { ANSWER_OPTION_VALUES, getAllowedValuesForInputKey } from '../estimator/questions';
import {
	MoneyRangeSchema,
	PricingRuleSchema,
	type AnswerCondition,
	type PricingRule,
	type ReviewCondition
} from './rule-schema';

export { PricingRuleSchema };

export const MAX_PRICING_MODEL_RULE_COUNT = 128;

export const PricingModelSchema = z
	.object({
		id: z.string().min(1).max(100),
		version: z.string().min(1).max(80),
		engineVersion: z.string().min(1).max(80),
		currency: z.literal('ZAR'),
		state: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']),
		confidenceThresholds: z
			.object({ highMaxPoints: z.number().int().safe().min(0), goodMaxPoints: z.number().int().safe().min(0) })
			.strict(),
		rules: z.array(PricingRuleSchema).min(1).max(MAX_PRICING_MODEL_RULE_COUNT)
	})
	.strict()
	.superRefine((model, context) => {
		if (model.confidenceThresholds.highMaxPoints > model.confidenceThresholds.goodMaxPoints) {
			context.addIssue({
				code: 'custom',
				path: ['confidenceThresholds'],
				message: 'highMaxPoints must be less than or equal to goodMaxPoints.'
			});
		}
		if (model.confidenceThresholds.highMaxPoints !== 0 || model.confidenceThresholds.goodMaxPoints > 1) {
			context.addIssue({
				code: 'custom',
				path: ['confidenceThresholds'],
				message: 'V1 confidence thresholds must keep highMaxPoints at 0 and goodMaxPoints at 1 or less.'
			});
		}
	});

export type PricingModel = z.infer<typeof PricingModelSchema>;
declare const validatedPricingModelBrand: unique symbol;
export type ValidatedPricingModel = PricingModel & { readonly [validatedPricingModelBrand]: true };

export class PricingModelValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PricingModelValidationError';
	}
}

const knownNumericKeys = new Set([
	'business.entityCount',
	'business.outstandingMonths',
	'personal.outstandingYears'
]);

const knownNumericMaximums: Readonly<Record<string, number>> = {
	'business.entityCount': 1000,
	'business.outstandingMonths': 100,
	'personal.outstandingYears': 100
};

const businessBooksStatusMonthBounds: Readonly<Record<string, readonly [number, number] | null>> = {
	current_and_reconciled: [0, 0],
	less_than_3_months: [1, 2],
	'3_to_6_months': [3, 6],
	'6_to_12_months': [7, 12],
	'1_to_2_years': [13, 24],
	over_2_years: [25, 100],
	not_sure: null
};

const orderedWorkloadBands: Readonly<Record<string, readonly string[]>> = {
	'business.monthlyTransactionVolume': ['under_50', '50_to_150', '151_to_300', '301_to_750', 'over_750'],
	'business.financialAccounts': ['one', '2_to_3', '4_to_6', '7_plus'],
	'business.employeeCount': ['none', '1_to_5', '6_to_15', '16_to_30', '31_plus'],
	'personal.rentalPropertyCount': ['one', '2_to_3', '4_plus']
};

const knownMultiSelectKeys = new Set([
	'business.ongoingServices',
	'business.complexityFactors',
	'business.outstandingComplianceAreas',
	'personal.incomeSources',
	'personal.ongoingRequirements'
]);

const knownScalarKeys = new Set(
	Object.keys(ANSWER_OPTION_VALUES).filter((key) => !knownMultiSelectKeys.has(key))
);

function assertAllowedValue(inputKey: string, value: string, path: string): void {
	const allowed = getAllowedValuesForInputKey(inputKey);
	if (!allowed?.includes(value)) throw new PricingModelValidationError(`${path} contains unknown ${inputKey} value "${value}".`);
}

function assertRange(range: unknown, path: string): void {
	const parsed = MoneyRangeSchema.safeParse(range);
	if (!parsed.success) throw new PricingModelValidationError(`${path} is not a valid nonnegative integer-cent range.`);
}

function validateRuleInputScope(
	scope: 'business' | 'personal' | 'shared',
	inputKey: string,
	path: string,
	allowUrgencyForSharedRule = false
): void {
	if (inputKey === 'urgency') {
		if (scope !== 'shared' || !allowUrgencyForSharedRule) {
			throw new PricingModelValidationError(`${path}: urgency cannot affect a price.`);
		}
		return;
	}
	if (scope === 'shared') {
		throw new PricingModelValidationError(`${path}: shared V1 rules may use only urgency.`);
	}
	const inputBranch = inputKey.split('.')[0];
	if (inputBranch !== scope) {
		throw new PricingModelValidationError(`${path}: ${inputKey} cannot drive a ${scope} rule.`);
	}
}

function validateAnswerCondition(condition: AnswerCondition, path: string): void {
	if (condition.type === 'ANSWER_EQUALS') {
		if (knownMultiSelectKeys.has(condition.inputKey) || knownNumericKeys.has(condition.inputKey)) {
			throw new PricingModelValidationError(`${path} must use ARRAY_CONTAINS for multi-select answers and numeric conditions for counts.`);
		}
		assertAllowedValue(condition.inputKey, condition.value, path);
		return;
	}
	if (condition.type === 'ANSWER_IN') {
		if (knownMultiSelectKeys.has(condition.inputKey) || knownNumericKeys.has(condition.inputKey)) {
			throw new PricingModelValidationError(`${path} must use ARRAY_CONTAINS for multi-select answers and numeric conditions for counts.`);
		}
		if (new Set(condition.values).size !== condition.values.length) throw new PricingModelValidationError(`${path} has duplicate values.`);
		for (const value of condition.values) assertAllowedValue(condition.inputKey, value, path);
		return;
	}
	if (condition.type === 'ARRAY_CONTAINS') {
		if (!knownMultiSelectKeys.has(condition.inputKey)) throw new PricingModelValidationError(`${path} uses ARRAY_CONTAINS with a scalar answer.`);
		assertAllowedValue(condition.inputKey, condition.value, path);
		return;
	}
	if (!knownNumericKeys.has(condition.inputKey)) {
		throw new PricingModelValidationError(`${path} uses a numeric condition with a nonnumeric answer.`);
	}
	if (condition.value > knownNumericMaximums[condition.inputKey]) {
		throw new PricingModelValidationError(`${path} threshold exceeds the accepted maximum for ${condition.inputKey}.`);
	}
}

function validateRuleSemantics(rule: PricingRule, index: number): void {
	const path = `rules[${index}]`;
	const inputValues = rule.type === 'FIXED_RANGE' || rule.type === 'REVIEW_TRIGGER' ? undefined : getAllowedValuesForInputKey(rule.inputKey);

	if (rule.type === 'FIXED_RANGE') assertRange(rule.range, `${path}.range`);
	if (rule.type === 'BAND_RANGE') {
		validateRuleInputScope(rule.scope, rule.inputKey, `${path}.inputKey`);
		if (!inputValues) throw new PricingModelValidationError(`${path}.inputKey is not a categorical answer key.`);
		const values = rule.bands.map((band) => band.value);
		if (new Set(values).size !== values.length) throw new PricingModelValidationError(`${path} contains duplicate bands.`);
		if (values.length !== inputValues.length || inputValues.some((value) => !values.includes(value))) {
			throw new PricingModelValidationError(`${path} must include every allowed value for ${rule.inputKey}.`);
		}
		for (const [bandIndex, band] of rule.bands.entries()) assertRange(band.range, `${path}.bands[${bandIndex}].range`);
		const bandsByValue = new Map(rule.bands.map((band) => [band.value, band.range]));
		const workloadOrder = orderedWorkloadBands[rule.inputKey];
		if (workloadOrder) {
			let previous: { minCents: number; maxCents: number } | undefined;
			for (const value of workloadOrder) {
				const range = bandsByValue.get(value);
				if (!range) throw new PricingModelValidationError(`${path} is missing workload band ${value}.`);
				if (previous && (range.minCents < previous.minCents || range.maxCents < previous.maxCents)) {
					throw new PricingModelValidationError(`${path} workload ranges must be monotone as ${rule.inputKey} increases.`);
				}
				previous = range;
			}
		}
		if (rule.when) {
			validateRuleInputScope(rule.scope, rule.when.inputKey, `${path}.when`);
			validateAnswerCondition(rule.when, `${path}.when`);
		}
		if (rule.inputKey === 'business.monthlyTransactionVolume') {
			const lowestKnownRange = bandsByValue.get('under_50');
			const highestKnownRange = bandsByValue.get('over_750');
			const unknownRange = bandsByValue.get('not_sure');
			if (
				!lowestKnownRange ||
				!highestKnownRange ||
				!unknownRange ||
				unknownRange.minCents > lowestKnownRange.minCents ||
				unknownRange.maxCents < highestKnownRange.maxCents
			) {
				throw new PricingModelValidationError(`${path} unknown workload range must cover the known workload range.`);
			}
		}
	}
	if (rule.type === 'PER_UNIT_RANGE') {
		validateRuleInputScope(rule.scope, rule.inputKey, `${path}.inputKey`);
		if (!knownNumericKeys.has(rule.inputKey)) throw new PricingModelValidationError(`${path}.inputKey must be an optional nonnegative integer count.`);
		assertRange(rule.unitRange, `${path}.unitRange`);
		if (!rule.unknownRange) throw new PricingModelValidationError(`${path} needs a safe unknown range for its optional count.`);
		assertRange(rule.unknownRange, `${path}.unknownRange`);
		if (rule.when) {
			validateRuleInputScope(rule.scope, rule.when.inputKey, `${path}.when`);
			if (knownMultiSelectKeys.has(rule.when.inputKey) || knownNumericKeys.has(rule.when.inputKey)) {
				throw new PricingModelValidationError(`${path}.when must compare a scalar categorical answer.`);
			}
			assertAllowedValue(rule.when.inputKey, rule.when.value, `${path}.when`);
		}
	}
	if (rule.type === 'PER_PERIOD_RANGE') {
		validateRuleInputScope(rule.scope, rule.inputKey, `${path}.inputKey`);
		if (!inputValues) throw new PricingModelValidationError(`${path}.inputKey is not a categorical answer key.`);
		const values = rule.periodsByValue.map((entry) => entry.value);
		if (new Set(values).size !== values.length) throw new PricingModelValidationError(`${path} contains duplicate period values.`);
		if (values.length !== inputValues.length || inputValues.some((value) => !values.includes(value))) {
			throw new PricingModelValidationError(`${path} must map every allowed value for ${rule.inputKey}.`);
		}
		assertRange(rule.unitRange, `${path}.unitRange`);
		if (rule.unknownRange) assertRange(rule.unknownRange, `${path}.unknownRange`);
		if (rule.periodCountInputKey && !knownNumericKeys.has(rule.periodCountInputKey)) {
			throw new PricingModelValidationError(`${path}.periodCountInputKey must be an optional nonnegative integer count.`);
		}
		if (rule.periodCountInputKey) validateRuleInputScope(rule.scope, rule.periodCountInputKey, `${path}.periodCountInputKey`);
		if (rule.periodsByValue.some((period) => period.minPeriods === null) && !rule.unknownRange) {
			throw new PricingModelValidationError(`${path} needs unknownRange for values without a known period count.`);
		}
		if (rule.inputKey === 'business.booksStatus') {
			if (rule.periodCountInputKey !== 'business.outstandingMonths') {
				throw new PricingModelValidationError(`${path} must use business.outstandingMonths as its exact period count.`);
			}
			for (const period of rule.periodsByValue) {
				const acceptedBounds = businessBooksStatusMonthBounds[period.value];
				if (
					acceptedBounds &&
					(period.minPeriods === null ||
						period.maxPeriods === null ||
						period.minPeriods > acceptedBounds[0] ||
						period.maxPeriods < acceptedBounds[1])
				) {
					throw new PricingModelValidationError(`${path} must cover accepted outstanding-month counts for ${period.value}.`);
				}
			}
		}
	}
	if (rule.type === 'SERVICE_ADDON_RANGE') {
		validateRuleInputScope(rule.scope, rule.inputKey, `${path}.inputKey`);
		if (!inputValues || !knownMultiSelectKeys.has(rule.inputKey)) {
			throw new PricingModelValidationError(`${path}.inputKey must be a structured multi-select answer.`);
		}
		const values = rule.addOns.map((addOn) => addOn.value);
		if (new Set(values).size !== values.length) throw new PricingModelValidationError(`${path} contains duplicate add-ons.`);
		if (values.length !== inputValues.length || inputValues.some((value) => !values.includes(value))) {
			throw new PricingModelValidationError(`${path} must include every allowed value for ${rule.inputKey}.`);
		}
		for (const [addOnIndex, addOn] of rule.addOns.entries()) assertRange(addOn.range, `${path}.addOns[${addOnIndex}].range`);
	}
	if (rule.type === 'COMPLEXITY_SCORE') {
		validateRuleInputScope(rule.scope, rule.inputKey, `${path}.inputKey`);
		if (!inputValues || !knownMultiSelectKeys.has(rule.inputKey)) {
			throw new PricingModelValidationError(`${path}.inputKey must be a structured multi-select answer.`);
		}
		const values = rule.pointsByValue.map((entry) => entry.value);
		if (new Set(values).size !== values.length) throw new PricingModelValidationError(`${path} contains duplicate complexity values.`);
		if (values.length !== inputValues.length || inputValues.some((value) => !values.includes(value))) {
			throw new PricingModelValidationError(`${path} must score every allowed value for ${rule.inputKey}.`);
		}
	}
	if (rule.type === 'CONFIDENCE_WEIGHT') {
		validateRuleInputScope(rule.scope, rule.inputKey, `${path}.inputKey`, true);
		const numericInput = knownNumericKeys.has(rule.inputKey);
		if ((!inputValues || !knownScalarKeys.has(rule.inputKey)) && !numericInput) {
			throw new PricingModelValidationError(`${path}.inputKey must be a scalar categorical answer or optional count.`);
		}
		if (numericInput && rule.pointsByValue.length > 0) {
			throw new PricingModelValidationError(`${path} cannot assign categorical weights to a numeric count.`);
		}
		if (numericInput && rule.missingPoints === 0) {
			throw new PricingModelValidationError(`${path} must assign a positive missing-count confidence weight.`);
		}
		const values = rule.pointsByValue.map((entry) => entry.value);
		if (new Set(values).size !== values.length) throw new PricingModelValidationError(`${path} contains duplicate confidence values.`);
		if (!numericInput) for (const value of values) assertAllowedValue(rule.inputKey, value, `${path}.pointsByValue`);
		if (rule.when) {
			validateRuleInputScope(rule.scope, rule.when.inputKey, `${path}.when`, true);
			if (knownMultiSelectKeys.has(rule.when.inputKey) || knownNumericKeys.has(rule.when.inputKey)) {
				throw new PricingModelValidationError(`${path}.when must compare a scalar categorical answer.`);
			}
			assertAllowedValue(rule.when.inputKey, rule.when.value, `${path}.when`);
		}
	}
	if (rule.type === 'REVIEW_TRIGGER') {
		const condition = rule.condition;
		if (
			condition.type === 'ANSWER_EQUALS' ||
			condition.type === 'ANSWER_IN' ||
			condition.type === 'ARRAY_CONTAINS' ||
			condition.type === 'NUMERIC_AT_LEAST'
		) {
			validateRuleInputScope(rule.scope, condition.inputKey, `${path}.condition`, true);
			validateAnswerCondition(condition, `${path}.condition`);
		} else {
			const requiredScope =
				condition.type === 'PERSONAL_HIGH_RISK_SELECTED' ? 'personal' :
				condition.type === 'UNRESOLVED_MULTI_YEAR_BACKLOG' ||
				condition.type === 'MULTIPLE_ENTITIES_WITHOUT_COUNT' ||
				condition.type === 'UNPRICEABLE_COMPLEXITY_SELECTED' ||
				condition.type === 'HIGH_VOLUME_SELECTED' ||
				condition.type === 'UNKNOWN_VOLUME_WITH_MAJOR_BACKLOG' ||
				condition.type === 'MULTI_YEAR_INCOMPLETE_RECORDS' ||
				condition.type === 'INCOMPLETE_RECORDS_WITHOUT_FULL_STATEMENTS'
					? 'business'
					: undefined;
			if (requiredScope && rule.scope !== requiredScope) {
				throw new PricingModelValidationError(`${path}.condition must use ${requiredScope} scope.`);
			}
		}
	}
}

function hasBranchBaseRules(rules: readonly PricingRule[], scope: 'business' | 'personal'): boolean {
	return (['catchup', 'ongoing'] as const).every((category) =>
		rules.some((rule) => rule.scope === scope && rule.category === category && isPricedRule(rule))
	);
}

const isPricedRule = (rule: PricingRule): rule is Extract<PricingRule, { category: 'catchup' | 'ongoing' }> =>
	rule.category === 'catchup' || rule.category === 'ongoing';

function matchesRequiredApplicability(
	rule: PricingRule,
	expectedWhen?: Readonly<{ inputKey: string; value: string }>
): boolean {
	if (expectedWhen === undefined) return !('when' in rule) || rule.when === undefined;
	if (rule.type !== 'PER_UNIT_RANGE') return false;
	return rule.when?.inputKey === expectedWhen.inputKey && rule.when.value === expectedWhen.value;
}

function hasMandatoryRuleCoverage(rules: readonly PricingRule[]): boolean {
	const required: readonly Readonly<{
		scope: 'business' | 'personal';
		category: PricingRule['category'];
		type: PricingRule['type'];
		inputKey?: string;
		when?: Readonly<{ inputKey: string; value: string }>;
	}>[] = [
		{ scope: 'business', category: 'catchup', type: 'BAND_RANGE', inputKey: 'business.entityType' },
		{ scope: 'business', category: 'catchup', type: 'PER_PERIOD_RANGE', inputKey: 'business.booksStatus' },
		{ scope: 'business', category: 'catchup', type: 'BAND_RANGE', inputKey: 'business.recordCondition' },
		{ scope: 'business', category: 'ongoing', type: 'BAND_RANGE', inputKey: 'business.monthlyTransactionVolume' },
		{ scope: 'business', category: 'ongoing', type: 'BAND_RANGE', inputKey: 'business.financialAccounts' },
		{ scope: 'business', category: 'ongoing', type: 'BAND_RANGE', inputKey: 'business.employeeCount' },
		{ scope: 'business', category: 'catchup', type: 'BAND_RANGE', inputKey: 'business.taxPosition' },
		{ scope: 'business', category: 'ongoing', type: 'SERVICE_ADDON_RANGE', inputKey: 'business.ongoingServices' },
		{ scope: 'business', category: 'catchup', type: 'SERVICE_ADDON_RANGE', inputKey: 'business.outstandingComplianceAreas' },
		{
			scope: 'business', category: 'catchup', type: 'PER_UNIT_RANGE', inputKey: 'business.entityCount',
			when: { inputKey: 'business.entityType', value: 'multiple_entities' }
		},
		{ scope: 'business', category: 'score', type: 'COMPLEXITY_SCORE', inputKey: 'business.complexityFactors' },
		{ scope: 'personal', category: 'catchup', type: 'BAND_RANGE', inputKey: 'personal.currentStatus' },
		{ scope: 'personal', category: 'catchup', type: 'SERVICE_ADDON_RANGE', inputKey: 'personal.incomeSources' },
		{ scope: 'personal', category: 'catchup', type: 'BAND_RANGE', inputKey: 'personal.rentalPropertyCount' },
		{ scope: 'personal', category: 'catchup', type: 'BAND_RANGE', inputKey: 'personal.sarsPosition' },
		{
			scope: 'personal', category: 'catchup', type: 'PER_UNIT_RANGE', inputKey: 'personal.outstandingYears',
			when: { inputKey: 'personal.currentStatus', value: 'multiple_years_outstanding' }
		},
		{ scope: 'personal', category: 'ongoing', type: 'SERVICE_ADDON_RANGE', inputKey: 'personal.ongoingRequirements' },
		{ scope: 'personal', category: 'score', type: 'COMPLEXITY_SCORE', inputKey: 'personal.incomeSources' }
	];
	return required.every((expected) =>
		rules.some((rule) => {
			return (
				rule.scope === expected.scope &&
				rule.category === expected.category &&
				rule.type === expected.type &&
				('inputKey' in rule ? rule.inputKey === expected.inputKey : expected.inputKey === undefined) &&
				matchesRequiredApplicability(rule, expected.when)
			);
		})
	);
}

const mandatoryReviewSafeguards: readonly Readonly<{
	scope: 'business' | 'personal' | 'shared';
	condition: ReviewCondition;
}>[] = [
	{ scope: 'business', condition: { type: 'ANSWER_EQUALS', inputKey: 'business.entityType', value: 'other_not_sure' } },
	{ scope: 'business', condition: { type: 'MULTIPLE_ENTITIES_WITHOUT_COUNT' } },
	{ scope: 'business', condition: { type: 'UNRESOLVED_MULTI_YEAR_BACKLOG' } },
	{ scope: 'business', condition: { type: 'MULTI_YEAR_INCOMPLETE_RECORDS' } },
	{ scope: 'business', condition: { type: 'INCOMPLETE_RECORDS_WITHOUT_FULL_STATEMENTS' } },
	{ scope: 'business', condition: { type: 'ANSWER_EQUALS', inputKey: 'business.taxPosition', value: 'sars_issue' } },
	{ scope: 'business', condition: { type: 'HIGH_VOLUME_SELECTED' } },
	{ scope: 'business', condition: { type: 'UNKNOWN_VOLUME_WITH_MAJOR_BACKLOG' } },
	{ scope: 'business', condition: { type: 'UNPRICEABLE_COMPLEXITY_SELECTED' } },
	{ scope: 'business', condition: { type: 'ANSWER_EQUALS', inputKey: 'business.employeeCount', value: '31_plus' } },
	{ scope: 'business', condition: { type: 'ARRAY_CONTAINS', inputKey: 'business.complexityFactors', value: 'trust_structures' } },
	{ scope: 'business', condition: { type: 'NUMERIC_AT_LEAST', inputKey: 'business.entityCount', value: 5 } },
	{ scope: 'personal', condition: { type: 'PERSONAL_HIGH_RISK_SELECTED' } },
	{ scope: 'personal', condition: { type: 'ARRAY_CONTAINS', inputKey: 'personal.incomeSources', value: 'other' } },
	{ scope: 'shared', condition: { type: 'ANSWER_IN', inputKey: 'urgency', values: ['within_14_days', 'deadline_missed'] } }
];

function sameReviewCondition(actual: ReviewCondition, expected: ReviewCondition): boolean {
	if (actual.type !== expected.type) return false;
	switch (actual.type) {
		case 'ANSWER_EQUALS':
			return expected.type === actual.type && actual.inputKey === expected.inputKey && actual.value === expected.value;
		case 'ANSWER_IN':
			return (
				expected.type === actual.type &&
				actual.inputKey === expected.inputKey &&
				actual.values.length === expected.values.length &&
				actual.values.every((value) => expected.values.includes(value))
			);
		case 'ARRAY_CONTAINS':
			return expected.type === actual.type && actual.inputKey === expected.inputKey && actual.value === expected.value;
		case 'NUMERIC_AT_LEAST':
			return expected.type === actual.type && actual.inputKey === expected.inputKey && actual.value === expected.value;
		default:
			return true;
	}
}

function hasMandatoryReviewCoverage(rules: readonly PricingRule[]): boolean {
	return mandatoryReviewSafeguards.every((required) =>
		rules.some(
			(rule) =>
				rule.type === 'REVIEW_TRIGGER' &&
				rule.scope === required.scope &&
				sameReviewCondition(rule.condition, required.condition)
		)
	);
}

type ConfidenceSafeguard = Readonly<{
	scope: 'business' | 'personal';
	inputKey: string;
	value: string;
}>;

type MissingCountSafeguard = Readonly<{
	scope: 'business' | 'personal';
	inputKey: string;
	when: Readonly<{ inputKey: string; value: string }>;
}>;

const mandatoryUnknownAnswerWeights: readonly ConfidenceSafeguard[] = [
	{ scope: 'business', inputKey: 'business.booksStatus', value: 'not_sure' },
	{ scope: 'business', inputKey: 'business.recordCondition', value: 'not_sure' },
	{ scope: 'business', inputKey: 'business.monthlyTransactionVolume', value: 'not_sure' },
	{ scope: 'business', inputKey: 'business.financialAccounts', value: 'not_sure' },
	{ scope: 'business', inputKey: 'business.employeeCount', value: 'not_sure' },
	{ scope: 'business', inputKey: 'business.taxPosition', value: 'not_sure' },
	{ scope: 'personal', inputKey: 'personal.currentStatus', value: 'not_sure' },
	{ scope: 'personal', inputKey: 'personal.sarsPosition', value: 'not_sure' },
	{ scope: 'personal', inputKey: 'personal.rentalPropertyCount', value: 'not_sure' },
	{ scope: 'personal', inputKey: 'personal.foreignIncomePresent', value: 'not_sure' },
	{ scope: 'personal', inputKey: 'personal.capitalGainsOccurred', value: 'not_sure' }
];

const mandatoryMissingCountWeights: readonly MissingCountSafeguard[] = [
	{
		scope: 'business',
		inputKey: 'business.entityCount',
		when: { inputKey: 'business.entityType', value: 'multiple_entities' }
	},
	{
		scope: 'business',
		inputKey: 'business.outstandingMonths',
		when: { inputKey: 'business.booksStatus', value: '1_to_2_years' }
	},
	{
		scope: 'business',
		inputKey: 'business.outstandingMonths',
		when: { inputKey: 'business.booksStatus', value: 'over_2_years' }
	},
	{
		scope: 'personal',
		inputKey: 'personal.outstandingYears',
		when: { inputKey: 'personal.currentStatus', value: 'multiple_years_outstanding' }
	}
];

function hasMandatoryConfidenceCoverage(rules: readonly PricingRule[], highMaxPoints: number): boolean {
	const answerWeightsPresent = mandatoryUnknownAnswerWeights.every((required) =>
		rules.some(
			(rule) =>
				rule.type === 'CONFIDENCE_WEIGHT' &&
				rule.scope === required.scope &&
				rule.inputKey === required.inputKey &&
				rule.when === undefined &&
				rule.pointsByValue.some((entry) => entry.value === required.value && entry.points > highMaxPoints)
		)
	);
	const missingCountWeightsPresent = mandatoryMissingCountWeights.every((required) =>
		rules.some(
			(rule) =>
				rule.type === 'CONFIDENCE_WEIGHT' &&
				rule.scope === required.scope &&
				rule.inputKey === required.inputKey &&
				rule.when?.inputKey === required.when.inputKey &&
				rule.when.value === required.when.value &&
				rule.missingPoints > highMaxPoints
		)
	);
	return answerWeightsPresent && missingCountWeightsPresent;
}

export function validatePricingModel(input: unknown): ValidatedPricingModel {
	const parsed = PricingModelSchema.safeParse(input);
	if (!parsed.success) throw new PricingModelValidationError(parsed.error.issues.map((issue) => issue.message).join(' '));
	const model = parsed.data;
	const codes = model.rules.map((rule) => rule.code);
	if (new Set(codes).size !== codes.length) throw new PricingModelValidationError('Pricing rule codes must be unique.');
	for (const [index, rule] of model.rules.entries()) validateRuleSemantics(rule, index);
	if (!hasBranchBaseRules(model.rules, 'business')) {
		throw new PricingModelValidationError('Business pricing requires at least one catch-up and one ongoing rule.');
	}
	if (!hasBranchBaseRules(model.rules, 'personal')) {
		throw new PricingModelValidationError('Personal pricing requires at least one catch-up and one ongoing rule.');
	}
	if (!hasMandatoryRuleCoverage(model.rules)) {
		throw new PricingModelValidationError('Pricing model is missing mandatory V1 business or personal driver coverage.');
	}
	if (!hasMandatoryReviewCoverage(model.rules)) {
		throw new PricingModelValidationError('Pricing model is missing mandatory professional-review safeguards.');
	}
	if (!hasMandatoryConfidenceCoverage(model.rules, model.confidenceThresholds.highMaxPoints)) {
		throw new PricingModelValidationError('Pricing model is missing mandatory confidence safeguards.');
	}
	return model as ValidatedPricingModel;
}
