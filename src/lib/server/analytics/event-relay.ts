import { createEstimatorEvent } from '../../estimator-analytics';

const MAX_BYTES = 1024;
type SafeEvent = NonNullable<ReturnType<typeof createEstimatorEvent>>;
type RelayDependencies = Readonly<{
  enabled: boolean;
  limit: () => Promise<boolean>;
  deliver: (event: SafeEvent) => Promise<void>;
}>;
function response(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
}

/** Testable boundary. The route must remain disabled until a destination and limiter are approved. */
export async function handleAnalyticsEvent(request: Request, deps: RelayDependencies): Promise<Response> {
  if (!deps.enabled) return response(503);
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return response(403);
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json' || !request.body) return response(400);
  try { if (!await deps.limit()) return response(429); } catch { return response(503); }
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BYTES) return response(413);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return response(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return response(400);
    const input = value as Record<string, unknown>;
    if (typeof input.event !== 'string') return response(400);
    const safe = createEstimatorEvent(input.event, input);
    if (!safe || Object.keys(input).length !== Object.keys(safe).length || Object.keys(input).some((key) => !Object.hasOwn(safe, key))) return response(400);
    try { await deps.deliver(safe); return response(204); } catch { return response(503); }
  } catch { return response(400); }
  finally { reader.releaseLock(); }
}
