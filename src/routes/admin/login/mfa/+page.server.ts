import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getStaffAccess } from '$lib/server/auth/staff-guard';

type MfaState = 'setup' | 'challenge' | 'activate';

async function requireMfaState(event: Parameters<Actions['enroll']>[0] | Parameters<Actions['verify']>[0]) {
	if (!event.locals.supabase) throw error(503, 'Staff access is temporarily unavailable.');
	const access = await getStaffAccess(event);
	if (access.kind === 'unauthenticated') throw redirect(303, '/admin/login');
	if (access.kind === 'invited') {
		return { client: event.locals.supabase, state: access.stage, invited: true };
	}
	if (access.kind === 'denied' || access.kind === 'forbidden') {
		throw error(403, 'You do not have access to this page.');
	}
	if (access.kind === 'unavailable') throw error(503, 'Staff access is temporarily unavailable.');
	if (access.kind === 'authorized') throw redirect(303, '/admin/estimates');
	return { client: event.locals.supabase, state: access.kind as MfaState, invited: false };
}

async function activateInvitedStaff(
	client: NonNullable<Parameters<Actions['verify']>[0]['locals']['supabase']>,
	event: Parameters<Actions['verify']>[0]
) {
	const { error: activationError } = await client.rpc('activate_invited_staff_after_mfa');
	if (activationError) {
		return fail(activationError.code === '42501' ? 403 : 503, {
			message: activationError.code === '42501'
				? 'This invitation is not ready for activation. Contact an administrator.'
				: 'Staff setup is temporarily unavailable.'
		});
	}

	const access = await getStaffAccess(event);
	if (access.kind === 'authorized') throw redirect(303, '/admin/estimates');
	if (access.kind === 'unauthenticated') throw redirect(303, '/admin/login');
	if (access.kind === 'denied' || access.kind === 'forbidden') {
		throw error(403, 'You do not have access to this page.');
	}
	throw error(503, 'Staff setup is temporarily unavailable.');
}

export const load: PageServerLoad = async (event) => {
	const { state } = await requireMfaState(event);
	return { state };
};

export const actions: Actions = {
	enroll: async (event) => {
		const { client, state } = await requireMfaState(event);
		if (state !== 'setup') return fail(409, { message: 'Use the authenticator challenge below.' });

		const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
		if (factorsError) return fail(503, { message: 'Authenticator setup is temporarily unavailable.' });

		for (const factor of factors.totp.filter((item) => item.status !== 'verified')) {
			const { error: removeError } = await client.auth.mfa.unenroll({ factorId: factor.id });
			if (removeError) return fail(503, { message: 'Authenticator setup is temporarily unavailable.' });
		}

		const { data, error: enrollError } = await client.auth.mfa.enroll({
			factorType: 'totp',
			friendlyName: 'Goat Accounting staff'
		});
		if (enrollError || !data?.totp?.qr_code || !data.totp.secret) {
			return fail(503, { message: 'Authenticator setup is temporarily unavailable.' });
		}
		return { enrollment: { qrCode: data.totp.qr_code, secret: data.totp.secret } };
	},
	verify: async (event) => {
		const { client, state, invited } = await requireMfaState(event);
		if (invited && state === 'activate') return activateInvitedStaff(client, event);
		if (state === 'activate') return fail(409, { message: 'Use the authenticator challenge below.' });
		const form = await event.request.formData();
		const code = String(form.get('code') ?? '').replace(/\s/g, '');
		if (!/^\d{6}$/.test(code)) return fail(400, { message: 'Enter the six-digit code from your authenticator app.' });

		const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
		if (factorsError) return fail(503, { message: 'Authenticator verification is temporarily unavailable.' });

		const unverifiedFactor = factors.totp.find((item) => item.status !== 'verified');
		const verifiedFactor = factors.totp.find((item) => item.status === 'verified');
		const factor = invited
			? state === 'challenge'
				? unverifiedFactor ?? verifiedFactor
				: unverifiedFactor
			: state === 'challenge'
				? verifiedFactor
				: unverifiedFactor;
		if (!factor) {
			return fail(409, {
				message: state === 'challenge'
					? 'No verified authenticator is available for this account.'
					: 'Start authenticator setup before entering a code.'
			});
		}

		const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: factor.id });
		if (challengeError) return fail(503, { message: 'Authenticator verification is temporarily unavailable.' });

		const { error: verifyError } = await client.auth.mfa.verify({
			factorId: factor.id,
			challengeId: challenge.id,
			code
		});
		if (verifyError) return fail(400, { message: 'That code did not work. Check it and try again.' });

		const access = await getStaffAccess(event);
		if (access.kind === 'authorized') throw redirect(303, '/admin/estimates');
		if (access.kind === 'invited' && access.stage === 'activate') {
			return activateInvitedStaff(client, event);
		}
		if (access.kind === 'unauthenticated') throw redirect(303, '/admin/login');
		if (access.kind === 'denied' || access.kind === 'forbidden') {
			throw error(403, 'You do not have access to this page.');
		}
		if (access.kind === 'unavailable') throw error(503, 'Staff access is temporarily unavailable.');
		return fail(400, { message: 'Authenticator verification did not establish AAL2. Try again.' });
	}
};
