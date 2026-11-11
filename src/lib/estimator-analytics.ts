import { pushDataLayer } from './analytics';

export const ESTIMATOR_EVENTS = [
  'estimate_started', 'estimate_step_completed', 'estimate_completed', 'estimate_result_viewed',
  'estimate_contact_started', 'estimate_contact_submitted', 'estimate_pdf_downloaded', 'estimate_booking_clicked'
] as const;
export type EstimatorEventName = (typeof ESTIMATOR_EVENTS)[number];
export type EstimatorMetadata = Readonly<{
  calculator_type?: 'business' | 'personal' | 'both';
  result_band?: 'low' | 'medium' | 'high';
  catch_up?: boolean;
  confidence?: 'high' | 'good' | 'preliminary';
  manual_review?: boolean;
}>;
// Delivery stays disabled until destination and privacy approval.
const ESTIMATOR_DELIVERY_ENABLED: boolean = false;
type SafeEvent = { event: EstimatorEventName } & EstimatorMetadata;

/** Construct a fresh payload; unknown keys and values can never reach the data layer. */
export function createEstimatorEvent(event: string, metadata: Record<string, unknown> = {}): SafeEvent | null {
  if (!(ESTIMATOR_EVENTS as readonly string[]).includes(event)) return null;
  const safe: { event: EstimatorEventName; calculator_type?: EstimatorMetadata['calculator_type']; result_band?: EstimatorMetadata['result_band']; catch_up?: boolean; confidence?: EstimatorMetadata['confidence']; manual_review?: boolean } = { event: event as EstimatorEventName };
  if (metadata.calculator_type === 'business' || metadata.calculator_type === 'personal' || metadata.calculator_type === 'both') safe.calculator_type = metadata.calculator_type;
  if (metadata.result_band === 'low' || metadata.result_band === 'medium' || metadata.result_band === 'high') safe.result_band = metadata.result_band;
  if (metadata.confidence === 'high' || metadata.confidence === 'good' || metadata.confidence === 'preliminary') safe.confidence = metadata.confidence;
  if (typeof metadata.catch_up === 'boolean') safe.catch_up = metadata.catch_up;
  if (typeof metadata.manual_review === 'boolean') safe.manual_review = metadata.manual_review;
  return safe;
}

/** Analytics is best-effort and must never affect the customer journey. */
export function trackEstimatorEvent(event: EstimatorEventName, metadata: EstimatorMetadata = {}, send: (event: SafeEvent) => void = pushDataLayer): void {
  try {
    const safe = createEstimatorEvent(event, metadata);
    if (safe) {
      send(safe);
      if (typeof window !== 'undefined') void sendEstimatorRelay(safe);
    }
  } catch { /* Analytics must not interrupt the operation. */ }
}

export function createEstimatorOnceTracker(send: (event: SafeEvent) => void = pushDataLayer): (event: EstimatorEventName, metadata?: EstimatorMetadata) => void {
  const sent = new Set<EstimatorEventName>();
  return (event, metadata = {}) => {
    if (sent.has(event)) return;
    sent.add(event);
    trackEstimatorEvent(event, metadata, send);
  };
}

export async function sendEstimatorRelay(event: SafeEvent, fetcher: (input: string, init: RequestInit) => Promise<Response> = (input, init) => fetch(input, init)): Promise<void> {
  if (!ESTIMATOR_DELIVERY_ENABLED) return;
  try {
    const safe = createEstimatorEvent(event.event, event);
    if (!safe) return;
    await fetcher('/api/analytics/events', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(safe),
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', keepalive: true
    });
  } catch { /* Telemetry cannot block or alter the customer journey. */ }
}
