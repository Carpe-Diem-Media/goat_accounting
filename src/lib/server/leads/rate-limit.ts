export type ContactRateLimiter = {
 limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

/** These short-lived limiter keys never contain contact details or raw network addresses. */
export async function checkContactRateLimit(
 limiter: ContactRateLimiter | undefined,
 publicRef: string,
 sourceAddress: string | null
): Promise<'allowed' | 'limited' | 'unavailable'> {
 if (!limiter) return 'unavailable';
 try {
  for (const [kind, value] of [['source', sourceAddress || 'unknown'], ['estimate', publicRef]]) {
   const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`contact:${kind}:${value}`));
   const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
   const result = await limiter.limit({ key: `contact:${kind}:${hash}` });
   if (result.success !== true) return 'limited';
  }
  return 'allowed';
 } catch { return 'unavailable'; }
}
