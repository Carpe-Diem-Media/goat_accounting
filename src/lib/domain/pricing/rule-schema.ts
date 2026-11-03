import { z } from 'zod';

import { ANSWER_OPTION_VALUES, PRICING_INPUT_KEYS, type PricingInputKey } from '../estimator/questions';

export const SAFE_CENTS_SCHEMA = z.number().int().safe().min(0);
export const MAX_PRICING_RULE_OPTION_COUNT = Math.max(...Object.values(ANSWER_OPTION_VALUES).map((values) => values.length));

export const MoneyRangeSchema = z
	.object({ minCents: SAFE_CENTS_SCHEMA, maxCents: SAFE_CENTS_SCHEMA })
	.strict()
	.refine((range) => range.minCents <= range.maxCents, 'minCents must be less than or equal to maxCents.');

const inputKeySchema = z.enum(PRICING_INPUT_KEYS);
const moneyScopeSchema = z.enum(['business', 'personal']);
const resultCategorySchema = z.enum(['catchup', 'ongoing']);
const scoreSchema = z.number().int().safe().min(0).max(100_000);
const commonRule = {
	code: z.string().min(1).max(80),
	label: z.string().min(1).max(160),
	explanation: z.string().min(1).max(300)
};

export const AnswerConditionSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('ANSWER_EQUALS'), inputKey: inputKeySchema, value: z.string().min(1) }).strict(),
	z
		.object({
			type: z.literal('ANSWER_IN'),
			inputKey: inputKeySchema,
			values: z.array(z.string().min(1)).min(1).max(MAX_PRICING_RULE_OPTION_COUNT)
		})
		.strict(),
	z.object({ type: z.literal('ARRAY_CONTAINS'), inputKey: inputKeySchema, value: z.string().min(1) }).strict(),
	z.object({ type: z.literal('NUMERIC_AT_LEAST'), inputKey: inputKeySchema, value: z.number().int().safe().min(0) }).strict()
]);

const reviewConditionSchema = z.discriminatedUnion('type', [
	...AnswerConditionSchema.options,
	z.object({ type: z.literal('UNRESOLVED_MULTI_YEAR_BACKLOG') }).strict(),
	z.object({ type: z.literal('MULTIPLE_ENTITIES_WITHOUT_COUNT') }).strict(),
	z.object({ type: z.literal('UNPRICEABLE_COMPLEXITY_SELECTED') }).strict(),
	z.object({ type: z.literal('HIGH_VOLUME_SELECTED') }).strict(),
	z.object({ type: z.literal('UNKNOWN_VOLUME_WITH_MAJOR_BACKLOG') }).strict(),
	z.object({ type: z.literal('MULTI_YEAR_INCOMPLETE_RECORDS') }).strict(),
	z.object({ type: z.literal('PERSONAL_HIGH_RISK_SELECTED') }).strict(),
	z.object({ type: z.literal('INCOMPLETE_RECORDS_WITHOUT_FULL_STATEMENTS') }).strict()
]);

const fixedRangeRuleSchema = z
	.object({
		type: z.literal('FIXED_RANGE'),
		scope: moneyScopeSchema,
		category: resultCategorySchema,
		...commonRule,
		range: MoneyRangeSchema
	})
	.strict();

const bandRangeRuleSchema = z
	.object({
		type: z.literal('BAND_RANGE'),
		scope: moneyScopeSchema,
		category: resultCategorySchema,
		...commonRule,
		inputKey: inputKeySchema,
		bands: z
			.array(z.object({ value: z.string().min(1), range: MoneyRangeSchema }).strict())
			.min(1)
			.max(MAX_PRICING_RULE_OPTION_COUNT),
		when: AnswerConditionSchema.optional()
	})
	.strict();

const perUnitRangeRuleSchema = z
	.object({
		type: z.literal('PER_UNIT_RANGE'),
		scope: moneyScopeSchema,
		category: resultCategorySchema,
		...commonRule,
		inputKey: inputKeySchema,
		unitLabel: z.string().min(1).max(80),
		unitRange: MoneyRangeSchema,
		unknownRange: MoneyRangeSchema.optional(),
		when: z
			.object({ inputKey: inputKeySchema, value: z.string().min(1) })
			.strict()
			.optional()
	})
	.strict();

const perPeriodRangeRuleSchema = z
	.object({
		type: z.literal('PER_PERIOD_RANGE'),
		scope: moneyScopeSchema,
		category: resultCategorySchema,
		...commonRule,
		inputKey: inputKeySchema,
		periodCountInputKey: inputKeySchema.optional(),
		periodLabel: z.string().min(1).max(80),
		periodsByValue: z
			.array(
				z
					.object({
						value: z.string().min(1),
						minPeriods: z.number().int().safe().min(0).max(1000).nullable(),
						maxPeriods: z.number().int().safe().min(0).max(1000).nullable()
					})
					.strict()
					.refine(
						(period) =>
							(period.minPeriods === null && period.maxPeriods === null) ||
							(period.minPeriods !== null && period.maxPeriods !== null && period.minPeriods <= period.maxPeriods),
						'minPeriods and maxPeriods must both be null or form an ordered range.'
					)
			)
			.min(1)
			.max(MAX_PRICING_RULE_OPTION_COUNT),
		unitRange: MoneyRangeSchema,
		unknownRange: MoneyRangeSchema.optional()
	})
	.strict();

const serviceAddonRangeRuleSchema = z
	.object({
		type: z.literal('SERVICE_ADDON_RANGE'),
		scope: moneyScopeSchema,
		category: resultCategorySchema,
		...commonRule,
		inputKey: inputKeySchema,
		addOns: z
			.array(z.object({ value: z.string().min(1), label: z.string().min(1), range: MoneyRangeSchema }).strict())
			.min(1)
			.max(MAX_PRICING_RULE_OPTION_COUNT)
	})
	.strict();

const complexityScoreRuleSchema = z
	.object({
		type: z.literal('COMPLEXITY_SCORE'),
		scope: moneyScopeSchema,
		category: z.literal('score'),
		...commonRule,
		inputKey: inputKeySchema,
		pointsByValue: z
			.array(z.object({ value: z.string().min(1), points: scoreSchema }).strict())
			.min(1)
			.max(MAX_PRICING_RULE_OPTION_COUNT)
	})
	.strict();

const confidenceWeightRuleSchema = z
	.object({
		type: z.literal('CONFIDENCE_WEIGHT'),
		scope: z.enum(['business', 'personal', 'shared']),
		category: z.literal('score'),
		...commonRule,
		inputKey: inputKeySchema,
		pointsByValue: z
			.array(z.object({ value: z.string().min(1), points: scoreSchema }).strict())
			.max(MAX_PRICING_RULE_OPTION_COUNT)
			.default([]),
		missingPoints: scoreSchema.default(0),
		when: z.object({ inputKey: inputKeySchema, value: z.string().min(1) }).strict().optional()
	})
	.strict();

const reviewTriggerRuleSchema = z
	.object({
		type: z.literal('REVIEW_TRIGGER'),
		scope: z.enum(['business', 'personal', 'shared']),
		category: z.literal('review'),
		...commonRule,
		condition: reviewConditionSchema
	})
	.strict();

export const PricingRuleSchema = z.discriminatedUnion('type', [
	fixedRangeRuleSchema,
	bandRangeRuleSchema,
	perUnitRangeRuleSchema,
	perPeriodRangeRuleSchema,
	serviceAddonRangeRuleSchema,
	complexityScoreRuleSchema,
	confidenceWeightRuleSchema,
	reviewTriggerRuleSchema
]);

export type MoneyRange = z.infer<typeof MoneyRangeSchema>;
export type PricingRule = z.infer<typeof PricingRuleSchema>;
export type PricingRuleInput = z.input<typeof PricingRuleSchema>;
export type AnswerCondition = z.infer<typeof AnswerConditionSchema>;
export type ReviewCondition = z.infer<typeof reviewConditionSchema>;
export type PriceCategory = 'catchup' | 'ongoing';
export type PricingScope = 'business' | 'personal' | 'shared';

export const isPricingInputKey = (value: string): value is PricingInputKey =>
	(PRICING_INPUT_KEYS as readonly string[]).includes(value);
