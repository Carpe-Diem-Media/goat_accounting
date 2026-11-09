import type { EstimateDocumentModel } from '../../pdf/estimate-pdf';
import { requireEmailContent, type EmailContent } from '../content';
import { contactBlock, escapeHtml, formatRange, htmlDocument, type RenderedEmail, validateEstimate } from './shared';

export type InternalLeadEmailInput = Readonly<{
	estimate: EstimateDocumentModel;
	estimateId: string;
	contact: Readonly<{ name: string; email: string; phone: string | null; businessName?: string | null; preferredContactMethod?: string | null }>;
	reviewFlags: readonly string[];
	freeText?: string | null;
}>;

const MAX_CONTACT_LENGTH = 240;
const MAX_REVIEW_FLAGS = 24;
const MAX_FREE_TEXT_LENGTH = 2000;

function bounded(value: string, max: number): string {
	return value.slice(0, max);
}

export function renderInternalLeadEmail(input: InternalLeadEmailInput, content: EmailContent): RenderedEmail {
	validateEstimate(input.estimate);
	content = requireEmailContent(content);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.estimateId)) {
		throw new Error('Invalid internal estimate identifier.');
	}
	if (input.reviewFlags.length > MAX_REVIEW_FLAGS) throw new Error('Too many review flags.');
	const adminUrl = `${content.publicOrigin}/admin/estimates/${input.estimateId}`;
	const catchup = formatRange(input.estimate.catchup.minCents, input.estimate.catchup.maxCents);
	const ongoing = formatRange(input.estimate.ongoing.minCents, input.estimate.ongoing.maxCents);
	const flags = input.reviewFlags.map((flag) => bounded(flag, 120));
	const assumptions = input.estimate.assumptions.map(({ label, value }) => `${bounded(label, 80)}: ${bounded(value, 180)}`);
	const freeText = input.freeText ? bounded(input.freeText, MAX_FREE_TEXT_LENGTH) : '';
	const contact = contactBlock(content);
	const details = [
		`<p>Contact: ${escapeHtml(bounded(input.contact.name, MAX_CONTACT_LENGTH))}</p>`,
		`<p>Email: ${escapeHtml(bounded(input.contact.email, MAX_CONTACT_LENGTH))}</p>`,
		input.contact.phone ? `<p>Phone: ${escapeHtml(bounded(input.contact.phone, 40))}</p>` : '',
		input.contact.businessName ? `<p>Business: ${escapeHtml(bounded(input.contact.businessName, MAX_CONTACT_LENGTH))}</p>` : '',
		input.contact.preferredContactMethod ? `<p>Preferred contact: ${escapeHtml(bounded(input.contact.preferredContactMethod, 40))}</p>` : '',
		`<p>Estimate reference: ${input.estimate.publicRef}</p>`,
		`<p>Pricing model version: ${escapeHtml(input.estimate.pricingModelVersion)}</p>`,
		`<p>Engine version: ${escapeHtml(input.estimate.engineVersion)}</p>`,
		`<p>Catch-up estimate: ${catchup}</p><p>Ongoing estimate: ${ongoing}/month</p>`,
		`<p>Manual review required: ${input.estimate.manualReviewRequired ? 'Yes' : 'No'}</p>`,
		`<h2>Review flags</h2><ul>${flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join('')}</ul>`,
		`<h2>Answers</h2><ul>${assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
		freeText ? `<h2>Additional details</h2><p>${escapeHtml(freeText).replace(/\n/g, '<br>')}</p>` : '',
		`<p><a href="${escapeHtml(adminUrl)}">Open estimate in admin</a></p>`
	].join('');
	const text = `Contact: ${bounded(input.contact.name, MAX_CONTACT_LENGTH)}\nEmail: ${bounded(input.contact.email, MAX_CONTACT_LENGTH)}\n${input.contact.phone ? `Phone: ${bounded(input.contact.phone, 40)}\n` : ''}${input.contact.businessName ? `Business: ${bounded(input.contact.businessName, MAX_CONTACT_LENGTH)}\n` : ''}${input.contact.preferredContactMethod ? `Preferred contact: ${bounded(input.contact.preferredContactMethod, 40)}\n` : ''}Estimate reference: ${input.estimate.publicRef}\nPricing model version: ${input.estimate.pricingModelVersion}\nEngine version: ${input.estimate.engineVersion}\nCatch-up estimate: ${catchup}\nOngoing estimate: ${ongoing}/month\nManual review required: ${input.estimate.manualReviewRequired ? 'Yes' : 'No'}\nReview flags:\n${flags.join('\n')}\nAnswers:\n${assumptions.join('\n')}${freeText ? `\nAdditional details:\n${bounded(input.freeText!, MAX_FREE_TEXT_LENGTH)}` : ''}\nAdmin estimate: ${adminUrl}\n${contact.text}`;
	const subject = 'New estimate contact request';
	return { subject, html: htmlDocument(subject, `<h1>${subject}</h1>${details}${contact.html}`), text: `${subject}\n${text}` };
}
