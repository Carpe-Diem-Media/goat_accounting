import { afterEach, expect, spyOn, test } from 'bun:test';
import { sendLeadNotification } from './mailer_api';

afterEach(() => { mockFetch?.mockRestore(); mockFetch = undefined; });
let mockFetch: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>> | undefined;

// TEST-ONLY booking regression. The mock prevents any real Resend request.
const booking = { client_name: 'TEST-ONLY Booking Client', client_email: 'booking@example.test', client_phone: '0820000000', primary_interest: 'General' as const, appointment_start_iso: '2026-12-01T10:00:00+02:00' };
test('booking mail retains its consultation ICS and booking-specific notification contract', async () => {
 mockFetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'test-only-booking-id' }));
 const result = await sendLeadNotification(booking, { RESEND_API_KEY: 'TEST_ONLY_KEY', ADVISOR_EMAIL: 'advisor@example.test', RESEND_FROM_EMAIL: 'from@example.test' });
 expect(result.ok).toBe(true);
 const payload = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
 expect(payload.to).toEqual(['advisor@example.test']);
 expect(payload.subject).toBe('New Lead: TEST-ONLY Booking Client (General)');
 expect(payload.text).toContain('Requested booking time:');
 expect(payload.attachments).toHaveLength(1);
 expect(payload.attachments[0].filename).toBe('consultation.ics');
 const ics = atob(payload.attachments[0].content);
 expect(ics).toContain('BEGIN:VCALENDAR');
 expect(ics).toContain('DTSTART:20261201T080000Z');
 expect(ics).toContain('DTEND:20261201T090000Z');
});
test('invalid booking data still fails validation before an HTTP request', async () => {
 mockFetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected HTTP call'));
 const result = await sendLeadNotification({ ...booking, client_phone: 'invalid' }, { RESEND_API_KEY: 'TEST_ONLY_KEY', ADVISOR_EMAIL: 'advisor@example.test' });
 expect(result.ok).toBe(false);
 expect(mockFetch).not.toHaveBeenCalled();
});
