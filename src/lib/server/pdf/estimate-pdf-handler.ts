import { renderEstimatePdf } from './estimate-pdf';
import type { EstimateDocumentModel } from './estimate-pdf';

export type EstimatePdfBindings = Readonly<{
	ESTIMATE_READ_ENABLED?: string;
	ADVISOR_EMAIL?: string;
}>;

export type EstimatePdfDependencies = Readonly<{
	getEstimateDocument: (publicRef: string) => Promise<EstimateDocumentModel | null>;
}>;

const PUBLIC_REF_PATTERN = /^[a-f0-9]{32}$/;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const PRIVATE_HEADERS = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow, noarchive',
	'referrer-policy': 'no-referrer',
	'x-content-type-options': 'nosniff'
};

function errorResponse(status: 404 | 503): Response {
	return new Response(null, { status, headers: PRIVATE_HEADERS });
}

function configuredContactEmail(bindings: EstimatePdfBindings | undefined): string | undefined {
	const value = bindings?.ADVISOR_EMAIL;
	if (!value || value.length > 254 || !EMAIL_PATTERN.test(value)) return undefined;
	return value;
}

export async function createEstimatePdfResponse(
	publicRef: string,
	bindings: EstimatePdfBindings | undefined,
	dependencies: EstimatePdfDependencies
): Promise<Response> {
	if (bindings?.ESTIMATE_READ_ENABLED !== 'true') return errorResponse(503);
	if (!PUBLIC_REF_PATTERN.test(publicRef)) return errorResponse(404);

	let model: EstimateDocumentModel | null;
	try {
		model = await dependencies.getEstimateDocument(publicRef);
	} catch {
		return errorResponse(503);
	}
	if (!model) return errorResponse(404);

	try {
		const bytes = await renderEstimatePdf(model, { contactEmail: configuredContactEmail(bindings) });
		const body = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(body).set(bytes);
		return new Response(body, {
			status: 200,
			headers: {
				...PRIVATE_HEADERS,
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="estimate-${publicRef}.pdf"`
			}
		});
	} catch {
		return errorResponse(503);
	}
}
