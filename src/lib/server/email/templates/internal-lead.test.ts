import { describe, expect, test } from 'bun:test';
import type { EstimateDocumentModel } from '../../pdf/estimate-pdf';
import { renderInternalLeadEmail } from './internal-lead';

const model: EstimateDocumentModel = {
	publicRef: 'b'.repeat(32), state: 'VALID', calculatorType: 'personal', createdAt: '2026-11-09T10:00:00Z',
	pricingModelVersion: 'historic-price-v2', engineVersion: 'historic-engine-v2',
	catchup: { minCents: 12345, maxCents: 23456, lineItems: [] }, ongoing: { minCents: 6543, maxCents: 9876, lineItems: [] },
	confidence: 'preliminary', manualReviewRequired: true, assumptions: [{ label: 'Question', value: '<b>answer</b>' }]
};
const content = { disclaimer: 'TEST-ONLY disclaimer', contactName: 'TEST-ONLY name', contactEmail: 'test@example.test', title: 'TEST-ONLY title', publicOrigin: 'https://example.test', approvalReference: 'TEST-ONLY approval' };
const input = {
	estimate: model,
	estimateId: '123e4567-e89b-12d3-a456-426614174000',
	contact: { name: '<b>NAME</b>', email: 'lead&<x>@example.test', phone: '<i>PHONE</i>' },
	reviewFlags: ['TEST-ONLY FLAG'],
	freeText: '<script>note</script>'
} as const;

describe('renderInternalLeadEmail', () => {
	test('includes bounded internal details, saved versions and the protected admin path', () => {
		const rendered = renderInternalLeadEmail(input, content);
		expect(rendered.html).toContain('/admin/estimates/123e4567-e89b-12d3-a456-426614174000');
		expect(rendered.html).toContain('historic-price-v2');
		expect(rendered.html).toContain('historic-engine-v2');
		expect(rendered.html).toContain('Catch-up estimate: R 123 - R 235');
		expect(rendered.text).toContain('TEST-ONLY FLAG');
		expect(rendered.text).toContain('<script>note</script>');
		expect(rendered.html).not.toContain('<script>');
		expect(rendered.html).toContain('&lt;b&gt;NAME&lt;/b&gt;');
		expect(rendered.html).toContain('lead&amp;&lt;x&gt;@example.test');
		expect(rendered.html).toContain('&lt;b&gt;answer&lt;/b&gt;');
	});

	test('bounds free text, contact fields and review flag collections', () => {
		const rendered = renderInternalLeadEmail({
			...input,
			contact: { name: 'n'.repeat(300), email: 'e'.repeat(300), phone: 'p'.repeat(80) },
			freeText: 'x'.repeat(2200), reviewFlags: ['f'.repeat(200)]
		}, content);
		expect(rendered.html).not.toContain('n'.repeat(241));
		expect(rendered.html).not.toContain('x'.repeat(2001));
		expect(rendered.html).toContain('f'.repeat(120));
		expect(() => renderInternalLeadEmail({ ...input, reviewFlags: Array(25).fill('flag') }, content)).toThrow();
	});

	test('rejects invalid internal identifiers and unapproved origins', () => {
		expect(() => renderInternalLeadEmail({ ...input, estimateId: 'not-a-uuid' }, content)).toThrow();
		expect(() => renderInternalLeadEmail(input, { ...content, publicOrigin: 'javascript:alert(1)' })).toThrow();
	});
});
