export class ContactPersistenceError extends Error {
	constructor() {
		super('The contact request could not be saved.');
		this.name = 'ContactPersistenceError';
	}
}

export class ContactConflictError extends Error {
	constructor() {
		super('A different contact request already exists for this estimate.');
		this.name = 'ContactConflictError';
	}
}

export class ContactUnavailableError extends Error {
	constructor() {
		super('This estimate is unavailable for contact requests.');
		this.name = 'ContactUnavailableError';
	}
}
