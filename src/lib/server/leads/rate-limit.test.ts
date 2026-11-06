import { expect, test } from 'bun:test';
import { checkContactRateLimit } from './rate-limit';

test('fails closed when throttling is missing or unavailable', async () => {
 expect(await checkContactRateLimit(undefined, 'a'.repeat(32), '192.0.2.1')).toBe('unavailable');
 expect(await checkContactRateLimit({ limit: async () => { throw new Error('sensitive upstream detail'); } }, 'a'.repeat(32), '192.0.2.1')).toBe('unavailable');
});
test('bounds requests independently by hashed source address and estimate reference', async () => {
 const keys: string[] = [];
 const limiter = { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: true }; } };
 expect(await checkContactRateLimit(limiter, 'a'.repeat(32), '192.0.2.1')).toBe('allowed');
 expect(keys).toHaveLength(2);
 expect(keys[0]).not.toContain('192.0.2.1');
 expect(keys[1]).not.toContain('a'.repeat(32));
 expect(keys[0]).not.toBe(keys[1]);
 expect(await checkContactRateLimit({ limit: async () => ({ success: false }) }, 'a'.repeat(32), '192.0.2.1')).toBe('limited');
});
