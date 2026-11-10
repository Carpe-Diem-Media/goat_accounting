import {
	canTransitionLead,
	LEAD_STATES,
	type LeadState
} from '../../domain/leads/lifecycle';
import type { StaffRole } from '../auth/staff-guard';

type TransitionActor = Readonly<{ userId: string; role: StaffRole }>;

export type LeadTransitionInput = Readonly<{
	leadId: string;
	toState: unknown;
	actor: TransitionActor;
	reason?: unknown;
	note?: unknown;
}>;

type LeadTransitionWrite = Readonly<{
	leadId: string;
	expectedState: LeadState;
	toState: LeadState;
	actorUserId: string;
	reasonCode?: string;
	note?: string;
}>;

type LeadTransitionDependencies = Readonly<{
	findCurrentState: (leadId: string) => Promise<LeadState | null>;
	transition: (input: LeadTransitionWrite) => PromiseLike<{ error: { code?: string } | null }>;
}>;

export type LeadTransitionResult = Readonly<{
	kind: 'success' | 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'unavailable';
}>;

type NormalizedText = Readonly<{ valid: true; value?: string }> | Readonly<{ valid: false }>;

function isLeadState(value: unknown): value is LeadState {
	return typeof value === 'string' && (LEAD_STATES as readonly string[]).includes(value);
}

function optionalText(value: unknown): NormalizedText {
	if (value === undefined || value === null) return { valid: true };
	if (typeof value !== 'string') return { valid: false };
	const normalized = value.trim();
	return { valid: true, value: normalized || undefined };
}

function resultForRpcError(code: string | undefined): LeadTransitionResult {
	if (code === '42501') return { kind: 'forbidden' };
	if (code === 'P0002') return { kind: 'not_found' };
	if (code === '40001') return { kind: 'conflict' };
	if (code === '23514' || code === '22023') return { kind: 'invalid' };
	return { kind: 'unavailable' };
}

export async function runLeadTransition(
	input: LeadTransitionInput,
	dependencies: LeadTransitionDependencies
): Promise<LeadTransitionResult> {
	if (input.actor.role !== 'advisor' && input.actor.role !== 'admin') {
		return { kind: 'forbidden' };
	}
	if (!isLeadState(input.toState)) return { kind: 'invalid' };

	const reason = optionalText(input.reason);
	const note = optionalText(input.note);
	if (!reason.valid || !note.valid) return { kind: 'invalid' };
	if (note.value && Array.from(note.value).length > 2000) return { kind: 'invalid' };

	let currentState: LeadState | null;
	try {
		currentState = await dependencies.findCurrentState(input.leadId);
	} catch {
		return { kind: 'unavailable' };
	}
	if (!currentState) return { kind: 'not_found' };
	if (!canTransitionLead(currentState, input.toState, reason.value)) return { kind: 'invalid' };

	try {
		const { error } = await dependencies.transition({
			leadId: input.leadId,
			expectedState: currentState,
			toState: input.toState,
			actorUserId: input.actor.userId,
			reasonCode: reason.value,
			note: note.value
		});
		if (error) return resultForRpcError(error.code);
		return { kind: 'success' };
	} catch {
		return { kind: 'unavailable' };
	}
}
