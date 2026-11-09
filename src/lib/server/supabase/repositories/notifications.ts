import type { Database } from '../database.types';
import type { EstimatorServiceClient } from '../repository.server';
import {
  assessClaimEligibility,
  buildRetryDeadlineMessage,
  classifyAttemptOutcome,
  validateClaimClock,
  type AttemptOutcome,
  type NotificationDelivery
} from '../../../domain/notifications/lifecycle';

const DISCOVERY_COLUMNS = 'id, type, state, provider, attempt_count, last_error_code, last_error_safe_message, created_at, last_attempt_at, sent_at';
const DELIVERY_COLUMNS = 'id, estimate_id, lead_id, type, state, provider, provider_message_id, recipient_hash, recipient_masked, attempt_count, last_error_code, last_error_safe_message, created_at, last_attempt_at, sent_at';
const LEAD_COLUMNS = 'id, estimate_id, full_name, email, phone, business_name, preferred_contact_method, requested_contact, requested_estimate_email';
const ESTIMATE_COLUMNS = 'id, public_ref, calculator_type, state, pricing_model_id, pricing_model_version, engine_version, answers_snapshot, calculation_snapshot, catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents, confidence, manual_review_required, review_reasons, review_flag_codes, free_text, created_at';
const UNKNOWN = 'ATTEMPT_OUTCOME_UNKNOWN';
const ATTEMPT_LIMIT = 5;
const ACTIVE_EXCLUSION_MS = 60_000;
const EXPIRY_MS = 23 * 60 * 60 * 1000;
const BACKOFF_MS = [60_000, 120_000, 240_000, 480_000] as const;

export type NotificationDiscoveryRow = Pick<NotificationDelivery, 'id' | 'type' | 'state' | 'provider' | 'attempt_count' | 'last_error_code' | 'last_error_safe_message' | 'created_at' | 'last_attempt_at' | 'sent_at'>;

type SafeError = 'lookup_failed' | 'context_invalid' | 'not_found' | 'claim_failed' | 'invalid_clock' | 'not_eligible' | 'finalize_failed' | 'invalid_outcome' | 'maintenance_failed';
type LeadRecord = Pick<Database['estimator']['Tables']['leads']['Row'], 'id' | 'estimate_id' | 'full_name' | 'email' | 'phone' | 'business_name' | 'preferred_contact_method' | 'requested_contact' | 'requested_estimate_email'>;
type EstimateRecord = Pick<Database['estimator']['Tables']['estimates']['Row'], 'id' | 'public_ref' | 'calculator_type' | 'state' | 'pricing_model_id' | 'pricing_model_version' | 'engine_version' | 'answers_snapshot' | 'calculation_snapshot' | 'catchup_min_cents' | 'catchup_max_cents' | 'ongoing_min_cents' | 'ongoing_max_cents' | 'confidence' | 'manual_review_required' | 'review_reasons' | 'review_flag_codes' | 'free_text' | 'created_at'>;

export interface NotificationContext {
  lead: LeadRecord;
  estimate: EstimateRecord;
  deliveries: NotificationDelivery[];
}

export interface ClaimedNotification {
  row: NotificationDelivery;
  invocation: 'initial' | 'manual';
}

function defaultSignal(signal?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(2_000);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

function timestampParts(value: string): { milliseconds: number; subMillisecondMicros: number } | null {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d{2}:?\d{2}$)/)?.[1] ?? '';
  const subMillisecondMicros = Number((fraction.slice(3, 6) + '000').slice(0, 3));
  return { milliseconds, subMillisecondMicros };
}

function timestampStrictlyAfter(candidate: string, previous: string): boolean {
  const next = timestampParts(candidate);
  const prior = timestampParts(previous);
  if (!next || !prior) return false;
  return next.milliseconds > prior.milliseconds ||
    (next.milliseconds === prior.milliseconds && next.subMillisecondMicros > prior.subMillisecondMicros);
}

function sameToken(a: NotificationDelivery, b: NotificationDelivery): boolean {
  return a.id === b.id && a.state === b.state && a.attempt_count === b.attempt_count &&
    a.last_attempt_at === b.last_attempt_at && a.last_error_code === b.last_error_code &&
    a.last_error_safe_message === b.last_error_safe_message;
}

function validProviderId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeOutcome(outcome: AttemptOutcome, claim: NotificationDelivery): { state: NotificationDelivery['state']; code: string; message: string | null } | null {
  if (outcome.classification === 'accepted') return { state: 'SENT', code: 'PROVIDER_ACCEPTED', message: null };
  if (outcome.classification === 'permanent' && ['PROVIDER_AUTH_REJECTED', 'PAYLOAD_CONFLICT', 'PROVIDER_REJECTED'].includes(outcome.code)) return { state: 'EXHAUSTED', code: outcome.code, message: null };
  if (outcome.classification === 'permanent') return null;
  if (outcome.classification === 'retryable') {
    if (outcome.code !== 'PROVIDER_RATE_LIMITED' && outcome.code !== 'PROVIDER_TRANSIENT') return null;
    const lastAttempt = Date.parse(claim.last_attempt_at ?? '');
    const backoff = BACKOFF_MS[Math.min(claim.attempt_count - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[3];
    return claim.attempt_count >= ATTEMPT_LIMIT
      ? { state: 'EXHAUSTED', code: outcome.code, message: null }
      : { state: 'FAILED_RETRYABLE', code: outcome.code, message: buildRetryDeadlineMessage(Math.max(lastAttempt + backoff, outcome.retryNotBefore ?? 0)) };
  }
  if (outcome.classification === 'uncertain' && ['PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR', 'RETRY_AFTER_INVALID', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_CONFLICT_UNKNOWN'].includes(outcome.code)) {
    return claim.attempt_count >= ATTEMPT_LIMIT
      ? { state: 'EXHAUSTED', code: outcome.code, message: null }
      : { state: 'FAILED_RETRYABLE', code: outcome.code, message: null };
  }
  return null;
}

export function createNotificationsRepository(client: EstimatorServiceClient, now: () => number = Date.now) {
  async function lookupDelivery(id: string, signal?: AbortSignal) {
    const { data, error } = await client.from('notification_deliveries').select(DELIVERY_COLUMNS).eq('id', id).abortSignal(defaultSignal(signal)).maybeSingle();
    if (error) return { row: null, error: 'lookup_failed' as const };
    return { row: data as unknown as NotificationDelivery | null, error: null };
  }

  async function intentsForLead(lead: LeadRecord, signal?: AbortSignal): Promise<{ rows: NotificationDelivery[]; error: SafeError | null }> {
    const [internal, customer] = await Promise.all([
      client.from('notification_deliveries').select(DELIVERY_COLUMNS).eq('lead_id', lead.id).limit(2).abortSignal(defaultSignal(signal)),
      client.from('notification_deliveries').select(DELIVERY_COLUMNS).eq('estimate_id', lead.estimate_id).limit(2).abortSignal(defaultSignal(signal))
    ]);
    if (internal.error || customer.error) return { rows: [], error: 'lookup_failed' };
    const rows = [...(internal.data ?? []), ...(customer.data ?? [])] as unknown as NotificationDelivery[];
    const internals = rows.filter((item) => item.type === 'internal_lead');
    const customers = rows.filter((item) => item.type === 'customer_estimate');
    const internalValid = lead.requested_contact === true ? internals.length === 1 : lead.requested_contact === false && internals.length === 0;
    const customerValid = lead.requested_estimate_email === true ? customers.length === 1 : lead.requested_estimate_email === false && customers.length === 0;
    if (!internalValid || !customerValid || rows.length !== internals.length + customers.length ||
      internals.some((item) => item.lead_id !== lead.id || item.estimate_id !== null) ||
      customers.some((item) => item.estimate_id !== lead.estimate_id || item.lead_id !== null)) {
      return { rows: [], error: 'context_invalid' };
    }
    return { rows, error: null };
  }

  async function contextForLead(lead: LeadRecord, signal?: AbortSignal): Promise<{ context: NotificationContext | null; error: SafeError | null }> {
    if (lead.requested_contact === null || lead.requested_estimate_email === null || !lead.requested_contact && !lead.requested_estimate_email) {
      return { context: null, error: 'context_invalid' };
    }
    const [estimateResult, intentResult] = await Promise.all([
      client.from('estimates').select(ESTIMATE_COLUMNS).eq('id', lead.estimate_id).abortSignal(defaultSignal(signal)).maybeSingle(),
      intentsForLead(lead, signal)
    ]);
    if (estimateResult.error || intentResult.error) return { context: null, error: estimateResult.error ? 'lookup_failed' : intentResult.error };
    if (!estimateResult.data) return { context: null, error: 'context_invalid' };
    return { context: { lead, estimate: estimateResult.data as unknown as EstimateRecord, deliveries: intentResult.rows }, error: null };
  }

  return {
    async findById(id: string, signal?: AbortSignal) {
      return lookupDelivery(id, signal);
    },

    async discover(cursor?: string, signal?: AbortSignal) {
      let query = client.from('notification_deliveries').select(DISCOVERY_COLUMNS).in('state', ['PENDING', 'FAILED_RETRYABLE']).order('id').limit(50).abortSignal(defaultSignal(signal));
      if (cursor) query = query.gt('id', cursor);
      const { data, error } = await query;
      if (error) return { rows: [], nextCursor: null, error: 'lookup_failed' as const };
      const rows = (data ?? []) as unknown as NotificationDelivery[];
      return { rows: rows as NotificationDiscoveryRow[], nextCursor: rows.length === 50 ? rows[rows.length - 1]!.id : null, error: null };
    },

    async loadContactContext(input: { leadId: string; estimateId: string }, signal?: AbortSignal) {
      const { data, error } = await client.from('leads').select(LEAD_COLUMNS).eq('id', input.leadId).abortSignal(defaultSignal(signal)).maybeSingle();
      if (error) return { context: null, error: 'lookup_failed' as const };
      if (!data) return { context: null, error: 'not_found' as const };
      const lead = data as unknown as LeadRecord;
      if (lead.estimate_id !== input.estimateId) return { context: null, error: 'context_invalid' as const };
      return contextForLead(lead, signal);
    },

    async loadContextForDelivery(deliveryId: string, signal?: AbortSignal) {
      const found = await lookupDelivery(deliveryId, signal);
      if (found.error) return { context: null, error: found.error };
      if (!found.row) return { context: null, error: 'not_found' as const };
      const leadId = found.row.lead_id;
      let leadQuery = client.from('leads').select(LEAD_COLUMNS).limit(2).abortSignal(defaultSignal(signal));
      if (leadId !== null) leadQuery = leadQuery.eq('id', leadId);
      else if (found.row.estimate_id !== null) leadQuery = leadQuery.eq('estimate_id', found.row.estimate_id);
      else return { context: null, error: 'context_invalid' as const };
      const { data, error } = await leadQuery;
      if (error) return { context: null, error: 'lookup_failed' as const };
      if (!data || data.length !== 1) return { context: null, error: 'context_invalid' as const };
      const result = await contextForLead(data[0] as unknown as LeadRecord, signal);
      if (result.error || !result.context || !result.context.deliveries.some((item) => item.id === deliveryId)) return { context: null, error: result.error ?? 'context_invalid' };
      return result;
    },

    async claim(observed: NotificationDelivery, options: { invocation: 'initial' | 'manual'; providerReconciled?: boolean; signal?: AbortSignal }) {
      const currentNow = now();
      const eligibility = assessClaimEligibility(observed, currentNow, options.invocation, options.providerReconciled ?? false);
      if (!eligibility.eligible) return { claim: null, error: 'not_eligible' as const, reason: eligibility.reason };
      const beforeMs = now();
      let query = client.from('notification_deliveries').update({
        attempt_count: observed.attempt_count + 1,
        last_attempt_at: 'now',
        last_error_code: UNKNOWN,
        last_error_safe_message: null
      }).eq('id', observed.id).eq('state', observed.state).eq('attempt_count', observed.attempt_count);
      query = observed.last_error_code === null ? query.is('last_error_code', null) : query.eq('last_error_code', observed.last_error_code);
      query = observed.last_error_safe_message === null ? query.is('last_error_safe_message', null) : query.eq('last_error_safe_message', observed.last_error_safe_message);
      query = observed.last_attempt_at === null ? query.is('last_attempt_at', null) : query.eq('last_attempt_at', observed.last_attempt_at);
      const { data, error } = await query.select(DELIVERY_COLUMNS).abortSignal(defaultSignal(options.signal)).maybeSingle();
      const afterMs = now();
      if (error) return { claim: null, error: 'claim_failed' as const };
      if (!data) return { claim: null, error: null, reason: 'lost_race' as const };
      const row = data as unknown as NotificationDelivery;
      const clock = validateClaimClock({ beforeMs, afterMs, databaseMs: Date.parse(row.last_attempt_at ?? '') });
      const advanced = observed.last_attempt_at === null || (row.last_attempt_at !== null && timestampStrictlyAfter(row.last_attempt_at, observed.last_attempt_at));
      if (!clock.valid || !advanced || !sameToken({ ...observed, last_error_code: UNKNOWN, last_error_safe_message: null, attempt_count: observed.attempt_count + 1, last_attempt_at: row.last_attempt_at }, row)) {
        return { claim: null, error: 'invalid_clock' as const };
      }
      return { claim: { row, invocation: options.invocation } satisfies ClaimedNotification, error: null };
    },

    async finalize(claim: NotificationDelivery | ClaimedNotification, outcome: AttemptOutcome, providerId?: string, signal?: AbortSignal) {
      const row = 'row' in claim ? claim.row : claim;
      if (row.last_error_code !== UNKNOWN || row.attempt_count < 1 || row.last_attempt_at === null) return { row: null, error: 'invalid_outcome' as const };
      if (outcome.classification === 'accepted' && !validProviderId(providerId)) return { row: null, error: 'invalid_outcome' as const };
      const update = safeOutcome(outcome, row);
      if (!update || (outcome.classification === 'accepted' && update.state !== 'SENT')) return { row: null, error: 'invalid_outcome' as const };
      const values: Database['estimator']['Tables']['notification_deliveries']['Update'] = { state: update.state, last_error_code: update.code, last_error_safe_message: update.message };
      if (update.state === 'SENT') {
        values.provider_message_id = providerId;
        values.sent_at = 'now';
      } else if (update.state === 'EXHAUSTED') {
        values.provider_message_id = null;
        values.sent_at = null;
      } else {
        values.provider_message_id = null;
        values.sent_at = null;
      }
      let query = client.from('notification_deliveries').update(values).eq('id', row.id).eq('state', row.state)
        .eq('attempt_count', row.attempt_count).eq('last_error_code', UNKNOWN).is('last_error_safe_message', null);
      query = row.last_attempt_at === null ? query.is('last_attempt_at', null) : query.eq('last_attempt_at', row.last_attempt_at);
      const { data, error } = await query.select(DELIVERY_COLUMNS).abortSignal(defaultSignal(signal)).maybeSingle();
      if (error) return { row: null, error: 'finalize_failed' as const };
      return { row: data as unknown as NotificationDelivery | null, error: null };
    },

    async exhaustIdle(observed: NotificationDelivery, workerNowMs: number, signal?: AbortSignal) {
      const createdAt = Date.parse(observed.created_at);
      const lastAt = observed.last_attempt_at === null ? null : Date.parse(observed.last_attempt_at);
      const idleUntil = lastAt === null ? createdAt : lastAt;
      const validToken = Number.isFinite(createdAt) && Number.isInteger(observed.attempt_count) && observed.attempt_count >= 0 && observed.attempt_count <= ATTEMPT_LIMIT &&
        ((observed.attempt_count === 0) === (lastAt === null)) && (lastAt === null || Number.isFinite(lastAt) && lastAt >= createdAt) && observed.provider === 'resend' &&
        (observed.type === 'internal_lead' ? observed.lead_id !== null && observed.estimate_id === null : observed.type === 'customer_estimate' && observed.estimate_id !== null && observed.lead_id === null);
      const expired = Number.isFinite(createdAt) && workerNowMs - 7_000 >= createdAt + EXPIRY_MS;
      const capped = observed.attempt_count >= ATTEMPT_LIMIT;
      if (!validToken || (!expired && !capped) || !Number.isFinite(workerNowMs) || workerNowMs - 7_000 < idleUntil + ACTIVE_EXCLUSION_MS || observed.state === 'SENT' || observed.state === 'EXHAUSTED') {
        return { row: null, error: null, reason: 'not_eligible' as const };
      }
      let query = client.from('notification_deliveries').update({ state: 'EXHAUSTED', last_error_code: expired ? 'INTENT_EXPIRED' : 'ATTEMPT_LIMIT', last_error_safe_message: null })
        .eq('id', observed.id).eq('state', observed.state).eq('attempt_count', observed.attempt_count);
      query = observed.last_error_code === null ? query.is('last_error_code', null) : query.eq('last_error_code', observed.last_error_code);
      query = observed.last_error_safe_message === null ? query.is('last_error_safe_message', null) : query.eq('last_error_safe_message', observed.last_error_safe_message);
      query = observed.last_attempt_at === null ? query.is('last_attempt_at', null) : query.eq('last_attempt_at', observed.last_attempt_at);
      const { data, error } = await query.select(DELIVERY_COLUMNS).abortSignal(defaultSignal(signal)).maybeSingle();
      if (error) return { row: null, error: 'maintenance_failed' as const };
      return { row: data as unknown as NotificationDelivery | null, error: null };
    }
  };
}
