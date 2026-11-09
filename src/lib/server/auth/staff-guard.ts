import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';

export const STAFF_ROLES = ['viewer', 'advisor', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

type VerifiedClaims = Readonly<Record<string, unknown>>;
type StaffRecord = Readonly<{
	user_id: string;
	role: string;
	state: string;
}>;
type Assurance = Readonly<{
	currentLevel: string | null;
	nextLevel: string | null;
}>;

export type StaffIdentity = Readonly<{
	userId: string;
	role: StaffRole;
	claims: VerifiedClaims;
}>;

export type MfaOnboardingStage = 'setup' | 'challenge' | 'pending';

export type StaffAccess =
	| { kind: 'unauthenticated' }
	| { kind: 'denied' }
	| { kind: 'forbidden' }
	| { kind: 'setup'; identity: StaffIdentity }
	| { kind: 'challenge'; identity: StaffIdentity }
	| { kind: 'invited'; identity: StaffIdentity; stage: MfaOnboardingStage }
	| { kind: 'authorized'; identity: StaffIdentity }
	| { kind: 'unavailable' };

function isStaffRole(role: string): role is StaffRole {
	return STAFF_ROLES.some((allowedRole) => allowedRole === role);
}

export function evaluateStaffAccess(input: {
	claims: VerifiedClaims | null;
	staff: StaffRecord | null;
	assurance: Assurance | null;
	allowedRoles?: readonly StaffRole[];
}): StaffAccess {
	const claims = input.claims;
	if (!claims) return { kind: 'unauthenticated' };
	const subject = claims.sub;
	if (typeof subject !== 'string' || subject.length === 0) return { kind: 'unauthenticated' };

	const row = input.staff;
	if (!row || row.user_id !== subject || !isStaffRole(row.role)) {
		return { kind: 'denied' };
	}

	const identity: StaffIdentity = {
		userId: subject,
		role: row.role,
		claims
	};
	const assurance = input.assurance;
	if (!assurance) return { kind: 'unavailable' };
	if (row.state === 'INVITED') {
		if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
			return { kind: 'invited', identity, stage: 'challenge' };
		}
		if (
			(assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal1') ||
			(assurance.currentLevel === 'aal2' && assurance.nextLevel === 'aal1')
		) {
			return { kind: 'invited', identity, stage: 'setup' };
		}
		if (
			claims.aal === 'aal2' &&
			assurance.currentLevel === 'aal2' &&
			assurance.nextLevel === 'aal2'
		) {
			return { kind: 'invited', identity, stage: 'pending' };
		}
		return { kind: 'unavailable' };
	}
	if (row.state !== 'ACTIVE') return { kind: 'denied' };

	if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal1') {
		return { kind: 'setup', identity };
	}
	if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
		return { kind: 'challenge', identity };
	}
	if (assurance.currentLevel === 'aal2' && assurance.nextLevel === 'aal1') {
		return { kind: 'setup', identity };
	}

	if (
		claims.aal !== 'aal2' ||
		assurance.currentLevel !== 'aal2' ||
		assurance.nextLevel !== 'aal2'
	) {
		return { kind: 'unavailable' };
	}

	if (input.allowedRoles && !input.allowedRoles.includes(row.role)) return { kind: 'forbidden' };
	return { kind: 'authorized', identity };
}

type StaffClient = SupabaseClient<Database, 'estimator'>;

function isAuthFailure(errorValue: { status?: number; name?: string } | null): boolean {
	return (
		errorValue?.status === 401 ||
		errorValue?.name === 'AuthSessionMissingError' ||
		errorValue?.name === 'AuthInvalidJwtError'
	);
}

export async function getStaffAccess(
	event: RequestEvent,
	allowedRoles?: readonly StaffRole[]
): Promise<StaffAccess> {
	const client = event.locals.supabase;
	if (!client) return { kind: 'unavailable' };

	const { data: claimsData, error: claimsError } = await client.auth.getClaims();
	if (claimsError) return isAuthFailure(claimsError) ? { kind: 'unauthenticated' } : { kind: 'unavailable' };
	const claims = (claimsData?.claims as VerifiedClaims | undefined) ?? null;
	if (!claims) return { kind: 'unauthenticated' };

	const userId = claims.sub;
	if (typeof userId !== 'string' || userId.length === 0) {
		return evaluateStaffAccess({ claims, staff: null, assurance: null, allowedRoles });
	}

	const { data: staff, error: staffError } = await client
		.from('staff_users')
		.select('user_id, role, state')
		.eq('user_id', userId)
		.maybeSingle();
	if (staffError) return { kind: 'unavailable' };

	const { data: assuranceData, error: assuranceError } =
		await client.auth.mfa.getAuthenticatorAssuranceLevel();
	if (assuranceError) return { kind: 'unavailable' };

	return evaluateStaffAccess({
		claims,
		staff: staff as StaffRecord | null,
		assurance: assuranceData
			? {
					currentLevel: assuranceData.currentLevel,
					nextLevel: assuranceData.nextLevel
				}
			: null,
		allowedRoles
	});
}

export async function requireStaff(
	event: RequestEvent,
	allowedRoles: readonly StaffRole[] = STAFF_ROLES
): Promise<StaffIdentity> {
	const access = await getStaffAccess(event, allowedRoles);
	switch (access.kind) {
		case 'authorized':
			return access.identity;
		case 'unauthenticated':
			throw redirect(303, '/admin/login');
		case 'setup':
		case 'challenge':
			throw redirect(303, '/admin/login/mfa');
		case 'invited':
		case 'forbidden':
		case 'denied':
			throw error(403, 'You do not have access to this page.');
		case 'unavailable':
			throw error(503, 'Staff access is temporarily unavailable.');
		default: {
			const unreachable: never = access;
			return unreachable;
		}
	}
}
