import {
	PDFDocument,
	StandardFonts,
	rgb,
	type PDFFont,
	type PDFPage
} from 'pdf-lib';

export type EstimateDocumentLineItem = Readonly<{
	label: string;
	minCents: number;
	maxCents: number;
}>;

export type EstimateDocumentRange = Readonly<{
	minCents: number;
	maxCents: number;
	lineItems: readonly EstimateDocumentLineItem[];
}>;

export type EstimateDocumentModel = Readonly<{
	publicRef: string;
	state: 'VALID' | 'SUPERSEDED' | 'VOIDED';
	calculatorType: 'business' | 'personal' | 'both';
	createdAt: string;
	pricingModelVersion: string;
	engineVersion: string;
	catchup: EstimateDocumentRange;
	ongoing: EstimateDocumentRange;
	confidence: 'high' | 'good' | 'preliminary';
	manualReviewRequired: boolean;
	assumptions: readonly Readonly<{ label: string; value: string }>[];
}>;

export type EstimatePdfRenderOptions = Readonly<{
	contactEmail?: string;
}>;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 46;
const MAX_LINE_ITEMS = 24;
const MAX_ASSUMPTIONS = 24;
const MAX_TEXT_LENGTH = 180;
const MAX_ASSUMPTION_LABEL_LENGTH = 80;
const MAX_FIRST_PAGE_Y = 292;
const LETTERS = /^[a-f0-9]{32}$/;

type OverflowEstimateLineItem = Readonly<{
	section: string;
	item: EstimateDocumentLineItem;
}>;

function oklchColor(lightness: number, chroma: number, hue: number) {
	const angle = (hue * Math.PI) / 180;
	const a = chroma * Math.cos(angle);
	const b = chroma * Math.sin(angle);
	const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
	const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
	const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
	const l = lRoot ** 3;
	const m = mRoot ** 3;
	const s = sRoot ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
	const srgb = linear.map((channel) => {
		const bounded = Math.max(0, Math.min(1, channel));
		return bounded <= 0.0031308 ? 12.92 * bounded : 1.055 * bounded ** (1 / 2.4) - 0.055;
	});
	return rgb(srgb[0], srgb[1], srgb[2]);
}

const COLORS = {
	brand: oklchColor(0.38, 0.08, 251),
	ink: oklchColor(0.24, 0.03, 252),
	muted: oklchColor(0.52, 0.03, 248),
	gold: oklchColor(0.7, 0.15, 85),
	paper: oklchColor(0.985, 0.006, 244),
	panel: oklchColor(0.94, 0.015, 242),
	border: oklchColor(0.89, 0.01, 244),
	alert: oklchColor(0.58, 0.18, 25),
	alertPaper: oklchColor(0.97, 0.02, 25)
};

function normalizeText(input: string, maxLength = MAX_TEXT_LENGTH): string {
	return input
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201c\u201d]/g, '"')
		.replace(/[\u2010-\u2015\u2212]/g, '-')
		.replace(/\u2026/g, '...')
		.replace(/\u00a0/g, ' ')
		.replace(/[^\x20-\x7e]/g, '?')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, maxLength);
}

function assertCents(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid saved estimate amount.');
}

function validateModel(model: EstimateDocumentModel): void {
	if (!LETTERS.test(model.publicRef)) throw new Error('Invalid saved estimate reference.');
	if (!['VALID', 'SUPERSEDED', 'VOIDED'].includes(model.state)) throw new Error('Invalid saved estimate state.');
	if (!['business', 'personal', 'both'].includes(model.calculatorType)) throw new Error('Invalid saved estimate type.');
	if (!Number.isFinite(Date.parse(model.createdAt))) throw new Error('Invalid saved estimate date.');
	if (model.pricingModelVersion.length > 80 || model.engineVersion.length > 80) throw new Error('Invalid saved estimate version.');
	if (model.catchup.minCents > model.catchup.maxCents || model.ongoing.minCents > model.ongoing.maxCents) {
		throw new Error('Invalid saved estimate range.');
	}
	assertCents(model.catchup.minCents);
	assertCents(model.catchup.maxCents);
	assertCents(model.ongoing.minCents);
	assertCents(model.ongoing.maxCents);
	if (model.catchup.lineItems.length + model.ongoing.lineItems.length > MAX_LINE_ITEMS) {
		throw new Error('Saved estimate has too many document line items.');
	}
	if (model.assumptions.length > MAX_ASSUMPTIONS) throw new Error('Saved estimate has too many assumptions.');
	for (const item of [...model.catchup.lineItems, ...model.ongoing.lineItems]) {
		assertCents(item.minCents);
		assertCents(item.maxCents);
		if (item.minCents > item.maxCents || item.label.length > 160) throw new Error('Invalid saved estimate line item.');
	}
	for (const assumption of model.assumptions) {
		if (assumption.label.length > MAX_ASSUMPTION_LABEL_LENGTH || assumption.value.length > MAX_TEXT_LENGTH) {
			throw new Error('Invalid saved estimate assumption.');
		}
	}
}

function groupDigits(input: string): string {
	return input.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatZar(cents: number): string {
	const amount = BigInt(cents);
	const whole = (amount / 100n).toString();
	const fraction = (amount % 100n).toString().padStart(2, '0');
	return `R ${groupDigits(whole)}.${fraction}`;
}

function formatRange(minCents: number, maxCents: number): string {
	return `${formatZar(minCents)} - ${formatZar(maxCents)}`;
}

function wrapText(text: string, font: PDFFont, size: number, width: number, maxLines = 4): string[] {
	const normalized = normalizeText(text);
	if (!normalized) return [''];
	const lines: string[] = [];
	let line = '';

	const pushWord = (word: string) => {
		let fragment = '';
		for (const character of word) {
			const candidate = fragment + character;
			if (fragment && font.widthOfTextAtSize(candidate, size) > width) {
				if (line) {
					lines.push(line);
					line = '';
				}
				lines.push(fragment);
				fragment = character;
			} else {
				fragment = candidate;
			}
		}
		if (!fragment) return;
		const candidate = line ? `${line} ${fragment}` : fragment;
		if (font.widthOfTextAtSize(candidate, size) <= width) {
			line = candidate;
		} else {
			if (line) lines.push(line);
			line = fragment;
		}
	};

	for (const word of normalized.split(' ')) {
		const candidate = line ? `${line} ${word}` : word;
		if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
		else pushWord(word);
	}
	if (line) lines.push(line);

	if (lines.length <= maxLines) return lines;
	const clipped = lines.slice(0, maxLines);
	let last = clipped[maxLines - 1];
	while (last && font.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1);
	clipped[maxLines - 1] = `${last.trimEnd()}...`;
	return clipped;
}

function drawWrapped(
	page: PDFPage,
	text: string,
	font: PDFFont,
	options: Readonly<{ x: number; y: number; size: number; width: number; color: ReturnType<typeof rgb>; maxLines?: number; lineHeight?: number }>
): number {
	const lines = wrapText(text, font, options.size, options.width, options.maxLines ?? 4);
	const lineHeight = options.lineHeight ?? options.size + 2;
	lines.forEach((line, index) => {
		page.drawText(line, { x: options.x, y: options.y - index * lineHeight, size: options.size, font, color: options.color });
	});
	return lines.length * lineHeight;
}

function drawFitText(page: PDFPage, text: string, font: PDFFont, x: number, y: number, width: number, size: number, color: ReturnType<typeof rgb>) {
	const safeText = normalizeText(text);
	let fittedSize = size;
	while (fittedSize > 7 && font.widthOfTextAtSize(safeText, fittedSize) > width) fittedSize -= 0.5;
	let fittedText = safeText.length > 140 ? `${safeText.slice(0, 137)}...` : safeText;
	while (fittedText && font.widthOfTextAtSize(fittedText, fittedSize) > width) {
		if (fittedText.length > 3) {
			const prefix = fittedText.slice(0, -4).trimEnd();
			fittedText = prefix ? `${prefix}...` : fittedText.slice(0, -1);
		} else {
			fittedText = fittedText.slice(0, -1);
		}
	}
	page.drawText(fittedText, { x, y, size: fittedSize, font, color });
}

function drawRule(page: PDFPage, y: number): void {
	page.drawLine({ start: { x: PAGE_MARGIN, y }, end: { x: PAGE_WIDTH - PAGE_MARGIN, y }, thickness: 0.7, color: COLORS.border });
}

function drawPageHeader(page: PDFPage, fonts: Readonly<{ display: PDFFont; bodyBold: PDFFont }>, title: string): void {
	page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: COLORS.gold });
	page.drawText('Goat Accounting', { x: PAGE_MARGIN, y: PAGE_HEIGHT - 43, size: 18, font: fonts.display, color: COLORS.brand });
	page.drawText(title, { x: PAGE_MARGIN, y: PAGE_HEIGHT - 82, size: 21, font: fonts.display, color: COLORS.ink });
	page.drawText('Estimate summary', { x: PAGE_MARGIN, y: PAGE_HEIGHT - 103, size: 9, font: fonts.bodyBold, color: COLORS.muted });
}

function drawRangePanel(
	page: PDFPage,
	fonts: Readonly<{ body: PDFFont; bodyBold: PDFFont }>,
	x: number,
	label: string,
	minCents: number,
	maxCents: number,
	width: number
): void {
	const top = 680;
	const height = 78;
	page.drawRectangle({ x, y: top - height, width, height, color: COLORS.panel, borderColor: COLORS.border, borderWidth: 0.8 });
	page.drawRectangle({ x, y: top - height, width: 4, height, color: COLORS.gold });
	page.drawText(label, { x: x + 14, y: top - 21, size: 9, font: fonts.bodyBold, color: COLORS.brand });
	drawFitText(page, formatRange(minCents, maxCents), fonts.bodyBold, x + 14, top - 48, width - 26, 13, COLORS.ink);
}

function itemLineHeight(item: EstimateDocumentLineItem, font: PDFFont, width: number): number {
	const lines = wrapText(item.label, font, 8.5, width, 3);
	return Math.max(15, lines.length * 10 + 4);
}

function drawServiceItem(
	page: PDFPage,
	item: EstimateDocumentLineItem,
	font: PDFFont,
	x: number,
	y: number,
	width: number,
	maxLines = 3
): number {
	const labelLines = wrapText(item.label, font, 8.5, width, maxLines);
	const rowHeight = Math.max(15, labelLines.length * 10 + 4);
	labelLines.forEach((line, index) => {
		page.drawText(line, { x, y: y - index * 10, size: 8.5, font, color: COLORS.ink });
	});
	page.drawLine({ start: { x, y: y - rowHeight + 2 }, end: { x: x + width, y: y - rowHeight + 2 }, thickness: 0.45, color: COLORS.border });
	return rowHeight;
}

function drawEstimateItems(
	page: PDFPage,
	model: EstimateDocumentModel,
	fonts: Readonly<{ body: PDFFont; bodyBold: PDFFont }>
): OverflowEstimateLineItem[] {
	const x = PAGE_MARGIN;
	const width = PAGE_WIDTH - PAGE_MARGIN * 2;
	let y = 547;
	const overflow: OverflowEstimateLineItem[] = [];
	const groups = [
		{ title: 'Catch-up services', items: model.catchup.lineItems },
		{ title: 'Monthly services', items: model.ongoing.lineItems }
	];

	page.drawText('Included and likely services', { x, y: 575, size: 11, font: fonts.bodyBold, color: COLORS.ink });
	if (groups.every((group) => group.items.length === 0)) {
		page.drawText('No itemised services are stored with this estimate.', { x, y, size: 9, font: fonts.body, color: COLORS.muted });
		return overflow;
	}

	let stop = false;
	for (const group of groups) {
		if (!group.items.length) continue;
		if (stop) {
			overflow.push(...group.items.map((item) => ({ section: group.title, item })));
			continue;
		}
		if (y - 16 < MAX_FIRST_PAGE_Y) {
			stop = true;
			overflow.push(...group.items.map((item) => ({ section: group.title, item })));
			continue;
		}
		page.drawText(group.title, { x, y, size: 8.5, font: fonts.bodyBold, color: COLORS.muted });
		y -= 14;
		for (let index = 0; index < group.items.length; index += 1) {
			const item = group.items[index];
			const height = itemLineHeight(item, fonts.body, width);
			if (y - height < MAX_FIRST_PAGE_Y) {
				stop = true;
				overflow.push(...group.items.slice(index).map((overflowItem) => ({ section: group.title, item: overflowItem })));
				break;
			}
			y -= drawServiceItem(page, item, fonts.body, x, y, width) + 2;
		}
	}
	return overflow;
}

function drawStatus(page: PDFPage, state: EstimateDocumentModel['state'], font: PDFFont): void {
	if (state === 'VALID') return;
	const label = state === 'VOIDED' ? 'VOID' : 'SUPERSEDED';
	const fill = state === 'VOIDED' ? COLORS.alertPaper : COLORS.paper;
	const ink = state === 'VOIDED' ? COLORS.alert : COLORS.muted;
	const width = font.widthOfTextAtSize(label, 8) + 18;
	const x = PAGE_WIDTH - PAGE_MARGIN - width;
	const y = PAGE_HEIGHT - 47;
	page.drawRectangle({ x, y, width, height: 20, color: fill, borderColor: ink, borderWidth: 0.7 });
	page.drawText(label, { x: x + 9, y: y + 6, size: 8, font, color: ink });
}

function drawFirstPageNotes(
	page: PDFPage,
	model: EstimateDocumentModel,
	fonts: Readonly<{ body: PDFFont; bodyBold: PDFFont }>,
	contactEmail?: string
): void {
	page.drawText(`Confidence: ${model.confidence}`, { x: PAGE_MARGIN, y: 255, size: 9, font: fonts.bodyBold, color: COLORS.brand });
	if (model.manualReviewRequired) {
		page.drawText('Manual review required', { x: PAGE_MARGIN, y: 237, size: 9, font: fonts.bodyBold, color: COLORS.alert });
	}
	page.drawText('Indicative, not a final quote.', { x: PAGE_MARGIN, y: 211, size: 8.5, font: fonts.body, color: COLORS.muted });
	if (contactEmail) {
		drawWrapped(page, `Contact Rossouw: ${contactEmail}`, fonts.body, {
			x: PAGE_MARGIN,
			y: 190,
			size: 8.5,
			width: PAGE_WIDTH - PAGE_MARGIN * 2,
			color: COLORS.ink,
			maxLines: 2,
			lineHeight: 10
		});
	}
}

function drawAssumptions(
	page: PDFPage,
	assumptions: EstimateDocumentModel['assumptions'],
	font: PDFFont,
	fontBold: PDFFont,
	x: number,
	y: number,
	width: number
): void {
	const columnGap = 20;
	const columnWidth = (width - columnGap) / 2;
	const columns = [assumptions.filter((_, index) => index % 2 === 0), assumptions.filter((_, index) => index % 2 === 1)];
	columns.forEach((entries, columnIndex) => {
		let cursor = y;
		const columnX = x + columnIndex * (columnWidth + columnGap);
		for (const entry of entries) {
			const labelHeight = drawWrapped(page, entry.label, fontBold, {
				x: columnX,
				y: cursor,
				size: 8.5,
				width: columnWidth,
				color: COLORS.brand,
				maxLines: 1,
				lineHeight: 9
			});
			const valueY = cursor - labelHeight - 1;
			const valueHeight = drawWrapped(page, entry.value, font, {
				x: columnX,
				y: valueY,
				size: 7.5,
				width: columnWidth,
				color: COLORS.ink,
				maxLines: 3,
				lineHeight: 8.5
			});
			cursor = valueY - valueHeight - 6;
		}
	});
}

function drawOverflowServices(
	page: PDFPage,
	items: readonly OverflowEstimateLineItem[],
	font: PDFFont,
	fontBold: PDFFont,
	x: number,
	y: number,
	width: number
): void {
	let cursor = y;
	let section = '';
	for (const entry of items) {
		if (entry.section !== section) {
			section = entry.section;
			page.drawText(section, { x, y: cursor, size: 8, font: fontBold, color: COLORS.muted });
			cursor -= 13;
		}
		const height = drawServiceItem(page, entry.item, font, x, cursor, width, 2);
		cursor -= height + 2;
	}
}

function formatDate(isoDate: string): string {
	return new Intl.DateTimeFormat('en-ZA', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'Africa/Johannesburg'
	}).format(new Date(isoDate));
}

export async function renderEstimatePdf(
	model: EstimateDocumentModel,
	options: EstimatePdfRenderOptions = {}
): Promise<Uint8Array> {
	validateModel(model);
	const document = await PDFDocument.create();
	const display = await document.embedFont(StandardFonts.TimesRomanBold);
	const body = await document.embedFont(StandardFonts.Helvetica);
	const bodyBold = await document.embedFont(StandardFonts.HelveticaBold);
	const catchupRange = formatRange(model.catchup.minCents, model.catchup.maxCents);
	const ongoingRange = formatRange(model.ongoing.minCents, model.ongoing.maxCents);
	const date = normalizeText(formatDate(model.createdAt), 40);

	document.setCreator('Goat Accounting');
	document.setTitle(`Goat Accounting estimate ${model.publicRef}`);
	document.setSubject(`${catchupRange} | ${ongoingRange}`);
	document.setCreationDate(new Date(model.createdAt));

	const firstPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	firstPage.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: COLORS.paper });
	drawPageHeader(firstPage, { display, bodyBold }, 'Your estimate');
	drawStatus(firstPage, model.state, bodyBold);
	drawFitText(firstPage, `Reference: ${model.publicRef}`, bodyBold, PAGE_MARGIN, 719, 300, 8.5, COLORS.ink);
	firstPage.drawText(`Estimate date: ${date}`, {
		x: PAGE_WIDTH - PAGE_MARGIN - 180,
		y: 719,
		size: 8.5,
		font: body,
		color: COLORS.muted
	});
	drawRule(firstPage, 705);
	firstPage.drawText('Estimated fees', { x: PAGE_MARGIN, y: 687, size: 10, font: bodyBold, color: COLORS.ink });
	const panelGap = 14;
	const panelWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - panelGap) / 2;
	drawRangePanel(firstPage, { body, bodyBold }, PAGE_MARGIN, 'Catch-up work', model.catchup.minCents, model.catchup.maxCents, panelWidth);
	drawRangePanel(
		firstPage,
		{ body, bodyBold },
		PAGE_MARGIN + panelWidth + panelGap,
		'Monthly recurring',
		model.ongoing.minCents,
		model.ongoing.maxCents,
		panelWidth
	);
	const remainingItems = drawEstimateItems(firstPage, model, { body, bodyBold });
	drawFirstPageNotes(firstPage, model, { body, bodyBold }, options.contactEmail);

	const needsSecondPage = remainingItems.length > 0 || model.assumptions.length > 0;
	let secondPage: PDFPage | undefined;
	if (needsSecondPage) {
		secondPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		secondPage.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: COLORS.paper });
		drawPageHeader(secondPage, { display, bodyBold }, 'Estimate details');
		drawFitText(secondPage, `Reference: ${model.publicRef}`, bodyBold, PAGE_MARGIN, 719, 300, 8.5, COLORS.ink);
		drawRule(secondPage, 705);
		const columnsWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
		const halfWidth = (columnsWidth - 20) / 2;
		if (remainingItems.length) {
			secondPage.drawText('Additional services', { x: PAGE_MARGIN, y: 681, size: 9, font: bodyBold, color: COLORS.ink });
			drawOverflowServices(secondPage, remainingItems, body, bodyBold, PAGE_MARGIN, 661, halfWidth);
		}
		if (model.assumptions.length) {
			const assumptionX = PAGE_MARGIN + halfWidth + 20;
			secondPage.drawText('Inputs used', { x: assumptionX, y: 681, size: 9, font: bodyBold, color: COLORS.ink });
			drawAssumptions(secondPage, model.assumptions, body, bodyBold, assumptionX, 661, halfWidth);
		}
	}

	const pageCount = needsSecondPage ? 2 : 1;
	[firstPage, ...(secondPage ? [secondPage] : [])].forEach((page, index) => {
		const footerY = 52;
		drawRule(page, 68);
		drawFitText(
			page,
			`Pricing model ${model.pricingModelVersion} | Engine ${model.engineVersion}`,
			body,
			PAGE_MARGIN,
			footerY,
			PAGE_WIDTH - PAGE_MARGIN * 2 - 70,
			7.5,
			COLORS.muted
		);
		page.drawText(`Page ${index + 1} of ${pageCount}`, {
			x: PAGE_WIDTH - PAGE_MARGIN - 65,
			y: footerY,
			size: 7.5,
			font: body,
			color: COLORS.muted
		});
	});

	return document.save({ useObjectStreams: false });
}
