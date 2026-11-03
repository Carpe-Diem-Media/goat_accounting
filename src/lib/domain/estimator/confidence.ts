import type { CanonicalEstimatorAnswers } from './answer-schema';
import type { EstimateReviewFlag } from './review-flags';
import { readAnswerValue } from './review-flags';
import type { PricingModel } from '../pricing/model';

export type EstimateConfidence = 'high' | 'good' | 'preliminary';

export type ConfidenceAssessment = Readonly<{
	confidence: EstimateConfidence;
	confidenceReasons: readonly string[];
	confidencePoints: Readonly<{ business?: number; personal?: number }>;
}>;

const branchExists = (answers: CanonicalEstimatorAnswers, branch: 'business' | 'personal') =>
	branch === 'business' ? answers.calculatorType !== 'personal' : answers.calculatorType !== 'business';

function pointsForBranch(
	answers: CanonicalEstimatorAnswers,
	model: PricingModel,
	branch: 'business' | 'personal',
	reasons: Set<string>
): number {
	let points = 0;
	for (const rule of model.rules) {
		if (rule.type !== 'CONFIDENCE_WEIGHT' || (rule.scope !== branch && rule.scope !== 'shared')) continue;
		if (rule.when && readAnswerValue(answers, rule.when.inputKey) !== rule.when.value) continue;
		const value = readAnswerValue(answers, rule.inputKey);
		let increment = 0;
		if (value === undefined) increment = rule.missingPoints;
		else if (typeof value === 'string') increment = rule.pointsByValue.find((entry) => entry.value === value)?.points ?? 0;
		else if (Array.isArray(value)) {
			increment = value.reduce((sum, selected) => {
				if (typeof selected !== 'string') return sum;
				return sum + (rule.pointsByValue.find((entry) => entry.value === selected)?.points ?? 0);
			}, 0);
		}
		if (!Number.isSafeInteger(points + increment)) throw new Error('Confidence score exceeds the safe integer range.');
		points += increment;
		if (increment > 0) reasons.add(rule.explanation);
	}
	return points;
}

function classify(points: number, thresholds: PricingModel['confidenceThresholds']): EstimateConfidence {
	if (points <= thresholds.highMaxPoints) return 'high';
	if (points <= thresholds.goodMaxPoints) return 'good';
	return 'preliminary';
}

const confidenceSeverity: Record<EstimateConfidence, number> = { high: 0, good: 1, preliminary: 2 };

export function calculateConfidence(
	answers: CanonicalEstimatorAnswers,
	model: PricingModel,
	reviewFlags: readonly EstimateReviewFlag[]
): ConfidenceAssessment {
	const reasons = new Set<string>();
	const scores: { business?: number; personal?: number } = {};
	let confidence: EstimateConfidence = 'high';
	for (const branch of ['business', 'personal'] as const) {
		if (!branchExists(answers, branch)) continue;
		const points = pointsForBranch(answers, model, branch, reasons);
		scores[branch] = points;
		const branchConfidence = classify(points, model.confidenceThresholds);
		if (confidenceSeverity[branchConfidence] > confidenceSeverity[confidence]) confidence = branchConfidence;
	}
	if (reviewFlags.length > 0) {
		confidence = 'preliminary';
		for (const flag of reviewFlags) reasons.add(flag.reason);
	}
	if (reasons.size === 0) reasons.add('The required structured pricing drivers are known and no review trigger matched.');
	return { confidence, confidenceReasons: [...reasons], confidencePoints: scores };
}
