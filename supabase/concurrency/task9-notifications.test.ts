import { describe, expect, test } from 'bun:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type { Database } from '../../src/lib/server/supabase/database.types';
import { createNotificationsRepository } from '../../src/lib/server/supabase/repositories/notifications';
import { buildRetryDeadlineMessage, classifyAttemptOutcome, type NotificationDelivery } from '../../src/lib/domain/notifications/lifecycle';

const enabled = Bun.env.GOAT_TASK9_LOCAL_TESTS === '1';
const expectedUrl = 'http://127.0.0.1:57321';
const invocationToken = randomBytes(32).toString('hex');
let invocationAuthorized = false;

const suite = enabled ? describe : describe.skip;
const fixtureEstimateId = '40000000-0000-4000-8000-000000000007';
const selection = 'id, estimate_id, lead_id, type, state, provider, provider_message_id, recipient_hash, recipient_masked, attempt_count, last_error_code, last_error_safe_message, created_at, last_attempt_at, sent_at';

function service(options: { loseResponse?: 'claim' | 'sent-finalization' } = {}) {
  const workdir = '/tmp/goat-task7-contract';
  const container = 'supabase_db_goat-task7-contract-isolated';
  const labels = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.supabase.cli.project" }} {{ index .Config.Labels "com.supabase.cli.workdir" }}', container], { encoding: 'utf8' }).trim();
  if (labels !== 'goat-task7-contract-isolated /tmp/goat-task7-contract') throw new Error('Disposable project/workdir labels do not match.');
  const cluster = execFileSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', 'supabase_admin', '-d', 'postgres', '-c', 'select system_identifier from pg_control_system()'], { encoding: 'utf8' }).trim();
  if (cluster !== '7706037786279415845') throw new Error('Local cluster identity does not match the authorized instance.');
  const marker = execFileSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', 'supabase_admin', '-d', 'postgres', '-c', 'select exists(select 1 from task7_test_authorization.disposable_instance where system_identifier=(select system_identifier from pg_control_system()) and length(token)=64)'], { encoding: 'utf8' }).trim();
  if (marker !== 't') throw new Error('Fresh disposable-instance marker is missing.');
  let status: Record<string, string>;
  try { status = JSON.parse(execFileSync('supabase', ['status', '--workdir', workdir, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch { throw new Error('Verified local Supabase status is unavailable.'); }
  if (status.API_URL !== expectedUrl || !status.SERVICE_ROLE_KEY) throw new Error('Verified local API URL or service key is unavailable.');
  const migrations = execFileSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', 'supabase_admin', '-d', 'postgres', '-c', 'select version from supabase_migrations.schema_migrations order by version'], { encoding: 'utf8' }).trim().split('\n').sort();
  if (migrations.join(',') !== '20261103183011,20261105062524,20261105090000') throw new Error('Local migrations do not match the accepted set.');
  const migrationFiles = readdirSync('supabase/migrations').filter((name) => /^(20261103183011|20261105062524|20261105090000)_.*\.sql$/.test(name));
  if (migrationFiles.length !== 3) throw new Error('Accepted migration files are missing.');
  for (const filename of migrationFiles) {
    const current = createHash('sha256').update(readFileSync(`supabase/migrations/${filename}`)).digest('hex');
    const accepted = createHash('sha256').update(execFileSync('git', ['show', `c9fff68d52b5113a529d6d63589cf04765fb2fd2:supabase/migrations/${filename}`])).digest('hex');
    if (current !== accepted) throw new Error('Migration bytes differ from the accepted implementation base.');
  }
  // A new invocation must replace and then match the per-cluster authorization nonce.
  // Explicit local-test opt-in, pinned identity and migration checks above authorize this test-only write.
  if (!invocationAuthorized) {
    execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], {
      input: `UPDATE task7_test_authorization.disposable_instance SET token='${invocationToken}' WHERE system_identifier=7706037786279415845;`,
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
    invocationAuthorized = true;
  }
  const authorized = execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-At', '-U', 'supabase_admin', '-d', 'postgres'], {
    input: `SELECT EXISTS(SELECT 1 FROM task7_test_authorization.disposable_instance WHERE token='${invocationToken}' AND system_identifier=(SELECT system_identifier FROM pg_control_system()));`,
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
  if (authorized !== 't') throw new Error('Current invocation does not own the disposable-instance marker.');
  const global = options.loseResponse ? { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    const shouldDrop = init?.method === 'PATCH' && requestUrl.includes('/rest/v1/notification_deliveries') && !dropped &&
      (options.loseResponse === 'claim' ? body.includes('ATTEMPT_OUTCOME_UNKNOWN') : body.includes('\"SENT\"'));
    if (shouldDrop) {
      dropped = true;
      await response.arrayBuffer();
      throw new Error('Simulated lost PostgREST response.');
    }
    return response;
  } } : undefined;
  let dropped = false;
  return createClient<Database, 'estimator'>(status.API_URL, status.SERVICE_ROLE_KEY, { db: { schema: 'estimator' }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global });
}

async function insertFixture(client: ReturnType<typeof service>, createdAt = new Date(Date.now() - 60 * 60_000).toISOString()) {
  const { data, error } = await client.from('notification_deliveries')
    .insert({ id: randomUUID(), estimate_id: fixtureEstimateId, type: 'customer_estimate', created_at: createdAt })
    .select(selection).single();
  if (error || !data) throw new Error('Synthetic notification fixture insert failed.');
  return data as unknown as NotificationDelivery;
}

suite('Task 9 notification PostgREST acceptance', () => {
  test('claims a newly persisted intent immediately and requires reconciliation for stale unknown recovery', async () => {
    const client = service(), repository = createNotificationsRepository(client);
    const fresh = await insertFixture(client, new Date().toISOString());
    const claim = await repository.claim(fresh, { invocation: 'initial' });
    expect(claim.error).toBeNull(); expect(claim.claim?.row.attempt_count).toBe(1);
    const old = await insertFixture(client);
    const first = await repository.claim(old, { invocation: 'initial' });
    const seeded = await client.from('notification_deliveries').update({ last_attempt_at: new Date(Date.now() - 120000).toISOString() }).eq('id', old.id).select(selection).single();
    expect(seeded.error).toBeNull();
    const unknown = seeded.data as unknown as NotificationDelivery;
    expect((await repository.claim(unknown, { invocation: 'manual' })).reason).toBe('reconciliation_required');
    const recovered = await repository.claim(unknown, { invocation: 'manual', providerReconciled: true });
    expect(recovered.claim?.row.attempt_count).toBe(2);
    expect((await repository.finalize(first.claim!, classifyAttemptOutcome({ kind: 'timeout' }))).row).toBeNull();
  });

  test('serializes concurrent claims, preserves microsecond tokens, and rejects stale finalization', async () => {
    const client = service();
    const repository = createNotificationsRepository(client);
    const id = randomUUID();
    const { data: inserted, error: insertError } = await client.from('notification_deliveries')
      .insert({ id, estimate_id: fixtureEstimateId, type: 'customer_estimate', created_at: new Date(Date.now() - 60 * 60_000).toISOString() })
      .select('id, estimate_id, lead_id, type, state, provider, provider_message_id, recipient_hash, recipient_masked, attempt_count, last_error_code, last_error_safe_message, created_at, last_attempt_at, sent_at')
      .single();
    expect(insertError?.code ?? null).toBeNull();
    expect(inserted).not.toBeNull();
    const observed = inserted as unknown as NotificationDelivery;

    const [first, competing] = await Promise.all([
      repository.claim(observed, { invocation: 'initial' }),
      repository.claim(observed, { invocation: 'initial' })
    ]);
    expect([first.claim, competing.claim].filter(Boolean)).toHaveLength(1);
    expect([first, competing].filter((result) => result.error === 'claim_failed')).toHaveLength(0);
    const owner = first.claim ?? competing.claim;
    expect(owner?.row.attempt_count).toBe(1);
    expect(owner?.row.last_attempt_at).not.toBeNull();

    const staleTimestamp = new Date(Math.floor((Date.now() - 300_000) / 1000) * 1000).toISOString().replace('.000Z', '.123456Z');
    const retryAt = Date.parse(staleTimestamp) + 60_000;
    const { error: seedError } = await client.from('notification_deliveries').update({
      last_attempt_at: staleTimestamp,
      last_error_code: 'PROVIDER_TRANSIENT',
      last_error_safe_message: buildRetryDeadlineMessage(retryAt)
    }).eq('id', id);
    expect(seedError?.code ?? null).toBeNull();

    const { data: retryRecord, error: readError } = await client.from('notification_deliveries')
      .select('id, estimate_id, lead_id, type, state, provider, provider_message_id, recipient_hash, recipient_masked, attempt_count, last_error_code, last_error_safe_message, created_at, last_attempt_at, sent_at')
      .eq('id', id).single();
    expect(readError?.code ?? null).toBeNull();
    expect((retryRecord as unknown as NotificationDelivery).last_attempt_at).toContain('123456');

    const second = await repository.claim(retryRecord as unknown as NotificationDelivery, { invocation: 'manual' });
    expect(second.error).toBeNull();
    expect(second.claim?.row.attempt_count).toBe(2);
    expect(second.claim?.row.last_attempt_at).not.toBe(staleTimestamp);

    const staleFinalize = await repository.finalize(owner!, classifyAttemptOutcome({ kind: 'timeout' }));
    expect(staleFinalize.error).toBeNull();
    expect(staleFinalize.row).toBeNull();

    const finalized = await repository.finalize(second.claim!, classifyAttemptOutcome({ kind: 'timeout' }));
    expect(finalized.error).toBeNull();
    expect(finalized.row?.state).toBe('FAILED_RETRYABLE');
    expect(finalized.row?.attempt_count).toBe(2);
    expect(finalized.row?.last_error_code).toBe('PROVIDER_TIMEOUT');

    const { data: persisted, error: persistedError } = await client.from('notification_deliveries')
      .select('state, attempt_count, last_error_code, last_attempt_at, last_error_safe_message')
      .eq('id', id).single();
    expect(persistedError?.code ?? null).toBeNull();
    expect(persisted).toMatchObject({ state: 'FAILED_RETRYABLE', attempt_count: 2, last_error_code: 'PROVIDER_TIMEOUT' });

    const acceptedId = randomUUID();
    const { data: acceptedIntent, error: acceptedInsertError } = await client.from('notification_deliveries')
      .insert({ id: acceptedId, estimate_id: fixtureEstimateId, type: 'customer_estimate', created_at: new Date(Date.now() - 60 * 60_000).toISOString() })
      .select('id, estimate_id, lead_id, type, state, provider, provider_message_id, recipient_hash, recipient_masked, attempt_count, last_error_code, last_error_safe_message, created_at, last_attempt_at, sent_at')
      .single();
    expect(acceptedInsertError?.code ?? null).toBeNull();
    const acceptedClaim = await repository.claim(acceptedIntent as unknown as NotificationDelivery, { invocation: 'initial' });
    expect(acceptedClaim.claim?.row.attempt_count).toBe(1);
    const sentAtBefore = Date.now();
    const accepted = await repository.finalize(acceptedClaim.claim!, {
      classification: 'accepted', code: 'PROVIDER_ACCEPTED', retryNotBefore: null, reconciliationRequired: false
    }, '40000000-0000-4000-8000-000000000099');
    const sentAtAfter = Date.now();
    expect(accepted.error).toBeNull();
    expect(accepted.row?.state).toBe('SENT');
    expect(accepted.row?.provider_message_id).toBe('40000000-0000-4000-8000-000000000099');
    const sentAt = Date.parse(accepted.row?.sent_at ?? '');
    expect(Number.isFinite(sentAt) && sentAt >= sentAtBefore - 5_000 && sentAt <= sentAtAfter + 5_000).toBe(true);
  });

  test('metadata changes invalidate an observed token and expiry maintenance preserves the claim count', async () => {
    const client = service();
    const repository = createNotificationsRepository(client);
    const observed = await insertFixture(client);
    const retryMessage = buildRetryDeadlineMessage(Date.now() - 120_000);
    const { error: seedError } = await client.from('notification_deliveries').update({
      last_error_code: 'PROVIDER_TRANSIENT', last_error_safe_message: retryMessage
    }).eq('id', observed.id);
    expect(seedError?.code ?? null).toBeNull();

    const invalidated = await repository.claim(observed, { invocation: 'initial' });
    expect(invalidated.error).toBeNull();
    expect(invalidated.claim).toBeNull();
    expect(invalidated.reason).toBe('lost_race');
    const refreshed = await repository.findById(observed.id);
    expect(refreshed.error).toBeNull();
    const current = await repository.claim(refreshed.row!, { invocation: 'initial' });
    expect(current.claim?.row.attempt_count).toBe(1);

    const expired = await insertFixture(client, new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    const exhausted = await repository.exhaustIdle(expired, Date.now());
    expect(exhausted.error).toBeNull();
    expect(exhausted.row?.state).toBe('EXHAUSTED');
    expect(exhausted.row?.attempt_count).toBe(0);
  });

  test('the fifth claim exhausts the row and no sixth claim is returned', async () => {
    const client = service();
    const repository = createNotificationsRepository(client);
    let row = await insertFixture(client);
    for (let count = 1; count <= 5; count += 1) {
      if (count > 1) {
        const oldAttempt = new Date(Date.now() - 1_200_000).toISOString().replace(/\.\d{3}Z$/, '.123456Z');
        const { error } = await client.from('notification_deliveries').update({
          last_attempt_at: oldAttempt,
          last_error_code: 'PROVIDER_TRANSIENT',
          last_error_safe_message: buildRetryDeadlineMessage(Date.now() - 120_000)
        }).eq('id', row.id);
        expect(error?.code ?? null).toBeNull();
        const reread = await repository.findById(row.id);
        expect(reread.error).toBeNull();
        row = reread.row!;
      }
      const claim = await repository.claim(row, { invocation: count === 1 ? 'initial' : 'manual' });
      expect(claim.claim?.row.attempt_count).toBe(count);
      const outcome = classifyAttemptOutcome({ kind: 'http', status: 503 });
      const finalized = await repository.finalize(claim.claim!, outcome);
      expect(finalized.error).toBeNull();
      expect(finalized.row?.attempt_count).toBe(count);
      expect(finalized.row?.state).toBe(count === 5 ? 'EXHAUSTED' : 'FAILED_RETRYABLE');
      row = finalized.row!;
    }
    const sixth = await repository.claim(row, { invocation: 'manual', providerReconciled: true });
    expect(sixth.claim).toBeNull();
  });


  test('races FAILED_RETRYABLE claims and enforces active exclusion, backoff and provider delay', async () => {
    const client = service();
    const repository = createNotificationsRepository(client);
    const inserted = await insertFixture(client);
    const seed = async (lastAttemptMs: number, deadlineMs: number, count: number) => {
      const result = await client.from('notification_deliveries').update({ state: 'FAILED_RETRYABLE', attempt_count: count,
        last_attempt_at: new Date(lastAttemptMs).toISOString(), last_error_code: 'PROVIDER_TRANSIENT',
        last_error_safe_message: buildRetryDeadlineMessage(deadlineMs) }).eq('id', inserted.id).select(selection).single();
      expect(result.error?.code ?? null).toBeNull();
      return result.data as unknown as NotificationDelivery;
    };
    const delayed = await seed(Date.now() - 600_000, Date.now() + 60_000, 1);
    expect((await repository.claim(delayed, { invocation: 'manual' })).claim).toBeNull();
    expect((await repository.findById(inserted.id)).row?.attempt_count).toBe(1);
    const eligible = await seed(Date.now() - 600_000, Date.now() - 60_000, 1);
    const pair = await Promise.all([repository.claim(eligible, { invocation: 'manual' }), repository.claim(eligible, { invocation: 'manual' })]);
    expect(pair.filter(result => result.claim)).toHaveLength(1);
    const owner = pair.find(result => result.claim)!.claim!;
    expect(owner.row.attempt_count).toBe(2);
    expect((await repository.claim(owner.row, { invocation: 'manual', providerReconciled: true })).claim).toBeNull();
    const backoff = await seed(Date.now() - 90_000, Date.now() - 60_000, 2);
    expect((await repository.claim(backoff, { invocation: 'manual' })).claim).toBeNull();
    expect((await repository.findById(inserted.id)).row?.attempt_count).toBe(2);
  });

  test('a lost claim response consumes one claim and a retry loses the original token', async () => {
    const normalClient = service();
    const lostClient = service({ loseResponse: 'claim' });
    const normalRepository = createNotificationsRepository(normalClient);
    const lostRepository = createNotificationsRepository(lostClient);
    const observed = await insertFixture(normalClient);
    const result = await lostRepository.claim(observed, { invocation: 'initial' });
    expect(result.claim).toBeNull();
    expect(result.error).toBe('claim_failed');
    const committed = await normalRepository.findById(observed.id);
    expect(committed.row?.attempt_count).toBe(1);
    expect(committed.row?.last_error_code).toBe('ATTEMPT_OUTCOME_UNKNOWN');
    const replay = await normalRepository.claim(observed, { invocation: 'initial' });
    expect(replay.claim).toBeNull();
    expect(replay.reason).toBe('lost_race');
  });

  test('a lost SENT finalization response is resolved by a fresh database read', async () => {
    const normalClient = service();
    const lostClient = service({ loseResponse: 'sent-finalization' });
    const repository = createNotificationsRepository(normalClient);
    const lostRepository = createNotificationsRepository(lostClient);
    const observed = await insertFixture(normalClient);
    const owner = await repository.claim(observed, { invocation: 'initial' });
    expect(owner.claim).not.toBeNull();
    const response = await lostRepository.finalize(owner.claim!, {
      classification: 'accepted', code: 'PROVIDER_ACCEPTED', retryNotBefore: null, reconciliationRequired: false
    }, '40000000-0000-4000-8000-000000000098');
    expect(response.row).toBeNull();
    expect(response.error).toBe('finalize_failed');
    const reread = await repository.findById(observed.id);
    expect(reread.row?.state).toBe('SENT');
    expect(reread.row?.provider_message_id).toBe('40000000-0000-4000-8000-000000000098');
  });

  test('terminal rows reject mutation and competing expiry/finalization has one durable winner', async () => {
    const client = service(), repository = createNotificationsRepository(client);
    const observed = await insertFixture(client, new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    // Seed a synthetic stale claim without a provider request. Application dispatch would reject this age.
    const seeded = await client.from('notification_deliveries').update({ attempt_count: 1, last_attempt_at: new Date(Date.now() - 120000).toISOString(), last_error_code: 'ATTEMPT_OUTCOME_UNKNOWN' }).eq('id', observed.id).select(selection).single();
    expect(seeded.error).toBeNull();
    const claim = seeded.data as unknown as NotificationDelivery;
    const results = await Promise.all([
      repository.exhaustIdle(claim, Date.now()),
      repository.finalize(claim, { classification: 'accepted', code: 'PROVIDER_ACCEPTED', retryNotBefore: null, reconciliationRequired: false }, randomUUID())
    ]);
    expect(results.filter(result => result.row)).toHaveLength(1);
    const terminal = (await repository.findById(observed.id)).row!;
    expect(['SENT', 'EXHAUSTED']).toContain(terminal.state);
    const mutation = await client.from('notification_deliveries').update({ attempt_count: 2 }).eq('id', observed.id);
    expect(mutation.error).not.toBeNull();
    const deletion = await client.from('notification_deliveries').delete().eq('id', observed.id);
    expect(deletion.error).not.toBeNull();
    expect((await repository.findById(observed.id)).row).toEqual(terminal);
  });

});
