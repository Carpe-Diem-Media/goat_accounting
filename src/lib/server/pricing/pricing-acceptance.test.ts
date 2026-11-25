import { expect, test } from 'bun:test';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT as model } from '../../../../supabase/pricing-candidates/goat-accounting-starter-v1';
import {
	GOAT_STARTER_V1_MANIFEST_REVISION, GOAT_STARTER_V1_SCENARIOS
} from '../../../../supabase/pricing-candidates/goat-accounting-starter-v1-acceptance';
import { inspectPricingAcceptance, PricingAcceptanceConflictError, transitionPricingAcceptance } from './pricing-acceptance';
import { fingerprintDraft } from './run-pricing-corpus';

type Repository = Parameters<typeof inspectPricingAcceptance>[0];
type Draft = NonNullable<Awaited<ReturnType<Repository['readDraft']>>>;
type Manifest = NonNullable<Awaited<ReturnType<Repository['readAcceptance']>>>;
const fingerprint = await fingerprintDraft(model);
const actor = { userId: crypto.randomUUID(), sessionId: crypto.randomUUID() };
const draft: Draft = {
	model, revision: 31, checksum: null, createdAt: '2026-11-25', activatedAt: null, retiredAt: null,
	rules: model.rules.map((rule) => ({ id: crypto.randomUUID(), enabled: true, rule }))
};
function manifest(payload = JSON.stringify(GOAT_STARTER_V1_SCENARIOS)): Manifest {
	return {
		id: crypto.randomUUID(), state: 'APPROVED', revision: `${GOAT_STARTER_V1_MANIFEST_REVISION}.${draft.revision}`,
		draft_revision: draft.revision, definition_fingerprint: fingerprint, scenario_payload: payload,
		scenario_digest: new Bun.CryptoHasher('sha256').update(payload).digest('hex'), approved_at: '2026-11-25'
	};
}
function repository(row: Manifest | null, candidate = draft) {
	const activations: Parameters<Repository['activateAcceptance']>[0][] = [];
	const unexpectedWrite = async () => { throw new Error('Unexpected acceptance write.'); };
	const repo: Repository = {
		readDraft: async () => candidate, readAcceptance: async () => row,
		submitAcceptance: unexpectedWrite, approveAcceptance: unexpectedWrite,
		activateAcceptance: async (input) => { activations.push(input); }
	};
	return { repo, activations };
}

test('activation reruns the 21 persisted expectations and binds the full draft to the guarded RPC', async () => {
	const row = manifest();
	const { repo, activations } = repository(row);
	await transitionPricingAcceptance(repo, model.id, actor, {
		revision: draft.revision, fingerprint, manifestId: row.id
	}, 'activate');
	expect(activations).toHaveLength(1);
	expect(activations[0]).toMatchObject({
		p_actor: actor.userId, p_session: actor.sessionId, p_manifest: row.id, p_digest: row.scenario_digest,
		p_draft_revision: draft.revision, p_fingerprint: fingerprint, p_projection: model
	});
	expect(activations[0].p_results).toHaveLength(21);
});

test('activation rejects absent, malformed, altered, failed, invalidated and stale evidence', async () => {
	const changedExpectations = structuredClone(GOAT_STARTER_V1_SCENARIOS);
	changedExpectations[0].expected.ongoing.minCents += 1;
	for (const row of [
		null, manifest('{'), manifest('[]'), manifest(JSON.stringify(changedExpectations)),
		{ ...manifest(), state: 'INVALIDATED' },
		{ ...manifest(), draft_revision: draft.revision - 1 },
		{ ...manifest(), scenario_digest: '0'.repeat(64) }
	]) {
		const { repo, activations } = repository(row);
		await expect(transitionPricingAcceptance(repo, model.id, actor, {
			revision: draft.revision, fingerprint, manifestId: row?.id ?? null
		}, 'activate')).rejects.toBeInstanceOf(PricingAcceptanceConflictError);
		expect(activations).toHaveLength(0);
	}
});

test('activation fails closed if a persisted rule is switched off after approval', async () => {
	const row = manifest();
	const modified = { ...draft, rules: draft.rules.map((rule, index) => ({ ...rule, enabled: index !== 0 })) };
	const { repo, activations } = repository(row, modified);
	await expect(transitionPricingAcceptance(repo, model.id, actor, {
		revision: draft.revision, fingerprint, manifestId: row.id
	}, 'activate')).rejects.toBeInstanceOf(PricingAcceptanceConflictError);
	expect(activations).toHaveLength(0);
});
