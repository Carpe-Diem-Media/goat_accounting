import { z } from 'zod';
import { CanonicalEstimatorAnswersSchema } from '../../domain/estimator/answer-schema';
import { calculateEstimate, type EstimateCalculation } from '../../domain/estimator/estimate';
import type { ValidatedPricingModel } from '../../domain/pricing/model';
import type { Json } from '../supabase/database.types';
import type { EstimateSnapshotWrite } from '../supabase/repositories/estimates';
import { createEstimateIdempotencyHashes, ESTIMATE_IDEMPOTENCY_KEY_PATTERN } from './idempotency';
import {
	CreateEstimateValidationError,
	EstimatePersistenceError,
	IdempotencyPayloadMismatchError,
	IdempotencyWindowExpiredError,
	NoActivePricingModelError,
	PricingModelUnavailableError
} from './errors';
import type { PublicEstimateRecord, PublicEstimateView } from './public-estimate';
import { toPublicEstimateView } from './public-estimate';

export { CreateEstimateValidationError, NoActivePricingModelError };

const CreateEstimateInputSchema = z.object({
	calculatorType: z.enum(['business', 'personal', 'both']),
	answers: CanonicalEstimatorAnswersSchema,
	freeText: z.string().max(2000).optional(),
	idempotencyKey: z.string().regex(ESTIMATE_IDEMPOTENCY_KEY_PATTERN)
}).strict().superRefine((input, context) => {
	if (input.calculatorType !== input.answers.calculatorType) {
		context.addIssue({ code: 'custom', path: ['calculatorType'], message: 'Calculator type must match the canonical answers.' });
	}
});

export type CreateEstimateInput = z.infer<typeof CreateEstimateInputSchema>;

export type CreateEstimateDependencies = Readonly<{
	getActivePricingModel: () => Promise<ValidatedPricingModel | null>;
	findByIdempotencyKey: (keyHash: string, fingerprintHash: string) => Promise<PublicEstimateRecord | null>;
	persistEstimate: (snapshot: EstimateSnapshotWrite) => Promise<PublicEstimateRecord>;
}>;

function jsonSnapshot(value: unknown): Json {
	return JSON.parse(JSON.stringify(value)) as Json;
}

function toWriteSnapshot(
	input: CreateEstimateInput,
	calculation: EstimateCalculation,
	hashes: Awaited<ReturnType<typeof createEstimateIdempotencyHashes>>
): EstimateSnapshotWrite {
	return {
		calculator_type: input.calculatorType,
		pricing_model_id: calculation.pricingModelId,
		pricing_model_version: calculation.pricingModelVersion,
		engine_version: calculation.engineVersion,
		answers_snapshot: jsonSnapshot(input.answers),
		calculation_snapshot: jsonSnapshot(calculation),
		catchup_min_cents: calculation.catchup.minCents,
		catchup_max_cents: calculation.catchup.maxCents,
		ongoing_min_cents: calculation.ongoing.minCents,
		ongoing_max_cents: calculation.ongoing.maxCents,
		confidence: calculation.confidence,
		manual_review_required: calculation.manualReviewRequired,
		review_reasons: jsonSnapshot(calculation.reviewReasons),
		review_flag_codes: calculation.reviewFlags.map((flag) => flag.code),
		free_text: input.freeText ?? null,
		idempotency_key_hash: hashes.idempotencyKeyHash,
		request_fingerprint_hash: hashes.requestFingerprintHash
	};
}

export async function createEstimate(
	input: unknown,
	dependencies: CreateEstimateDependencies
): Promise<PublicEstimateView> {
	const parsed = CreateEstimateInputSchema.safeParse(input);
	if (!parsed.success) throw new CreateEstimateValidationError();
	const request = parsed.data;
	const canonicalRequest = {
		calculatorType: request.calculatorType,
		answers: request.answers,
		freeText: request.freeText ?? null
	};
	const hashes = await createEstimateIdempotencyHashes(request.idempotencyKey, canonicalRequest);
	let existing: PublicEstimateRecord | null;
	try {
		existing = await dependencies.findByIdempotencyKey(hashes.idempotencyKeyHash, hashes.requestFingerprintHash);
	} catch (error) {
		if (error instanceof IdempotencyPayloadMismatchError || error instanceof IdempotencyWindowExpiredError) throw error;
		throw new EstimatePersistenceError();
	}
	if (existing) return toPublicEstimateView(existing);

	let model: ValidatedPricingModel | null;
	try {
		model = await dependencies.getActivePricingModel();
	} catch {
		throw new PricingModelUnavailableError();
	}
	if (!model) throw new NoActivePricingModelError();

	let calculation: EstimateCalculation;
	try {
		calculation = calculateEstimate(request.answers, model);
	} catch {
		throw new PricingModelUnavailableError();
	}
	if (
		calculation.pricingModelId !== model.id ||
		calculation.pricingModelVersion !== model.version ||
		calculation.engineVersion !== model.engineVersion
	) {
		throw new PricingModelUnavailableError();
	}

	let persisted: PublicEstimateRecord;
	try {
		persisted = await dependencies.persistEstimate(toWriteSnapshot(request, calculation, hashes));
	} catch (error) {
		if (
			error instanceof IdempotencyPayloadMismatchError ||
			error instanceof IdempotencyWindowExpiredError ||
			error instanceof EstimatePersistenceError
		) {
			throw error;
		}
		throw new EstimatePersistenceError();
	}
	return toPublicEstimateView(persisted);
}
