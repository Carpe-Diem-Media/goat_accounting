import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type EstimatorServerEnv = {
	SUPABASE_URL?: string;
	SUPABASE_SECRET_KEY?: string;
};

export function createEstimatorServiceClient(env: EstimatorServerEnv) {
	const supabaseUrl = env.SUPABASE_URL;
	const secretKey = env.SUPABASE_SECRET_KEY;

	if (!supabaseUrl || !secretKey) {
		throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required for estimator server access.');
	}

	return createClient<Database, 'estimator'>(supabaseUrl, secretKey, {
		db: { schema: 'estimator' },
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	});
}
