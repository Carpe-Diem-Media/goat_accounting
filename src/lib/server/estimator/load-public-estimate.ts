import { error } from '@sveltejs/kit';

export type EstimateReadBindings = {
	ESTIMATE_READ_ENABLED?: string;
};

export async function loadPublicEstimate<
	Bindings extends EstimateReadBindings,
	Client,
	Repository,
	Estimate
>(
	publicRef: string,
	bindings: Bindings | undefined,
	setHeaders: (headers: Record<string, string>) => void,
	dependencies: {
		createClient: (bindings: Bindings) => Client;
		createRepository: (client: Client) => Repository;
		getPublicEstimate: (publicRef: string, repository: Repository) => Promise<Estimate | null>;
	}
): Promise<{ estimate: Estimate }> {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow, noarchive',
		'referrer-policy': 'no-referrer'
	});

	if (bindings?.ESTIMATE_READ_ENABLED !== 'true') {
		throw error(503, 'Estimate results are temporarily unavailable.');
	}

	let estimate: Estimate | null;
	try {
		const client = dependencies.createClient(bindings);
		const repository = dependencies.createRepository(client);
		estimate = await dependencies.getPublicEstimate(publicRef, repository);
	} catch {
		throw error(503, 'Estimate results are temporarily unavailable.');
	}

	if (!estimate) throw error(404, 'Estimate not found.');
	return { estimate };
}


export function contactPanelConfig(bindings: Pick<Cloudflare.Env,
	'ESTIMATE_CONTACT_ENABLED' | 'TURNSTILE_SITE_KEY' | 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_HOSTNAME' | 'CONTACT_RATE_LIMITER'
> | undefined): { siteKey: string } | null {
	return bindings?.ESTIMATE_CONTACT_ENABLED === 'true'
		&& bindings.TURNSTILE_SITE_KEY
		&& bindings.TURNSTILE_SECRET_KEY
		&& bindings.TURNSTILE_HOSTNAME
		&& bindings.CONTACT_RATE_LIMITER
		? { siteKey: bindings.TURNSTILE_SITE_KEY }
		: null;
}
