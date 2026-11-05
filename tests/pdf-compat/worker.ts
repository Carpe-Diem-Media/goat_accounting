import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default {
	async fetch(): Promise<Response> {
		const document = await PDFDocument.create();
		const font = await document.embedFont(StandardFonts.Helvetica);
		const page = document.addPage([595.28, 841.89]);
		page.drawText('Goat Accounting PDF Worker compatibility check', {
			x: 48,
			y: 790,
			size: 16,
			font,
			color: rgb(0.13, 0.2, 0.3)
		});

		const bytes = await document.save();
		return new Response(bytes, {
			headers: { 'content-type': 'application/pdf' }
		});
	}
};
