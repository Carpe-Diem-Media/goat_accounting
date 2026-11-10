export const LEAD_STATES = [
	'NEW',
	'CONTACTED',
	'QUALIFIED',
	'PROPOSAL_SENT',
	'CLOSED_WON',
	'CLOSED_LOST',
	'CLOSED_NOT_A_FIT'
] as const;

export type LeadState = typeof LEAD_STATES[number];

const transitions: Readonly<Record<LeadState, readonly LeadState[]>> = {
	NEW: ['CONTACTED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT'],
	CONTACTED: ['QUALIFIED', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT'],
	QUALIFIED: ['PROPOSAL_SENT', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT'],
	PROPOSAL_SENT: ['CLOSED_WON', 'CLOSED_LOST'],
	CLOSED_WON: [],
	CLOSED_LOST: [],
	CLOSED_NOT_A_FIT: []
};

const closureStates = new Set<LeadState>(['CLOSED_WON', 'CLOSED_LOST', 'CLOSED_NOT_A_FIT']);

export function getLeadTransitions(from: LeadState): readonly LeadState[] {
	return transitions[from];
}

export function canTransitionLead(from: LeadState, to: LeadState, reason?: string): boolean {
	if (!transitions[from].includes(to)) return false;
	return !closureStates.has(to) || Boolean(reason?.trim());
}
