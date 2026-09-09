export type RiskAnswer = 1 | 2 | 3 | 4 | 5;

export type RiskAnswers = Record<string, number>;

export const RISK_QUESTIONS = [
	{
		id: 'q1',
		text: 'I am comfortable with investments that may lose value in the short term for potentially higher long-term returns.',
		weight: 1
	},
	{ id: 'q2', text: 'I prefer guaranteed returns, even if they are lower.', weight: -1 },
	{ id: 'q3', text: 'Market volatility makes me anxious about my investments.', weight: -1 },
	{ id: 'q4', text: 'I would invest a significant portion of my portfolio in stocks.', weight: 1 },
	{ id: 'q5', text: 'I prioritize capital preservation over growth.', weight: -1 },
	{ id: 'q6', text: 'I am willing to take on more risk for the chance of higher rewards.', weight: 1 },
	{ id: 'q7', text: 'I would be comfortable if my portfolio dropped 20% in a single year.', weight: 1 },
	{ id: 'q8', text: 'I prefer stable, predictable investment returns.', weight: -1 },
	{ id: 'q9', text: 'I have a long time horizon and can wait for markets to recover.', weight: 1 },
	{ id: 'q10', text: 'I would rather miss a gain than risk a loss.', weight: -1 }
] as const;

export type RiskCategory =
	| 'Conservative'
	| 'Moderately Conservative'
	| 'Moderate'
	| 'Moderately Aggressive'
	| 'Aggressive';

const MIN_RAW_SCORE = -20;
const MAX_RAW_SCORE = 20;

export function calculateRiskScore(answers: RiskAnswers): number {
	const rawScore = RISK_QUESTIONS.reduce((total, question) => {
		const answer = normalizeAnswer(answers[question.id]);
		return total + answer * question.weight;
	}, 0);

	return Math.round(((rawScore - MIN_RAW_SCORE) / (MAX_RAW_SCORE - MIN_RAW_SCORE)) * 100);
}

export function getRiskCategory(score: number): RiskCategory {
	if (score <= 20) return 'Conservative';
	if (score <= 40) return 'Moderately Conservative';
	if (score <= 60) return 'Moderate';
	if (score <= 80) return 'Moderately Aggressive';
	return 'Aggressive';
}

export function getRiskDescription(category: RiskCategory): string {
	const descriptions: Record<RiskCategory, string> = {
		Conservative:
			'You prefer stability and capital preservation. You may be most comfortable with lower-risk investments, even if returns are more modest.',
		'Moderately Conservative':
			'You lean towards safety but are open to some growth assets. A balanced approach with a tilt towards fixed income may suit you.',
		Moderate:
			'You are comfortable with a balanced mix of growth and stability. You accept some short-term volatility for the potential of reasonable long-term returns.',
		'Moderately Aggressive':
			'You favour growth and are willing to accept meaningful short-term fluctuations. A portfolio weighted towards equities may align with your outlook.',
		Aggressive:
			'You seek maximum growth and are comfortable with significant market swings. You may have a long time horizon and high tolerance for volatility.'
	};

	return descriptions[category];
}

function normalizeAnswer(answer: number | undefined): RiskAnswer {
	return answer && answer >= 1 && answer <= 5 ? (Math.round(answer) as RiskAnswer) : 3;
}
