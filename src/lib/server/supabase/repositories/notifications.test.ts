import { describe, expect, test } from 'bun:test';
import { createNotificationsRepository } from './notifications';
import type { NotificationDelivery } from '../../../domain/notifications/lifecycle';

const row: NotificationDelivery = {
  id: '40000000-0000-4000-8000-000000000001', estimate_id: null,
  lead_id: '40000000-0000-4000-8000-000000000002', type: 'internal_lead', state: 'PENDING',
  provider: 'resend', provider_message_id: null, recipient_hash: null, recipient_masked: null,
  attempt_count: 0, last_error_code: null, last_error_safe_message: null,
  created_at: '2026-11-09T08:00:00.000Z', last_attempt_at: null, sent_at: null
};

function queryMock(responses: unknown[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let responseIndex = 0;
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['from', 'select', 'eq', 'is', 'lt', 'gt', 'order', 'limit', 'update', 'abortSignal', 'maybeSingle', 'single']) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === 'maybeSingle' || method === 'single') return Promise.resolve(responses[responseIndex++]);
      return query;
    };
  }
  query.then = ((resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(responses[responseIndex++]).then(resolve, reject)) as unknown as (...args: unknown[]) => unknown;
  const client = { from: query.from };
  return { client, calls };
}

describe('notification repository claims', () => {
  test('claim matches the full observed token and retry metadata before returning ownership', async () => {
    const claimed = { ...row, attempt_count: 1, last_attempt_at: '2026-11-09T09:00:00.000Z', last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN' };
    const mock = queryMock([{ data: claimed, error: null }]);
    let calls = 0;
    const repo = createNotificationsRepository(mock.client as never, () => { calls += 1; return Date.parse('2026-11-09T09:00:00.000Z'); });

    const result = await repo.claim(row, { invocation: 'initial' });

    expect(result.claim?.row).toEqual(claimed);
    expect(mock.calls.filter((call) => call.method === 'eq' || call.method === 'is').map((call) => call.args.slice(0, 2))).toEqual([
      ['id', row.id], ['state', row.state], ['attempt_count', row.attempt_count],
      ['last_error_code', null], ['last_error_safe_message', null], ['last_attempt_at', null]
    ]);
    expect(mock.calls.some((call) => call.method === 'update' && (call.args[0] as Record<string, unknown>).last_attempt_at === 'now')).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
  });


  test('a lost claim response never returns an owner', async () => {
    const mock = queryMock([{ data: null, error: { code: '57014', message: 'private database detail' } }]);
    const repo = createNotificationsRepository(mock.client as never, () => Date.parse('2026-11-09T09:00:00.000Z'));

    const result = await repo.claim(row, { invocation: 'initial' });

    expect(result.claim).toBeNull();
    expect(result.error).toBe('claim_failed');
    expect(JSON.stringify(result)).not.toContain('private database detail');
  });

  test('a claim response outside clock bounds does not grant ownership', async () => {
    const claimed = { ...row, attempt_count: 1, last_attempt_at: '2026-11-09T09:01:00.000Z', last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN' };
    const mock = queryMock([{ data: claimed, error: null }]);
    const repo = createNotificationsRepository(mock.client as never, () => Date.parse('2026-11-09T09:00:00.000Z'));

    const result = await repo.claim(row, { invocation: 'initial' });

    expect(result.claim).toBeNull();
    expect(result.error).toBe('invalid_clock');
  });
});

describe('notification repository finalization', () => {

  test('uncertain fifth claim is finalized as exhausted', async () => {
    const claim = { ...row, attempt_count: 5, last_attempt_at: '2026-11-09T09:00:00.000Z', last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN' };
    const exhausted = { ...claim, state: 'EXHAUSTED' as const, last_error_code: 'PROVIDER_TIMEOUT' };
    const mock = queryMock([{ data: exhausted, error: null }]);
    const repo = createNotificationsRepository(mock.client as never);

    const result = await repo.finalize(claim, { classification: 'uncertain', code: 'PROVIDER_TIMEOUT', retryNotBefore: null, reconciliationRequired: true });

    expect(result.row).toEqual(exhausted);
    expect(mock.calls.find((call) => call.method === 'update')?.args[0]).toMatchObject({ state: 'EXHAUSTED', last_error_code: 'PROVIDER_TIMEOUT' });
  });

  test('finalization requires the claimed token and unknown-outcome marker', async () => {
    const claim = { ...row, attempt_count: 1, last_attempt_at: '2026-11-09T09:00:00.000Z', last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN' };
    const sent = { ...claim, state: 'SENT' as const, last_error_code: null, provider_message_id: '40000000-0000-4000-8000-000000000003', sent_at: 'now' };
    const mock = queryMock([{ data: sent, error: null }]);
    const repo = createNotificationsRepository(mock.client as never);

    const result = await repo.finalize(claim, { classification: 'accepted', code: 'PROVIDER_ACCEPTED', retryNotBefore: null, reconciliationRequired: false }, '40000000-0000-4000-8000-000000000003');

    expect(result.row).toEqual(sent);
    expect(mock.calls.filter((call) => call.method === 'eq' || call.method === 'is').map((call) => call.args.slice(0, 2))).toContainEqual(['last_error_code', 'ATTEMPT_OUTCOME_UNKNOWN']);
    expect(mock.calls.filter((call) => call.method === 'eq' || call.method === 'is').map((call) => call.args.slice(0, 2))).toContainEqual(['attempt_count', 1]);
  });
});

describe('notification context validation', () => {
  const lead = {
    id: '40000000-0000-4000-8000-000000000002', estimate_id: '40000000-0000-4000-8000-000000000007',
    full_name: 'Synthetic Contact', email: 'synthetic@example.invalid', phone: null, business_name: null,
    preferred_contact_method: 'email', requested_contact: true, requested_estimate_email: false
  };
  const estimate = { id: lead.estimate_id, public_ref: 'a'.repeat(32) };
  const intent = { ...row, lead_id: lead.id, estimate_id: null };

  test('loads only the intents selected on the saved lead', async () => {
    const mock = queryMock([
      { data: lead, error: null }, { data: estimate, error: null },
      { data: [intent], error: null }, { data: [], error: null }
    ]);
    const result = await createNotificationsRepository(mock.client as never).loadContactContext({ leadId: lead.id, estimateId: lead.estimate_id });

    expect(result.error).toBeNull();
    expect(result.context?.deliveries).toEqual([intent]);
    expect(mock.calls.some((call) => ['insert', 'update', 'upsert'].includes(call.method))).toBe(false);
  });

  test('blocks all context when a selected intent is missing or duplicated', async () => {
    for (const internalRows of [[], [intent, { ...intent, id: '40000000-0000-4000-8000-000000000004' }]]) {
      const mock = queryMock([
        { data: lead, error: null }, { data: estimate, error: null },
        { data: internalRows, error: null }, { data: [], error: null }
      ]);
      const result = await createNotificationsRepository(mock.client as never).loadContactContext({ leadId: lead.id, estimateId: lead.estimate_id });
      expect(result.context).toBeNull();
      expect(result.error).toBe('context_invalid');
      expect(mock.calls.some((call) => ['insert', 'update', 'upsert'].includes(call.method))).toBe(false);
    }
  });

  test('blocks an unselected delivery and a mismatched parent', async () => {
    const unselected = { ...row, id: '40000000-0000-4000-8000-000000000005', type: 'customer_estimate' as const, lead_id: null, estimate_id: lead.estimate_id };
    const wrongParent = { ...intent, estimate_id: lead.estimate_id };
    for (const [internalRows, customerRows] of [[[intent], [unselected]], [[wrongParent], []]] as const) {
      const mock = queryMock([
        { data: lead, error: null }, { data: estimate, error: null },
        { data: internalRows, error: null }, { data: customerRows, error: null }
      ]);
      const result = await createNotificationsRepository(mock.client as never).loadContactContext({ leadId: lead.id, estimateId: lead.estimate_id });
      expect(result.context).toBeNull();
      expect(result.error).toBe('context_invalid');
    }
  });
});
