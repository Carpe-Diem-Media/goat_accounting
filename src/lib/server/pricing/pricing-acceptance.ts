import { GOAT_ACCOUNTING_STARTER_V1_DRAFT } from '../../../../supabase/pricing-candidates/goat-accounting-starter-v1';
import {
	GOAT_STARTER_V1_MANIFEST_REVISION,
	GOAT_STARTER_V1_SCENARIOS
} from '../../../../supabase/pricing-candidates/goat-accounting-starter-v1-acceptance';
import type { createPricingRepository } from '../supabase/repositories/pricing';
import { fingerprintDraft, runPricingCorpus, serializeDraftFingerprintInput } from './run-pricing-corpus';

type Repository = Pick<ReturnType<typeof createPricingRepository>,
	'readDraft' | 'readAcceptance' | 'submitAcceptance' | 'approveAcceptance' | 'activateAcceptance'>;
type Draft = NonNullable<Awaited<ReturnType<Repository['readDraft']>>>;
type Actor = { userId: string; sessionId: string };
type Selection = { revision: number; fingerprint: string; manifestId: string | null };
export type AcceptanceAction = 'submit' | 'approve' | 'activate';
export class PricingAcceptanceConflictError extends Error {}

const sourcePayload = JSON.stringify(GOAT_STARTER_V1_SCENARIOS);
const requiredFingerprint = () => fingerprintDraft(GOAT_ACCOUNTING_STARTER_V1_DRAFT);

async function digest(payload: string) {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function inspectPricingAcceptance(repo: Repository, draft: Draft) {
	const manifest = await repo.readAcceptance(draft.model.id);
	const summary = manifest && {
		id: manifest.id,
		state: manifest.state,
		revision: manifest.revision,
		approvedAt: manifest.approved_at,
		fingerprint: manifest.definition_fingerprint
	};
	if (draft.model.state !== 'DRAFT') return { summary, report: null, fingerprint: null, action: null };

	const enabled = draft.rules.map((rule) => rule.enabled);
	const fingerprint = await fingerprintDraft(draft.model, enabled);
	if (fingerprint !== await requiredFingerprint()) return { summary, report: null, fingerprint, action: null };

	const current = manifest?.state !== 'INVALIDATED' ? manifest : null;
	const revision = `${GOAT_STARTER_V1_MANIFEST_REVISION}.${draft.revision}`;
	if (current && (current.draft_revision !== draft.revision || current.definition_fingerprint !== fingerprint)) {
		return { summary, report: null, fingerprint, action: null };
	}
	const reviewed = current?.revision === revision ? current : null;
	const payload = reviewed?.scenario_payload ?? sourcePayload;
	const scenarioDigest = await digest(payload);
	if (reviewed && (reviewed.scenario_digest !== scenarioDigest || payload !== sourcePayload)) {
		return { summary, report: null, fingerprint, action: null };
	}

	const report = await runPricingCorpus(draft.model, {
		modelId: draft.model.id,
		definitionFingerprint: fingerprint,
		revision,
		scenarios: JSON.parse(payload)
	}, enabled);
	const action: AcceptanceAction | null = !report.passed ? null
		: reviewed?.state === 'APPROVED' ? 'activate'
		: reviewed?.state === 'DRAFT' ? 'approve'
		: 'submit';
	return { summary, report, fingerprint, action, scenarioDigest, payload };
}

/** Load and evaluate the stored evidence again before either privileged transition. */
export async function transitionPricingAcceptance(
	repo: Repository, modelId: string, actor: Actor, selection: Selection, action: AcceptanceAction
) {
	const draft = await repo.readDraft(modelId);
	if (!draft || draft.model.state !== 'DRAFT' || draft.revision !== selection.revision) {
		throw new PricingAcceptanceConflictError();
	}
	const current = await inspectPricingAcceptance(repo, draft);
	const manifestId = current.summary?.state !== 'INVALIDATED' ? current.summary?.id ?? null : null;
	if (current.action !== action || !current.report?.passed || current.fingerprint !== selection.fingerprint ||
		manifestId !== selection.manifestId || !current.scenarioDigest || !current.payload) {
		throw new PricingAcceptanceConflictError();
	}

	const enabled = draft.rules.map((rule) => rule.enabled);
	const binding = {
		p_actor: actor.userId, p_session: actor.sessionId, p_model: modelId,
		p_draft_revision: draft.revision, p_definition: serializeDraftFingerprintInput(draft.model, enabled),
		p_fingerprint: current.fingerprint, p_digest: current.scenarioDigest
	};
	if (action === 'submit') {
		await repo.submitAcceptance({
			...binding, p_revision: current.report.manifestRevision, p_payload: current.payload,
			p_prior_manifest: manifestId
		});
		return;
	}
	if (!manifestId) throw new PricingAcceptanceConflictError();
	const reviewed = { ...binding, p_manifest: manifestId, p_results: current.report.scenarios };
	if (action === 'approve') {
		await repo.approveAcceptance(reviewed);
		return;
	}
	await repo.activateAcceptance({
		...reviewed,
		p_projection: { ...draft.model, rules: draft.model.rules.filter((_rule, index) => enabled[index]) }
	});
}
