const ROUTES = ['estimate_create', 'estimate_read', 'estimate_contact', 'estimate_pdf', 'dashboard'] as const;
const OUTCOMES = ['success', 'failure'] as const;
const ERROR_CODES = ['invalid_request', 'unauthorized', 'unavailable', 'persistence_failed', 'provider_failed'] as const;
type Route = (typeof ROUTES)[number];
type Outcome = (typeof OUTCOMES)[number];
type ErrorCode = (typeof ERROR_CODES)[number];
export type OperationalEvent = Readonly<{
  route: Route; outcome: Outcome; request_id?: string; error_code?: ErrorCode;
  provider_latency_ms?: number; manual_review?: boolean; pricing_version?: string; engine_version?: string;
}>;

/** Only fixed fields and validated values can be written to operational logs. */
export function createOperationalEvent(input: Record<string, unknown>): OperationalEvent | null {
  if (!ROUTES.includes(input.route as Route) || !OUTCOMES.includes(input.outcome as Outcome)) return null;
  const event: { route: Route; outcome: Outcome; request_id?: string; error_code?: ErrorCode; provider_latency_ms?: number; manual_review?: boolean; pricing_version?: string; engine_version?: string } = { route: input.route as Route, outcome: input.outcome as Outcome };
  if (typeof input.request_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.request_id)) event.request_id = input.request_id;
  if (ERROR_CODES.includes(input.error_code as ErrorCode)) event.error_code = input.error_code as ErrorCode;
  if (typeof input.provider_latency_ms === 'number' && Number.isFinite(input.provider_latency_ms) && input.provider_latency_ms >= 0 && input.provider_latency_ms <= 600000) event.provider_latency_ms = Math.round(input.provider_latency_ms);
  if (typeof input.manual_review === 'boolean') event.manual_review = input.manual_review;
  for (const key of ['pricing_version', 'engine_version'] as const) {
    const value = input[key];
    if (typeof value === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value)) event[key] = value;
  }
  return event;
}

/** The logger is deliberately non-blocking for the calling operation. */
export function logOperationalEvent(input: Record<string, unknown>, write: (event: OperationalEvent) => void = (event) => console.info(JSON.stringify(event))): void {
  try { const event = createOperationalEvent(input); if (event) write(event); } catch { /* Do not change request outcomes. */ }
}
export function newCorrelationId(): string | undefined {
  try { return crypto.randomUUID(); } catch { return undefined; }
}
export async function observeResponse(route: Route, response: Promise<Response>, write?: (event: OperationalEvent) => void, requestId = newCorrelationId()): Promise<Response> {
  try {
    const result = await response;
    logOperationalEvent({ route, outcome: result.ok ? 'success' : 'failure', request_id: requestId,
      ...(result.ok ? {} : { error_code: result.status < 500 ? 'invalid_request' : 'unavailable' }) }, write);
    return result;
  } catch (error) {
    logOperationalEvent({ route, outcome: 'failure', request_id: requestId, error_code: 'unavailable' }, write);
    throw error;
  }
}
export async function observeProvider<T extends { success: boolean; reason?: string }>(route: Route, requestId: string | undefined, operation: () => Promise<T>, write?: (event: OperationalEvent) => void): Promise<T> {
  const started = Date.now();
  try {
    const result = await operation();
    logOperationalEvent({ route, request_id: requestId, outcome: result.success ? 'success' : 'failure', provider_latency_ms: Date.now() - started,
      ...(result.success ? {} : { error_code: result.reason === 'rejected' ? 'invalid_request' : 'provider_failed' }) }, write);
    return result;
  } catch (error) {
    logOperationalEvent({ route, request_id: requestId, outcome: 'failure', provider_latency_ms: Date.now() - started, error_code: 'provider_failed' }, write);
    throw error;
  }
}
