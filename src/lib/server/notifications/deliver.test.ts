import { describe, expect, test } from 'bun:test';
import type { NotificationDelivery } from '../../domain/notifications/lifecycle';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';
import { calculateEstimate } from '../../domain/estimator/estimate';
import type { NotificationContext } from '../supabase/repositories/notifications';
import { contentDigest, type EstimateMailBindings, type MailFetch } from '../email/estimate-mailer';
import { deliverContactNotifications, deliverNotificationById, type DeliveryOptions } from './deliver';

const leadId = '40000000-0000-4000-8000-000000000001', estimateId = '40000000-0000-4000-8000-000000000002';
const scenario = CANONICAL_PRICING_TEST_CORPUS.find((item) => item.id === 'simple-current-sole-proprietor')!;
const calculation = calculateEstimate(scenario.answers, TEST_PRICING_MODEL);
const content = { disclaimer: 'TEST-ONLY disclaimer', contactName: 'TEST-ONLY Goat', contactEmail: 'test@example.com', approvalReference: 'TEST-ONLY', publicOrigin: 'https://example.test' };
const id1 = '40000000-0000-4000-8000-000000000011', id2 = '40000000-0000-4000-8000-000000000012';
const delivery = (id: string, type: NotificationDelivery['type']): NotificationDelivery => ({ id, estimate_id: type === 'customer_estimate' ? estimateId : null, lead_id: type === 'internal_lead' ? leadId : null, type, state: 'PENDING', provider: 'resend', provider_message_id: null, recipient_hash: null, recipient_masked: null, attempt_count: 0, last_error_code: null, last_error_safe_message: null, created_at: '2026-11-09T10:00:00.000Z', last_attempt_at: null, sent_at: null });
const internal = delivery(id1, 'internal_lead'), customer = delivery(id2, 'customer_estimate');
const context = { lead: { id: leadId, estimate_id: estimateId, full_name: 'Ada Lovelace', email: 'ada@example.com', phone: null, business_name: null, preferred_contact_method: 'email', requested_contact: true, requested_estimate_email: false }, estimate: { id: estimateId, public_ref: 'b'.repeat(32), calculator_type: scenario.answers.calculatorType, state: 'VALID', pricing_model_id: 'pricing', pricing_model_version: TEST_PRICING_MODEL.version, engine_version: TEST_PRICING_MODEL.engineVersion, answers_snapshot: scenario.answers, calculation_snapshot: calculation, catchup_min_cents: calculation.catchup.minCents, catchup_max_cents: calculation.catchup.maxCents, ongoing_min_cents: calculation.ongoing.minCents, ongoing_max_cents: calculation.ongoing.maxCents, confidence: calculation.confidence, manual_review_required: calculation.manualReviewRequired, review_reasons: calculation.reviewReasons, review_flag_codes: [], free_text: null, created_at: '2026-11-09T10:00:00.000Z' }, deliveries: [internal, customer] } as unknown as NotificationContext;
const accepted = { ...internal, state: 'SENT' as const, attempt_count: 1, last_attempt_at: '2026-11-09T10:00:01.000Z', last_error_code: 'PROVIDER_ACCEPTED', sent_at: '2026-11-09T10:00:02.000Z', provider_message_id: '40000000-0000-4000-8000-000000000099' };
const fetchOk: MailFetch = async () => new Response(JSON.stringify({ id: '40000000-0000-4000-8000-000000000099' }), { status: 200 });
async function setup(requestedEstimateEmail = false) {
  const bindings: EstimateMailBindings = { ESTIMATE_NOTIFICATIONS_ENABLED: 'true', ESTIMATE_EMAIL_CONTENT: JSON.stringify(content), ESTIMATE_EMAIL_CONTENT_SHA256: await contentDigest(content), ESTIMATE_EMAIL_FROM: 'sender@example.com', ESTIMATE_EMAIL_INTERNAL_TO: 'internal@example.com', RESEND_API_KEY: 'test-key' };
  const calls = { claim: 0, finalize: 0, fetch: 0, exhaustIdle: 0 };
  const repo = { loadContactContext: async () => ({ context: { ...context, lead: { ...context.lead, requested_estimate_email: requestedEstimateEmail } }, error: null }), loadContextForDelivery: async () => ({ context, error: null }), exhaustIdle: async () => { calls.exhaustIdle++; return { row: null, error: null }; }, claim: async (row: NotificationDelivery, claimOptions: { invocation: 'initial' | 'manual' }) => { calls.claim++; return { claim: { row: { ...row, attempt_count: 1, last_attempt_at: '2026-11-09T10:00:01.000Z', last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN', last_error_safe_message: null }, invocation: claimOptions.invocation }, error: null }; }, finalize: async (_claim: unknown, attempt: { classification: string; code: string }) => { calls.finalize++; return { row: { ...accepted, state: attempt.classification === 'accepted' ? 'SENT' : 'FAILED_RETRYABLE', last_error_code: attempt.code }, error: null }; } } as unknown as DeliveryOptions['repository'];
  const fetch: MailFetch = async (...args) => { calls.fetch++; return fetchOk(...args); };
  return { bindings, calls, options: { repository: repo, testOnly: true, fetch, now: () => Date.parse(internal.created_at) + 60_000 } satisfies DeliveryOptions };
}

describe('contact notification delivery', () => {
  test('dispatches the initial selected intent from the saved snapshot', async () => {
    const setupData = await setup();
    const result = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, setupData.options);
    expect(result.outcomes).toEqual([{ deliveryId: id1, code: 'PROVIDER_ACCEPTED', state: 'SENT' }]);
    expect(setupData.calls).toEqual({ claim: 1, finalize: 1, fetch: 1, exhaustIdle: 0 });
  });
  test('never claims or sends an unselected delivery type', async () => {
    const setupData = await setup();
    await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, setupData.options);
    expect(setupData.calls.claim).toBe(1);
    expect(setupData.calls.fetch).toBe(1);
  });
  test('concurrent contact retries use the atomic claim as a send barrier', async () => {
    const setupData = await setup();
    let claimed = false;
    setupData.options.repository.claim = async (row: NotificationDelivery) => {
      if (claimed) return { claim: null, error: null, reason: 'lost_race' as const };
      claimed = true;
      return { claim: { row: { ...row, attempt_count: 1, last_attempt_at: '2026-11-09T10:00:01.000Z', last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN', last_error_safe_message: null }, invocation: 'initial' as const }, error: null };
    };
    await Promise.all([
      deliverContactNotifications({ leadId, estimateId }, setupData.bindings, setupData.options),
      deliverContactNotifications({ leadId, estimateId }, setupData.bindings, setupData.options)
    ]);
    expect(setupData.calls.fetch).toBe(1);
  });
  test('an uncertain provider response never becomes SENT', async () => {
    const setupData = await setup();
    setupData.options.fetch = async () => { throw new Error('network details must not escape'); };
    const result = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, setupData.options);
    expect(result.outcomes).toEqual([{ deliveryId: id1, code: 'PROVIDER_NETWORK_ERROR', state: 'FAILED_RETRYABLE' }]);
  });
  test('disabled configuration leaves the persisted intent untouched', async () => {
    const setupData = await setup();
    const result = await deliverContactNotifications({ leadId, estimateId }, { ...setupData.bindings, ESTIMATE_NOTIFICATIONS_ENABLED: 'false' }, setupData.options);
    expect(result.status).toBe('disabled');
    expect(setupData.calls).toEqual({ claim: 0, finalize: 0, fetch: 0, exhaustIdle: 0 });
  });
  test('manual dispatch claims only the requested existing intent', async () => {
    const setupData = await setup();
    const invocations: string[] = [];
    const claim = setupData.options.repository.claim;
    setupData.options.repository.claim = async (row, claimOptions) => { invocations.push(claimOptions.invocation); return claim(row, claimOptions); };
    const result = await deliverNotificationById(id1, setupData.bindings, { ...setupData.options, providerReconciled: true, reconciledToken: { attemptCount: 0, lastAttemptAt: null, lastErrorCode: null, lastErrorSafeMessage: null } });
    expect(result.outcomes[0]?.state).toBe('SENT');
    expect(invocations).toEqual(['manual']);
    expect(setupData.calls.fetch).toBe(1);
  });
  test('manual reconciliation cannot authorize a changed attempt token', async () => {
    const setupData = await setup();
    const result = await deliverNotificationById(id1, setupData.bindings, { ...setupData.options, providerReconciled: true,
      reconciledToken: { attemptCount: 1, lastAttemptAt: '2026-11-09T10:00:00.000Z', lastErrorCode: 'ATTEMPT_OUTCOME_UNKNOWN', lastErrorSafeMessage: null } });
    expect(result.code).toBe('reconciliation_stale');
    expect(setupData.calls.exhaustIdle).toBe(0);
    expect(setupData.calls.claim).toBe(0);
    expect(setupData.calls.fetch).toBe(0);
  });
  test('a repository that ignores abort cannot hold the request past budget', async () => {
    const setupData = await setup();
    setupData.options.repository.loadContactContext = () => new Promise(() => {});
    const started = performance.now();
    const result = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, { ...setupData.options, budgetMs: 15 });
    expect(performance.now() - started).toBeLessThan(250);
    expect(result.code).toBe('budget_exhausted');
  });
  test('rechecks intent expiry before provider HTTP', async () => {
    const setupData = await setup();
    const expiry = Date.parse(internal.created_at) + 23 * 60 * 60 * 1000;
    const result = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, { ...setupData.options, now: () => expiry - 12_000 });
    expect(result.outcomes).toEqual([{ deliveryId: id1, code: 'intent_expired' }]);
    expect(setupData.calls.fetch).toBe(0);
    expect(setupData.calls.finalize).toBe(0);
    const clockAnomaly = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, { ...setupData.options, now: () => Date.parse(internal.created_at) - 1 });
    expect(clockAnomaly.outcomes).toEqual([{ deliveryId: id1, code: 'intent_expired' }]);
    expect(setupData.calls.fetch).toBe(0);
  });
  test('reports stale finalization as unknown instead of accepted', async () => {
    const setupData = await setup();
    setupData.options.repository.finalize = async () => ({ row: null, error: null });
    const result = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, setupData.options);
    expect(result.outcomes).toEqual([{ deliveryId: id1, code: 'finalize_stale' }]);
  });
  test('reports early lookup and configuration outcomes safely', async () => {
    const setupData = await setup();
    const reports: Array<{ deliveryId?: string; code: string }> = [];
    setupData.options.repository.loadContactContext = async () => ({ context: null, error: 'lookup_failed' });
    const result = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, { ...setupData.options, report: (item) => reports.push(item) });
    expect(result.code).toBe('lookup_failed');
    expect(reports).toEqual([{ code: 'lookup_failed' }]);
    setupData.options.repository.loadContactContext = async () => ({ context, error: null });
    reports.length = 0;
    const badConfig = await deliverContactNotifications({ leadId, estimateId }, { ...setupData.bindings, ESTIMATE_EMAIL_CONTENT_SHA256: '0'.repeat(64) }, { ...setupData.options, report: (item) => reports.push(item) });
    expect(badConfig.status).toBe('configuration_error');
    expect(reports).toEqual([{ code: 'configuration_error' }]);
  });
  test('manual disabled configuration does not run exhaustion maintenance', async () => {
    const setupData = await setup();
    const result = await deliverNotificationById(id1, { ...setupData.bindings, ESTIMATE_NOTIFICATIONS_ENABLED: 'false' }, setupData.options);
    expect(result.status).toBe('disabled');
    expect(setupData.calls.exhaustIdle).toBe(0);
  });
  test('an already-aborted caller starts no repository work', async () => {
    const setupData = await setup();
    const controller = new AbortController();
    controller.abort();
    const result = await deliverContactNotifications({ leadId, estimateId }, setupData.bindings, { ...setupData.options, signal: controller.signal });
    expect(result.status).toBe('aborted');
    expect(setupData.calls.claim).toBe(0);
    expect(setupData.calls.fetch).toBe(0);
  });
});

test('both selected emails start concurrently and retain saved historic amounts', async () => {
 const data = await setup(true);
 let release!: () => void; const bothStarted = new Promise<void>(resolve => { release = resolve; });
 const payloads: Array<{ html: string; text: string }> = [];
 data.options.fetch = async (_input, init) => {
  payloads.push(JSON.parse(String(init?.body)));
  if (payloads.length === 2) release();
  await bothStarted;
  return Response.json({ id: '40000000-0000-4000-8000-000000000099' });
 };
 const result = await deliverContactNotifications({ leadId, estimateId }, data.bindings, data.options);
 expect(result.outcomes).toHaveLength(2); expect(result.outcomes.every(item => item.state === 'SENT')).toBe(true);
 expect(payloads).toHaveLength(2);
 expect(payloads[0].text).toContain(TEST_PRICING_MODEL.version);
 const savedMinimum = Math.floor(calculation.ongoing.minCents / 100).toLocaleString('en-US');
 for (const payload of payloads) expect(payload.text).toContain('R ' + savedMinimum);
});
