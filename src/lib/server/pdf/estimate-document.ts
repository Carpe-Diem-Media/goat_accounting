import {
	CanonicalEstimatorAnswersSchema,
	type CanonicalEstimatorAnswers
} from '../../domain/estimator/answer-schema';
import { ESTIMATOR_QUESTION_CATALOG } from '../../domain/estimator/questions';
import type { Json } from '../supabase/database.types';
import type { EstimatorServiceClient } from '../supabase/repository.server';
import { EstimateSnapshotIntegrityError, EstimatePersistenceError } from '../estimator/errors';
import {
	toPublicEstimateView,
	type PublicEstimateRecord
} from '../estimator/public-estimate';
import type { EstimateDocumentLineItem, EstimateDocumentModel, EstimateDocumentRange } from './estimate-pdf';

export type EstimateDocumentRecord = PublicEstimateRecord & Readonly<{
	answers_snapshot: Json;
}>;

export type EstimateDocumentLookup = Readonly<{
	findDocumentByPublicRef: (publicRef: string) => Promise<EstimateDocumentRecord | null>;
}>;

export const ESTIMATE_DOCUMENT_COLUMNS = [
	'public_ref',
	'calculator_type',
	'state',
	'created_at',
	'pricing_model_version',
	'engine_version',
	'answers_snapshot',
	'calculation_snapshot',
	'catchup_min_cents',
	'catchup_max_cents',
	'ongoing_min_cents',
	'ongoing_max_cents'
].join(', ');

const PUBLIC_REF_PATTERN = /^[a-f0-9]{32}$/;

const COMPLIANCE_AREA_LABELS: Readonly<Record<string, string>> = {
	company_income_tax: 'Company income tax',
	personal_income_tax: 'Personal income tax',
	vat: 'VAT',
	payroll: 'Payroll',
	cipc: 'CIPC compliance',
	other: 'Other'
};

const RENTAL_PROPERTY_LABELS = {
	one: '1 property',
	'2_to_3': '2 to 3 properties',
	'4_plus': '4 or more properties',
	not_sure: 'Not sure'
} as const;

function questionOptionLabel(questionId: string, value: string): string {
	const question = ESTIMATOR_QUESTION_CATALOG.find((entry) => entry.id === questionId);
	if (!question || !('options' in question)) throw new EstimateSnapshotIntegrityError();
	const option = question.options.find((entry) => entry.value === value);
	if (!option) throw new EstimateSnapshotIntegrityError();
	return option.label;
}

function yesNoLabel(value: 'yes' | 'no' | 'not_sure'): string {
	return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not sure';
}

function selectedLabels(questionId: string, values: readonly string[]): string {
	return values.map((value) => questionOptionLabel(questionId, value)).join('; ');
}

function addChoice(
	assumptions: { label: string; value: string }[],
	label: string,
	questionId: string,
	value: string | readonly string[] | undefined
): void {
	if (value === undefined) return;
	assumptions.push({
		label,
		value: typeof value === 'string' ? questionOptionLabel(questionId, value) : selectedLabels(questionId, value)
	});
}

function mapAnswers(answers: CanonicalEstimatorAnswers): readonly Readonly<{ label: string; value: string }>[] {
	const assumptions: { label: string; value: string }[] = [];
	addChoice(assumptions, 'Urgency', 'URGENCY', answers.urgency);

	if (answers.calculatorType === 'business' || answers.calculatorType === 'both') {
		const business = answers.business;
		addChoice(assumptions, 'Business type', 'B1', business.entityType);
		if (business.entityCount !== undefined) assumptions.push({ label: 'Number of entities', value: String(business.entityCount) });
		addChoice(assumptions, 'Books status', 'B2', business.booksStatus);
		if (business.outstandingMonths !== undefined) {
			assumptions.push({ label: 'Outstanding months', value: String(business.outstandingMonths) });
		}
		addChoice(assumptions, 'Record condition', 'B3', business.recordCondition);
		if (business.bankStatementsAvailableForFullPeriod) {
			assumptions.push({
				label: 'Bank statements for full period',
				value: yesNoLabel(business.bankStatementsAvailableForFullPeriod)
			});
		}
		addChoice(assumptions, 'Transactions each month', 'B4', business.monthlyTransactionVolume);
		addChoice(assumptions, 'Financial accounts', 'B5', business.financialAccounts);
		addChoice(assumptions, 'Employees', 'B6', business.employeeCount);
		addChoice(assumptions, 'Tax/compliance position', 'B7', business.taxPosition);
		if (business.outstandingComplianceAreas) {
			assumptions.push({
				label: 'Outstanding compliance areas',
				value: business.outstandingComplianceAreas.map((area) => COMPLIANCE_AREA_LABELS[area]).join('; ')
			});
		}
		addChoice(assumptions, 'Ongoing services', 'B8', business.ongoingServices);
		addChoice(assumptions, 'Complexity factors', 'COMPLEXITY', business.complexityFactors);
	}

	if (answers.calculatorType === 'personal' || answers.calculatorType === 'both') {
		const personal = answers.personal;
		addChoice(assumptions, 'Personal tax status', 'P1', personal.currentStatus);
		if (personal.outstandingYears !== undefined) {
			assumptions.push({ label: 'Outstanding tax years', value: String(personal.outstandingYears) });
		}
		addChoice(assumptions, 'Income or activity sources', 'P2', personal.incomeSources);
		addChoice(assumptions, 'SARS position', 'P4', personal.sarsPosition);
		addChoice(assumptions, 'Ongoing personal tax support', 'P5', personal.ongoingRequirements);
		if (personal.rentalPropertyCount) {
			assumptions.push({
				label: 'Rental properties',
				value: RENTAL_PROPERTY_LABELS[personal.rentalPropertyCount]
			});
		}
		if (personal.foreignIncomePresent) {
			assumptions.push({ label: 'Foreign income', value: yesNoLabel(personal.foreignIncomePresent) });
		}
		if (personal.capitalGainsOccurred) {
			assumptions.push({ label: 'Capital gains/disposals', value: yesNoLabel(personal.capitalGainsOccurred) });
		}
	}

	if (assumptions.length > 24) throw new EstimateSnapshotIntegrityError();
	return assumptions.map((assumption) => ({
		label: assumption.label.slice(0, 160),
		value: assumption.value.length > 180 ? `${assumption.value.slice(0, 177)}...` : assumption.value
	}));
}

function documentRange(range: ReturnType<typeof toPublicEstimateView>['catchup']): EstimateDocumentRange {
	return {
		minCents: range.minCents,
		maxCents: range.maxCents,
		lineItems: range.lineItems.map((item): EstimateDocumentLineItem => ({
			label: item.label,
			minCents: item.minCents,
			maxCents: item.maxCents
		}))
	};
}

export function toEstimateDocumentModel(record: EstimateDocumentRecord): EstimateDocumentModel {
	const estimate = toPublicEstimateView(record);
	const parsedAnswers = CanonicalEstimatorAnswersSchema.safeParse(record.answers_snapshot);
	if (!parsedAnswers.success || parsedAnswers.data.calculatorType !== estimate.calculatorType) {
		throw new EstimateSnapshotIntegrityError();
	}

	return {
		publicRef: estimate.publicRef,
		state: estimate.state,
		calculatorType: estimate.calculatorType,
		createdAt: estimate.createdAt,
		pricingModelVersion: record.pricing_model_version,
		engineVersion: record.engine_version,
		catchup: documentRange(estimate.catchup),
		ongoing: documentRange(estimate.ongoing),
		confidence: estimate.confidence,
		manualReviewRequired: estimate.manualReviewRequired,
		assumptions: mapAnswers(parsedAnswers.data)
	};
}

export function createEstimateDocumentRepository(client: EstimatorServiceClient): EstimateDocumentLookup {
	return {
		async findDocumentByPublicRef(publicRef: string): Promise<EstimateDocumentRecord | null> {
			if (!PUBLIC_REF_PATTERN.test(publicRef)) return null;
			const { data, error } = await client
				.from('estimates')
				.select(ESTIMATE_DOCUMENT_COLUMNS)
				.eq('public_ref', publicRef)
				.maybeSingle();

			if (error) throw new EstimatePersistenceError();
			return data as unknown as EstimateDocumentRecord | null;
		}
	};
}
