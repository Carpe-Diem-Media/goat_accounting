import { env as workerEnv } from 'cloudflare:workers';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getLeadTransitions, LEAD_STATES, type LeadState } from '$lib/domain/leads/lifecycle';
import { requireStaff } from '$lib/server/auth/staff-guard';
import { runLeadTransition } from '$lib/server/leads/transition-lead';
import { createEstimatorServiceClient, type EstimatorServerEnv } from '$lib/server/supabase/client.server';
import { createLeadsRepository } from '$lib/server/supabase/repositories/leads';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async (event) => {
	const identity = await requireStaff(event);
	const { locals, params } = event;
	if (!UUID.test(params.id)) throw error(404, 'Lead not found.');
	const client = locals.supabase;
	if (!client) throw error(503, 'Lead records are temporarily unavailable.');

	const { data: lead, error: leadError } = await client
		.from('leads')
		.select('id, estimate_id, state, full_name, email, phone, business_name, preferred_contact_method, contact_consent_at, created_at')
		.eq('id', params.id)
		.maybeSingle();
	if (leadError) throw error(503, 'Lead records are temporarily unavailable.');
	if (!lead) throw error(404, 'Lead not found.');

	const { data: estimate, error: estimateError } = await client
		.from('estimates')
		.select('id, public_ref, calculator_type, state, catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents, created_at')
		.eq('id', lead.estimate_id)
		.maybeSingle();
	if (estimateError) throw error(503, 'Lead records are temporarily unavailable.');

	const { data: events, error: eventsError } = await client
		.from('lead_events')
		.select('id, from_state, to_state, event_order, actor_user_id, reason_code, note, created_at')
		.eq('lead_id', lead.id)
		.order('event_order', { ascending: true, nullsFirst: true })
		.order('created_at', { ascending: true })
		.order('id', { ascending: true });
	if (eventsError) throw error(503, 'Lead history is temporarily unavailable.');

	return {
		lead,
		estimate,
		events: events ?? [],
		canManage: identity.role === 'advisor' || identity.role === 'admin',
		availableTransitions: getLeadTransitions(lead.state)
	};
};

export const actions: Actions = {
	transition: async (event) => {
		const actor = await requireStaff(event, ['advisor', 'admin']);
		const { locals, params, platform, request } = event;
		if (!UUID.test(params.id)) throw error(404, 'Lead not found.');
		const sessionClient = locals.supabase;
		if (!sessionClient) throw error(503, 'Lead records are temporarily unavailable.');

		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return fail(400, {
				message: 'The lead update could not be read.',
				targetState: '',
				reason: '',
				note: ''
			});
		}

		const targetState = formData.get('targetState');
		const expectedState = formData.get('expectedState');
		const reason = formData.get('reason');
		const note = formData.get('note');
		const formValues = {
			targetState: typeof targetState === 'string' ? targetState : '',
			reason: typeof reason === 'string' ? reason : '',
			note: typeof note === 'string' ? note : ''
		};
		if (typeof expectedState !== 'string' || !(LEAD_STATES as readonly string[]).includes(expectedState)) {
			return fail(400, { message: 'Refresh the page before changing this lead.', ...formValues });
		}

		let repository: ReturnType<typeof createLeadsRepository>;
		try {
			const bindings = (platform?.env ?? workerEnv) as EstimatorServerEnv;
			repository = createLeadsRepository(createEstimatorServiceClient(bindings));
		} catch {
			throw error(503, 'Lead records are temporarily unavailable.');
		}

		const result = await runLeadTransition(
			{
				leadId: params.id,
				expectedState: expectedState as LeadState,
				toState: targetState,
				actor: { userId: actor.userId, role: actor.role },
				reason,
				note
			},
			{
				findCurrentState: async (leadId) => {
					const { data, error: readError } = await sessionClient
						.from('leads')
						.select('state')
						.eq('id', leadId)
						.maybeSingle();
					if (readError) throw readError;
					return data?.state ?? null;
				},
				transition: (input) => repository.transitionLead(input)
			}
		);

		switch (result.kind) {
			case 'success':
				throw redirect(303, `/admin/leads/${params.id}`);
			case 'forbidden':
				throw error(403, 'You do not have access to update this lead.');
			case 'not_found':
				throw error(404, 'Lead not found.');
			case 'invalid':
				return fail(400, {
					message: 'Choose an available next state. A closure reason is required when closing a lead.',
					...formValues
				});
			case 'conflict':
				return fail(409, {
					message: 'The lead changed after this form loaded. Refresh the page to review its current state and history before trying again.',
					...formValues
				});
			case 'unavailable':
				throw error(503, 'Lead records are temporarily unavailable.');
		}
	}
};
