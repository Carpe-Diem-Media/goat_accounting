import { describe, expect, it } from 'bun:test';
import {
	RISK_QUESTIONS,
	calculateRiskScore,
	getRiskCategory,
	getRiskDescription,
	type RiskAnswers
} from './risk_appetite';

describe('risk appetite scoring', () => {
	it('defines the ten questions used by the calculator', () => {
		expect(RISK_QUESTIONS).toHaveLength(10);
		expect(RISK_QUESTIONS[0]).toMatchObject({ id: 'q1', weight: 1 });
	});

	it('returns a neutral score for unanswered questions', () => {
		expect(calculateRiskScore({})).toBe(50);
	});

	it('normalizes opposite answer patterns to the score boundaries', () => {
		const riskSeeking: RiskAnswers = Object.fromEntries(
			RISK_QUESTIONS.map((question) => [question.id, question.weight === 1 ? 5 : 1])
		);
		const riskAverse: RiskAnswers = Object.fromEntries(
			RISK_QUESTIONS.map((question) => [question.id, question.weight === 1 ? 1 : 5])
		);

		expect(calculateRiskScore(riskSeeking)).toBe(100);
		expect(calculateRiskScore(riskAverse)).toBe(0);
	});

	it('maps score ranges to the five profile categories', () => {
		expect(getRiskCategory(0)).toBe('Conservative');
		expect(getRiskCategory(21)).toBe('Moderately Conservative');
		expect(getRiskCategory(41)).toBe('Moderate');
		expect(getRiskCategory(61)).toBe('Moderately Aggressive');
		expect(getRiskCategory(81)).toBe('Aggressive');
	});

	it('provides useful guidance for each profile category', () => {
		expect(getRiskDescription('Moderate')).toContain('balanced mix');
		expect(getRiskDescription('Aggressive')).toContain('maximum growth');
	});
});
