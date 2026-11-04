import { CanonicalEstimatorAnswersSchema, type CanonicalEstimatorAnswers } from './answer-schema';
import { calculateConfidence } from './confidence';
import { calculateReviewFlags } from './review-flags';
import { validatePricingModel, type ValidatedPricingModel } from '../pricing/model';
import { evaluatePricingRules, PRICING_ENGINE_VERSION, PricingEngineError } from '../pricing/engine';
import type { EstimateLineItem, EstimateTotal } from '../pricing/engine';

export const ESTIMATE_ENGINE_VERSION = PRICING_ENGINE_VERSION;
export { PricingEngineError };
export type { EstimateLineItem, EstimateTotal };

export type EstimateCalculation = Readonly<{
	engineVersion: string;
	pricingModelId: string;
	pricingModelVersion: string;
	catchup: EstimateTotal;
	ongoing: EstimateTotal;
	confidence: 'high' | 'good' | 'preliminary';
	confidenceReasons: readonly string[];
	confidencePoints: Readonly<{ business?: number; personal?: number }>;
	complexityScores: Readonly<{ business?: number; personal?: number }>;
	manualReviewRequired: boolean;
	reviewFlags: ReturnType<typeof calculateReviewFlags>;
	reviewReasons: readonly string[];
}>;

export function calculateEstimate(
	inputAnswers: CanonicalEstimatorAnswers,
	inputModel: ValidatedPricingModel
): EstimateCalculation {
	const answers = CanonicalEstimatorAnswersSchema.parse(inputAnswers);
	let model: ValidatedPricingModel;
	try {
		model = validatePricingModel(inputModel);
	} catch (error) {
		throw new PricingEngineError(error instanceof Error ? error.message : 'Pricing model validation failed.');
	}
	if (model.state !== 'ACTIVE') throw new PricingEngineError('Only an active pricing model can calculate an estimate.');

	const pricing = evaluatePricingRules(answers, model);
	const reviewFlags = calculateReviewFlags(answers, model);
	const confidence = calculateConfidence(answers, model, reviewFlags);
	return {
		engineVersion: model.engineVersion,
		pricingModelId: model.id,
		pricingModelVersion: model.version,
		catchup: pricing.catchup,
		ongoing: pricing.ongoing,
		confidence: confidence.confidence,
		confidenceReasons: confidence.confidenceReasons,
		confidencePoints: confidence.confidencePoints,
		complexityScores: pricing.complexityScores,
		manualReviewRequired: reviewFlags.length > 0,
		reviewFlags,
		reviewReasons: reviewFlags.map((flag) => flag.reason)
	};
}
