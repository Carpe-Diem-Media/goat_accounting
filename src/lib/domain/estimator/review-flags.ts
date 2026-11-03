import type { CanonicalEstimatorAnswers } from './answer-schema';
import type { PricingModel } from '../pricing/model';
import type { AnswerCondition, ReviewCondition, PricingRule } from '../pricing/rule-schema';

export type EstimateReviewFlag = Readonly<{
	code: string;
	label: string;
	reason: string;
	ruleCode: string;
}>;

export function readAnswerValue(answers: CanonicalEstimatorAnswers, inputKey: string): unknown {
	const [branch, field] = inputKey.split('.');
	if (branch === 'urgency') return answers.urgency;
	if (branch === 'business') return answers.calculatorType === 'personal' ? undefined : answers.business[field as keyof typeof answers.business];
	if (branch === 'personal') return answers.calculatorType === 'business' ? undefined : answers.personal[field as keyof typeof answers.personal];
	return undefined;
}

const hasBusiness = (answers: CanonicalEstimatorAnswers) => answers.calculatorType !== 'personal';
const hasPersonal = (answers: CanonicalEstimatorAnswers) => answers.calculatorType !== 'business';

function appliesToAnswers(scope: PricingRule['scope'], answers: CanonicalEstimatorAnswers): boolean {
	if (scope === 'business') return hasBusiness(answers);
	if (scope === 'personal') return hasPersonal(answers);
	return true;
}

export function matchesAnswerCondition(condition: AnswerCondition, answers: CanonicalEstimatorAnswers): boolean {
	if (condition.type === 'ANSWER_EQUALS') return readAnswerValue(answers, condition.inputKey) === condition.value;
	if (condition.type === 'ANSWER_IN') {
		const value = readAnswerValue(answers, condition.inputKey);
		return typeof value === 'string' && condition.values.includes(value);
	}
	if (condition.type === 'ARRAY_CONTAINS') {
		const value = readAnswerValue(answers, condition.inputKey);
		return Array.isArray(value) && value.includes(condition.value);
	}
	const value = readAnswerValue(answers, condition.inputKey);
	return typeof value === 'number' && value >= condition.value;
}

function isMultiYearBacklog(answers: CanonicalEstimatorAnswers): boolean {
	if (!hasBusiness(answers)) return false;
	return ['1_to_2_years', 'over_2_years'].includes(answers.business.booksStatus) && answers.business.outstandingMonths === undefined;
}

function isPersonalHighRisk(answers: CanonicalEstimatorAnswers): boolean {
	if (!hasPersonal(answers)) return false;
	return (
		answers.personal.currentStatus === 'sars_issue' ||
		answers.personal.sarsPosition === 'audit' ||
		answers.personal.sarsPosition === 'objection_appeal' ||
		answers.personal.sarsPosition === 'tax_debt'
	);
}

function matchesCondition(condition: ReviewCondition, answers: CanonicalEstimatorAnswers): boolean {
	if (
		condition.type === 'ANSWER_EQUALS' ||
		condition.type === 'ANSWER_IN' ||
		condition.type === 'ARRAY_CONTAINS' ||
		condition.type === 'NUMERIC_AT_LEAST'
	) {
		return matchesAnswerCondition(condition, answers);
	}
	if (condition.type === 'UNRESOLVED_MULTI_YEAR_BACKLOG') return isMultiYearBacklog(answers);
	if (condition.type === 'MULTIPLE_ENTITIES_WITHOUT_COUNT') {
		return hasBusiness(answers) && answers.business.entityType === 'multiple_entities' && answers.business.entityCount === undefined;
	}
	if (condition.type === 'UNPRICEABLE_COMPLEXITY_SELECTED') {
		return hasBusiness(answers) && (answers.business.complexityFactors.includes('not_sure') || answers.business.entityType === 'other_not_sure');
	}
	if (condition.type === 'HIGH_VOLUME_SELECTED') {
		return hasBusiness(answers) && answers.business.monthlyTransactionVolume === 'over_750';
	}
	if (condition.type === 'UNKNOWN_VOLUME_WITH_MAJOR_BACKLOG') {
		return (
			hasBusiness(answers) &&
			answers.business.monthlyTransactionVolume === 'not_sure' &&
			['6_to_12_months', '1_to_2_years', 'over_2_years'].includes(answers.business.booksStatus)
		);
	}
	if (condition.type === 'MULTI_YEAR_INCOMPLETE_RECORDS') {
		return (
			hasBusiness(answers) &&
			['1_to_2_years', 'over_2_years'].includes(answers.business.booksStatus) &&
			['bank_statements_only', 'incomplete_or_messy'].includes(answers.business.recordCondition)
		);
	}
	if (condition.type === 'PERSONAL_HIGH_RISK_SELECTED') return isPersonalHighRisk(answers);
	if (condition.type === 'INCOMPLETE_RECORDS_WITHOUT_FULL_STATEMENTS') {
		return (
			hasBusiness(answers) &&
			answers.business.booksStatus !== 'current_and_reconciled' &&
			['bank_statements_only', 'incomplete_or_messy'].includes(answers.business.recordCondition) &&
			answers.business.bankStatementsAvailableForFullPeriod !== 'yes'
		);
	}
	return false;
}

export function calculateReviewFlags(
	answers: CanonicalEstimatorAnswers,
	model: Pick<PricingModel, 'rules'>
): EstimateReviewFlag[] {
	const flags: EstimateReviewFlag[] = [];
	for (const rule of model.rules) {
		if (rule.type !== 'REVIEW_TRIGGER' || !appliesToAnswers(rule.scope, answers)) continue;
		if (!matchesCondition(rule.condition, answers)) continue;
		flags.push({ code: rule.code, label: rule.label, reason: rule.explanation, ruleCode: rule.code });
	}
	return flags;
}
