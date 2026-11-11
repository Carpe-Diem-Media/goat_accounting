import type { CanonicalEstimatorAnswers } from '../estimator/answer-schema';
import { matchesAnswerCondition, readAnswerValue } from '../estimator/review-flags';
import type { ValidatedPricingModel } from './model';
import type { MoneyRange, PriceCategory, PricingRule } from './rule-schema';

export const PRICING_ENGINE_VERSION = '1.0.0';

export type EstimateLineItem = Readonly<{
	code: string;
	ruleCode: string;
	label: string;
	category: PriceCategory;
	branch: 'business' | 'personal';
	minCents: number;
	maxCents: number;
	quantity?: number;
	quantityRange?: Readonly<{ min: number; max: number }>;
	unit?: string;
	sourceAnswers: Readonly<Record<string, string | number | readonly string[]>>;
	explanation: string;
}>;

export type EstimateTotal = Readonly<{
	minCents: number;
	maxCents: number;
	lineItems: readonly EstimateLineItem[];
}>;

export type PricingRuleEvaluation = Readonly<{
	catchup: EstimateTotal;
	ongoing: EstimateTotal;
	complexityScores: Readonly<{ business?: number; personal?: number }>;
}>;

export class PricingEngineError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PricingEngineError';
	}
}

function hasBusiness(answers: CanonicalEstimatorAnswers): answers is Extract<CanonicalEstimatorAnswers, { calculatorType: 'business' | 'both' }> {
	return answers.calculatorType !== 'personal';
}

function hasPersonal(answers: CanonicalEstimatorAnswers): answers is Extract<CanonicalEstimatorAnswers, { calculatorType: 'personal' | 'both' }> {
	return answers.calculatorType !== 'business';
}

function scopeExists(scope: PricingRule['scope'], answers: CanonicalEstimatorAnswers): scope is 'business' | 'personal' {
	if (scope === 'business') return hasBusiness(answers);
	if (scope === 'personal') return hasPersonal(answers);
	return false;
}

function safeAdd(left: number, right: number, context: string): number {
	const result = left + right;
	if (!Number.isSafeInteger(result) || result < 0) throw new PricingEngineError(`Money arithmetic overflow while ${context}.`);
	return result;
}

function safeMultiply(left: number, right: number, context: string): number {
	const result = left * right;
	if (!Number.isSafeInteger(result) || result < 0) throw new PricingEngineError(`Money arithmetic overflow while ${context}.`);
	return result;
}

function multiplyRange(range: MoneyRange, count: number, context: string): MoneyRange {
	return {
		minCents: safeMultiply(range.minCents, count, context),
		maxCents: safeMultiply(range.maxCents, count, context)
	};
}

function getSourceAnswers(answers: CanonicalEstimatorAnswers, keys: readonly string[]): Record<string, string | number | readonly string[]> {
	const sources: Record<string, string | number | readonly string[]> = {};
	for (const key of keys) {
		const value = readAnswerValue(answers, key);
		if (typeof value === 'string' || typeof value === 'number') sources[key] = value;
		else if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) sources[key] = [...value];
	}
	return sources;
}

function createLineItem(
	rule: Extract<PricingRule, { category: 'catchup' | 'ongoing' }>,
	branch: 'business' | 'personal',
	range: MoneyRange,
	answers: CanonicalEstimatorAnswers,
	options: Readonly<{
		code?: string;
		label?: string;
		quantity?: number;
		quantityRange?: Readonly<{ min: number; max: number }>;
		unit?: string;
		sourceKeys?: readonly string[];
	}> = {}
): EstimateLineItem {
	if (range.minCents > range.maxCents || range.minCents < 0 || range.maxCents < 0) {
		throw new PricingEngineError(`Rule ${rule.code} produced an invalid money range.`);
	}
	return {
		code: options.code ?? rule.code,
		ruleCode: rule.code,
		label: options.label ?? rule.label,
		category: rule.category,
		branch,
		minCents: range.minCents,
		maxCents: range.maxCents,
		...(options.quantity === undefined ? {} : { quantity: options.quantity }),
		...(options.quantityRange === undefined ? {} : { quantityRange: options.quantityRange }),
		...(options.unit === undefined ? {} : { unit: options.unit }),
		sourceAnswers: getSourceAnswers(answers, options.sourceKeys ?? []),
		explanation: rule.explanation
	};
}

function matchesWhen(
	answers: CanonicalEstimatorAnswers,
	when: Extract<PricingRule, { type: 'PER_UNIT_RANGE' }>['when']
): boolean {
	if (!when) return true;
	return readAnswerValue(answers, when.inputKey) === when.value;
}

function lineItemsForBranch(
	answers: CanonicalEstimatorAnswers,
	model: ValidatedPricingModel,
	branch: 'business' | 'personal'
): EstimateLineItem[] {
	const items: EstimateLineItem[] = [];
	for (const rule of model.rules) {
		if (!scopeExists(rule.scope, answers) || rule.scope !== branch) continue;
		if (rule.type === 'FIXED_RANGE') {
			items.push(createLineItem(rule, branch, rule.range, answers));
			continue;
		}
		if (rule.type === 'BAND_RANGE') {
			if (rule.when && !matchesAnswerCondition(rule.when, answers)) continue;
			const value = readAnswerValue(answers, rule.inputKey);
			if (value === undefined) continue;
			if (typeof value !== 'string') throw new PricingEngineError(`Rule ${rule.code} requires a known answer for ${rule.inputKey}.`);
			const band = rule.bands.find((candidate) => candidate.value === value);
			if (!band) throw new PricingEngineError(`Rule ${rule.code} has no band for ${rule.inputKey}=${value}.`);
			items.push(createLineItem(rule, branch, band.range, answers, { sourceKeys: [rule.inputKey] }));
			continue;
		}
		if (rule.type === 'PER_UNIT_RANGE') {
			if (!matchesWhen(answers, rule.when)) continue;
			const value = readAnswerValue(answers, rule.inputKey);
			if (typeof value === 'number') {
				const itemRange = multiplyRange(rule.unitRange, value, `multiplying ${rule.code} by its quantity`);
				items.push(createLineItem(rule, branch, itemRange, answers, {
					quantity: value,
					unit: rule.unitLabel,
					sourceKeys: [rule.inputKey, ...(rule.when ? [rule.when.inputKey] : [])]
				}));
			} else if (value === undefined && rule.unknownRange) {
				items.push(createLineItem(rule, branch, rule.unknownRange, answers, {
					unit: rule.unitLabel,
					sourceKeys: rule.when ? [rule.when.inputKey] : []
				}));
			} else if (value !== undefined) {
				throw new PricingEngineError(`Rule ${rule.code} requires a numeric answer for ${rule.inputKey}.`);
			}
			continue;
		}
		if (rule.type === 'PER_PERIOD_RANGE') {
			const value = readAnswerValue(answers, rule.inputKey);
			if (typeof value !== 'string') throw new PricingEngineError(`Rule ${rule.code} requires a known answer for ${rule.inputKey}.`);
			const periodBand = rule.periodsByValue.find((candidate) => candidate.value === value);
			if (!periodBand) throw new PricingEngineError(`Rule ${rule.code} has no period band for ${rule.inputKey}=${value}.`);
			if (periodBand.minPeriods === null || periodBand.maxPeriods === null) {
				if (!rule.unknownRange) throw new PricingEngineError(`Rule ${rule.code} has no unknown-period range.`);
				items.push(createLineItem(rule, branch, rule.unknownRange, answers, { sourceKeys: [rule.inputKey] }));
				continue;
			}
			const exactCount = rule.periodCountInputKey ? readAnswerValue(answers, rule.periodCountInputKey) : undefined;
			const minPeriods = typeof exactCount === 'number' ? exactCount : periodBand.minPeriods;
			const maxPeriods = typeof exactCount === 'number' ? exactCount : periodBand.maxPeriods;
			if (maxPeriods === 0) continue;
			const itemRange = {
				minCents: safeMultiply(rule.unitRange.minCents, minPeriods, `multiplying ${rule.code} by minimum periods`),
				maxCents: safeMultiply(rule.unitRange.maxCents, maxPeriods, `multiplying ${rule.code} by maximum periods`)
			};
			items.push(createLineItem(rule, branch, itemRange, answers, {
				quantity: typeof exactCount === 'number' ? exactCount : undefined,
				quantityRange: typeof exactCount === 'number' ? undefined : { min: minPeriods, max: maxPeriods },
				unit: rule.periodLabel,
				sourceKeys: [rule.inputKey, ...(rule.periodCountInputKey ? [rule.periodCountInputKey] : [])]
			}));
			continue;
		}
		if (rule.type === 'SERVICE_ADDON_RANGE') {
			const value = readAnswerValue(answers, rule.inputKey);
			if (value === undefined) continue;
			if (!Array.isArray(value)) throw new PricingEngineError(`Rule ${rule.code} requires a multi-select answer for ${rule.inputKey}.`);
			for (const addOn of rule.addOns) {
				if (!value.includes(addOn.value)) continue;
				items.push(
					createLineItem(rule, branch, addOn.range, answers, {
						code: `${rule.code}.${addOn.value}`,
						label: addOn.label,
						sourceKeys: [rule.inputKey]
					})
				);
			}
		}
	}
	return items;
}

function totalFor(items: readonly EstimateLineItem[], category: PriceCategory): EstimateTotal {
	const lineItems = items.filter((item) => item.category === category);
	let minCents = 0;
	let maxCents = 0;
	for (const item of lineItems) {
		minCents = safeAdd(minCents, item.minCents, `adding ${category} minimums`);
		maxCents = safeAdd(maxCents, item.maxCents, `adding ${category} maximums`);
	}
	if (minCents > maxCents) throw new PricingEngineError(`${category} total minimum exceeds maximum.`);
	return { minCents, maxCents, lineItems };
}

function complexityScoreForBranch(
	answers: CanonicalEstimatorAnswers,
	model: ValidatedPricingModel,
	branch: 'business' | 'personal'
): number {
	let score = 0;
	for (const rule of model.rules) {
		if (rule.type !== 'COMPLEXITY_SCORE' || rule.scope !== branch) continue;
		const value = readAnswerValue(answers, rule.inputKey);
		if (value === undefined) continue;
		if (!Array.isArray(value)) throw new PricingEngineError(`Rule ${rule.code} requires a multi-select complexity answer.`);
		for (const selected of value) {
			const points = rule.pointsByValue.find((entry) => entry.value === selected)?.points;
			if (points === undefined) throw new PricingEngineError(`Rule ${rule.code} has no score for ${selected}.`);
			if (!Number.isSafeInteger(score + points)) throw new PricingEngineError(`Complexity score for ${branch} exceeds the safe integer range.`);
			score += points;
		}
	}
	return score;
}

export function evaluatePricingRules(
	answers: CanonicalEstimatorAnswers,
	model: ValidatedPricingModel
): PricingRuleEvaluation {
	if (model.state !== 'ACTIVE') throw new PricingEngineError('Only an active pricing model can evaluate pricing rules.');
	return evaluateValidatedRules(answers, model);
}

/** Internal acceptance path. Drafts never pass the public estimate guard. */
export function evaluateDraftPricingRules(answers: CanonicalEstimatorAnswers, model: ValidatedPricingModel): PricingRuleEvaluation {
	if (model.state !== 'DRAFT') throw new PricingEngineError('Candidate evaluation requires a draft pricing model.');
	return evaluateValidatedRules(answers, model);
}

function evaluateValidatedRules(answers: CanonicalEstimatorAnswers, model: ValidatedPricingModel): PricingRuleEvaluation {
	if (model.engineVersion !== PRICING_ENGINE_VERSION) {
		throw new PricingEngineError(
			`Pricing model requires unsupported pricing engine version ${model.engineVersion}; this engine supports ${PRICING_ENGINE_VERSION}.`
		);
	}
	const items = [
		...(hasBusiness(answers) ? lineItemsForBranch(answers, model, 'business') : []),
		...(hasPersonal(answers) ? lineItemsForBranch(answers, model, 'personal') : [])
	];
	return {
		catchup: totalFor(items, 'catchup'),
		ongoing: totalFor(items, 'ongoing'),
		complexityScores: {
			...(hasBusiness(answers) ? { business: complexityScoreForBranch(answers, model, 'business') } : {}),
			...(hasPersonal(answers) ? { personal: complexityScoreForBranch(answers, model, 'personal') } : {})
		}
	};
}
