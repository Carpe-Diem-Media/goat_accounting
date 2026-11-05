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

async function finishDefaultBusinessAnswers(page: Page): Promise<void> {
	await page.goto(`${APP_ORIGIN}/estimate`);
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

test('saves a personal estimate without business answers', async ({ page }) => {
 await page.goto(`${APP_ORIGIN}/estimate`);
 await choose(page, 'Personal tax');
 await advance(page);
 await choose(page, 'Current');
 await advance(page);
 await choose(page, 'Salary/remuneration');
 await advance(page);
 await choose(page, 'Normal filing only');
 await advance(page);
 await choose(page, 'Annual personal tax return');
 await advance(page);
 await choose(page, 'No urgent deadline');
 await submitEstimate(page);
 expect(savedEstimates).toHaveLength(1);
 expect(savedEstimates[0].calculator_type).toBe('personal');
});

test('rental and provisional tax details survive reload and appear in the saved snapshot and PDF', async ({ page }) => {
 await page.goto(`${APP_ORIGIN}/estimate`);
 await choose(page, 'Personal tax'); await advance(page);
 await choose(page, 'Multiple tax years outstanding'); await advance(page);
 await choose(page, 'Rental property'); await choose(page, 'Provisional tax'); await advance(page);
 await page.getByLabel('Years outstanding (optional)').fill('3');
 await page.getByRole('group', { name: 'How many rental properties?' }).getByLabel('2–3', { exact: true }).check();
 await page.reload();
 await expect(page.getByLabel('Years outstanding (optional)')).toHaveValue('3');
 await expect(page.getByRole('group', { name: 'How many rental properties?' }).getByLabel('2–3', { exact: true })).toBeChecked();
 await advance(page); await choose(page, 'Normal filing only'); await advance(page);
 await choose(page, 'Provisional tax'); await advance(page); await choose(page, 'No urgent deadline');
 const ref = await submitEstimate(page);
 expect(savedEstimates[0].answers_snapshot).toMatchObject({ calculatorType: 'personal', personal: { outstandingYears: 3, incomeSources: ['rental_property', 'provisional_tax'], rentalPropertyCount: '2_to_3' } });
 const pdf = await page.request.get(`${APP_ORIGIN}/api/estimates/${ref}/pdf`);
 expect(pdf.status()).toBe(200); expect(pdf.headers()['content-type']).toBe('application/pdf');
 await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', `/api/estimates/${ref}/pdf`);
});

test('removes conditional answers when their sources and status change', async ({ page }) => {
 await page.goto(`${APP_ORIGIN}/estimate`); await choose(page, 'Personal tax'); await advance(page);
 await choose(page, 'Multiple tax years outstanding'); await advance(page);
 await choose(page, 'Rental property'); await choose(page, 'Foreign income/assets'); await choose(page, 'Capital gains/disposals'); await advance(page);
 await page.getByLabel('Years outstanding (optional)').fill('4');
 await page.getByRole('group', { name: 'How many rental properties?' }).getByLabel('1', { exact: true }).check();
 await page.getByRole('group', { name: 'Is foreign income present?' }).getByLabel('Yes', { exact: true }).check();
 await page.getByRole('group', { name: 'Did capital gains transactions occur?' }).getByLabel('Yes', { exact: true }).check();
 await page.getByRole('button', { name: 'Back', exact: true }).click();
 await page.getByLabel('Rental property', { exact: true }).uncheck();
 await page.getByLabel('Foreign income/assets', { exact: true }).uncheck();
 await page.getByLabel('Capital gains/disposals', { exact: true }).uncheck();
 await choose(page, 'Salary/remuneration');
 await page.getByRole('button', { name: 'Back', exact: true }).click();
 await choose(page, 'Current'); await advance(page); await advance(page);
 await choose(page, 'Normal filing only'); await advance(page); await choose(page, 'Annual personal tax return'); await advance(page);
 await choose(page, 'No urgent deadline'); await submitEstimate(page);
 const personal = (savedEstimates[0].answers_snapshot as { personal: Record<string, unknown> }).personal;
 for (const key of ['outstandingYears', 'rentalPropertyCount', 'foreignIncomePresent', 'capitalGainsOccurred']) expect(personal).not.toHaveProperty(key);
});

test('high-risk SARS answers require review and retries retain the submission key', async ({ page }) => {
 const keys: string[] = [];
 page.on('request', (request) => { if (request.url().endsWith('/api/estimates')) keys.push(request.headers()['idempotency-key'] ?? ''); });
 await page.goto(`${APP_ORIGIN}/estimate`); await choose(page, 'Personal tax'); await advance(page);
 await choose(page, 'SARS issue/verification/audit/penalties'); await advance(page);
 await choose(page, 'Salary/remuneration'); await advance(page); await choose(page, 'Audit'); await advance(page);
 await choose(page, 'Dispute/objection support'); await advance(page); await choose(page, 'Within 30 days');
 await page.route('**/api/estimates', (route) => route.fulfill({ status: 503, body: '{}' }));
 await page.getByRole('button', { name: 'View estimate' }).click();
 await expect(page.getByRole('alert')).toContainText('could not be saved');
 await page.reload(); await page.unroute('**/api/estimates'); await submitEstimate(page);
 expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
 await expect(page.getByRole('heading', { name: 'A professional review is needed' })).toBeVisible();
 expect((savedEstimates[0].calculation_snapshot as { manualReviewRequired: boolean }).manualReviewRequired).toBe(true);
});

test('combined flow saves both branches together with one urgency', async ({ page }) => {
 await page.goto(`${APP_ORIGIN}/estimate`); await choose(page, 'Business and personal tax'); await advance(page);
 await choose(page, 'Sole proprietor'); await advance(page);
 await choose(page, 'Fully current and reconciled'); await advance(page);
 await choose(page, 'Accounting software is current/reasonably clean'); await advance(page);
 await choose(page, 'Under 50'); await advance(page); await choose(page, '1'); await advance(page);
 await choose(page, 'None'); await advance(page); await choose(page, 'Everything is submitted/current'); await advance(page);
 await choose(page, 'Monthly bookkeeping/accounting'); await advance(page); await choose(page, 'None of these'); await advance(page);
 await choose(page, 'Current'); await advance(page); await choose(page, 'Salary/remuneration'); await advance(page);
 await choose(page, 'Normal filing only'); await advance(page); await choose(page, 'Annual personal tax return'); await advance(page);
 await choose(page, 'No urgent deadline'); await submitEstimate(page);
 expect(savedEstimates).toHaveLength(1);
 expect(savedEstimates[0].answers_snapshot).toMatchObject({ calculatorType: 'both', urgency: 'no_urgent_deadline', business: { entityType: 'sole_proprietor' }, personal: { currentStatus: 'current' } });
 await expect(page.getByRole('heading', { name: 'Your business and personal estimate' })).toBeVisible();
});

test('an expired in-progress draft cannot be submitted as a completed estimate', async ({ page }) => {
 await page.goto(`${APP_ORIGIN}/estimate`); await choose(page, 'Personal tax'); await advance(page);
 await choose(page, 'Current'); await advance(page); await choose(page, 'Salary/remuneration'); await advance(page);
 await choose(page, 'Normal filing only'); await advance(page); await choose(page, 'Annual personal tax return'); await advance(page);
 await choose(page, 'No urgent deadline');
 await page.evaluate(() => { const now = Date.now(); Date.now = () => now + 25 * 60 * 60 * 1000; });
 await page.getByRole('button', { name: 'View estimate' }).click();
 await expect(page.getByRole('status')).toContainText('expired');
 await expect(page.getByRole('heading', { name: 'What would you like an estimate for?' })).toBeVisible();
 expect(savedEstimates).toHaveLength(0);
});

}
