import { z } from 'zod';

import { ANSWER_OPTION_VALUES } from './questions';

const answerEnum = <K extends keyof typeof ANSWER_OPTION_VALUES>(key: K) =>
	z.enum(ANSWER_OPTION_VALUES[key]);
const answerSelection = <K extends keyof typeof ANSWER_OPTION_VALUES>(key: K) =>
	z.array(answerEnum(key)).min(1).max(ANSWER_OPTION_VALUES[key].length);

const outstandingMonthsSchema = z.number().int().safe().min(1).max(100);
const outstandingYearsSchema = z.number().int().safe().min(2).max(100);

const noDuplicates = (values: readonly string[]) => new Set(values).size === values.length;

export const BusinessAnswersSchema = z
	.object({
		entityType: answerEnum('business.entityType'),
		entityCount: z.number().int().safe().min(2).max(1000).optional(),
		booksStatus: answerEnum('business.booksStatus'),
		outstandingMonths: outstandingMonthsSchema.optional(),
		recordCondition: answerEnum('business.recordCondition'),
		bankStatementsAvailableForFullPeriod: answerEnum(
			'business.bankStatementsAvailableForFullPeriod'
		).optional(),
		monthlyTransactionVolume: answerEnum('business.monthlyTransactionVolume'),
		financialAccounts: answerEnum('business.financialAccounts'),
		employeeCount: answerEnum('business.employeeCount'),
		taxPosition: answerEnum('business.taxPosition'),
		outstandingComplianceAreas: answerSelection('business.outstandingComplianceAreas').optional(),
		ongoingServices: answerSelection('business.ongoingServices'),
		complexityFactors: answerSelection('business.complexityFactors')
	})
	.strict()
	.superRefine((business, context) => {
		if (business.entityType !== 'multiple_entities' && business.entityCount !== undefined) {
			context.addIssue({
				code: 'custom',
				path: ['entityCount'],
				message: 'Entity count is only collected for multiple entities.'
			});
		}

		if (business.outstandingMonths !== undefined && business.booksStatus !== '1_to_2_years' && business.booksStatus !== 'over_2_years') {
			context.addIssue({
				code: 'custom',
				path: ['outstandingMonths'],
				message: 'Outstanding-month count is only collected for multi-year backlogs.'
			});
		}
		if (
			business.outstandingMonths !== undefined &&
			((business.booksStatus === '1_to_2_years' && business.outstandingMonths < 13) ||
				(business.booksStatus === '1_to_2_years' && business.outstandingMonths > 24) ||
				(business.booksStatus === 'over_2_years' && business.outstandingMonths < 25))
		) {
			context.addIssue({
				code: 'custom',
				path: ['outstandingMonths'],
				message: 'Outstanding-month count must fit the selected books-status band.'
			});
		}

		const backlogExists = business.booksStatus !== 'current_and_reconciled';
		const needsStatementAvailability =
			backlogExists &&
			(business.recordCondition === 'bank_statements_only' ||
				business.recordCondition === 'incomplete_or_messy');
		if (needsStatementAvailability && business.bankStatementsAvailableForFullPeriod === undefined) {
			context.addIssue({
				code: 'custom',
				path: ['bankStatementsAvailableForFullPeriod'],
				message: 'Statement availability is required for incomplete records with a backlog.'
			});
		}
		if (!needsStatementAvailability && business.bankStatementsAvailableForFullPeriod !== undefined) {
			context.addIssue({
				code: 'custom',
				path: ['bankStatementsAvailableForFullPeriod'],
				message: 'Statement availability is only collected when records are incomplete and behind.'
			});
		}

		const complianceAreasRequired =
			business.taxPosition === 'some_submissions_outstanding' ||
			business.taxPosition === 'multiple_periods_outstanding';
		const complianceAreasAreAllowed =
			complianceAreasRequired || business.taxPosition === 'sars_issue';
		if (complianceAreasRequired && business.outstandingComplianceAreas === undefined) {
			context.addIssue({
				code: 'custom',
				path: ['outstandingComplianceAreas'],
				message: 'Select the outstanding compliance areas.'
			});
		}
		if (!complianceAreasAreAllowed && business.outstandingComplianceAreas !== undefined) {
			context.addIssue({
				code: 'custom',
				path: ['outstandingComplianceAreas'],
				message: 'Outstanding areas are only collected when compliance status identifies outstanding work.'
			});
		}

		if (!noDuplicates(business.ongoingServices)) {
			context.addIssue({ code: 'custom', path: ['ongoingServices'], message: 'Service selections must be unique.' });
		}
		if (!noDuplicates(business.complexityFactors)) {
			context.addIssue({ code: 'custom', path: ['complexityFactors'], message: 'Complexity selections must be unique.' });
		}
		const exclusiveComplexity = business.complexityFactors.includes('none') || business.complexityFactors.includes('not_sure');
		if (exclusiveComplexity && business.complexityFactors.length !== 1) {
			context.addIssue({
				code: 'custom',
				path: ['complexityFactors'],
				message: 'None and not-sure selections must be selected by themselves.'
			});
		}
		if (business.outstandingComplianceAreas && !noDuplicates(business.outstandingComplianceAreas)) {
			context.addIssue({
				code: 'custom',
				path: ['outstandingComplianceAreas'],
				message: 'Compliance-area selections must be unique.'
			});
		}
	});

export const PersonalAnswersSchema = z
	.object({
		currentStatus: answerEnum('personal.currentStatus'),
		outstandingYears: outstandingYearsSchema.optional(),
		incomeSources: answerSelection('personal.incomeSources'),
		sarsPosition: answerEnum('personal.sarsPosition'),
		ongoingRequirements: answerSelection('personal.ongoingRequirements'),
		rentalPropertyCount: answerEnum('personal.rentalPropertyCount').optional(),
		foreignIncomePresent: answerEnum('personal.foreignIncomePresent').optional(),
		capitalGainsOccurred: answerEnum('personal.capitalGainsOccurred').optional()
	})
	.strict()
	.superRefine((personal, context) => {
		if (personal.outstandingYears !== undefined && personal.currentStatus !== 'multiple_years_outstanding') {
			context.addIssue({
				code: 'custom',
				path: ['outstandingYears'],
				message: 'Outstanding-year count is only collected for multiple-year backlogs.'
			});
		}
		if (personal.rentalPropertyCount !== undefined && !personal.incomeSources.includes('rental_property')) {
			context.addIssue({
				code: 'custom',
				path: ['rentalPropertyCount'],
				message: 'Rental-property count requires rental income.'
			});
		}
		if (personal.incomeSources.includes('rental_property') && personal.rentalPropertyCount === undefined) {
			context.addIssue({
				code: 'custom',
				path: ['rentalPropertyCount'],
				message: 'Rental-property count is required when rental income is selected.'
			});
		}
		if (personal.foreignIncomePresent !== undefined && !personal.incomeSources.includes('foreign_income')) {
			context.addIssue({
				code: 'custom',
				path: ['foreignIncomePresent'],
				message: 'Foreign-income detail requires foreign income/assets.'
			});
		}
		if (personal.incomeSources.includes('foreign_income') && personal.foreignIncomePresent === undefined) {
			context.addIssue({
				code: 'custom',
				path: ['foreignIncomePresent'],
				message: 'Foreign-income detail is required when foreign income/assets are selected.'
			});
		}
		if (personal.capitalGainsOccurred !== undefined && !personal.incomeSources.includes('capital_gains')) {
			context.addIssue({
				code: 'custom',
				path: ['capitalGainsOccurred'],
				message: 'Capital-gains detail requires capital gains/disposals.'
			});
		}
		if (personal.incomeSources.includes('capital_gains') && personal.capitalGainsOccurred === undefined) {
			context.addIssue({
				code: 'custom',
				path: ['capitalGainsOccurred'],
				message: 'Capital-gains detail is required when capital gains/disposals are selected.'
			});
		}
		if (!noDuplicates(personal.incomeSources)) {
			context.addIssue({ code: 'custom', path: ['incomeSources'], message: 'Income-source selections must be unique.' });
		}
		if (!noDuplicates(personal.ongoingRequirements)) {
			context.addIssue({
				code: 'custom',
				path: ['ongoingRequirements'],
				message: 'Ongoing-requirement selections must be unique.'
			});
		}
	});

const urgencySchema = answerEnum('urgency');

export const BusinessEstimatorAnswersSchema = z
	.object({ calculatorType: z.literal('business'), urgency: urgencySchema, business: BusinessAnswersSchema })
	.strict();

export const PersonalEstimatorAnswersSchema = z
	.object({ calculatorType: z.literal('personal'), urgency: urgencySchema, personal: PersonalAnswersSchema })
	.strict();

export const CombinedEstimatorAnswersSchema = z
	.object({
		calculatorType: z.literal('both'),
		urgency: urgencySchema,
		business: BusinessAnswersSchema,
		personal: PersonalAnswersSchema
	})
	.strict();

export const CanonicalEstimatorAnswersSchema = z.discriminatedUnion('calculatorType', [
	BusinessEstimatorAnswersSchema,
	PersonalEstimatorAnswersSchema,
	CombinedEstimatorAnswersSchema
]);

export type BusinessAnswers = z.infer<typeof BusinessAnswersSchema>;
export type PersonalAnswers = z.infer<typeof PersonalAnswersSchema>;
export type CanonicalEstimatorAnswers = z.infer<typeof CanonicalEstimatorAnswersSchema>;
