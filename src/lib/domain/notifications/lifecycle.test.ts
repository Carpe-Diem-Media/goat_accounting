import { describe, expect, test } from 'bun:test';
import {
  assessClaimEligibility,
  buildRetryDeadlineMessage,
  classifyAttemptOutcome,
  parseRetryDeadlineMessage,
  validateClaimClock,
  validateNotificationUpdate,
  type NotificationDelivery,
} from './lifecycle';

const base = (): NotificationDelivery => ({
  id: 'delivery-1', estimate_id: null, lead_id: 'lead-1', type: 'internal_lead',
  state: 'PENDING', provider: 'resend', provider_message_id: null,
  recipient_hash: null, recipient_masked: null, attempt_count: 0,
  last_error_code: null, last_error_safe_message: null,
  created_at: '2026-11-01T00:00:00.000Z', last_attempt_at: null, sent_at: null,
});

const states = ['PENDING', 'FAILED_RETRYABLE', 'SENT', 'EXHAUSTED'] as const;
const allowed: Record<string, string[]> = {
  PENDING: ['PENDING', 'FAILED_RETRYABLE', 'SENT', 'EXHAUSTED'],
  FAILED_RETRYABLE: ['FAILED_RETRYABLE', 'SENT', 'EXHAUSTED'],
  SENT: ['SENT'], EXHAUSTED: ['EXHAUSTED'],
};

describe('notification SQL lifecycle guards', () => {
  test('matches all sixteen state transitions, including terminal identical no-ops', () => {
    for (const from of states) for (const to of states) {
      const before = { ...base(), state: from, ...(from === 'SENT' ? { sent_at: '2026-11-01T00:00:00.000Z' } : {}) };
      const after = { ...before, state: to, ...(to === 'SENT' ? { sent_at: '2026-11-01T00:00:00.000Z' } : { sent_at: null }) };
      expect(validateNotificationUpdate(before, after).allowed).toBe(allowed[from].includes(to));
      if (from === to && (from === 'SENT' || from === 'EXHAUSTED')) {
        expect(validateNotificationUpdate(before, after).noOp).toBe(true);
      }
    }
  });

  test('enforces insert defaults, identity, attempt, timestamp and SENT invariants', () => {
    const row = base();
    expect(validateNotificationUpdate(null, row).allowed).toBe(true);
    expect(validateNotificationUpdate(null, { ...row, attempt_count: 1 }).allowed).toBe(false);
    for (const field of ['id', 'estimate_id', 'lead_id', 'type', 'provider', 'recipient_hash', 'recipient_masked', 'created_at'] as const) {
      const changed = { ...row, [field]: field === 'estimate_id' ? 'estimate-2' : field === 'recipient_hash' ? 'a'.repeat(64) : 'changed' };
      expect(validateNotificationUpdate(row, changed).reason).toBe('identity_changed');
    }
    expect(validateNotificationUpdate(row, null).reason).toBe('delete_forbidden');
    expect(validateNotificationUpdate(row, { ...row, attempt_count: -1 }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, attempt_count: 2, last_attempt_at: '2026-11-01T00:00:00Z' }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, attempt_count: 0, last_attempt_at: 'bad timestamp' }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, type: 'customer_estimate', estimate_id: 'estimate-1', lead_id: null }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, attempt_count: 2147483648, last_attempt_at: '2026-11-01T00:00:00Z' }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, recipient_hash: null, id: row.id }).allowed).toBe(true);
    expect(validateNotificationUpdate(row, { ...row, attempt_count: 1 }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, attempt_count: 1, last_attempt_at: '2026-11-01T00:00:00Z' }).allowed).toBe(true);
    expect(validateNotificationUpdate({ ...row, state: 'SENT', sent_at: '2026-11-01T00:00:00Z' }, { ...row, state: 'SENT', sent_at: '2026-11-01T00:00:00Z', last_error_code: 'changed' }).reason).toBe('terminal_immutable');
    expect(validateNotificationUpdate(row, { ...row, recipient_hash: 'bad' }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, last_error_code: 'x'.repeat(101) }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, last_error_safe_message: 'x'.repeat(501) }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, state: 'SENT', sent_at: null }).allowed).toBe(false);
    expect(validateNotificationUpdate(row, { ...row, state: 'SENT', sent_at: '2026-11-01T00:00:00Z' }).allowed).toBe(true);
  });

  test('rejects unrecognized runtime states without throwing', () => {
    const row = { ...base(), state: 'BROKEN' } as unknown as NotificationDelivery;
    expect(assessClaimEligibility(row, Date.parse('2026-11-01T00:01:00Z'), 'initial').eligible).toBe(false);
    expect(validateNotificationUpdate(row, base()).allowed).toBe(false);
  });

  test('allows a fresh initial intent without applying a reclaim delay', () => {
    const row = base();
    expect(assessClaimEligibility(row, Date.parse(row.created_at), 'initial').eligible).toBe(true);
    expect(assessClaimEligibility(row, Date.parse(row.created_at) - 1, 'initial').eligible).toBe(false);
  });

  test('only permits initial claims at zero and authorized retries above zero', () => {
    const row = base();
    expect(assessClaimEligibility(row, Date.parse('2026-11-01T00:01:00Z'), 'initial').eligible).toBe(true);
    expect(assessClaimEligibility(row, Date.parse('2026-11-01T00:01:00Z'), 'manual').eligible).toBe(true);
    expect(assessClaimEligibility({ ...row, attempt_count: 1, state: 'FAILED_RETRYABLE', last_attempt_at: '2026-11-01T00:00:00Z' }, Date.parse('2026-11-01T00:02:00Z'), 'initial').reason).toBe('wrong_invocation');
    expect(assessClaimEligibility({ ...row, attempt_count: 1, last_attempt_at: '2026-11-01T00:00:00Z', last_error_code: 'PROVIDER_TRANSIENT' }, Date.parse('2026-11-01T00:02:00Z'), 'manual').eligible).toBe(true);
  });

  test('enforces five-claim cap, four backoffs and claim exclusion boundaries', () => {
    const stamp = '2026-11-01T00:00:00.000Z';
    for (let count = 1; count <= 4; count++) {
      const row = { ...base(), state: 'FAILED_RETRYABLE' as const, attempt_count: count, last_attempt_at: stamp, last_error_code: 'PROVIDER_TRANSIENT' };
      const deadline = Date.parse(stamp) + [60, 120, 240, 480][count - 1] * 1000;
      expect(assessClaimEligibility(row, deadline - 7000, 'manual').eligible).toBe(false);
      expect(assessClaimEligibility(row, deadline + 7000, 'manual').eligible).toBe(true);
    }
    const capped = { ...base(), state: 'FAILED_RETRYABLE' as const, attempt_count: 5, last_attempt_at: stamp };
    expect(assessClaimEligibility(capped, Date.parse('2026-11-02T00:00:00Z'), 'manual').reason).toBe('attempt_limit');
    expect(assessClaimEligibility({ ...base(), attempt_count: 1, state: 'FAILED_RETRYABLE', last_attempt_at: stamp, last_error_code: 'PROVIDER_TRANSIENT' }, Date.parse(stamp) + 59999, 'manual').reason).toBe('claim_active');
  });

  test('applies 23-hour expiry with seven-second clock margin and five-second send budget', () => {
    const row = base();
    const expiry = Date.parse(row.created_at) + 23 * 60 * 60 * 1000;
    expect(assessClaimEligibility(row, expiry - 12001, 'initial').eligible).toBe(true);
    expect(assessClaimEligibility(row, expiry - 12000, 'initial').eligible).toBe(false);
    expect(assessClaimEligibility(row, Number.NaN, 'initial').reason).toBe('invalid_clock');
  });

  test('validates claim clock round trip and timestamp consistency', () => {
    expect(validateClaimClock({ beforeMs: 1000, afterMs: 2000, databaseMs: 1500, previousAttemptMs: 1400 }).valid).toBe(true);
    expect(validateClaimClock({ beforeMs: 1000, afterMs: 2000, databaseMs: 1400, previousAttemptMs: 1400 }).valid).toBe(false);
    expect(validateClaimClock({ beforeMs: 1000, afterMs: 2000, databaseMs: 7001 }).valid).toBe(false);
    expect(validateClaimClock({ beforeMs: 1000, afterMs: 2000, databaseMs: -4001 }).valid).toBe(false);
    expect(validateClaimClock({ beforeMs: 1000, afterMs: 500, databaseMs: 700 }).valid).toBe(false);
    expect(validateClaimClock({ beforeMs: 1000, afterMs: 4000, databaseMs: 2000 }).valid).toBe(false);
    expect(validateClaimClock({ beforeMs: 1000, afterMs: 2000, databaseMs: Number.NaN }).valid).toBe(false);
  });

  test('stores and strictly parses generated retry deadlines', () => {
    const message = buildRetryDeadlineMessage(Date.parse('2026-11-01T00:00:00Z'));
    expect(message).toBe('Retry not before 2026-11-01T00:00:00.000Z.');
    expect(parseRetryDeadlineMessage(message)).toBe(Date.parse('2026-11-01T00:00:00Z'));
    expect(parseRetryDeadlineMessage('Retry not before 2026-11-01T00:00:00Z.')).toBeNull();
    expect(parseRetryDeadlineMessage('provider says retry later')).toBeNull();
  });

  test('computes conservative Retry-After deadlines for seconds and dates', () => {
    const now = Date.parse('2026-11-01T00:00:00Z');
    expect(classifyAttemptOutcome({ kind: 'http', status: 429, retryAfter: '30', receivedAtMs: now }).retryNotBefore).toBe(now + 37000);
    expect(classifyAttemptOutcome({ kind: 'http', status: 503, retryAfter: 'Sun, 01 Nov 2026 00:02:00 GMT', receivedAtMs: now }).retryNotBefore).toBe(Date.parse('2026-11-01T00:02:07Z'));
  });

  test('classifies transient, permanent and uncertain outcomes safely', () => {
    expect(classifyAttemptOutcome({ kind: 'http', status: 503, receivedAtMs: 1 }).classification).toBe('retryable');
    expect(classifyAttemptOutcome({ kind: 'http', status: 600 }).classification).toBe('uncertain');
    expect(classifyAttemptOutcome({ kind: 'http', status: 409, errorCode: 'concurrent_idempotent_requests', receivedAtMs: 1 }).classification).toBe('retryable');
    expect(classifyAttemptOutcome({ kind: 'http', status: 409, errorCode: 'invalid_idempotent_request', receivedAtMs: 1 }).classification).toBe('permanent');
    expect(classifyAttemptOutcome({ kind: 'http', status: 401, receivedAtMs: 1 }).classification).toBe('permanent');
    expect(classifyAttemptOutcome({ kind: 'http', status: 409, errorCode: 'other' }).classification).toBe('uncertain');
    expect(classifyAttemptOutcome({ kind: 'timeout' }).classification).toBe('uncertain');
    expect(classifyAttemptOutcome({ kind: 'http', status: 200, validAcceptance: false }).classification).toBe('uncertain');
  });

  test('holds malformed retry metadata and unknown outcomes until explicit reconciliation', () => {
    const result = classifyAttemptOutcome({ kind: 'http', status: 429, retryAfter: 'later-ish', receivedAtMs: 1000 });
    expect(result.classification).toBe('uncertain');
    expect(classifyAttemptOutcome({ kind: 'http', status: 429, retryAfter: '999999999999999999999999', receivedAtMs: 1000 }).classification).toBe('uncertain');
    expect(classifyAttemptOutcome({ kind: 'http', status: 429, retryAfter: 'tomorrow', receivedAtMs: 1000 }).classification).toBe('uncertain');
    expect(classifyAttemptOutcome({ kind: 'http', status: 429, retryAfter: 'Sun, 32 Nov 2026 00:00:00 GMT', receivedAtMs: 1000 }).classification).toBe('uncertain');
    const row = { ...base(), last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN' };
    expect(assessClaimEligibility({ ...row, attempt_count: 1, last_attempt_at: '2026-11-01T00:00:00Z' }, Date.parse('2026-11-01T00:05:00Z'), 'manual').reason).toBe('reconciliation_required');
    expect(assessClaimEligibility({ ...row, attempt_count: 1, last_attempt_at: '2026-11-01T00:00:00Z' }, Date.parse('2026-11-01T00:05:00Z'), 'manual', true).eligible).toBe(true);
  });
});
