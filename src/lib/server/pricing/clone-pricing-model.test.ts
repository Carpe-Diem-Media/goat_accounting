import { describe, expect, test } from 'bun:test';
import { clonePricingModel } from './clone-pricing-model';

describe('clonePricingModel', () => {
 test('rejects invalid IDs and versions without writing', async () => {
  let calls = 0;
  const repo = { clone: async () => { calls++; return crypto.randomUUID(); } };
  await expect(clonePricingModel(repo, 'bad', '1.0.0', crypto.randomUUID())).rejects.toThrow();
  await expect(clonePricingModel(repo, crypto.randomUUID(), '01.0.0', crypto.randomUUID())).rejects.toThrow();
  expect(calls).toBe(0);
 });
 test('sends valid input to the atomic repository operation', async () => {
  const source = crypto.randomUUID(); const actor = crypto.randomUUID(); const result = crypto.randomUUID();
  const calls: unknown[] = [];
  const repo = { clone: async (...args: [string, string, string]) => { calls.push(args); return result; } };
  expect(await clonePricingModel(repo, source, '1.2.3', actor)).toBe(result);
  expect(calls).toEqual([[source, '1.2.3', actor]]);
 });
});
