import { constants, openSync, fstatSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createEstimatorServiceClient, type EstimatorServerEnv } from '../src/lib/server/supabase/client.server';
import { createNotificationsRepository, type NotificationDiscoveryRow } from '../src/lib/server/supabase/repositories/notifications';
import { assessClaimEligibility, parseRetryDeadlineMessage } from '../src/lib/domain/notifications/lifecycle';
import { contentDigest, type EstimateMailBindings } from '../src/lib/server/email/estimate-mailer';
import { loadEmailContent } from '../src/lib/server/email/content';
import { deliverNotificationById } from '../src/lib/server/notifications/deliver';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$/;
const CODES = new Set(['ATTEMPT_OUTCOME_UNKNOWN','PROVIDER_TIMEOUT','PROVIDER_NETWORK_ERROR','RETRY_AFTER_INVALID','PROVIDER_RESPONSE_INVALID','PROVIDER_CONFLICT_UNKNOWN','PROVIDER_ACCEPTED','PROVIDER_RATE_LIMITED','PROVIDER_TRANSIENT','PROVIDER_AUTH_REJECTED','PAYLOAD_CONFLICT','PROVIDER_REJECTED','INTENT_EXPIRED','ATTEMPT_LIMIT']);
type Arguments = { mode: 'list'; after?: string } | { mode: 'inspect'; deliveryId: string } | { mode: 'retry'; deliveryId: string; reconciliationReference?: string } | { mode: 'digest' | 'help' };
type CliBindings = EstimateMailBindings & EstimatorServerEnv & { ESTIMATE_NOTIFICATION_OPERATOR_UID?: string; ESTIMATE_NOTIFICATION_AUDIT_PATH?: string };
type Repository = ReturnType<typeof createNotificationsRepository>;

export function parseNotificationArguments(args: string[]): Arguments | null {
 const values: Record<string, string | boolean> = {};
 for (let index = 0; index < args.length; index++) {
  const key = args[index];
  if (Object.hasOwn(values, key)) return null;
  if (['--list','--inspect','--confirm-provider-reconciled','--content-digest','--help'].includes(key)) values[key] = true;
  else if (['--delivery-id','--after','--reconciliation-ref'].includes(key)) {
   const value = args[++index]; if (!value || value.startsWith('--')) return null; values[key] = value;
  } else return null;
 }
 if (values['--help'] && args.length === 1) return { mode: 'help' };
 if (values['--content-digest'] && args.length === 1) return { mode: 'digest' };
 if (values['--list'] && Object.keys(values).every(key => key === '--list' || key === '--after')) {
  const after = values['--after'];
  return after === undefined ? { mode: 'list' } : typeof after === 'string' && UUID.test(after) ? { mode: 'list', after } : null;
 }
 const deliveryId = values['--delivery-id'];
 if (typeof deliveryId !== 'string' || !UUID.test(deliveryId)) return null;
 if (values['--inspect']) return Object.keys(values).length === 2 ? { mode: 'inspect', deliveryId } : null;
 if (values['--list'] || values['--after'] || values['--content-digest'] || values['--help']) return null;
 if (values['--confirm-provider-reconciled']) {
  const reference = values['--reconciliation-ref'];
  return typeof reference === 'string' && REFERENCE.test(reference) ? { mode: 'retry', deliveryId, reconciliationReference: reference } : null;
 }
 return Object.keys(values).length === 1 ? { mode: 'retry', deliveryId } : null;
}

type StatusRow = Pick<NotificationDiscoveryRow, 'id'|'type'|'state'|'attempt_count'|'created_at'|'last_attempt_at'|'last_error_code'|'last_error_safe_message'> & { recipient_masked?: unknown; estimate_id?: unknown };
export function publicDeliveryStatus(row: StatusRow, now = Date.now()) {
 const count = Number.isInteger(row.attempt_count) && row.attempt_count >= 0 && row.attempt_count <= 5 ? row.attempt_count : null;
 const created = Date.parse(row.created_at);
 const last = row.last_attempt_at === null ? null : Date.parse(row.last_attempt_at);
 const deadline = row.last_error_safe_message === null ? null : parseRetryDeadlineMessage(row.last_error_safe_message);
 const expiry = Number.isFinite(created) ? created + 23 * 60 * 60_000 : null;
 const next = count === 0 ? created : count && count < 5 && last !== null && Number.isFinite(last) ? Math.max(last + [60,120,240,480][count - 1] * 1000, deadline ?? 0) + 7000 : null;
 const iso = (value: number | null) => value !== null && Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
 return {
  deliveryId: UUID.test(row.id) ? row.id : null,
  type: ['internal_lead','customer_estimate'].includes(row.type) ? row.type : null,
  state: ['PENDING','FAILED_RETRYABLE','SENT','EXHAUSTED'].includes(row.state) ? row.state : null,
  claimCount: count,
  code: row.last_error_code === null ? null : CODES.has(row.last_error_code) ? row.last_error_code : 'UNRECOGNIZED_STORED_ERROR',
  nextEligibleAt: iso(next), expiresAt: iso(expiry), expired: expiry !== null && now >= expiry,
  reconciliationRequired: row.last_error_code !== null && !CODES.has(row.last_error_code) || ['ATTEMPT_OUTCOME_UNKNOWN','PROVIDER_TIMEOUT','PROVIDER_NETWORK_ERROR','RETRY_AFTER_INVALID','PROVIDER_RESPONSE_INVALID','PROVIDER_CONFLICT_UNKNOWN'].includes(row.last_error_code ?? '') || row.last_error_safe_message !== null && deadline === null
 };
}

/** Local audit journal, fsynced before a reconciliation permission reaches the dispatcher. */
export function appendReconciliationAudit(path: string, input: { deliveryId: string; reference: string; attemptCount: number; previousCode: string | null }): boolean {
 if (!isAbsolute(path) || !UUID.test(input.deliveryId) || !REFERENCE.test(input.reference) || !Number.isInteger(input.attemptCount) || input.attemptCount < 0 || input.attemptCount > 5) return false;
 let fd: number | undefined;
 try {
  fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  const stat = fstatSync(fd);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.()) return false;
  const record = { auditId: randomUUID(), recordedAt: new Date().toISOString(), operatorUid: process.getuid?.(), deliveryId: input.deliveryId,
   claimCount: input.attemptCount, previousCode: input.previousCode !== null && CODES.has(input.previousCode) ? input.previousCode : 'UNRECOGNIZED_STORED_ERROR',
   decision: 'provider_reconciled_retry_authorized', reference: input.reference };
  writeSync(fd, JSON.stringify(record) + '\n'); fsyncSync(fd);
  return true;
 } catch { return false; }
 finally { if (fd !== undefined) closeSync(fd); }
}

export async function runNotificationCommand(args: string[], bindings: CliBindings, dependencies: {
 write?: (value: unknown) => void;
 repository?: Repository;
 retry?: (id: string, reconciled: boolean) => Promise<{ status: string; code?: string; outcomes: readonly { deliveryId?: string; code: string; state?: string }[] }>;
} = {}): Promise<number> {
 const write = dependencies.write ?? (value => console.log(JSON.stringify(value)));
 const fail = (code: string) => { write({ code }); return 1; };
 const command = parseNotificationArguments(args);
 if (!command) return fail('INVALID_ARGUMENTS');
 if (command.mode === 'help') { write({ usage: '--list [--after UUID] | --inspect --delivery-id UUID | --delivery-id UUID [--confirm-provider-reconciled --reconciliation-ref CASE-ID] | --content-digest' }); return 0; }
 try {
  if (command.mode === 'digest') {
   const content = loadEmailContent(bindings.ESTIMATE_EMAIL_CONTENT);
   if (!content) return fail('CONTENT_CONFIGURATION_INVALID');
   write({ contentSha256: await contentDigest(content) }); return 0;
  }
  if (command.mode === 'retry' && bindings.ESTIMATE_NOTIFICATIONS_ENABLED !== 'true') { write({ status: 'disabled' }); return 0; }
  if (command.mode === 'retry' && (!bindings.ESTIMATE_NOTIFICATION_OPERATOR_UID || bindings.ESTIMATE_NOTIFICATION_OPERATOR_UID !== String(process.getuid?.()))) return fail('OPERATOR_UNAUTHORIZED');
  const repository = dependencies.repository ?? createNotificationsRepository(createEstimatorServiceClient(bindings));
  if (command.mode === 'list') {
   const result = await repository.discover(command.after);
   if (result.error) return fail('NOTIFICATION_LOOKUP_UNAVAILABLE');
   write({ deliveries: result.rows.map(row => publicDeliveryStatus(row)), nextCursor: result.nextCursor }); return 0;
  }
  const result = await repository.findById(command.deliveryId);
  if (result.error) return fail('NOTIFICATION_LOOKUP_UNAVAILABLE');
  if (!result.row) return fail('NOTIFICATION_NOT_FOUND');
  if (command.mode === 'inspect') { write(publicDeliveryStatus(result.row)); return 0; }
  const eligibility = assessClaimEligibility(result.row, Date.now(), 'manual');
  let reconciled = false;
  if (command.reconciliationReference) {
   if (eligibility.eligible || eligibility.reason !== 'reconciliation_required') return fail('RECONCILIATION_NOT_REQUIRED');
   if (!assessClaimEligibility(result.row, Date.now(), 'manual', true).eligible) return fail('RECONCILIATION_RETRY_NOT_ELIGIBLE');
   if (!bindings.ESTIMATE_NOTIFICATION_AUDIT_PATH || !appendReconciliationAudit(bindings.ESTIMATE_NOTIFICATION_AUDIT_PATH, { deliveryId: result.row.id, attemptCount: result.row.attempt_count, previousCode: result.row.last_error_code, reference: command.reconciliationReference })) return fail('RECONCILIATION_AUDIT_UNAVAILABLE');
   reconciled = true;
  }
  if (!eligibility.eligible && eligibility.reason === 'reconciliation_required' && !reconciled) return fail('RECONCILIATION_REQUIRED');
  const outcome = dependencies.retry ? await dependencies.retry(command.deliveryId, reconciled) : await deliverNotificationById(command.deliveryId, bindings, { repository, providerReconciled: reconciled, ...(reconciled ? { reconciledToken: { attemptCount: result.row.attempt_count, lastAttemptAt: result.row.last_attempt_at, lastErrorCode: result.row.last_error_code, lastErrorSafeMessage: result.row.last_error_safe_message } } : {}) });
  write({ status: outcome.status, ...(outcome.code ? { code: outcome.code } : {}), outcomes: outcome.outcomes.map(item => ({ deliveryId: typeof item.deliveryId === 'string' && UUID.test(item.deliveryId) ? item.deliveryId : null, code: item.code, ...(item.state ? { state: item.state } : {}) })) });
  return outcome.outcomes.length > 0 && outcome.outcomes.every(item => item.state === 'SENT') ? 0 : 1;
 } catch { return fail('NOTIFICATION_OPERATION_UNAVAILABLE'); }
}

if (import.meta.main) process.exitCode = await runNotificationCommand(process.argv.slice(2), process.env);
