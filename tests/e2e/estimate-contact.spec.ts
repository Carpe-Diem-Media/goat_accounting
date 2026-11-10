import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import { calculateEstimate } from '../../src/lib/domain/estimator/estimate';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../src/lib/domain/pricing/test-corpus';
import { handleContactPost } from '../../src/lib/server/leads/contact-api';
import { createLeadFromEstimate } from '../../src/lib/server/leads/create-lead';
import { ContactConflictError } from '../../src/lib/server/leads/errors';
import type { ContactInput } from '../../src/lib/domain/leads/contact';
import type { TurnstileResult } from '../../src/lib/server/leads/turnstile';

// The estimate comes from the canonical synthetic corpus. Supabase and contact persistence stay in-process. Browser contact POSTs call the real validator and lead service, with a single-use synthetic verifier. This checks browser behavior, not Supabase transaction or database acceptance.

const APP_ORIGIN = 'http://127.0.0.1:8788';
const SUPABASE_PORT = 55191;
const SUPABASE_URL = `http://127.0.0.1:${SUPABASE_PORT}`;
const scenario = CANONICAL_PRICING_TEST_CORPUS.find((entry) => entry.id === 'simple-current-sole-proprietor');
if (!scenario) throw new Error('The canonical synthetic business estimate fixture is missing.');
const calculation = calculateEstimate(scenario.answers, TEST_PRICING_MODEL);

type SyntheticEstimate = {
	id: string;
	public_ref: string;
	calculator_type: string;
	state: string;
	created_at: string;
	calculation_snapshot: typeof calculation;
	catchup_min_cents: number;
	catchup_max_cents: number;
	ongoing_min_cents: number;
	ongoing_max_cents: number;
	pricing_model_version: string;
	engine_version: string;
};

type SyntheticRequestState = {
	ref: string;
	state: 'VALID' | 'SUPERSEDED' | 'VOIDED';
	rejectNextVerification: boolean;
	consumedTokens: Set<string>;
	contact: ContactInput | null;
	leads: number;
	events: number;
	deliveries: string[];
};

let supabaseServer: Server;
let activeState: SyntheticRequestState;
let activeEstimate: SyntheticEstimate;

function respond(response: import('node:http').ServerResponse, body: unknown, status = 200): void {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

async function startSyntheticSupabase(): Promise<void> {
	supabaseServer = createServer((request, response) => {
		const url = new URL(request.url ?? '/', SUPABASE_URL);
		if (url.pathname === '/rest/v1/estimates' && request.method === 'GET') {
			const ref = url.searchParams.get('public_ref')?.replace(/^eq\./, '');
			respond(response, ref === activeEstimate.public_ref ? [{ ...activeEstimate, state: activeState.state }] : []);
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

function newSyntheticEstimate(state: SyntheticRequestState['state'] = 'VALID'): void {
	const ref = randomBytes(16).toString('hex');
	activeState = {
		ref,
		state,
		rejectNextVerification: false,
		consumedTokens: new Set(),
		contact: null,
		leads: 0,
		events: 0,
		deliveries: []
	};
	activeEstimate = {
		id: randomUUID(),
		public_ref: ref,
		calculator_type: scenario.answers.calculatorType,
		state,
		created_at: '2026-11-05T10:00:00.000Z',
		calculation_snapshot: calculation,
		catchup_min_cents: calculation.catchup.minCents,
		catchup_max_cents: calculation.catchup.maxCents,
		ongoing_min_cents: calculation.ongoing.minCents,
		ongoing_max_cents: calculation.ongoing.maxCents,
		pricing_model_version: TEST_PRICING_MODEL.version,
		engine_version: TEST_PRICING_MODEL.engineVersion
	};
}

function installTurnstileStub(page: Page): Promise<void> {
	return page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', (route) => route.fulfill({
		status: 200,
		contentType: 'application/javascript',
		body: `(() => {
			let sequence = 0;
			const widgets = new Map();
			const issue = (options) => options.callback('synthetic-token-' + crypto.randomUUID() + '-' + (++sequence));
			window.turnstile = {
				render: (container, options) => { const id = 'synthetic-widget'; widgets.set(id, options); issue(options); return id; },
				reset: (id) => { const options = widgets.get(id); if (options) issue(options); },
				remove: (id) => widgets.delete(id)
			};
			window.__contactTurnstileTest = {
				expire: () => { const options = widgets.get('synthetic-widget'); options?.['expired-callback']?.(); },
				fail: () => { const options = widgets.get('synthetic-widget'); options?.['error-callback']?.(); }
			};
		})();`
	}));
}

async function installContactRoute(page: Page): Promise<void> {
	await page.route(`**/api/estimates/${activeState.ref}/contact`, async (route: Route) => {
		const request = route.request();
		const input = new Request(request.url(), {
			method: request.method(),
			headers: request.headers(),
			body: request.postData() ?? undefined
		});
		const dependencies = {
			verify: async (token: string): Promise<TurnstileResult> => {
				if (activeState.consumedTokens.has(token)) return { success: false, reason: 'rejected' };
				activeState.consumedTokens.add(token);
				if (activeState.rejectNextVerification) {
					activeState.rejectNextVerification = false;
					return { success: false, reason: 'rejected' };
				}
				return { success: true };
			},
			findEstimateId: async (publicRef: string) => publicRef === activeState.ref ? activeEstimate.id : null,
			createContactLead: async (_estimateId: string, contact: ContactInput) => {
				if (activeState.state !== 'VALID' && !activeState.contact) throw new Error('Estimate is not eligible for a first request.');
				if (activeState.contact) {
					if (JSON.stringify(activeState.contact) !== JSON.stringify(contact)) throw new ContactConflictError();
					return;
				}
				activeState.contact = contact;
				activeState.leads += 1;
				activeState.events += 1;
				if (contact.requestedEstimateEmail) activeState.deliveries.push('estimate_email');
				if (contact.requestedContact) activeState.deliveries.push('contact_request');
			}
		};
		const response = await handleContactPost(input, (body) => createLeadFromEstimate(activeState.ref, body, dependencies));
		await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
	});
}

async function openContact(page: Page): Promise<void> {
	await page.goto(`${APP_ORIGIN}/estimate/${activeState.ref}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Your business estimate', exact: true })).toBeVisible();
	await expect(page.getByLabel('Full name')).toBeHidden();
	await page.getByText('Email estimate or request contact', { exact: true }).click();
	await expect(page.getByRole('form', { name: 'Contact request' })).toBeVisible();
}

async function fillContact(page: Page, { email = true, contact = false }: { email?: boolean; contact?: boolean } = {}): Promise<void> {
	const form = page.getByRole('form', { name: 'Contact request' });
	await form.getByLabel('Full name').fill('Synthetic Prospect');
	await form.getByLabel('Email address').fill('prospect@example.invalid');
	await form.getByLabel('Preferred contact method', { exact: true }).selectOption('email');
	if (email) await form.getByLabel('Email me this estimate', { exact: true }).check();
	if (contact) await form.getByLabel('Ask Rossouw to contact me', { exact: true }).check();
	await form.getByLabel('I consent to Goat Accounting using these details to fulfil my selected requests.', { exact: true }).check();
}

async function submitContact(page: Page) {
	const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/api/estimates/${activeState.ref}/contact`));
	await page.getByRole('button', { name: 'Save my request', exact: true }).click();
	return responsePromise;
}

if (typeof Bun === 'undefined') {
	test.beforeAll(async () => startSyntheticSupabase());
	test.afterAll(async () => closeSyntheticSupabase());
	test.beforeEach(async ({ page }) => {
		newSyntheticEstimate();
		await installTurnstileStub(page);
		await installContactRoute(page);
	});

	test('shows the completed estimate before asking for contact details', async ({ page }) => {
		await openContact(page);
		const form = page.getByRole('form', { name: 'Contact request' });
		await expect(form.getByLabel('Email me this estimate', { exact: true })).not.toBeChecked();
		await expect(form.getByLabel('Ask Rossouw to contact me', { exact: true })).not.toBeChecked();
		await expect(form.getByLabel('I consent to Goat Accounting using these details to fulfil my selected requests.', { exact: true })).not.toBeChecked();
		await expect(form.getByLabel('Full name')).toHaveValue('');
		await expect(form.getByLabel(/marketing/i)).toHaveCount(0);
	});

	test('links selection and consent validation to their fields', async ({ page }, testInfo) => {
		await openContact(page);
		let contactRequests = 0;
		page.on('request', (request) => { if (request.url().endsWith('/contact')) contactRequests++; });
		const validity = await page.getByRole('form', { name: 'Contact request' }).evaluate((element) => {
			const form = element as HTMLFormElement;
			form.dataset.submitEvents = '0';
			form.addEventListener('submit', () => { form.dataset.submitEvents = String(Number(form.dataset.submitEvents) + 1); });
			return { noValidate: form.noValidate, nativeValidity: form.checkValidity() };
		});
		await page.getByRole('button', { name: 'Save my request', exact: true }).click();
		const evidence = await page.getByRole('form', { name: 'Contact request' }).evaluate((form) => ({
			submitEvents: (form as HTMLElement).dataset.submitEvents,
			actionError: form.querySelector('#contact-actions-error')?.textContent,
			nameError: form.querySelector('#contact-name-error')?.textContent,
			emailError: form.querySelector('#contact-email-error')?.textContent,
			consentError: form.querySelector('#contact-consent-error')?.textContent,
			actionErrorHidden: (form.querySelector('#contact-actions-error') as HTMLElement)?.hidden
		}));
		await testInfo.attach('empty-submit-diagnosis', { body: JSON.stringify({ ...validity, ...evidence, contactRequests, consumedTokens: activeState.consumedTokens.size, leads: activeState.leads }, null, 2), contentType: 'application/json' });
		expect(validity).toEqual({ noValidate: true, nativeValidity: false });
		expect(evidence.submitEvents).toBe('1');
		expect(contactRequests).toBe(0);
		expect(activeState.consumedTokens.size).toBe(0);
		expect(activeState.leads).toBe(0);
		await expect(page.getByRole('alert')).toContainText(/choose|select|consent/i);
		await expect(page.getByLabel('Ask Rossouw to contact me', { exact: true })).toHaveAttribute('aria-describedby', 'contact-actions-error');
		await expect(page.locator('#contact-actions-error')).toContainText(/select at least one request/i);
		await expect(page.getByLabel('I consent to Goat Accounting using these details to fulfil my selected requests.', { exact: true })).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Full name')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByRole('group', { name: 'Select your requests, at least one required' })).toHaveAttribute('aria-describedby', 'contact-actions-error');
	});

	for (const selection of [
		{ label: 'email only', email: true, contact: false, deliveries: ['estimate_email'] },
		{ label: 'contact only', email: false, contact: true, deliveries: ['contact_request'] },
		{ label: 'both requests', email: true, contact: true, deliveries: ['estimate_email', 'contact_request'] }
	]) {
		test(`saves ${selection.label} with one-use verification and no contact data in the response`, async ({ page }) => {
			await openContact(page);
			await fillContact(page, selection);
			const response = await submitContact(page);
			expect(response.status()).toBe(200);
			const responseText = await response.text();
			expect(responseText).toContain('"saved":true');
			expect(responseText).not.toContain('Synthetic Prospect');
			expect(responseText).not.toContain('prospect@example.invalid');
			expect(activeState.leads).toBe(1);
			expect(activeState.events).toBe(1);
			expect(activeState.deliveries).toEqual(selection.deliveries);
			await expect(page.getByRole('status')).toContainText('Your request has been saved.');
			const analytics = await page.evaluate(() => (window as Window & { dataLayer?: unknown[] }).dataLayer ?? []);
			expect(analytics).toContainEqual({ event: 'estimate_contact_submitted' });
			expect(JSON.stringify(analytics)).not.toContain('prospect@example.invalid');
			expect(JSON.stringify(analytics)).not.toContain('Synthetic Prospect');
			await expect(page.getByRole('status')).toContainText(/does not mean an email has been sent/i);
			expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('prospect@example.invalid');
			expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('prospect@example.invalid');
		});
	}

	test('supports keyboard use on a narrow viewport and requires a fresh token after expiry', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openContact(page);
		const form = page.getByRole('form', { name: 'Contact request' });
		await form.getByLabel('Full name').focus();
		await page.keyboard.type('Keyboard Prospect');
		await form.getByLabel('Email address').fill('keyboard@example.invalid');
		await form.getByLabel('Email me this estimate', { exact: true }).check();
		await form.getByLabel('I consent to Goat Accounting using these details to fulfil my selected requests.', { exact: true }).check();
		await page.evaluate(() => window.__contactTurnstileTest.expire());
		await expect(page.getByRole('status')).toContainText(/security check expired/i);
		await page.getByRole('button', { name: 'Retry security check', exact: true }).click();
		activeState.rejectNextVerification = true;
		const failed = await submitContact(page);
		expect(failed.status()).toBe(403);
		await expect(page.getByRole('alert')).toContainText(/security check/i);
		const eventsBeforeRetry = await page.evaluate(() => (window as Window & { dataLayer?: { event?: string }[] }).dataLayer ?? []);
		expect(eventsBeforeRetry.some((event) => event.event === 'estimate_contact_submitted')).toBe(false);
		await expect.poll(() => activeState.consumedTokens.size).toBe(1);
		const retried = await submitContact(page);
		expect(retried.status()).toBe(200);
		expect(activeState.consumedTokens.size).toBe(2);
		expect(activeState.leads).toBe(1);
		expect(activeState.events).toBe(1);
		expect(activeState.deliveries).toEqual(['estimate_email']);
	});

	test('rejects changed actions after the original request was saved', async ({ page }) => {
		await openContact(page);
		await fillContact(page, { email: true });
		const first = await submitContact(page);
		expect(first.status()).toBe(200);
		await expect(page.getByRole('form', { name: 'Contact request' })).toHaveCount(0);
		await openContact(page);
		await fillContact(page, { email: true, contact: true });
		const changed = await submitContact(page);
		expect(changed.status()).toBe(409);
		await expect(page.getByRole('alert')).toContainText(/original selections/i);
		expect(activeState.leads).toBe(1);
		expect(activeState.events).toBe(1);
		expect(activeState.deliveries).toEqual(['estimate_email']);
	});

	for (const state of ['VOIDED', 'SUPERSEDED'] as const) {
		test(`does not show the contact form for a ${state.toLowerCase()} estimate`, async ({ page }) => {
			newSyntheticEstimate(state);
			await page.goto(`${APP_ORIGIN}/estimate/${activeState.ref}`);
			await expect(page.getByLabel('Full name', { exact: true })).toHaveCount(0);
			await expect(page.getByRole('form', { name: 'Contact request' })).toHaveCount(0);
		});
	}


	if (process.env.HALLMARK_AUDIT === 'true') test('renders the contact panel for the Hallmark audit', async ({ page }) => {
		await openContact(page);
		await mkdir('.hallmark/contact', { recursive: true });
		await page.getByRole('region', { name: 'Optional contact' }).screenshot({ path: '.hallmark/contact/default-desktop.png' });
		await page.getByRole('button', { name: 'Save my request', exact: true }).click();
		await expect(page.locator('#contact-actions-error')).toContainText('Select at least one request.');
		await mkdir('.hallmark/contact', { recursive: true });
		await page.getByRole('region', { name: 'Optional contact' }).screenshot({ path: '.hallmark/contact/empty-desktop.png' });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole('region', { name: 'Optional contact' }).screenshot({ path: '.hallmark/contact/empty-mobile.png' });
		const { stdout, stderr } = await promisify(execFile)('node', [
			'/home/jcschoeman96/.agents/skills/hallmark/scripts/sloplint.mjs',
			'src/lib/ui/estimator/contact-panel.svelte', '--scope', 'component', '--render',
			'--url', `${APP_ORIGIN}/estimate/${activeState.ref}`
		], { timeout: 60_000 });
		console.log(stdout, stderr);
	});

	test('rejects malformed, oversized, and cross-origin requests before verification', async ({ page }) => {
		await openContact(page);
		const url = `${APP_ORIGIN}/api/estimates/${activeState.ref}/contact`;
		const invalid = await page.request.post(url, { data: { requestedContact: true }, headers: { 'content-type': 'application/json' } });
		expect(invalid.status()).toBe(400);
		const oversized = await page.request.post(url, { data: 'x'.repeat(9 * 1024), headers: { 'content-type': 'application/json' } });
		expect(oversized.status()).toBe(413);
		const crossOrigin = await page.request.post(url, {
			data: {},
			headers: { 'content-type': 'application/json', origin: 'https://other.example.invalid' }
		});
		expect(crossOrigin.status()).toBe(403);
		expect(activeState.consumedTokens.size).toBe(0);
		expect(activeState.leads).toBe(0);
	});
}

declare global {
	interface Window {
		turnstile: {
			render: (container: HTMLElement, options: Record<string, unknown>) => string;
			reset: (id: string) => void;
			remove: (id: string) => void;
		};
		__contactTurnstileTest: { expire: () => void; fail: () => void };
	}
}
