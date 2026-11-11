import { createServer, type Server } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { TEST_PRICING_MODEL } from '../../src/lib/domain/pricing/test-corpus';
import { validatePricingModel } from '../../src/lib/domain/pricing/model';

// Run with `bunx playwright test tests/e2e/estimate-business.spec.ts`. The Playwright config builds the Worker and starts Wrangler locally with synthetic Supabase settings. This spec supplies an in-process REST fake and the isolated TEST_PRICING_MODEL, so it needs no live Supabase project, credentials, migrations, or seed data.

const APP_ORIGIN = 'http://127.0.0.1:8788';
const SUPABASE_PORT = 55191;
const SUPABASE_URL = `http://127.0.0.1:${SUPABASE_PORT}`;
const DRAFT_KEY = 'goat-accounting:business-estimator:v1';

type StoredEstimate = Record<string, unknown> & {
	public_ref: string;
	idempotency_key_hash: string;
	request_fingerprint_hash: string;
};

const modelRecord = (() => {
	const model = TEST_PRICING_MODEL as unknown as Record<string, unknown>;
	const rules = TEST_PRICING_MODEL.rules.map((rule, sortOrder) => {
		const fields = rule as unknown as Record<string, unknown>;
		const parameters: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(fields)) {
			if (!['type', 'scope', 'category', 'code', 'label', 'explanation', 'inputKey', 'condition', 'when'].includes(key)) {
				parameters[key] = value;
			}
		}
		return {
			code: fields.code,
			label: fields.label,
			scope: fields.scope,
			category: fields.category,
			rule_type: fields.type,
			input_key: fields.inputKey ?? null,
			explanation: fields.explanation,
			conditions: fields.condition !== undefined
				? { condition: fields.condition }
				: fields.when !== undefined ? { when: fields.when } : {},
			parameters,
			enabled: true,
			sort_order: sortOrder
		};
	});

	return {
		id: model.id,
		version: model.version,
		engine_contract_version: model.engineVersion,
		currency: model.currency,
		state: model.state,
		confidence_high_max_points: TEST_PRICING_MODEL.confidenceThresholds.highMaxPoints,
		confidence_good_max_points: TEST_PRICING_MODEL.confidenceThresholds.goodMaxPoints,
		pricing_rules: rules
	};
})();

const restoredModel = (() => {
	const row = modelRecord as unknown as Record<string, unknown>;
	const rules = (row.pricing_rules as Record<string, unknown>[]).map((rule) => {
		const typedRule: Record<string, unknown> = {
			type: rule.rule_type,
			scope: rule.scope,
			category: rule.category,
			code: rule.code,
			label: rule.label,
			explanation: rule.explanation
		};
		if (rule.input_key !== null) typedRule.inputKey = rule.input_key;
		for (const fields of [rule.conditions, rule.parameters] as Record<string, unknown>[]) {
			for (const [key, value] of Object.entries(fields)) {
				if (Object.hasOwn(typedRule, key)) throw new Error(`Synthetic model repeats ${key}.`);
				typedRule[key] = value;
			}
		}
		return typedRule;
	});
	return validatePricingModel({
		id: row.id,
		version: row.version,
		engineVersion: row.engine_contract_version,
		currency: row.currency,
		state: row.state,
		confidenceThresholds: {
			highMaxPoints: row.confidence_high_max_points,
			goodMaxPoints: row.confidence_good_max_points
		},
		rules
	});
})();

let supabaseServer: Server;
let savedEstimates: StoredEstimate[] = [];
let estimatePostCount = 0;
let syntheticRequests: string[] = [];

function respond(response: import('node:http').ServerResponse, body: unknown, status = 200): void {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

async function requestBody(request: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk));
	return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function startSyntheticSupabase(): Promise<void> {
	savedEstimates = [];
	estimatePostCount = 0;
	supabaseServer = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', SUPABASE_URL);
		syntheticRequests.push(`${request.method ?? 'GET'} ${url.pathname}`);
		if (url.pathname === '/rest/v1/pricing_models' && request.method === 'GET') {
			respond(response, [modelRecord]);
			return;
		}

		if (url.pathname === '/rest/v1/estimates' && request.method === 'GET') {
			const keyHash = url.searchParams.get('idempotency_key_hash')?.replace(/^eq\./, '');
			const publicRef = url.searchParams.get('public_ref')?.replace(/^eq\./, '');
			const matches = savedEstimates.filter((estimate) =>
				(keyHash ? estimate.idempotency_key_hash === keyHash : true) &&
				(publicRef ? estimate.public_ref === publicRef : true)
			);
			respond(response, matches);
			return;
		}

		if (url.pathname === '/rest/v1/estimates' && request.method === 'POST') {
			estimatePostCount += 1;
			const snapshot = await requestBody(request);
			const duplicate = savedEstimates.some((estimate) => estimate.idempotency_key_hash === snapshot.idempotency_key_hash);
			if (duplicate) {
				respond(response, {
					code: '23505',
					message: 'unique constraint "estimates_idempotency_key_hash_uidx"'
				}, 409);
				return;
			}
			const estimate: StoredEstimate = {
				...snapshot,
				id: randomUUID(),
				public_ref: randomBytes(16).toString('hex'),
				state: 'VALID',
				created_at: new Date().toISOString()
			};
			savedEstimates.push(estimate);
			respond(response, estimate, 201);
			return;
		}

		respond(response, { message: 'No synthetic Supabase route matched.' }, 404);
	});
	await new Promise<void>((resolve, reject) => {
		supabaseServer.once('error', reject);
		supabaseServer.listen(SUPABASE_PORT, '127.0.0.1', resolve);
	});
}

async function closeSyntheticSupabase(): Promise<void> {
	await new Promise<void>((resolve, reject) => supabaseServer.close((error) => error ? reject(error) : resolve()));
}

if (typeof Bun === 'undefined') {
	test.beforeAll(async () => startSyntheticSupabase());
	test.afterAll(async () => closeSyntheticSupabase());
	test.beforeEach(() => {
		savedEstimates = [];
		estimatePostCount = 0;
		syntheticRequests = [];
	});

async function choose(page: Page, label: string): Promise<void> {
	await page.getByLabel(label, { exact: true }).check();
}

async function advance(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

async function finishDefaultBusinessAnswers(page: Page, alreadyStarted = false): Promise<void> {
	if (!alreadyStarted) await page.goto(`${APP_ORIGIN}/estimate`);
	await choose(page, 'Business accounting');
	await advance(page);
	await choose(page, 'Sole proprietor');
	await advance(page);
	await choose(page, 'Fully current and reconciled');
	await advance(page);
	await choose(page, 'Accounting software is current/reasonably clean');
	await advance(page);
	await choose(page, 'Under 50');
	await advance(page);
	await choose(page, '1');
	await advance(page);
	await choose(page, 'None');
	await advance(page);
	await choose(page, 'Everything is submitted/current');
	await advance(page);
	await choose(page, 'Monthly bookkeeping/accounting');
	await advance(page);
	await choose(page, 'None of these');
	await advance(page);
	await choose(page, 'No urgent deadline');
}

async function submitEstimate(page: Page): Promise<string> {
	const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/estimates'));
	await page.getByRole('button', { name: 'View estimate', exact: true }).click();
	const response = await responsePromise;
	expect(response.status(), `Synthetic DB requests: ${syntheticRequests.join(', ')}; synthetic model: ${restoredModel.id}`).toBe(201);
	await expect(page).toHaveURL(/\/estimate\/[a-f0-9]{32}$/);
	return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

test('completes a business estimate before contact and retakes as a new saved attempt', async ({ page }) => {
	const idempotencyKeys: string[] = [];
	page.on('request', (request) => {
		if (request.url().endsWith('/api/estimates')) idempotencyKeys.push(request.headers()['idempotency-key'] ?? '');
	});

	await finishDefaultBusinessAnswers(page);
	const note = 'Business accounting context. '.repeat(80).trimEnd();
	await page.locator('#free-text').fill(note);
	await expect(page.locator('#free-text')).toHaveValue(note.slice(0, 2000));
	const firstRef = await submitEstimate(page);
	await expect(page.getByRole('heading', { name: 'Your business estimate', exact: true })).toBeVisible();
	await expect(page.getByText('Indicative estimate, not a final quote.')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Estimate ranges' }).getByText('Catch-up work', { exact: true })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Estimate ranges' }).getByText('Ongoing monthly support', { exact: true })).toBeVisible();
	await expect(page.getByText('Business complexity score')).toHaveCount(0);
	await expect(page.locator('input[type="email"]:visible, input[type="tel"]:visible')).toHaveCount(0);
	await expect(page.getByLabel(/Free-text/)).toHaveCount(0);
	await expect(page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).resolves.toBeNull();
	expect(savedEstimates[0].free_text).toHaveLength(2000);
	expect((savedEstimates[0].answers_snapshot as { business: Record<string, unknown> }).business).not.toHaveProperty('entityCount');

	await page.getByRole('button', { name: 'Start a new estimate', exact: true }).click();
	await choose(page, 'Business accounting');
	await advance(page);
	await expect(page.getByRole('heading', { name: 'What type of business/entity is this?', exact: true })).toBeVisible();
	await choose(page, 'Multiple entities');
	await page.getByLabel('Number of entities (optional)', { exact: true }).fill('3');
	await advance(page);
	await choose(page, 'Fully current and reconciled');
	await advance(page);
	await choose(page, 'Accounting software is current/reasonably clean');
	await advance(page);
	await choose(page, 'Under 50');
	await advance(page);
	await choose(page, '1');
	await advance(page);
	await choose(page, 'None');
	await advance(page);
	await choose(page, 'Everything is submitted/current');
	await advance(page);
	await choose(page, 'Monthly bookkeeping/accounting');
	await advance(page);
	await choose(page, 'None of these');
	await advance(page);
	await choose(page, 'No urgent deadline');
	const secondRef = await submitEstimate(page);

	expect(firstRef).not.toBe(secondRef);
	expect(idempotencyKeys).toHaveLength(2);
	expect(idempotencyKeys[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(idempotencyKeys[1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(idempotencyKeys[1]).not.toBe(idempotencyKeys[0]);
	expect(savedEstimates).toHaveLength(2);
	expect((savedEstimates[1].answers_snapshot as { business: Record<string, unknown> }).business).toHaveProperty('entityCount', 3);
});

test('shows lifecycle warnings while preserving saved amounts and hiding private lifecycle fields', async ({ page }) => {
	await finishDefaultBusinessAnswers(page);
	const publicRef = await submitEstimate(page);
	const ranges = page.getByRole('region', { name: 'Estimate ranges' }).locator('p.tabular-nums');
	const savedRanges = await ranges.allTextContents();
	expect(savedEstimates[0].state).toBe('VALID');
	await expect(page.getByText('Historical estimate', { exact: true })).toHaveCount(0);

	const privateVoidReason = 'Private invalidation note';
	savedEstimates[0].state = 'VOIDED';
	savedEstimates[0].void_reason = privateVoidReason;
	await page.goto(`${APP_ORIGIN}/estimate/${publicRef}`);
	await expect(page.getByRole('alert')).toContainText('This estimate has been invalidated');
	await expect(page.getByRole('alert')).toContainText('Do not rely on these saved amounts');
	await expect(page.getByText(privateVoidReason, { exact: true })).toHaveCount(0);
	expect(await ranges.allTextContents()).toEqual(savedRanges);

	const internalReplacementId = '00000000-0000-4000-8000-000000000001';
	savedEstimates[0].state = 'SUPERSEDED';
	savedEstimates[0].superseded_by_estimate_id = internalReplacementId;
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Historical estimate', exact: true })).toBeVisible();
	await expect(page.getByText(/superseded/i)).toBeVisible();
	await expect(page.getByText(internalReplacementId, { exact: true })).toHaveCount(0);
	expect(await ranges.allTextContents()).toEqual(savedRanges);
});

test('renders duplicate labels in saved line items and review flags', async ({ page }) => {
	await finishDefaultBusinessAnswers(page);
	await submitEstimate(page);

	const snapshot = savedEstimates[0].calculation_snapshot as unknown as {
		catchup: { lineItems: { label: string }[] };
		ongoing: { lineItems: { label: string }[] };
		manualReviewRequired: boolean;
		reviewFlags: { label: string; reason: string }[];
		reviewReasons: string[];
	};
	expect(snapshot.catchup.lineItems.length).toBeGreaterThan(1);
	expect(snapshot.ongoing.lineItems.length).toBeGreaterThan(1);
	snapshot.catchup.lineItems[1].label = snapshot.catchup.lineItems[0].label;
	snapshot.ongoing.lineItems[1].label = snapshot.ongoing.lineItems[0].label;
	snapshot.reviewFlags = [
		{ label: 'Shared review label', reason: 'First saved review reason.' },
		{ label: 'Shared review label', reason: 'Second saved review reason.' }
	];
	snapshot.reviewReasons = snapshot.reviewFlags.map((flag) => flag.reason);
	snapshot.manualReviewRequired = true;

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your business estimate', exact: true })).toBeVisible();
	await expect(page.locator('section[aria-labelledby="catchup-items-heading"] li')).toHaveCount(snapshot.catchup.lineItems.length);
	await expect(page.locator('section[aria-labelledby="ongoing-items-heading"] li')).toHaveCount(snapshot.ongoing.lineItems.length);
	await expect(page.locator('section[aria-labelledby="review-heading"] li')).toHaveCount(2);
});

test('offers a download link to the saved PDF endpoint', async ({ page }) => {
	await finishDefaultBusinessAnswers(page);
	const publicRef = await submitEstimate(page);
	const pdfPath = `/api/estimates/${publicRef}/pdf`;
	const downloadLink = page.getByRole('link', { name: 'Download PDF', exact: true });
	await expect(downloadLink).toBeVisible();
	await expect(downloadLink).toHaveAttribute('href', pdfPath);

	const response = await page.request.get(`${APP_ORIGIN}${pdfPath}`);
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('application/pdf');
	expect(response.headers()['content-disposition']).toContain('attachment');
	expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('asks schema-supported backlog and compliance branches and preserves approved complexity choices', async ({ page }) => {
	await page.goto(`${APP_ORIGIN}/estimate`);
	await choose(page, 'Business accounting');
	await advance(page);
	await choose(page, 'Pty Ltd / Close Corporation');
	await advance(page);
	await choose(page, '1–2 years behind');
	await page.getByLabel('Approximate months outstanding (optional)', { exact: true }).fill('18');
	await advance(page);
	await choose(page, 'Records are incomplete or messy');
	await choose(page, 'No, statements are not available for the full period');
	await advance(page);
	await choose(page, '151–300');
	await advance(page);
	await choose(page, '2–3');
	await advance(page);
	await choose(page, '1–5');
	await advance(page);
	await choose(page, 'Some submissions are outstanding');
	await choose(page, 'VAT');
	await advance(page);
	await choose(page, 'VAT');
	await advance(page);
	await choose(page, 'Stock/inventory');
	await choose(page, 'Multiple branches');
	await choose(page, 'Multiple companies/entities');
	await advance(page);
	await choose(page, 'Within 30 days');

	const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/estimates'));
	await page.getByRole('button', { name: 'View estimate', exact: true }).click();
	const response = await responsePromise;
	expect(response.status()).toBe(201);
	const request = await response.request().postDataJSON() as {
		answers: { business: Record<string, unknown> };
	};
	expect(request.answers.business).toMatchObject({
		booksStatus: '1_to_2_years',
		outstandingMonths: 18,
		bankStatementsAvailableForFullPeriod: 'no',
		outstandingComplianceAreas: ['vat'],
		complexityFactors: ['inventory', 'multiple_branches', 'multiple_entities']
	});
	expect(request.answers.business).not.toHaveProperty('entityCount');
	for (const unsupportedField of ['paymentPlatformCount', 'inventorySystem', 'branchCount']) {
		expect(request.answers.business).not.toHaveProperty(unsupportedField);
	}
	await expect(page.getByRole('heading', { name: 'Your business estimate', exact: true })).toBeVisible();
});

test('clears incompatible outstanding months when B2 changes during backward navigation', async ({ page }) => {
	await page.goto(`${APP_ORIGIN}/estimate`);
	await choose(page, 'Business accounting');
	await advance(page);
	await choose(page, 'Sole proprietor');
	await advance(page);
	await choose(page, '1–2 years behind');
	const monthsInput = page.getByLabel('Approximate months outstanding (optional)', { exact: true });
	await monthsInput.fill('18');
	await advance(page);
	await choose(page, 'Accounting software is current/reasonably clean');
	await advance(page);
	await choose(page, 'Under 50');
	await advance(page);
	await choose(page, '1');
	await advance(page);
	await choose(page, 'None');
	await advance(page);
	await choose(page, 'Everything is submitted/current');
	await advance(page);
	await choose(page, 'Monthly bookkeeping/accounting');
	await advance(page);
	await choose(page, 'None of these');
	await advance(page);
	await choose(page, 'No urgent deadline');

	for (let step = 0; step < 8; step += 1) {
		await page.getByRole('button', { name: 'Back', exact: true }).click();
	}
	await expect(page.getByRole('heading', { name: 'How up to date are your books/accounting records?' })).toBeVisible();
	await expect(page.getByLabel('1–2 years behind', { exact: true })).toBeChecked();
	await expect(monthsInput).toHaveValue('18');
	await expect(monthsInput).toHaveAttribute('min', '13');
	await expect(monthsInput).toHaveAttribute('max', '24');

	await choose(page, 'More than 2 years behind');
	await expect(monthsInput).toHaveValue('');
	await expect(monthsInput).toHaveAttribute('min', '25');
	await expect(monthsInput).toHaveAttribute('max', '100');
	await monthsInput.fill('25');
	await advance(page);
	await page.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(monthsInput).toHaveValue('25');

	await choose(page, '1–2 years behind');
	await expect(monthsInput).toHaveValue('');
	await monthsInput.fill('24');
	for (let step = 0; step < 8; step += 1) await advance(page);

	const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/estimates'));
	await page.getByRole('button', { name: 'View estimate', exact: true }).click();
	const response = await responsePromise;
	expect(response.status()).toBe(201);
	const request = await response.request().postDataJSON() as {
		answers: { business: Record<string, unknown> };
	};
	expect(request.answers.business).toMatchObject({ booksStatus: '1_to_2_years', outstandingMonths: 24 });
});

test('uses keyboard focus and radio navigation to advance through the questionnaire', async ({ page }) => {
	await page.goto(`${APP_ORIGIN}/estimate`);
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Skip to questionnaire' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'What would you like an estimate for?' })).toBeFocused();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Space');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'What type of business/entity is this?' })).toBeFocused();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Space');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'How up to date are your books/accounting records?' })).toBeFocused();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Space');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'What condition are the existing records in?' })).toBeFocused();
});

test('stays within a mobile viewport without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${APP_ORIGIN}/estimate`);
	await choose(page, 'Business accounting');
	await advance(page);
	await expect(page.getByRole('heading', { name: 'What type of business/entity is this?' })).toBeVisible();
	const widths = await page.evaluate(() => ({
		viewport: document.documentElement.clientWidth,
		content: document.documentElement.scrollWidth
	}));
	expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

test('recovers an in-progress, versioned draft after reload', async ({ page }) => {
	await page.goto(`${APP_ORIGIN}/estimate`);
	await choose(page, 'Business accounting');
	await advance(page);
	await choose(page, 'Multiple entities');
	await page.getByLabel('Number of entities (optional)', { exact: true }).fill('3');
	await advance(page);
	await choose(page, '1–2 years behind');
	await page.getByLabel('Approximate months outstanding (optional)', { exact: true }).fill('18');
	const draft = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
	expect(draft).not.toBeNull();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'How up to date are your books/accounting records?' })).toBeVisible();
	await expect(page.getByLabel('1–2 years behind', { exact: true })).toBeChecked();
	await expect(page.getByLabel('Approximate months outstanding (optional)', { exact: true })).toHaveValue('18');
	const restored = JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY) ?? '{}') as {
		version?: number;
		expiresAt?: number;
		status?: string;
	};
	expect(restored).toMatchObject({ version: 1, status: 'IN_PROGRESS' });
	expect(restored.expiresAt).toBeGreaterThan(Date.now());
});

test('reuses the completion idempotency key on retry after an unavailable API response', async ({ page }) => {
	const idempotencyKeys: string[] = [];
	page.on('request', (request) => {
		if (request.url().endsWith('/api/estimates')) idempotencyKeys.push(request.headers()['idempotency-key'] ?? '');
	});
	await finishDefaultBusinessAnswers(page);
	await page.route('**/api/estimates', (route) => route.fulfill({
		status: 503,
		contentType: 'application/json',
		body: JSON.stringify({ error: { code: 'ESTIMATE_UNAVAILABLE', message: 'The estimate could not be saved right now.' } })
	}));
	await page.getByRole('button', { name: 'View estimate', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('could not be saved');
	await expect(page.getByRole('button', { name: 'View estimate', exact: true })).toBeEnabled();
	const failedEvents = await page.evaluate(() => (window as Window & { dataLayer?: { event?: string }[] }).dataLayer ?? []);
	expect(failedEvents.some((event) => event.event === 'estimate_completed')).toBe(false);
	await page.unroute('**/api/estimates');
	const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/estimates'));
	await page.getByRole('button', { name: 'View estimate', exact: true }).click();
	const response = await responsePromise;
	expect(response.status()).toBe(201);
	expect(idempotencyKeys).toHaveLength(2);
	expect(idempotencyKeys[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
	await expect.poll(() => page.evaluate(() => ((window as Window & { dataLayer?: { event?: string }[] }).dataLayer ?? []).filter((event) => event.event === 'estimate_completed').length)).toBe(1);
});

test('submits only once when the completion button receives a rapid double click', async ({ page }) => {
	let estimateRequestCount = 0;
	page.on('request', (request) => {
		if (request.url().endsWith('/api/estimates')) estimateRequestCount += 1;
	});
	await finishDefaultBusinessAnswers(page);
	await page.route('**/api/estimates', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 300));
		await route.continue();
	});
	await page.getByRole('button', { name: 'View estimate', exact: true }).dblclick({ delay: 20 });
	await expect(page.getByRole('heading', { name: 'Your business estimate', exact: true })).toBeVisible();
	expect(estimateRequestCount).toBe(1);
	expect(estimatePostCount).toBe(1);
});

test('does not claim completion when the estimate API is unavailable', async ({ page }) => {
	await finishDefaultBusinessAnswers(page);
	await page.route('**/api/estimates', (route) => route.abort());
	await page.getByRole('button', { name: 'View estimate', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('could not be saved');
	await expect(page).toHaveURL(`${APP_ORIGIN}/estimate`);
	await expect(page.getByRole('button', { name: 'View estimate', exact: true })).toBeEnabled();
	const draft = JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY) ?? '{}') as {
		idempotencyKey?: string;
		status?: string;
	};
	expect(draft.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(draft.status).toBe('IN_PROGRESS');
	expect(savedEstimates).toHaveLength(0);
});

test('estimator pages isolate GTM and emit only coarse in-memory events', async ({ page }) => {
  const tagRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('googletagmanager.com')) tagRequests.push(request.url()); });
  await page.goto('/estimate?email=private%40example.invalid');
  await expect(page.getByRole('heading', { name: 'Estimate your accounting and tax support' })).toBeVisible();
  await choose(page, 'Business accounting');
  await advance(page);
  const events = await page.evaluate(() => (window as Window & { dataLayer?: unknown[] }).dataLayer ?? []);
  expect(events).toContainEqual({ event: 'estimate_started' });
  expect(events).toContainEqual({ event: 'estimate_step_completed', calculator_type: 'business' });
  expect(JSON.stringify(events)).not.toContain('private');
  expect(tagRequests).toEqual([]);
});

test('saved-result events do not contain the estimate reference or answer values', async ({ page }) => {
  const tagRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('googletagmanager.com')) tagRequests.push(request.url()); });
  await finishDefaultBusinessAnswers(page);
  const ref = await submitEstimate(page);
  await expect.poll(() => page.evaluate(() => ((window as Window & { dataLayer?: { event?: string }[] }).dataLayer ?? []).some((event) => event.event === 'estimate_result_viewed'))).toBe(true);
  const events = await page.evaluate(() => (window as Window & { dataLayer?: unknown[] }).dataLayer ?? []);
  expect(events).toContainEqual({ event: 'estimate_completed', calculator_type: 'business' });
  expect(events).toContainEqual(expect.objectContaining({ event: 'estimate_result_viewed', calculator_type: 'business' }));
  expect(JSON.stringify(events)).not.toContain(ref);
  expect(JSON.stringify(events)).not.toContain('Sole proprietor');
  const pdf = page.getByRole('link', { name: 'Download PDF' });
  await page.route(`**/api/estimates/${ref}/pdf`, (route) => route.fulfill({ status: 503, body: '' }));
  await pdf.click();
  await expect(page.getByRole('status').filter({ hasText: 'PDF could not be downloaded' })).toBeVisible();
  const failed = await page.evaluate(() => (window as Window & { dataLayer?: { event?: string }[] }).dataLayer ?? []);
  expect(failed.filter((event) => event.event === 'estimate_pdf_downloaded')).toHaveLength(0);
  await page.unroute(`**/api/estimates/${ref}/pdf`);
  await page.route(`**/api/estimates/${ref}/pdf`, (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: 'not-a-pdf' }));
  await pdf.click();
  await expect(page.getByRole('status').filter({ hasText: 'PDF could not be downloaded' })).toBeVisible();
  expect((await page.evaluate(() => (window as Window & { dataLayer?: { event?: string }[] }).dataLayer ?? [])).filter((event) => event.event === 'estimate_pdf_downloaded')).toHaveLength(0);
  await page.unroute(`**/api/estimates/${ref}/pdf`);
  for (let count = 1; count <= 2; count++) {
    const download = page.waitForEvent('download');
    await pdf.click();
    expect((await download).suggestedFilename()).toBe(`estimate-${ref}.pdf`);
    await expect.poll(() => page.evaluate(() => ((window as Window & { dataLayer?: { event?: string }[] }).dataLayer ?? []).filter((event) => event.event === 'estimate_pdf_downloaded').length)).toBe(count);
  }
  await page.setViewportSize({ width: 375, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(tagRequests).toEqual([]);
});

test('marketing to saved estimate navigation cannot leak references to external requests', async ({ page }) => {
  const external: Array<{ url: string; referer: string }> = [];
  const relay: Array<{ referer: string; cookie: string }> = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/analytics/events') relay.push({ referer: request.headers().referer ?? '', cookie: request.headers().cookie ?? '' });
    if (url.origin !== APP_ORIGIN) {
      external.push({ url: request.url(), referer: request.headers().referer ?? '' });
      if (url.hostname === 'www.googletagmanager.com' && url.pathname.endsWith('/gtm.js')) {
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__syntheticGtmLoaded = true;' });
      } else await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as Window & { __syntheticGtmLoaded?: boolean }).__syntheticGtmLoaded)).toBe(true);
  await page.evaluate(() => { const link = document.createElement('a'); link.href = '/estimate'; link.textContent = 'Synthetic estimator link'; document.body.append(link); });
  await page.getByRole('link', { name: 'Synthetic estimator link' }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/estimate`);
  expect(await page.evaluate(() => (window as Window & { __syntheticGtmLoaded?: boolean }).__syntheticGtmLoaded)).toBeUndefined();
  await finishDefaultBusinessAnswers(page, true);
  const ref = await submitEstimate(page);
  expect(relay).toEqual([]);
  expect(external.some((item) => item.url.includes(ref) || item.referer.includes(ref))).toBe(false);
  expect(relay.every((item) => !item.referer && !item.cookie)).toBe(true);
});

test('direct unauthenticated dashboard access never returns metrics', async ({ request }) => {
  const response = await request.get('/admin/dashboard', { maxRedirects: 0 });
  expect([303, 403, 503]).toContain(response.status());
  expect(await response.text()).not.toContain('Catch-up opportunity');
  const relay = await request.post('/api/analytics/events', { headers: { origin: APP_ORIGIN, 'content-type': 'application/json' }, data: { event: 'estimate_started' } });
  expect(relay.status()).toBe(503);
  expect(relay.headers()['cache-control']).toContain('no-store');
});
}
