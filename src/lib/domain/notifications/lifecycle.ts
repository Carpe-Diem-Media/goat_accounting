export type NotificationState = 'PENDING' | 'FAILED_RETRYABLE' | 'SENT' | 'EXHAUSTED';

/** SQL-shaped notification row consumed by persistence adapters. */
export interface NotificationDelivery {
  id: string;
  estimate_id: string | null;
  lead_id: string | null;
  type: 'internal_lead' | 'customer_estimate';
  state: NotificationState;
  provider: 'resend';
  provider_message_id: string | null;
  recipient_hash: string | null;
  recipient_masked: string | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_safe_message: string | null;
  created_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
}

export interface GuardResult { allowed: boolean; noOp?: boolean; reason?: string }

const transitions: Record<NotificationState, readonly NotificationState[]> = {
  PENDING: ['PENDING', 'SENT', 'FAILED_RETRYABLE', 'EXHAUSTED'],
  FAILED_RETRYABLE: ['FAILED_RETRYABLE', 'SENT', 'EXHAUSTED'],
  SENT: ['SENT'],
  EXHAUSTED: ['EXHAUSTED'],
};
const identityFields: readonly (keyof NotificationDelivery)[] = [
  'id', 'estimate_id', 'lead_id', 'type', 'provider', 'recipient_hash', 'recipient_masked', 'created_at',
];

function validTimestamp(value: string | null): boolean {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

/** Adapters pass canonical PostgREST timestamp strings; token predicates retain the original precision. */
function identical(a: NotificationDelivery, b: NotificationDelivery): boolean {
  return (Object.keys(a) as (keyof NotificationDelivery)[]).every((key) => Object.is(a[key], b[key])) &&
    (Object.keys(b) as (keyof NotificationDelivery)[]).every((key) => Object.is(a[key], b[key]));
}

export function validateNotificationUpdate(
  before: NotificationDelivery | null,
  after: NotificationDelivery | null,
): GuardResult {
  if (after === null) return { allowed: false, reason: 'delete_forbidden' };
  if (!Object.hasOwn(transitions, after.state) || (before && !Object.hasOwn(transitions, before.state))) return { allowed: false, reason: 'invalid_transition' };
  if (before === null) {
    if (after.state !== 'PENDING' || after.attempt_count !== 0 || after.last_attempt_at !== null || after.sent_at !== null) {
      return { allowed: false, reason: 'invalid_insert' };
    }
  } else {
    for (const key of identityFields) {
      if (!Object.is(before[key], after[key])) return { allowed: false, reason: 'identity_changed' };
    }
    if (!Number.isInteger(after.attempt_count) || after.attempt_count > 2_147_483_647 || after.attempt_count < before.attempt_count ||
      after.attempt_count > before.attempt_count + 1 ||
      (after.attempt_count > before.attempt_count && after.last_attempt_at === null)) {
      return { allowed: false, reason: 'invalid_attempt_count' };
    }
    if ((before.state === 'SENT' || before.state === 'EXHAUSTED') && !identical(before, after)) {
      return { allowed: false, reason: 'terminal_immutable' };
    }
    if (!transitions[before.state].includes(after.state)) return { allowed: false, reason: 'invalid_transition' };
  }
  if (!Number.isInteger(after.attempt_count) || after.attempt_count < 0 || after.attempt_count > 2_147_483_647 ||
    (after.recipient_hash !== null && !/^[a-f0-9]{64}$/.test(after.recipient_hash)) ||
    (after.last_error_code !== null && Array.from(after.last_error_code).length > 100) ||
    (after.last_error_safe_message !== null && Array.from(after.last_error_safe_message).length > 500) ||
    !validTimestamp(after.created_at) || !validTimestamp(after.last_attempt_at) || !validTimestamp(after.sent_at)) {
    return { allowed: false, reason: 'invalid_row' };
  }
  if ((after.state === 'SENT') !== (after.sent_at !== null)) return { allowed: false, reason: 'invalid_sent_at' };
  if ((after.type === 'internal_lead' && (after.lead_id === null || after.estimate_id !== null)) ||
    (after.type === 'customer_estimate' && (after.estimate_id === null || after.lead_id !== null))) {
    return { allowed: false, reason: 'invalid_parent' };
  }
  return { allowed: true, noOp: before !== null && identical(before, after) && (after.state === 'SENT' || after.state === 'EXHAUSTED') };
}

const ACTIVE_CLAIM_MS = 60_000;
const CLOCK_MARGIN_MS = 7_000;
const SEND_BUDGET_MS = 5_000;
const EXPIRY_MS = 23 * 60 * 60 * 1000;
const backoffMs = [60_000, 120_000, 240_000, 480_000] as const;
const reconciliationCodes = new Set(['ATTEMPT_OUTCOME_UNKNOWN', 'PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR', 'RETRY_AFTER_INVALID', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_CONFLICT_UNKNOWN']);
const allowlistedCodes = new Set([...reconciliationCodes, 'PROVIDER_ACCEPTED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TRANSIENT', 'PROVIDER_AUTH_REJECTED', 'PAYLOAD_CONFLICT', 'PROVIDER_REJECTED', 'PROVIDER_CONFLICT_UNKNOWN']);

type ClaimReason = 'eligible' | 'terminal' | 'invalid_row' | 'invalid_clock' | 'attempt_limit' |
  'wrong_invocation' | 'claim_active' | 'backoff' | 'provider_delay' | 'retry_metadata_invalid' |
  'reconciliation_required' | 'expired';
export type ClaimEligibility = { eligible: true; reason: 'eligible'; nextEligibleAt: number; expiresAt: number } |
  { eligible: false; reason: ClaimReason; nextEligibleAt: number | null; expiresAt: number | null };

export function assessClaimEligibility(
  row: NotificationDelivery,
  workerNowMs: number,
  invocation: 'initial' | 'manual',
  providerReconciled = false,
): ClaimEligibility {
  const created = Date.parse(row.created_at);
  const expiresAt = created + EXPIRY_MS;
  const denied = (reason: ClaimReason, nextEligibleAt: number | null = null): ClaimEligibility => ({ eligible: false, reason, nextEligibleAt, expiresAt: Number.isFinite(expiresAt) ? expiresAt : null });
  if (![workerNowMs, created].every(Number.isFinite) || !validTimestamp(row.last_attempt_at)) return denied('invalid_clock');
  if (!Object.hasOwn(transitions, row.state) || row.provider !== 'resend' || !Number.isInteger(row.attempt_count) || row.attempt_count < 0 || row.attempt_count > 5 ||
    ((row.attempt_count === 0) !== (row.last_attempt_at === null)) ||
    (row.type === 'internal_lead' ? row.lead_id === null || row.estimate_id !== null : row.type === 'customer_estimate' ? row.estimate_id === null || row.lead_id !== null : true) ||
    (row.recipient_hash !== null && !/^[a-f0-9]{64}$/.test(row.recipient_hash)) ||
    (row.last_error_code !== null && (!allowlistedCodes.has(row.last_error_code) || Array.from(row.last_error_code).length > 100)) ||
    (row.last_error_safe_message !== null && (Array.from(row.last_error_safe_message).length > 500 || !['PROVIDER_RATE_LIMITED', 'PROVIDER_TRANSIENT'].includes(row.last_error_code ?? '')))) return denied('invalid_row');
  if (row.state === 'SENT' || row.state === 'EXHAUSTED') return denied('terminal');
  if (row.attempt_count >= 5) return denied('attempt_limit');
  if ((invocation === 'initial' && row.attempt_count !== 0)) return denied('wrong_invocation');

  let nextEligibleAt = created;
  if (row.attempt_count > 0) {
    const lastAttempt = Date.parse(row.last_attempt_at!);
    if (!Number.isFinite(lastAttempt) || lastAttempt < created) return denied('invalid_row');
    const minimumDelay = Math.max(ACTIVE_CLAIM_MS, backoffMs[Math.min(row.attempt_count - 1, backoffMs.length - 1)]);
    nextEligibleAt = Math.max(nextEligibleAt, lastAttempt + minimumDelay);
    if ((row.last_error_code === null || reconciliationCodes.has(row.last_error_code)) && !providerReconciled) return denied('reconciliation_required', nextEligibleAt);
    if (row.last_error_safe_message !== null) {
      const providerDeadline = parseRetryDeadlineMessage(row.last_error_safe_message);
      if (providerDeadline === null) return denied('retry_metadata_invalid', nextEligibleAt);
      nextEligibleAt = Math.max(nextEligibleAt, providerDeadline);
    }
  }
  if (workerNowMs < created) return denied('invalid_clock');
  // Only reclaims need the exclusion/backoff margin. A newly committed intent can be sent immediately.
  if (row.attempt_count > 0 && workerNowMs - CLOCK_MARGIN_MS < nextEligibleAt) return denied(row.attempt_count > 0 && workerNowMs - CLOCK_MARGIN_MS < Date.parse(row.last_attempt_at!) + ACTIVE_CLAIM_MS ? 'claim_active' : 'backoff', nextEligibleAt);
  if (workerNowMs + CLOCK_MARGIN_MS + SEND_BUDGET_MS >= expiresAt) return denied('expired', nextEligibleAt);
  return { eligible: true, reason: 'eligible', nextEligibleAt, expiresAt };
}

export function validateClaimClock(input: { beforeMs: number; afterMs: number; databaseMs: number; previousAttemptMs?: number }): { valid: boolean } {
  const { beforeMs, afterMs, databaseMs, previousAttemptMs } = input;
  return { valid: [beforeMs, afterMs, databaseMs].every(Number.isFinite) && afterMs >= beforeMs &&
    afterMs - beforeMs <= 2_000 && databaseMs >= beforeMs - 5_000 && databaseMs <= afterMs + 5_000 &&
    (previousAttemptMs === undefined || (Number.isFinite(previousAttemptMs) && databaseMs > previousAttemptMs)) };
}

export function buildRetryDeadlineMessage(deadlineMs: number): string {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0 || !Number.isFinite(new Date(deadlineMs).getTime())) {
    throw new RangeError('Invalid retry deadline');
  }
  return `Retry not before ${new Date(deadlineMs).toISOString()}.`;
}

const retryMessagePattern = /^Retry not before (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\.$/;
export function parseRetryDeadlineMessage(message: string): number | null {
  const match = retryMessagePattern.exec(message);
  if (!match) return null;
  const parsed = Date.parse(match[1]);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === match[1] ? parsed : null;
}

export type AttemptOutcomeInput =
  | { kind: 'timeout' }
  | { kind: 'network_error' }
  | { kind: 'http'; status: number; receivedAtMs?: number; retryAfter?: string | null; errorCode?: string; validAcceptance?: boolean };
export interface AttemptOutcome {
  classification: 'retryable' | 'permanent' | 'uncertain' | 'accepted';
  code: string;
  retryNotBefore: number | null;
  reconciliationRequired: boolean;
}

function parseRetryAfter(value: string, receivedAtMs: number): number | null {
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    const deadline = receivedAtMs + seconds * 1000 + CLOCK_MARGIN_MS;
    return Number.isSafeInteger(seconds) && Number.isSafeInteger(deadline) ? deadline : null;
  }
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return null;
  const date = Date.parse(value);
  const deadline = date + CLOCK_MARGIN_MS;
  return Number.isSafeInteger(date) && Number.isSafeInteger(deadline) ? deadline : null;
}

export function classifyAttemptOutcome(input: AttemptOutcomeInput): AttemptOutcome {
  const uncertain = (code: string): AttemptOutcome => ({ classification: 'uncertain', code, retryNotBefore: null, reconciliationRequired: true });
  if (input.kind === 'timeout' || input.kind === 'network_error') return uncertain(input.kind === 'timeout' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR');
  const { status } = input;
  if (status >= 200 && status < 300) return input.validAcceptance
    ? { classification: 'accepted', code: 'PROVIDER_ACCEPTED', retryNotBefore: null, reconciliationRequired: false }
    : uncertain('PROVIDER_RESPONSE_INVALID');
  const concurrentConflict = status === 409 && input.errorCode === 'concurrent_idempotent_requests';
  const transient = status === 429 || (status >= 500 && status < 600) || concurrentConflict;
  if (transient) {
    if (input.retryAfter !== undefined && input.retryAfter !== null) {
      if (input.receivedAtMs === undefined || !Number.isFinite(input.receivedAtMs)) return uncertain('RETRY_AFTER_INVALID');
      const deadline = parseRetryAfter(input.retryAfter, input.receivedAtMs);
      if (deadline === null) return uncertain('RETRY_AFTER_INVALID');
      return { classification: 'retryable', code: status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_TRANSIENT', retryNotBefore: deadline, reconciliationRequired: false };
    }
    return { classification: 'retryable', code: status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_TRANSIENT', retryNotBefore: null, reconciliationRequired: false };
  }
  if (status === 409 && input.errorCode !== 'invalid_idempotent_request') return uncertain('PROVIDER_CONFLICT_UNKNOWN');
  if (status >= 400 && status < 500) return { classification: 'permanent', code: status === 401 || status === 403 ? 'PROVIDER_AUTH_REJECTED' : status === 409 ? 'PAYLOAD_CONFLICT' : 'PROVIDER_REJECTED', retryNotBefore: null, reconciliationRequired: false };
  return uncertain('PROVIDER_RESPONSE_INVALID');
}
