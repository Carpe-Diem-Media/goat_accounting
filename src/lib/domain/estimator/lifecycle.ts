export type EstimateLifecycleState = 'VALID' | 'SUPERSEDED' | 'VOIDED';

export type EstimateLifecycleRecord = Readonly<{
	id: string;
	state: EstimateLifecycleState;
	[key: string]: unknown;
}>;

export type EstimateLifecycleAction =
	| Readonly<{ type: 'SUPERSEDE'; replacementEstimateId: string }>
	| Readonly<{
			type: 'VOID';
			authorized: boolean;
			actorId: string;
			reason: string;
			at: string;
	  }>;

export class EstimateLifecycleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'EstimateLifecycleError';
	}
}

export function transitionEstimateLifecycle<T extends EstimateLifecycleRecord>(
	estimate: T,
	action: EstimateLifecycleAction
): T | (T & Readonly<{ state: 'SUPERSEDED'; supersededByEstimateId: string }>) | (T & Readonly<{
	state: 'VOIDED';
	voidReason: string;
	voidedBy: string;
	voidedAt: string;
}>) {
	const estimateId = estimate.id.trim();
	if (!estimateId) throw new EstimateLifecycleError('An estimate must have an ID before its lifecycle can change.');
	if (estimate.state !== 'VALID') {
		throw new EstimateLifecycleError(`Cannot transition an estimate from terminal state ${estimate.state}.`);
	}

	if (action.type === 'SUPERSEDE') {
		const replacementId = action.replacementEstimateId.trim();
		if (!replacementId || replacementId === estimateId) {
			throw new EstimateLifecycleError('A valid estimate requires a different replacement estimate ID.');
		}
		return { ...estimate, state: 'SUPERSEDED', supersededByEstimateId: replacementId };
	}

	const actorId = action.actorId.trim();
	const reason = action.reason.trim();
	const timestamp = Date.parse(action.at);
	if (!action.authorized) throw new EstimateLifecycleError('Voiding an estimate requires an authorized actor.');
	if (!actorId) throw new EstimateLifecycleError('Voiding an estimate requires an actor ID.');
	if (!reason || reason.length > 500) throw new EstimateLifecycleError('Voiding an estimate requires a reason of 1 to 500 characters.');
	if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== action.at) {
		throw new EstimateLifecycleError('Voiding an estimate requires a canonical UTC ISO timestamp.');
	}
	return {
		...estimate,
		state: 'VOIDED',
		voidReason: reason,
		voidedBy: actorId,
		voidedAt: new Date(timestamp).toISOString()
	};
}
