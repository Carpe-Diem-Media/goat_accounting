export class CreateEstimateValidationError extends Error {
	constructor(message = 'Estimate request is invalid.') {
		super(message);
		this.name = 'CreateEstimateValidationError';
	}
}

export class InvalidIdempotencyKeyError extends Error {
	constructor() {
		super('Idempotency key must be a 32-byte base64url token.');
		this.name = 'InvalidIdempotencyKeyError';
	}
}

export class NoActivePricingModelError extends Error {
	constructor() {
		super('No active pricing model is available.');
		this.name = 'NoActivePricingModelError';
	}
}

export class PricingModelUnavailableError extends Error {
	constructor() {
		super('The active pricing model could not be used.');
		this.name = 'PricingModelUnavailableError';
	}
}

export class IdempotencyPayloadMismatchError extends Error {
	constructor() {
		super('The idempotency key was already used for a different request.');
		this.name = 'IdempotencyPayloadMismatchError';
	}
}

export class IdempotencyWindowExpiredError extends Error {
	constructor() {
		super('The idempotency retry window has expired.');
		this.name = 'IdempotencyWindowExpiredError';
	}
}

export class EstimateSnapshotIntegrityError extends Error {
	constructor() {
		super('The saved estimate snapshot is inconsistent.');
		this.name = 'EstimateSnapshotIntegrityError';
	}
}

export class EstimatePersistenceError extends Error {
	constructor() {
		super('Estimate persistence failed.');
		this.name = 'EstimatePersistenceError';
	}
}
