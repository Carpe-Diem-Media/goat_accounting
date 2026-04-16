import { createClient } from '@supabase/supabase-js';
import { LeadSchema, type Lead } from '$lib/domain/lead_schema';

const DEFAULT_LEADS_TABLE = 'leads';

export type PlatformEnv = Record<string, string | undefined>;

export type SaveLeadResult = {
	table: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: SupabaseLeadError };

export class SupabaseLeadError extends Error {
	constructor(
		public readonly code: 'CONFIG_ERROR' | 'VALIDATION_ERROR' | 'PROVIDER_ERROR' | 'UNKNOWN_ERROR',
		message: string,
		public readonly details?: unknown
	) {
		super(message);
		this.name = 'SupabaseLeadError';
	}
}

function toSupabaseLeadError(error: unknown): SupabaseLeadError {
	if (error instanceof SupabaseLeadError) return error;
	if (error instanceof Error) return new SupabaseLeadError('UNKNOWN_ERROR', error.message);
	return new SupabaseLeadError('UNKNOWN_ERROR', 'Unknown error');
}

function resolveEnv(env: unknown): PlatformEnv {
	if (env) return env as PlatformEnv;
	throw new SupabaseLeadError(
		'CONFIG_ERROR',
		'platform.env is required. Pass event.platform?.env from a SvelteKit server handler.'
	);
}

function requireEnv(env: PlatformEnv, key: string): string {
	const value = env[key];
	if (!value) {
		throw new SupabaseLeadError('CONFIG_ERROR', `Missing required platform.env value: ${key}`);
	}
	return value;
}

function resolveSupabaseKey(env: PlatformEnv): string {
	return requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
}

function resolveTable(env: PlatformEnv): string {
	return env.SUPABASE_LEADS_TABLE ?? DEFAULT_LEADS_TABLE;
}

export async function saveLeadToSupabase(leadData: Lead, env: unknown): Promise<Result<SaveLeadResult>> {
	try {
		const platformEnv = resolveEnv(env);
		const parsedLead = LeadSchema.safeParse(leadData);
		if (!parsedLead.success) {
			throw new SupabaseLeadError('VALIDATION_ERROR', 'Lead payload failed validation', parsedLead.error.flatten());
		}

		const supabaseUrl = requireEnv(platformEnv, 'SUPABASE_URL');
		const supabaseKey = resolveSupabaseKey(platformEnv);
		const table = resolveTable(platformEnv);
		const supabase = createClient(supabaseUrl, supabaseKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		const { error } = await supabase.from(table).insert(parsedLead.data);
		if (error) {
			throw new SupabaseLeadError('PROVIDER_ERROR', `Supabase insert failed for table "${table}"`, error);
		}

		return { ok: true, data: { table } };
	} catch (error) {
		return { ok: false, error: toSupabaseLeadError(error) };
	}
}
