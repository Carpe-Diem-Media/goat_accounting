import type { EstimatorServiceClient } from '../repository.server';
import type { Database } from '../database.types';
import {
	ESTIMATE_IDEMPOTENCY_RETRY_WINDOW_MS
} from '../../estimator/idempotency';
import type { PublicEstimateRecord } from '../../estimator/public-estimate';
import {
	EstimatePersistenceError,
	IdempotencyPayloadMismatchError,
	IdempotencyWindowExpiredError
} from '../../estimator/errors';

type EstimateInsert = Database['estimator']['Tables']['estimates']['Insert'];

export type EstimateSnapshotWrite = Omit<Pick<EstimateInsert,
	| 'calculator_type'
	| 'pricing_model_id'
	| 'pricing_model_version'
	| 'engine_version'
	| 'answers_snapshot'
	| 'calculation_snapshot'
	| 'catchup_min_cents'
	| 'catchup_max_cents'
	| 'ongoing_min_cents'
	| 'ongoing_max_cents'
	| 'confidence'
	| 'manual_review_required'
	| 'review_reasons'
	| 'review_flag_codes'
	| 'free_text'
	| 'idempotency_key_hash'
	| 'request_fingerprint_hash'>, 'free_text' | 'idempotency_key_hash' | 'request_fingerprint_hash'> & Readonly<{
	free_text: string | null;
	idempotency_key_hash: string;
	request_fingerprint_hash: string;
}>;

type EstimateWithIdempotencyHashes = PublicEstimateRecord & Readonly<{
	idempotency_key_hash: string | null;
	request_fingerprint_hash: string | null;
}>;

type SupabaseWriteError = Readonly<{
	code?: string;
	message?: string;
	details?: string | null;
}>;

const PUBLIC_ESTIMATE_COLUMNS = `
	public_ref, calculator_type, state, created_at, pricing_model_version, engine_version,
	calculation_snapshot, catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents
`;
const IDEMPOTENT_ESTIMATE_COLUMNS = `${PUBLIC_ESTIMATE_COLUMNS}, idempotency_key_hash, request_fingerprint_hash`;
const MAX_PUBLIC_REF_COLLISION_RETRIES = 2;

function errorConstraint(error: SupabaseWriteError): string | null {
	const message = `${error.message ?? ''} ${error.details ?? ''}`;
	return message.match(/unique constraint ["']([^"']+)["']/i)?.[1] ?? null;
}

function isUniqueViolation(error: SupabaseWriteError): boolean {
	return error.code === '23505';
}

function publicRecord(record: EstimateWithIdempotencyHashes): PublicEstimateRecord {
	const { idempotency_key_hash: _keyHash, request_fingerprint_hash: _fingerprintHash, ...estimate } = record;
	return estimate;
}

export function createEstimatesRepository(
	client: EstimatorServiceClient,
	options: Readonly<{ now?: () => Date }> = {}
) {
	const now = options.now ?? (() => new Date());

	async function findByIdempotencyKeyHash(keyHash: string): Promise<EstimateWithIdempotencyHashes | null> {
		const { data, error } = await client
			.from('estimates')
			.select(IDEMPOTENT_ESTIMATE_COLUMNS)
			.eq('idempotency_key_hash', keyHash)
			.maybeSingle();

		if (error) throw new EstimatePersistenceError();
		return data as unknown as EstimateWithIdempotencyHashes | null;
	}

	async function existingIdempotentEstimate(
		keyHash: string,
		fingerprintHash: string
	): Promise<PublicEstimateRecord | null> {
		const existing = await findByIdempotencyKeyHash(keyHash);
		if (!existing) return null;
		if (existing.request_fingerprint_hash !== fingerprintHash) throw new IdempotencyPayloadMismatchError();

		const createdAt = Date.parse(existing.created_at);
		const ageMs = now().getTime() - createdAt;
		if (!Number.isFinite(createdAt) || ageMs >= ESTIMATE_IDEMPOTENCY_RETRY_WINDOW_MS) {
			throw new IdempotencyWindowExpiredError();
		}
		return publicRecord(existing);
	}

	return {
		findByIdempotencyKey(keyHash: string, fingerprintHash: string): Promise<PublicEstimateRecord | null> {
			return existingIdempotentEstimate(keyHash, fingerprintHash);
		},

		async createEstimateSnapshot(snapshot: EstimateSnapshotWrite): Promise<PublicEstimateRecord> {
			for (let attempt = 0; attempt <= MAX_PUBLIC_REF_COLLISION_RETRIES; attempt += 1) {
				const { data, error } = await client
					.from('estimates')
					.insert(snapshot)
					.select(IDEMPOTENT_ESTIMATE_COLUMNS)
					.single();

				if (!error && data) return publicRecord(data as unknown as EstimateWithIdempotencyHashes);
				if (!error) throw new EstimatePersistenceError();

				const writeError = error as SupabaseWriteError;
				if (isUniqueViolation(writeError) && errorConstraint(writeError) === 'estimates_idempotency_key_hash_uidx') {
					const existing = await existingIdempotentEstimate(
						snapshot.idempotency_key_hash,
						snapshot.request_fingerprint_hash
					);
					if (existing) return existing;
					throw new EstimatePersistenceError();
				}

				if (
					isUniqueViolation(writeError) &&
					errorConstraint(writeError) === 'estimates_public_ref_key' &&
					attempt < MAX_PUBLIC_REF_COLLISION_RETRIES
				) {
					continue;
				}
				throw new EstimatePersistenceError();
			}
			throw new EstimatePersistenceError();
		},

		async findByPublicRef(publicRef: string): Promise<PublicEstimateRecord | null> {
			const { data, error } = await client
				.from('estimates')
				.select(PUBLIC_ESTIMATE_COLUMNS)
				.eq('public_ref', publicRef)
				.maybeSingle();

			if (error) throw new EstimatePersistenceError();
			return data as unknown as PublicEstimateRecord | null;
		}
	};
}
