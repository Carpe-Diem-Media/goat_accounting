import { expect, test } from '@playwright/test';
import { ESTIMATE_DISCLAIMER } from '../../src/lib/domain/estimator/estimate-disclaimer';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT } from '../../supabase/pricing-candidates/goat-accounting-starter-v1';
import { GOAT_STARTER_V1_SCENARIOS } from '../../supabase/pricing-candidates/goat-accounting-starter-v1-acceptance';
import { extractPdfText } from '../support/pdf-text';
import { cookiesForSession, createStaffFixture, dashboardOrigins, sql } from './dashboard-authenticated.support';

const businessAnswers = [
	'Sole proprietor', 'Fully current and reconciled', 'Accounting software is current/reasonably clean',
	'Under 50', '1', 'None', 'Everything is submitted/current', 'Monthly bookkeeping/accounting', 'None of these'
];
const personalAnswers = ['Current', 'Salary/remuneration', 'Normal filing only', 'Annual personal tax return'];
const journeys = [
	{
		scenarioId: 'simple-current-sole-proprietor', title: 'Your business estimate',
		choices: ['Business accounting', ...businessAnswers]
	},
	{
		scenarioId: 'personal-salaried-taxpayer', title: 'Your personal tax estimate',
		choices: ['Personal tax', ...personalAnswers]
	},
	{
		scenarioId: 'combined-business-and-personal', title: 'Your business and personal estimate',
		choices: ['Business and personal tax', ...businessAnswers, ...personalAnswers]
	}
];
const privateHeaders = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow, noarchive',
	'referrer-policy': 'no-referrer'
};
const candidate = GOAT_ACCOUNTING_STARTER_V1_DRAFT;

function pdfRange({ minCents, maxCents }: { minCents: number; maxCents: number }): string {
	return `R ${Math.floor(minCents / 100).toLocaleString('en-US')} - R ${Math.ceil(maxCents / 100).toLocaleString('en-US')}`;
}

test('saves, replays and serves business, personal and combined estimates with reviewed V1 pricing', async ({ page, context }) => {
	const { enabled, defaultOff } = dashboardOrigins();
	const admin = await createStaffFixture('admin');
	await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1'
		? route.continue() : route.abort());

	await test.step('activate the reviewed candidate through the disposable AAL2 app', async () => {
		await context.addCookies(cookiesForSession(admin.aal2, enabled));
		await page.goto(`${enabled}/admin/pricing`);
		await page.getByRole('button', { name: 'Import starter pricing V1 as draft' }).click();
		await page.getByRole('link', { name: candidate.version, exact: true }).click();
		for (const action of ['Submit manifest', 'Approve manifest', 'Activate pricing model']) {
			await page.getByRole('button', { name: action, exact: true }).click();
		}
		await expect(page.getByText('State: ACTIVE', { exact: true })).toBeVisible();
		await context.clearCookies();
	});

	await page.setViewportSize({ width: 375, height: 844 });
	for (const [index, journey] of journeys.entries()) {
		await test.step(journey.scenarioId, async () => {
			const scenario = GOAT_STARTER_V1_SCENARIOS.find(({ id }) => id === journey.scenarioId);
			if (!scenario?.expected) throw new Error(`Missing reviewed expectation for ${journey.scenarioId}.`);
			const expected = scenario.expected;
			const note = 'Synthetic private estimate note';

			await page.goto(`${enabled}/estimate`);
			for (const answer of journey.choices) {
				await page.getByLabel(answer, { exact: true }).check();
				await page.getByRole('button', { name: 'Continue', exact: true }).click();
			}
			await page.getByLabel('No urgent deadline', { exact: true }).check();
			await page.locator('#free-text').fill(note);
			const savedResponse = page.waitForResponse((response) => response.url() === `${enabled}/api/estimates`);
			await page.getByRole('button', { name: 'View estimate', exact: true }).click();
			const saved = await savedResponse;
			expect(saved.status()).toBe(201);
			expect(saved.headers()['cache-control']).toBe(privateHeaders['cache-control']);
			const payload = await saved.json();
			await expect(page).toHaveURL(/\/estimate\/[a-f0-9]{32}$/);
			const publicRef = new URL(page.url()).pathname.split('/').at(-1)!;
			expect(publicRef).toMatch(/^[a-f0-9]{32}$/);
			const result = await page.reload();
			expect(result?.status()).toBe(200);
			expect(result?.headers()).toMatchObject(privateHeaders);
			await expect(page.getByRole('heading', { name: journey.title })).toBeVisible();
			await expect(page.getByLabel('Estimate disclaimer')).toHaveText(ESTIMATE_DISCLAIMER);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

			const readSnapshot = () => JSON.parse(sql(`
				SELECT row_to_json(estimate) FROM (
					SELECT id, public_ref, pricing_model_id, pricing_model_version, engine_version,
						catchup_min_cents, catchup_max_cents, ongoing_min_cents, ongoing_max_cents,
						answers_snapshot, calculation_snapshot, confidence, manual_review_required, free_text
					FROM estimator.estimates WHERE public_ref = '${publicRef}'
				) estimate;
			`));
			const snapshot = readSnapshot();
			expect(snapshot).toMatchObject({
				public_ref: publicRef,
				pricing_model_id: candidate.id,
				pricing_model_version: candidate.version,
				engine_version: candidate.engineVersion,
				catchup_min_cents: expected.catchup.minCents,
				catchup_max_cents: expected.catchup.maxCents,
				ongoing_min_cents: expected.ongoing.minCents,
				ongoing_max_cents: expected.ongoing.maxCents,
				calculation_snapshot: { catchup: expected.catchup, ongoing: expected.ongoing },
				confidence: expected.confidence,
				manual_review_required: expected.manualReviewRequired,
				free_text: note
			});
			expect(snapshot.answers_snapshot).toEqual(scenario.answers);

			const original = saved.request();
			const key = original.headers()['idempotency-key'];
			expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
			const replayRequest = { data: original.postDataJSON(), headers: { 'idempotency-key': key } };
			const replay = await context.request.post(original.url(), replayRequest);
			expect(replay.status()).toBe(201);
			expect(await replay.json()).toEqual(payload);
			for (const privateValue of [snapshot.id, candidate.id, note]) {
				expect(JSON.stringify(payload)).not.toContain(privateValue);
			}
			expect((await context.request.post(`${defaultOff}/api/estimates`, replayRequest)).status()).toBe(503);
			expect(readSnapshot()).toEqual(snapshot);
			expect(Number(sql('SELECT count(*) FROM estimator.estimates'))).toBe(index + 1);

			const pdfPath = `/api/estimates/${publicRef}/pdf`;
			const pdf = await context.request.get(enabled + pdfPath);
			expect(pdf.status()).toBe(200);
			expect(pdf.headers()).toMatchObject({ ...privateHeaders, 'content-type': 'application/pdf' });
			expect(pdf.headers()['content-disposition']).toContain('attachment');
			const pdfText = await extractPdfText(await pdf.body());
			expect(pdfText).toContain(publicRef);
			expect(pdfText).toContain(`Catch-up work ${pdfRange(expected.catchup)}`);
			expect(pdfText).toContain(`Illustrative monthly equivalent ${pdfRange(expected.ongoing)}`);
			expect(pdfText).toContain(ESTIMATE_DISCLAIMER);
			expect(pdfText).not.toContain(note);
			expect((await context.request.get(defaultOff + pdfPath)).status()).toBe(503);

			const adminPath = `${enabled}/admin/estimates/${snapshot.id}`;
			const anonymous = await context.request.get(adminPath, { maxRedirects: 0 });
			expect(anonymous.headers().location).toBe('/admin/login');
			await context.addCookies(cookiesForSession(admin.aal1, enabled));
			const passwordOnly = await context.request.get(adminPath, { maxRedirects: 0 });
			expect(passwordOnly.headers().location).toBe('/admin/login/mfa');
			await context.clearCookies();
			await context.addCookies(cookiesForSession(admin.aal2, enabled));
			await page.goto(adminPath);
			await expect(page.getByRole('heading', { name: 'Estimate details' })).toBeVisible();
			await expect(page.getByText(publicRef, { exact: true })).toBeVisible();
			await page.getByText('Stored estimate snapshot', { exact: true }).click();
			await expect(page.getByText('Pricing model version', { exact: true }).locator('..')).toContainText(candidate.version);
			await context.clearCookies();
		});
	}
});
