import { describe, expect, test } from 'bun:test';
import type { EstimateDocumentModel } from '../../pdf/estimate-pdf';
import { renderCustomerEstimateEmail } from './customer-estimate';

const model: EstimateDocumentModel = {
	publicRef: 'a'.repeat(32), state: 'VALID', calculatorType: 'business', createdAt: '2026-11-09T10:00:00Z',
	pricingModelVersion: 'old-price-v1', engineVersion: 'engine-v1',
	catchup: { minCents: 10000, maxCents: 20000, lineItems: [{ label: '<script>item</script>', minCents: 10000, maxCents: 20000 }] },
	ongoing: { minCents: 5000, maxCents: 9000, lineItems: [] }, confidence: 'good', manualReviewRequired: true, assumptions: [{ label: 'Internal question', value: 'private answer' }]
};
const content = { disclaimer: 'TEST-ONLY disclaimer', contactName: 'TEST-ONLY name', contactEmail: 'test@example.test', title: 'TEST-ONLY title', publicOrigin: 'https://example.test', approvalReference: 'TEST-ONLY approval' };

describe('renderCustomerEstimate', () => {
	test('uses the saved result and public page and PDF links only', () => {
		const rendered = renderCustomerEstimateEmail(model, content);
		expect(rendered.html).toContain('Catch-up estimate: R 100 - R 200');
		expect(rendered.html).toContain('Ongoing estimate: R 50 - R 90');
		expect(rendered.html).toContain('https://example.test/estimate/' + 'a'.repeat(32));
		expect(rendered.html).toContain('https://example.test/api/estimates/' + 'a'.repeat(32) + '/pdf');
		expect(rendered.text).toContain('Catch-up estimate: R 100 - R 200');
		expect(rendered.html).toContain('Confidence: good');
		expect(rendered.html).toContain('Review required: Yes');
		expect(rendered.text).toContain('Confidence: good');
		expect(rendered.text).toContain('Review required: Yes');
		expect(rendered.html).not.toContain('private answer');
		expect(rendered.html).not.toContain('old-price-v1');
		expect(rendered.html).not.toContain('manualReviewRequired');
		expect(rendered.html).not.toContain('private answer');
	});

	test('escapes configured values in HTML text and mail links', () => {
		const rendered = renderCustomerEstimateEmail(model, {
			...content,
			title: '<img src=x onerror=alert(1)>', disclaimer: '<script>alert(1)</script>',
			contactName: '<b>name</b>', contactEmail: 'test+tag@example.test', contactPhone: '<i>phone</i>'
		});
		expect(rendered.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(rendered.html).toContain('mailto:test+tag@example.test');
		expect(rendered.html).not.toContain('<script>');
		expect(rendered.html).not.toContain('<b>name</b>');
	});

	test('identifies a saved voided estimate instead of presenting it as current', () => {
		const email = renderCustomerEstimateEmail({ ...model, state: 'VOIDED' }, content);
		expect(email.html).toContain('Estimate status: VOIDED');
		expect(email.text).toContain('Estimate status: VOIDED');
	});

	test('rejects corrupt saved references and ranges', () => {
		expect(() => renderCustomerEstimateEmail({ ...model, publicRef: 'bad' }, content)).toThrow();
		expect(() => renderCustomerEstimateEmail({ ...model, catchup: { ...model.catchup, minCents: -1 } }, content)).toThrow();
	});
});
