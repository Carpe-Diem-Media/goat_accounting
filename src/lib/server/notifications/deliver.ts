import type { NotificationDelivery } from '../../domain/notifications/lifecycle';
import { createNotificationsRepository } from '../supabase/repositories/notifications';
import type { NotificationContext } from '../supabase/repositories/notifications';
import { loadEstimateMailConfiguration, sendEstimateMail, type EstimateMailBindings, type MailFetch } from '../email/estimate-mailer';
import { renderCustomerEstimateEmail } from '../email/templates/customer-estimate';
import { renderInternalLeadEmail } from '../email/templates/internal-lead';
import { toEstimateDocumentModel, type EstimateDocumentRecord } from '../pdf/estimate-document';

export type DeliverySafeOutcome = Readonly<{ deliveryId?: string; state?: NotificationDelivery['state']; code: string }>;
export type DeliveryOptions = Readonly<{
  repository: ReturnType<typeof createNotificationsRepository>;
  signal?: AbortSignal;
  fetch?: MailFetch;
  testOnly?: boolean;
  now?: () => number;
  budgetMs?: number;
  report?: (outcome: DeliverySafeOutcome) => void;
}>;
export type DeliveryResult = Readonly<{ status: string; code?: string; outcomes: readonly DeliverySafeOutcome[] }>;
export type ReconciledDeliveryToken = Readonly<{ attemptCount: number; lastAttemptAt: string | null; lastErrorCode: string | null; lastErrorSafeMessage: string | null }>;
const MAX_BUDGET_MS = 7000;
const SEND_TIMEOUT_MS = 5000;
const INTENT_EXPIRY_MS = 23 * 60 * 60 * 1000;
const PROVIDER_START_MARGIN_MS = 12_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function safeCall(report: DeliveryOptions['report'], item: DeliverySafeOutcome) { try { report?.(item); } catch { /* Reports cannot affect delivery. */ } }
function modelRecord(context: NotificationContext): EstimateDocumentRecord {
  const row = context.estimate;
  return { public_ref: row.public_ref, calculator_type: row.calculator_type, state: row.state, created_at: row.created_at,
    pricing_model_version: row.pricing_model_version, engine_version: row.engine_version, answers_snapshot: row.answers_snapshot,
    calculation_snapshot: row.calculation_snapshot, catchup_min_cents: row.catchup_min_cents, catchup_max_cents: row.catchup_max_cents,
    ongoing_min_cents: row.ongoing_min_cents, ongoing_max_cents: row.ongoing_max_cents };
}
function makeOutcome(deliveryId: string | undefined, code: string, state?: NotificationDelivery['state']): DeliverySafeOutcome { return { ...(deliveryId ? { deliveryId } : {}), code, ...(state ? { state } : {}) }; }

function runWithinBudget(operation: (signal: AbortSignal) => Promise<DeliveryResult>, options: DeliveryOptions, deliveryId?: string): Promise<DeliveryResult> {
  const budget = Math.min(MAX_BUDGET_MS, Math.max(0, options.budgetMs ?? MAX_BUDGET_MS));
  const controller = new AbortController();
  const report = (result: DeliveryResult) => {
    const expected = result.status === 'disabled' || result.status === 'nothing_selected';
    if (!expected && result.code && !result.outcomes.some((item) => item.code === result.code)) safeCall(options.report, makeOutcome(deliveryId, result.code));
    return result;
  };
  if (options.signal?.aborted) {
    const result = { status: 'aborted', code: 'aborted', outcomes: [] };
    return Promise.resolve(report(result));
  }
  let timer: ReturnType<typeof setTimeout>;
  let abortResolve!: (result: DeliveryResult) => void;
  const aborted = new Promise<DeliveryResult>((resolve) => { abortResolve = resolve; });
  const onAbort = () => {
    controller.abort();
    abortResolve({ status: 'aborted', code: 'aborted', outcomes: [] });
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const deadline = new Promise<DeliveryResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ status: 'budget_exhausted', code: 'budget_exhausted', outcomes: [] });
    }, budget);
  });
  const work = Promise.resolve().then(() => operation(controller.signal)).catch(() => ({ status: 'delivery_failed', code: 'delivery_failed', outcomes: [] }));
  return Promise.race([work, deadline, aborted]).finally(() => {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }).then(report);
}

export function deliverContactNotifications(saved: { leadId: string | null; estimateId: string }, bindings: EstimateMailBindings, options: DeliveryOptions): Promise<DeliveryResult> {
  return runWithinBudget((signal) => runContactNotifications(saved, bindings, { ...options, signal }), options);
}

async function runContactNotifications(saved: { leadId: string | null; estimateId: string }, bindings: EstimateMailBindings, options: DeliveryOptions): Promise<DeliveryResult> {
  const started = performance.now(), budget = Math.min(MAX_BUDGET_MS, Math.max(0, options.budgetMs ?? MAX_BUDGET_MS));
  const controller = new AbortController();
  const abortParent = () => controller.abort();
  options.signal?.addEventListener('abort', abortParent, { once: true });
  const timer = setTimeout(() => controller.abort(), budget);
  const outcomes: DeliverySafeOutcome[] = [];
  const alive = () => !controller.signal.aborted && performance.now() - started < budget;
  const record = (value: DeliverySafeOutcome) => { outcomes.push(value); safeCall(options.report, value); };
  try {
    if (!saved.leadId || !UUID.test(saved.leadId) || !UUID.test(saved.estimateId)) return { status: 'context_invalid', code: 'context_invalid', outcomes };
    const config = await loadEstimateMailConfiguration(bindings, options.testOnly);
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    if (config.status !== 'ready') return { status: config.status, code: config.status, outcomes };
    const loaded = await options.repository.loadContactContext({ leadId: saved.leadId, estimateId: saved.estimateId }, controller.signal);
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    if (loaded.error || !loaded.context) return { status: 'lookup_failed', code: loaded.error ?? 'context_invalid', outcomes };
    const context = loaded.context;
    const selected = context.deliveries.filter((item) => item.type === 'internal_lead' ? context.lead.requested_contact : context.lead.requested_estimate_email);
    if (!selected.length) return { status: 'nothing_selected', outcomes };
    const estimate = toEstimateDocumentModel(modelRecord(context));
    const messages = new Map<string, ReturnType<typeof renderCustomerEstimateEmail>>();
    for (const item of selected) {
      if (item.type === 'internal_lead') messages.set(item.id, renderInternalLeadEmail({ estimate, estimateId: context.estimate.id,
        contact: { name: context.lead.full_name, email: context.lead.email, phone: context.lead.phone, businessName: context.lead.business_name, preferredContactMethod: context.lead.preferred_contact_method },
        reviewFlags: context.estimate.review_flag_codes ?? [], freeText: context.estimate.free_text }, config.config.content));
      else messages.set(item.id, renderCustomerEstimateEmail(estimate, config.config.content));
    }
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    await Promise.all(selected.slice(0, 2).map(async (item) => {
      if (!alive() || budget - (performance.now() - started) < SEND_TIMEOUT_MS) { record(makeOutcome(item.id, 'budget_insufficient')); return; }
      const claimed = await options.repository.claim(item, { invocation: 'initial', signal: controller.signal });
      if (!alive()) return;
      if (claimed.error || !claimed.claim) { record(makeOutcome(item.id, claimed.error ?? 'not_eligible')); return; }
      if (!alive() || budget - (performance.now() - started) < SEND_TIMEOUT_MS) { record(makeOutcome(item.id, 'budget_insufficient')); return; }
      const to = item.type === 'internal_lead' ? config.config.internalTo : context.lead.email;
      const now = options.now?.() ?? Date.now();
      const createdAt = Date.parse(item.created_at), expiresAt = createdAt + INTENT_EXPIRY_MS;
      if (!Number.isFinite(now) || !Number.isFinite(createdAt) || now < createdAt || now + PROVIDER_START_MARGIN_MS >= expiresAt) {
        record(makeOutcome(item.id, 'intent_expired'));
        return;
      }
      if (!alive() || budget - (performance.now() - started) < SEND_TIMEOUT_MS) { record(makeOutcome(item.id, 'budget_insufficient')); return; }
      const sent = await sendEstimateMail(config.config, item.id, to, messages.get(item.id)!, { fetch: options.fetch, signal: controller.signal,
        timeoutMs: Math.min(SEND_TIMEOUT_MS, budget - (performance.now() - started)) });
      if (!alive()) return;
      const finalized = await options.repository.finalize(claimed.claim.row, sent, sent.providerId ?? undefined, controller.signal);
      if (!alive()) return;
      if (finalized.error) { record(makeOutcome(item.id, 'finalize_failed')); return; }
      if (!finalized.row) { record(makeOutcome(item.id, 'finalize_stale')); return; }
      record(makeOutcome(item.id, sent.code, finalized.row?.state));
    }));
    return { status: outcomes.length && outcomes.every((item) => item.state === 'SENT') ? 'accepted' : 'completed', outcomes };
  } catch { return { status: 'delivery_failed', code: 'delivery_failed', outcomes }; }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abortParent); }
}

export function deliverNotificationById(deliveryId: string, bindings: EstimateMailBindings, options: DeliveryOptions & { providerReconciled?: boolean; reconciledToken?: ReconciledDeliveryToken }): Promise<DeliveryResult> {
  return runWithinBudget((signal) => runManualNotification(deliveryId, bindings, { ...options, signal }), options, deliveryId);
}

async function runManualNotification(deliveryId: string, bindings: EstimateMailBindings, options: DeliveryOptions & { providerReconciled?: boolean; reconciledToken?: ReconciledDeliveryToken }): Promise<DeliveryResult> {
  if (!UUID.test(deliveryId)) return { status: 'context_invalid', code: 'context_invalid', outcomes: [] };
  const started = performance.now(), budget = Math.min(MAX_BUDGET_MS, Math.max(0, options.budgetMs ?? MAX_BUDGET_MS));
  const controller = new AbortController(), abortParent = () => controller.abort();
  options.signal?.addEventListener('abort', abortParent, { once: true });
  const timer = setTimeout(() => controller.abort(), budget), outcomes: DeliverySafeOutcome[] = [];
  const alive = () => !controller.signal.aborted && performance.now() - started < budget;
  const record = (value: DeliverySafeOutcome) => { outcomes.push(value); safeCall(options.report, value); };
  try {
    const found = await options.repository.loadContextForDelivery(deliveryId, controller.signal);
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    if (found.error || !found.context) return { status: 'lookup_failed', code: found.error ?? 'context_invalid', outcomes };
    const context = found.context, item = context.deliveries.find((candidate) => candidate.id === deliveryId);
    if (!item) return { status: 'not_found', code: 'not_found', outcomes };
    if (options.providerReconciled && (!options.reconciledToken ||
      options.reconciledToken.attemptCount !== item.attempt_count ||
      options.reconciledToken.lastAttemptAt !== item.last_attempt_at ||
      options.reconciledToken.lastErrorCode !== item.last_error_code ||
      options.reconciledToken.lastErrorSafeMessage !== item.last_error_safe_message)) {
      return { status: 'reconciliation_stale', code: 'reconciliation_stale', outcomes };
    }
    const config = await loadEstimateMailConfiguration(bindings, options.testOnly);
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    if (config.status !== 'ready') return { status: config.status, code: config.status, outcomes };
    const maintenance = await options.repository.exhaustIdle(item, options.now?.() ?? Date.now(), controller.signal);
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    if (maintenance.error) return { status: 'persistence_unavailable', code: maintenance.error, outcomes };
    if (maintenance.row) {
      record(makeOutcome(deliveryId, maintenance.row.last_error_code ?? 'exhausted', maintenance.row.state));
      return { status: 'exhausted', outcomes };
    }
    const estimate = toEstimateDocumentModel(modelRecord(context));
    const message = item.type === 'internal_lead' ? renderInternalLeadEmail({ estimate, estimateId: context.estimate.id,
      contact: { name: context.lead.full_name, email: context.lead.email, phone: context.lead.phone, businessName: context.lead.business_name, preferredContactMethod: context.lead.preferred_contact_method },
      reviewFlags: context.estimate.review_flag_codes ?? [], freeText: context.estimate.free_text }, config.config.content)
      : renderCustomerEstimateEmail(estimate, config.config.content);
    if (!alive() || budget - (performance.now() - started) < SEND_TIMEOUT_MS) return { status: 'budget_insufficient', code: 'budget_insufficient', outcomes };
    const claim = await options.repository.claim(item, { invocation: 'manual', providerReconciled: options.providerReconciled, signal: controller.signal });
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    if (claim.error || !claim.claim) return { status: 'not_eligible', code: claim.error ?? 'not_eligible', outcomes };
    if (!alive() || budget - (performance.now() - started) < SEND_TIMEOUT_MS) return { status: 'budget_insufficient', code: 'budget_insufficient', outcomes };
    const to = item.type === 'internal_lead' ? config.config.internalTo : context.lead.email;
    const now = options.now?.() ?? Date.now();
    const createdAt = Date.parse(item.created_at), expiresAt = createdAt + INTENT_EXPIRY_MS;
    if (!Number.isFinite(now) || !Number.isFinite(createdAt) || now < createdAt || now + PROVIDER_START_MARGIN_MS >= expiresAt) {
      record(makeOutcome(deliveryId, 'intent_expired'));
      return { status: 'completed', outcomes };
    }
    if (!alive() || budget - (performance.now() - started) < SEND_TIMEOUT_MS) return { status: 'budget_insufficient', code: 'budget_insufficient', outcomes };
    const sent = await sendEstimateMail(config.config, deliveryId, to, message, { fetch: options.fetch, signal: controller.signal,
      timeoutMs: Math.min(SEND_TIMEOUT_MS, budget - (performance.now() - started)) });
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    const finalized = await options.repository.finalize(claim.claim.row, sent, sent.providerId ?? undefined, controller.signal);
    if (!alive()) return { status: 'budget_exhausted', code: 'budget_exhausted', outcomes };
    if (finalized.error) return { status: 'finalize_failed', code: 'finalize_failed', outcomes };
    if (!finalized.row) { record(makeOutcome(deliveryId, 'finalize_stale')); return { status: 'completed', outcomes }; }
    record(makeOutcome(deliveryId, sent.code, finalized.row?.state));
    return { status: 'completed', outcomes };
  } catch { return { status: 'delivery_failed', code: 'delivery_failed', outcomes }; }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abortParent); }
}
