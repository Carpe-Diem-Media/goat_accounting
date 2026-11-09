import { describe, expect, test } from 'bun:test';
import { createLeadFromEstimate } from './create-lead';
import { handleContactPost } from './contact-api';

const body = { turnstileToken: 'token', fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '', businessName: '', preferredContactMethod: 'email', contactConsent: true, requestedContact: true, requestedEstimateEmail: false };
const leadId = '40000000-0000-4000-8000-000000000001';
const deps = (createContactLead: () => Promise<string | null | void>, afterCommit?: (saved: { leadId: string | null; estimateId: string }) => Promise<void>) => ({
  verify: async () => ({ success: true as const }), findEstimateId: async () => '40000000-0000-4000-8000-000000000002', createContactLead, afterCommit
});

describe('createLeadFromEstimate commit boundary', () => {
  test('returns saved context and contains every post-commit failure', async () => {
    const result = await createLeadFromEstimate('a'.repeat(32), body, deps(async () => leadId, async () => { throw new Error('private notification failure'); }));
    expect(result).toEqual({ leadId, estimateId: '40000000-0000-4000-8000-000000000002' });
  });
  test('keeps acknowledged success when the RPC result has no usable UUID', async () => {
    let called = false;
    const result = await createLeadFromEstimate('a'.repeat(32), body, deps(async () => null, async (saved) => { called = true; expect(saved.leadId).toBeNull(); }));
    expect(result.leadId).toBeNull();
    expect(called).toBe(true);
  });
});

test('public contact response remains saved after acknowledged persistence and notification lookup failure', async () => {
 for (const rpcResult of [leadId, null]) {
  const response = await handleContactPost(new Request('https://example.test/api/estimates/' + 'a'.repeat(32) + '/contact', {
   method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.test' }, body: JSON.stringify(body)
  }), payload => createLeadFromEstimate('a'.repeat(32), payload, deps(async () => rpcResult, async () => { throw new Error('notification lookup unavailable'); })));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ saved: true });
 }
});
