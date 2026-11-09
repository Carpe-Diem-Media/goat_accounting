/** Regenerate local visual fixtures. TEST-ONLY content never enters runtime configuration. */
import { renderCustomerEstimateEmail } from '../src/lib/server/email/templates/customer-estimate';
import { renderInternalLeadEmail } from '../src/lib/server/email/templates/internal-lead';
import type { EstimateDocumentModel } from '../src/lib/server/pdf/estimate-pdf';

const content = {
 publicOrigin: 'https://example.test', approvalReference: 'TEST-ONLY preview approval marker',
 disclaimer: 'TEST-ONLY disclaimer. This preview is not approved business wording.',
 contactName: 'TEST-ONLY contact', contactEmail: 'preview@example.test'
};
const estimate: EstimateDocumentModel = {
 publicRef: 'a'.repeat(32), state: 'VALID', calculatorType: 'business', createdAt: '2026-11-09T12:00:00Z',
 pricingModelVersion: 'TEST-ONLY historic-v1', engineVersion: 'TEST-ONLY engine-v1',
 catchup: { minCents: 120000, maxCents: 180000, lineItems: [] },
 ongoing: { minCents: 30000, maxCents: 50000, lineItems: [] }, confidence: 'preliminary',
 manualReviewRequired: true, assumptions: [{ label: 'TEST-ONLY records', value: 'TEST-ONLY saved answer' }]
};
const customer = renderCustomerEstimateEmail(estimate, content);
const internal = renderInternalLeadEmail({ estimate, estimateId: '40000000-0000-4000-8000-000000000001', contact: { name: 'TEST-ONLY prospect', email: 'prospect@example.test', phone: null }, reviewFlags: ['TEST-ONLY review flag'], freeText: 'TEST-ONLY saved note.' }, content);
function body(html: string) { return html.split('<body>')[1].split('</body>')[0]; }
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="TEST-ONLY actual notification renderer output."><title>TEST-ONLY notification previews</title><style>
/* Hallmark · component: notification email preview · genre: editorial · theme: inherited Goat Accounting · states: native links · contrast: browser defaults · v2.0.0 */
:root { --preview-ink: currentColor; }
html, body { overflow-x: clip; }
a:focus-visible { outline: 2px solid var(--preview-ink); outline-offset: 2px; }
a:active { opacity: 0.7; }
h1 { text-wrap: balance; }
</style></head><body><p>TEST-ONLY previews. Content below comes from the actual email renderers.</p><section aria-label="Customer email">${body(customer.html)}</section><hr><section aria-label="Internal email">${body(internal.html)}</section></body></html>`;
await Bun.write(new URL('./notifications-email-preview.html', import.meta.url), html);
