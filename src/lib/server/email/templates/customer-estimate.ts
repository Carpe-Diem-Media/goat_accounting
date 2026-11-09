import type { EstimateDocumentModel } from '../../pdf/estimate-pdf';
import { requireEmailContent, type EmailContent } from '../content';
import { contactBlock, escapeHtml, formatRange, htmlDocument, type RenderedEmail, validateEstimate } from './shared';

export function renderCustomerEstimateEmail(document: EstimateDocumentModel, content: EmailContent): RenderedEmail {
	validateEstimate(document);
	content = requireEmailContent(content);
	const estimateUrl = `${content.publicOrigin}/estimate/${document.publicRef}`;
	const pdfUrl = `${content.publicOrigin}/api/estimates/${document.publicRef}/pdf`;
	const catchup = formatRange(document.catchup.minCents, document.catchup.maxCents);
	const ongoing = formatRange(document.ongoing.minCents, document.ongoing.maxCents);
	const reviewText = document.manualReviewRequired ? 'Review required: Yes' : 'Review required: No';
	const contact = contactBlock(content);
	const subject = 'Your saved estimate';
	const html = htmlDocument(subject, `<h1>${subject}</h1><p>Reference: ${document.publicRef}</p><p>Estimate status: ${escapeHtml(document.state)}</p><p>Catch-up estimate: ${catchup}</p><p>Ongoing estimate: ${ongoing}</p><p>Confidence: ${escapeHtml(document.confidence)}</p><p>${reviewText}</p><p><a href="${escapeHtml(estimateUrl)}">View estimate</a></p><p><a href="${escapeHtml(pdfUrl)}">Download estimate PDF</a></p>${contact.html}`);
	const text = `${subject}\nReference: ${document.publicRef}\nEstimate status: ${document.state}\nCatch-up estimate: ${catchup}\nOngoing estimate: ${ongoing}\nConfidence: ${escapeHtml(document.confidence)}\n${reviewText}\nView estimate: ${estimateUrl}\nDownload estimate PDF: ${pdfUrl}\n${contact.text}`;
	return { subject, html, text };
}
