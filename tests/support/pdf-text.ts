import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
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
