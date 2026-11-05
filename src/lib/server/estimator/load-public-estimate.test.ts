import { describe, expect, it } from 'bun:test';
import { loadPublicEstimate, type EstimateReadBindings } from './load-public-estimate';

const REF = 'c'.repeat(32);
const publicEstimate = { publicRef: REF, state: 'VALID' as const };

function makeDependencies() {
	const calls = { clients: 0, repositories: 0, lookups: 0 };
	return {
		calls,
		dependencies: {
			createClient: (_bindings: EstimateReadBindings) => {
				calls.clients += 1;
				return { client: true };
			},
			createRepository: (_client: { client: boolean }) => {
				calls.repositories += 1;
				return { repository: true };
			},
			getPublicEstimate: async (_publicRef: string, _repository: { repository: boolean }) => {
				calls.lookups += 1;
				return publicEstimate;
			}
		}
	};
}

describe('public estimate result loader', () => {
	it('sets private response headers when it returns a saved result', async () => {
		const { calls, dependencies } = makeDependencies();
		const headers: Record<string, string> = {};

		const result = await loadPublicEstimate(
			REF,
			{ ESTIMATE_READ_ENABLED: 'true' },
			(values) => Object.assign(headers, values),
			dependencies
		);

		expect(result).toEqual({ estimate: publicEstimate });
		expect(headers).toEqual({
			'cache-control': 'private, no-store',
			'x-robots-tag': 'noindex, nofollow, noarchive',
			'referrer-policy': 'no-referrer'
		});
		expect(calls).toEqual({ clients: 1, repositories: 1, lookups: 1 });
	});

	it('defaults reads to disabled without creating a client or querying the repository', async () => {
		const { calls, dependencies } = makeDependencies();
		const headers: Record<string, string> = {};

		await expect(
			loadPublicEstimate(REF, undefined, (values) => Object.assign(headers, values), dependencies)
		).rejects.toMatchObject({ status: 503 });

		expect(calls).toEqual({ clients: 0, repositories: 0, lookups: 0 });
		expect(headers['cache-control']).toBe('private, no-store');
	});
});
