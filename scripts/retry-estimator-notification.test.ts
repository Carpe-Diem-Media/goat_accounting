import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, statSync, rmSync, chmodSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendReconciliationAudit, parseNotificationArguments, publicDeliveryStatus, runNotificationCommand } from './retry-estimator-notification';

const id = '65000000-0000-4000-8000-000000000001';
test('accepts only bounded discovery, inspection and one-delivery retry arguments', () => {
 expect(parseNotificationArguments(['--list'])).toEqual({ mode: 'list' });
 expect(parseNotificationArguments(['--inspect', '--delivery-id', id])).toEqual({ mode: 'inspect', deliveryId: id });
 for (const args of [['--list', '--delivery-id', id], ['--delivery-id', 'invalid'], ['--delivery-id', id, '--confirm-provider-reconciled'], ['--recipient', 'private@example.test']]) expect(parseNotificationArguments(args)).toBeNull();
});
test('operator status never exposes recipient metadata, parent IDs or arbitrary stored error text', () => {
 const output = JSON.stringify(publicDeliveryStatus({ id, type: 'customer_estimate', state: 'FAILED_RETRYABLE', attempt_count: 1, created_at: '2026-11-09T00:00:00Z', last_attempt_at: '2026-11-09T00:01:00Z', last_error_code: 'private@example.test', last_error_safe_message: 'private@example.test', recipient_masked: 'private@example.test', estimate_id: 'PRIVATE_PARENT' }));
 expect(output).not.toContain('private@'); expect(output).not.toContain('PRIVATE_PARENT'); expect(output).toContain(id);
});
test('reconciliation audit is durable, restricted and requires a reference', () => {
 const directory = mkdtempSync(join(tmpdir(), 'goat-task9-audit-'));
 const path = join(directory, 'audit.jsonl');
 try {
  expect(appendReconciliationAudit(path, { deliveryId: id, reference: 'TEST-ONLY-case-1', attemptCount: 1, previousCode: 'PROVIDER_TIMEOUT' })).toBe(true);
  expect(statSync(path).mode & 0o777).toBe(0o600);
  const record = JSON.parse(readFileSync(path, 'utf8').trim());
  expect(record.reference).toBe('TEST-ONLY-case-1'); expect(record.deliveryId).toBe(id); expect(record.operatorUid).toBe(process.getuid?.());
  expect(appendReconciliationAudit(path, { deliveryId: id, reference: 'person@example.test', attemptCount: 1, previousCode: 'PROVIDER_TIMEOUT' })).toBe(false);
 } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('the Bun command executes without Cloudflare imports and fails closed while sending is disabled', async () => {
 const result = Bun.spawnSync([process.execPath, 'scripts/retry-estimator-notification.ts', '--delivery-id', id], { env: { PATH: process.env.PATH, ESTIMATE_NOTIFICATIONS_ENABLED: 'false' }, stdout: 'pipe', stderr: 'pipe' });
 expect(result.exitCode).toBe(0); expect(result.stdout.toString()).toContain('disabled'); expect(result.stderr.toString()).not.toContain('cloudflare');
});
test('a retry requires operator authorization and successful audited reconciliation', async () => {
 let calls = 0;
 const writes: unknown[] = [];
 const code = await runNotificationCommand(['--delivery-id', id], { ESTIMATE_NOTIFICATIONS_ENABLED: 'true' }, { write: value => writes.push(value), retry: async () => { calls++; return { status: 'complete', outcomes: [] }; } });
 expect(code).toBe(1); expect(calls).toBe(0); expect(JSON.stringify(writes)).toContain('OPERATOR_UNAUTHORIZED');
});

test('manual ambiguity cannot pass the dispatcher until reconciliation is durably recorded', async () => {
 const directory = mkdtempSync(join(tmpdir(), 'goat-task9-command-'));
 const auditPath = join(directory, 'audit.jsonl');
 const now = Date.now();
 const row = { id, type: 'customer_estimate', state: 'FAILED_RETRYABLE', provider: 'resend', estimate_id: id, lead_id: null, attempt_count: 1,
  created_at: new Date(now - 600000).toISOString(), last_attempt_at: new Date(now - 120000).toISOString(), last_error_code: 'PROVIDER_TIMEOUT', last_error_safe_message: null,
  recipient_hash: null, recipient_masked: null, provider_message_id: null, sent_at: null };
 const repository = { findById: async () => ({ row, error: null }) } as unknown as NonNullable<Parameters<typeof runNotificationCommand>[2]>['repository'];
 const bindings = { ESTIMATE_NOTIFICATIONS_ENABLED: 'true', ESTIMATE_NOTIFICATION_OPERATOR_UID: String(process.getuid?.()), ESTIMATE_NOTIFICATION_AUDIT_PATH: auditPath };
 let calls = 0; const writes: unknown[] = [];
 const dependencies = { repository, write: (value: unknown) => writes.push(value), retry: async (_id: string, reconciled: boolean) => {
  expect(reconciled).toBe(true); expect(JSON.parse(readFileSync(auditPath, 'utf8').trim()).deliveryId).toBe(id); calls++;
  return { status: 'completed', outcomes: [{ deliveryId: id, code: 'PROVIDER_ACCEPTED', state: 'SENT' }] };
 } };
 try {
  expect(await runNotificationCommand(['--delivery-id', id], bindings, dependencies)).toBe(1); expect(calls).toBe(0);
  const args = ['--delivery-id', id, '--confirm-provider-reconciled', '--reconciliation-ref', 'TEST-ONLY-case-2'];
  expect(await runNotificationCommand(args, { ...bindings, ESTIMATE_NOTIFICATION_AUDIT_PATH: '/missing/task9/audit' }, dependencies)).toBe(1); expect(calls).toBe(0);
  expect(await runNotificationCommand(args, bindings, dependencies)).toBe(0); expect(calls).toBe(1);
  row.last_error_code = 'PROVIDER_TRANSIENT';
  const auditBefore = readFileSync(auditPath, 'utf8');
  expect(await runNotificationCommand(args, bindings, dependencies)).toBe(1);
  expect(readFileSync(auditPath, 'utf8')).toBe(auditBefore); expect(calls).toBe(1);
 } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('audit rejects symlinks and permissive existing files', () => {
 const directory = mkdtempSync(join(tmpdir(), 'goat-task9-audit-'));
 const target = join(directory, 'target'), link = join(directory, 'link');
 const input = { deliveryId: id, reference: 'TEST-ONLY-case-3', attemptCount: 1, previousCode: 'PROVIDER_TIMEOUT' };
 try {
  writeFileSync(target, ''); chmodSync(target, 0o644); symlinkSync(target, link);
  expect(appendReconciliationAudit(target, input)).toBe(false); expect(appendReconciliationAudit(link, input)).toBe(false);
  expect(readFileSync(target, 'utf8')).toBe('');
 } finally { rmSync(directory, { recursive: true, force: true }); }
});
