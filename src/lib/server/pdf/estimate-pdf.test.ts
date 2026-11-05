import { describe, expect, it } from 'bun:test';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, StandardFonts } from 'pdf-lib';
import type { EstimateDocumentModel } from './estimate-pdf';

async function loadPdfModule() {
	return import('./estimate-pdf').catch(() => null);
}

function minimumDocumentModel(): EstimateDocumentModel {
	return {
		publicRef: 'a'.repeat(32),
		state: 'VALID',
		calculatorType: 'business',
		createdAt: '2026-11-05T10:00:00.000Z',
		pricingModelVersion: '1.0.0',
		engineVersion: '1.0.0',
		catchup: { minCents: 125_000, maxCents: 275_000, lineItems: [] },
		ongoing: { minCents: 45_000, maxCents: 80_000, lineItems: [] },
		confidence: 'good',
		manualReviewRequired: false,
		assumptions: []
	};
}

function maximumDocumentModel(): EstimateDocumentModel {
	const longLabel = 'Records and compliance support '.repeat(5).trim().slice(0, 160);
	return {
		...minimumDocumentModel(),
		state: 'VOIDED',
		confidence: 'preliminary',
		manualReviewRequired: true,
		catchup: {
			...minimumDocumentModel().catchup,
			lineItems: Array.from({ length: 12 }, (_, index) => ({
				label: `Catch-up ${index + 1}: ${longLabel}`.slice(0, 160),
				minCents: 10_000 + index,
				maxCents: 20_000 + index
			}))
		},
		ongoing: {
			...minimumDocumentModel().ongoing,
			lineItems: Array.from({ length: 12 }, (_, index) => ({
				label: `Monthly ${index + 1}: ${longLabel}`.slice(0, 160),
				minCents: 30_000 + index,
				maxCents: 50_000 + index
			}))
		},
		assumptions: Array.from({ length: 24 }, (_, index) => ({
			label: `Assumption ${index + 1}: customer safe input `.repeat(2).slice(0, 80),
			value: 'Résumé “records” — unsupported glyphs: 漢字 🐐 '.repeat(5).slice(0, 180)
		}))
	};
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
	const document = await PDFDocument.load(bytes);
	const textRuns: string[] = [];
	for (const page of document.getPages()) {
		const contents = page.node.Contents();
		const references = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
		for (const reference of references) {
			const stream = reference instanceof PDFRawStream ? reference : document.context.lookup(reference as never);
			if (!(stream instanceof PDFRawStream)) continue;
			const source = new TextDecoder().decode(decodePDFRawStream(stream).decode());
			for (const match of source.matchAll(/<([0-9A-F]+)>\s*Tj/g)) {
				const bytes = match[1].match(/.{2}/g) ?? [];
				textRuns.push(bytes.map((byte) => String.fromCharCode(Number.parseInt(byte, 16))).join(''));
			}
		}
	}
	return textRuns.join('\n').replace(/\s+/g, ' ');
}

describe('saved estimate PDF renderer', () => {
	it('creates a valid one-page PDF for a minimum saved estimate', async () => {
		const module = await loadPdfModule();
		expect(module).not.toBeNull();
		if (!module) return;

		const bytes = await module.renderEstimatePdf(minimumDocumentModel());
		const document = await PDFDocument.load(bytes);

		expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
		expect(document.getPageCount()).toBe(1);
		expect(document.getPages()[0].getSize()).toMatchObject({ width: 595.28, height: 841.89 });
	});

	it('wraps maximum content within two pages and marks voided estimates', async () => {
		const module = await loadPdfModule();
		expect(module).not.toBeNull();
		if (!module) return;

		const bytes = await module.renderEstimatePdf(maximumDocumentModel());
		const document = await PDFDocument.load(bytes);

		expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
		expect(document.getPageCount()).toBeLessThanOrEqual(2);
		expect(document.getPageCount()).toBeGreaterThan(1);
	});

	it('prints the saved reference, exact ranges, review notices and safe fallback text', async () => {
		const module = await loadPdfModule();
		expect(module).not.toBeNull();
		if (!module) return;
		const model = maximumDocumentModel();
		const text = await extractPdfText(await module.renderEstimatePdf(model));

		expect(text).toContain(model.publicRef);
		expect(text).toContain('Catch-up 12:');
		expect(text).toContain('Monthly 12:');
		expect(text).toContain('R 1,250.00 - R 2,750.00');
		expect(text).toContain('R 450.00 - R 800.00');
		expect(text).toContain('Confidence: preliminary');
		expect(text).toContain('Manual review required');
		expect(text).toContain('Indicative, not a final quote.');
		expect(text).toContain('VOID');
		expect(text).toContain('Resume "records" - unsupported glyphs: ?? ??');
	});

	it('preserves the saved amount ranges and reference in document metadata', async () => {
		const module = await loadPdfModule();
		expect(module).not.toBeNull();
		if (!module) return;

		const model = minimumDocumentModel();
		const bytes = await module.renderEstimatePdf(model);
		const document = await PDFDocument.load(bytes);

		expect(document.getTitle()).toContain(model.publicRef);
		expect(document.getSubject()).toContain('R 1,250.00 - R 2,750.00');
		expect(document.getSubject()).toContain('R 450.00 - R 800.00');
		expect(document.getCreationDate()?.toISOString()).toBe(model.createdAt);
	});

	it('keeps maximum model-version text within the footer width', async () => {
		const module = await loadPdfModule();
		expect(module).not.toBeNull();
		if (!module) return;
		const model = {
			...minimumDocumentModel(),
			pricingModelVersion: 'model-version-'.repeat(6).slice(0, 80),
			engineVersion: 'engine-version-'.repeat(6).slice(0, 80)
		};
		const text = await extractPdfText(await module.renderEstimatePdf(model));
		const start = text.indexOf('Pricing model ');
		const end = text.indexOf('Page 1 of 1', start);
		const footer = text.slice(start, end).trim();
		const metricsDocument = await PDFDocument.create();
		const font = await metricsDocument.embedFont(StandardFonts.Helvetica);

		expect(start).toBeGreaterThanOrEqual(0);
		expect(end).toBeGreaterThan(start);
		expect(font.widthOfTextAtSize(footer, 7)).toBeLessThanOrEqual(433.28);
	});
});
