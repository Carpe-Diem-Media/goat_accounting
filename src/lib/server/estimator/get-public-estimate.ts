import { EstimateSnapshotIntegrityError } from './errors';
import type { PublicEstimateRecord, PublicEstimateView } from './public-estimate';
import { toPublicEstimateView } from './public-estimate';

export { EstimateSnapshotIntegrityError };

export type PublicEstimateLookup = Readonly<{
	findByPublicRef: (publicRef: string) => Promise<PublicEstimateRecord | null>;
}>;

const PUBLIC_REF_PATTERN = /^[a-f0-9]{32}$/;

export async function getPublicEstimate(
	publicRef: string,
	repository: PublicEstimateLookup
): Promise<PublicEstimateView | null> {
	if (!PUBLIC_REF_PATTERN.test(publicRef)) return null;
	const record = await repository.findByPublicRef(publicRef);
	return record ? toPublicEstimateView(record) : null;
}
