import { z } from 'zod';
import type { Database, Json } from '../supabase/database.types';
import { EstimateSnapshotIntegrityError } from './errors';

const SafeCentsSchema = z.number().int().safe().min(0);

const PublicLineItemSchema = z.object({
	label: z.string().min(1).max(160),
	category: z.enum(['catchup', 'ongoing']),
	branch: z.enum(['business', 'personal']),
	minCents: SafeCentsSchema,
	maxCents: SafeCentsSchema,
	quantity: z.number().finite().optional(),
	quantityRange: z.object({ min: z.number().finite(), max: z.number().finite() }).optional(),
	unit: z.string().max(80).optional(),
	explanation: z.string().min(1).max(300)
}).superRefine((item, context) => {
	if (item.minCents > item.maxCents) {
		context.addIssue({ code: 'custom', path: ['maxCents'], message: 'Line item maximum is below its minimum.' });
	}
	if (item.quantityRange && item.quantityRange.min > item.quantityRange.max) {
		context.addIssue({ code: 'custom', path: ['quantityRange'], message: 'Line item quantity range is invalid.' });
	}
});

const PublicTotalSchema = z.object({
	minCents: SafeCentsSchema,
	maxCents: SafeCentsSchema,
	lineItems: z.array(PublicLineItemSchema)
}).superRefine((total, context) => {
	if (total.minCents > total.maxCents) {
		context.addIssue({ code: 'custom', path: ['maxCents'], message: 'Estimate maximum is below its minimum.' });
	}
	const minSum = total.lineItems.reduce((sum, item) => sum + item.minCents, 0);
	const maxSum = total.lineItems.reduce((sum, item) => sum + item.maxCents, 0);
	if (!Number.isSafeInteger(minSum) || !Number.isSafeInteger(maxSum) || minSum !== total.minCents || maxSum !== total.maxCents) {
		context.addIssue({ code: 'custom', path: ['lineItems'], message: 'Estimate totals do not equal the saved line items.' });
	}
});

const CalculationSnapshotSchema = z.object({
	engineVersion: z.string().min(1).max(80),
	pricingModelId: z.string().min(1).max(100),
	pricingModelVersion: z.string().min(1).max(80),
	catchup: PublicTotalSchema,
	ongoing: PublicTotalSchema,
	confidence: z.enum(['high', 'good', 'preliminary']),
	confidenceReasons: z.array(z.string().min(1).max(300)),
	confidencePoints: z.record(z.string(), z.number().int().safe()),
	complexityScores: z.record(z.string(), z.number().int().safe()),
	manualReviewRequired: z.boolean(),
	reviewFlags: z.array(z.object({ label: z.string().min(1).max(160), reason: z.string().min(1).max(300) })),
	reviewReasons: z.array(z.string().min(1).max(300))
});

export type PublicEstimateLineItem = z.infer<typeof PublicLineItemSchema>;
export type PublicEstimateRange = z.infer<typeof PublicTotalSchema>;
export type PublicEstimateView = Readonly<{
	publicRef: string;
	calculatorType: Database['estimator']['Enums']['calculator_type'];
	state: Database['estimator']['Enums']['estimate_state'];
	createdAt: string;
	catchup: PublicEstimateRange;
	ongoing: PublicEstimateRange;
	confidence: 'high' | 'good' | 'preliminary';
	confidenceReasons: readonly string[];
	manualReviewRequired: boolean;
	reviewReasons: readonly string[];
	reviewFlags: readonly Readonly<{ label: string; reason: string }>[];
}>;

export type PublicEstimateRecord = Readonly<{
	public_ref: string;
	calculator_type: Database['estimator']['Enums']['calculator_type'];
	state: Database['estimator']['Enums']['estimate_state'];
	created_at: string;
	pricing_model_version: string;
	engine_version: string;
	calculation_snapshot: Json;
	catchup_min_cents: number;
	catchup_max_cents: number;
	ongoing_min_cents: number;
	ongoing_max_cents: number;
}>;

export function toPublicEstimateView(record: PublicEstimateRecord): PublicEstimateView {
	const parsed = CalculationSnapshotSchema.safeParse(record.calculation_snapshot);
	if (
		!parsed.success ||
		! /^[a-f0-9]{32}$/.test(record.public_ref) ||
		parsed.data?.pricingModelVersion !== record.pricing_model_version ||
		parsed.data?.engineVersion !== record.engine_version ||
		parsed.data?.catchup.minCents !== record.catchup_min_cents ||
		parsed.data?.catchup.maxCents !== record.catchup_max_cents ||
		parsed.data?.ongoing.minCents !== record.ongoing_min_cents ||
		parsed.data?.ongoing.maxCents !== record.ongoing_max_cents ||
		parsed.data?.manualReviewRequired !== (parsed.data.reviewFlags.length > 0) ||
		JSON.stringify(parsed.data?.reviewReasons) !== JSON.stringify(parsed.data?.reviewFlags.map((flag) => flag.reason))
	) {
		throw new EstimateSnapshotIntegrityError();
	}

	return {
		publicRef: record.public_ref,
		calculatorType: record.calculator_type,
		state: record.state,
		createdAt: record.created_at,
		catchup: parsed.data.catchup,
		ongoing: parsed.data.ongoing,
		confidence: parsed.data.confidence,
		confidenceReasons: parsed.data.confidenceReasons,
		manualReviewRequired: parsed.data.manualReviewRequired,
		reviewReasons: parsed.data.reviewReasons,
		reviewFlags: parsed.data.reviewFlags
	};
}
