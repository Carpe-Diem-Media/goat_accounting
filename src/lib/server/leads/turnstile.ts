export type TurnstileResult = Readonly<{ success: true }> | Readonly<{ success: false; reason: 'rejected' | 'unavailable' }>;
export type TurnstileConfig = Readonly<{ secret: string; hostname: string }>;
export const CONTACT_TURNSTILE_ACTION = 'estimate_contact';

/** Redeem once per submission. Never cache a successful token as permission for a later action. */
export async function verifyTurnstile(
 token: string,
 config: TurnstileConfig,
 dependencies: { fetch?: (url: string, init: RequestInit) => Promise<Response>; now?: () => number } = {}
): Promise<TurnstileResult> {
 if (typeof token !== 'string' || !token.trim() || token.length > 2048) return { success: false, reason: 'rejected' };
 if (!config.secret.trim() || !config.hostname.trim()) return { success: false, reason: 'unavailable' };
 try {
  const response = await (dependencies.fetch ?? globalThis.fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
   method: 'POST',
   headers: { 'content-type': 'application/x-www-form-urlencoded' },
   body: new URLSearchParams({ secret: config.secret, response: token }).toString(),
   signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) return { success: false, reason: 'unavailable' };
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object') return { success: false, reason: 'rejected' };
  const value = result as Record<string, unknown>;
  if (value.success !== true && Array.isArray(value['error-codes']) && value['error-codes'].some((code) => ['internal-error', 'missing-input-secret', 'invalid-input-secret'].includes(code))) {
   return { success: false, reason: 'unavailable' };
  }
  const challengedAt = typeof value.challenge_ts === 'string' ? Date.parse(value.challenge_ts) : NaN;
  const age = (dependencies.now ?? Date.now)() - challengedAt;
  if (value.success !== true || value.hostname !== config.hostname || value.action !== CONTACT_TURNSTILE_ACTION || !Number.isFinite(age) || age < 0 || age >= 300_000) {
   return { success: false, reason: 'rejected' };
  }
  return { success: true };
 } catch {
  // Do not log tokens, server credentials, IPs or upstream response bodies.
  return { success: false, reason: 'unavailable' };
 }
}
