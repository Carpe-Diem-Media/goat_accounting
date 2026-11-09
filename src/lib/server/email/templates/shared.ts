import type { EstimateDocumentModel } from '../../pdf/estimate-pdf';
import type { EmailContent } from '../content';

export type RenderedEmail = Readonly<{ subject: string; html: string; text: string }>;

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function formatZar(cents: number): string {
	if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid saved estimate amount.');
	const whole = BigInt(cents);
	return `R ${(whole / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatRange(minCents: number, maxCents: number): string {
	const roundedMax = maxCents + (maxCents % 100 ? 100 - maxCents % 100 : 0);
	return `${formatZar(minCents)} - ${formatZar(roundedMax)}`;
}

export function validateEstimate(document: EstimateDocumentModel): void {
	if (!/^[a-f0-9]{32}$/.test(document.publicRef)) throw new Error('Invalid saved estimate reference.');
	if (document.assumptions.length > 24 || document.catchup.lineItems.length + document.ongoing.lineItems.length > 100) {
		throw new Error('Saved estimate has too many details.');
	}
	for (const range of [document.catchup, document.ongoing]) {
		if (!Number.isSafeInteger(range.minCents) || !Number.isSafeInteger(range.maxCents) || range.minCents < 0 || range.minCents > range.maxCents) {
			throw new Error('Invalid saved estimate range.');
		}
	}
}

export function htmlDocument(title: string, body: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body><main>${body}</main></body></html>`;
}

export function contactBlock(content: EmailContent): { html: string; text: string } {
	const phone = content.contactPhone ? `\n${content.contactPhone}` : '';
	const title = content.title ? `, ${escapeHtml(content.title)}` : '';
	const titleText = content.title ? `, ${content.title}` : '';
	return {
		html: `<p>${escapeHtml(content.contactName)}${title}<br><a href="mailto:${escapeHtml(content.contactEmail)}">${escapeHtml(content.contactEmail)}</a>${content.contactPhone ? `<br>${escapeHtml(content.contactPhone)}` : ''}</p><p>${escapeHtml(content.disclaimer)}</p>`,
		text: `${content.contactName}${titleText}\n${content.contactEmail}${phone}\n${content.disclaimer}`
	};
}
