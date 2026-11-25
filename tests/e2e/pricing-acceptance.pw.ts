import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { GOAT_ACCOUNTING_STARTER_V1_DRAFT } from '../../supabase/pricing-candidates/goat-accounting-starter-v1';
import { cookiesForSession, createStaffFixture, dashboardOrigins, setStaffState } from './dashboard-authenticated.support';

test('an AAL2 admin reviews 21 versioned scenarios, approves, then activates the persisted V1 draft', async ({ browser }) => {
	const { enabled, defaultOff } = dashboardOrigins();
	const admin = await createStaffFixture('admin');
	const viewer = await createStaffFixture('viewer');
	const context = await browser.newContext({ viewport: { width: 375, height: 844 }, reducedMotion: 'reduce' });
	const endpoint = `/admin/pricing/${GOAT_ACCOUNTING_STARTER_V1_DRAFT.id}`;
	const page = await context.newPage();

	async function post(action: string, fields: Record<string, string> = {}, origin = enabled) {
		return context.request.post(`${origin}${endpoint}?/${action}`, { form: fields, headers: { origin, accept: 'text/html' }, maxRedirects: 0 });
	}

	async function session(value: typeof admin.aal2) {
		await context.clearCookies();
		await context.addCookies(cookiesForSession(value, enabled));
	}

	for (const action of ['submit', 'approve', 'activate']) {
		const unauthenticated = await post(action);
		expect(unauthenticated.status()).toBe(303);
		expect(unauthenticated.headers().location).toBe('/admin/login');
	}
	await session(admin.aal1);
	for (const action of ['submit', 'approve', 'activate']) {
		const passwordOnly = await post(action);
		expect(passwordOnly.status()).toBe(303);
		expect(passwordOnly.headers().location).toBe('/admin/login/mfa');
	}
	await session(viewer.aal2);
	for (const action of ['submit', 'approve', 'activate']) expect((await post(action)).status()).toBe(403);
	await session(admin.aal2);
	expect((await post('activate', {}, defaultOff)).status()).toBe(404);

	expect((await page.goto(`${enabled}/admin/pricing`))?.status()).toBe(200);
	await page.getByRole('button', { name: 'Import starter pricing V1 as draft' }).click();
	expect((await page.goto(enabled + endpoint))?.status()).toBe(200);
	await page.keyboard.press('Tab');
	const skip = page.getByRole('link', { name: 'Skip to content' });
	await expect(skip).toBeFocused();
	expect(await skip.evaluate((element) => getComputedStyle(element).zIndex)).toBe('50');
	await page.getByText('All 21 acceptance scenarios passed').click();
	await expect(page.getByText('vat-filing-two_monthly: Passed')).toBeVisible();
	const vatScenario = page.getByRole('listitem').filter({ hasText: 'vat-filing-two_monthly: Passed' });
	await vatScenario.getByText('vat-filing-two_monthly: Passed').click();
	await expect(vatScenario.getByText('Once-off catch-up', { exact: true })).toBeVisible();
	await expect(vatScenario.getByText('Monthly ongoing', { exact: true })).toBeVisible();
	await expect(vatScenario.getByText(/R\s*2\s*225,00.*R\s*3\s*525,00/)).toBeVisible();
	await expect(vatScenario.getByText('High', { exact: true })).toBeVisible();
	await expect(vatScenario.getByText('Not required', { exact: true })).toBeVisible();
	const unknownVat = page.getByRole('listitem').filter({ hasText: 'vat-filing-unknown: Passed' });
	await unknownVat.getByText('vat-filing-unknown: Passed').click();
	await expect(unknownVat.getByText('vat_filing_frequency_needs_review', { exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

	await page.getByText('All 21 acceptance scenarios passed').click();

	const submit = page.getByRole('button', { name: 'Submit manifest' });
	await page.keyboard.press('Tab');
	await expect(submit).toBeFocused();
	expect(await submit.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
	await submit.press('Enter');
	await expect(page.getByText('Approval status: DRAFT')).toBeVisible();
	await page.getByText('All 21 acceptance scenarios passed').click();
	await vatScenario.getByText('vat-filing-two_monthly: Passed').click();
	await expect(vatScenario.getByText(/R\s*2\s*225,00.*R\s*3\s*525,00/)).toBeVisible();
	const approve = page.getByRole('button', { name: 'Approve manifest' });
	expect((await post('approve', { revision: '0', fingerprint: '0'.repeat(64), manifestId: '' })).status()).toBe(409);
	const form = await approve.evaluate((element: HTMLButtonElement) =>
		Object.fromEntries([...new FormData(element.form!)].map(([name, value]) => [name, String(value)]))
	);
	expect((await post('approve', { ...form, approverId: viewer.userId })).status()).toBe(400);
	expect((await post('approve', { ...form, results: '[]' })).status()).toBe(400);
	expect((await post('approve', { ...form, fingerprint: '0'.repeat(64) })).status()).toBe(409);
	expect((await post('activate', form)).status()).toBe(409);

	await approve.click();
	await expect(page.getByText('Approval status: APPROVED')).toBeVisible();
	await expect(page.getByText('State: DRAFT', { exact: true })).toBeVisible();
	expect((await post('approve', form)).status()).toBe(409);
	if (process.env.GOAT_HALLMARK_SCRIPT) {
		const cookies = (await context.cookies(enabled)).map(({ name, value }) => `${name}=${value}`).join('; ');
		const proxy = createServer(async (request, response) => {
			if (request.method !== 'GET') { response.writeHead(405).end(); return; }
			const url = new URL(request.url ?? '/', enabled);
			const baseline = url.searchParams.has('hallmarkBaseline');
			const upstream = await fetch(enabled + url.pathname, { headers: { cookie: cookies }, redirect: 'manual' });
			response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream' });
			if (baseline) {
				// Isolate the existing layout from the new acceptance section with the same compiled CSS.
				const html = await upstream.text();
				response.end(html.replace(/<section[^>]+aria-labelledby="acceptance-heading"[\s\S]*?<\/section>/, '')
					.replace('Open a draft to review its manifest, approve it and activate pricing.',
						'Activation is unavailable until the independent approval workflow is complete.')
					.replace(/<script[\s\S]*?<\/script>/g, ''));
			} else response.end(Buffer.from(await upstream.arrayBuffer()));
		});
		await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
		try {
			const address = proxy.address();
			if (!address || typeof address === 'string') throw new Error('Hallmark loopback address unavailable.');
			const loopback = `http://127.0.0.1:${address.port}`;
			const target = loopback + endpoint;
			const lint = spawn('node', [process.env.GOAT_HALLMARK_SCRIPT, 'src/routes/admin/pricing',
				'--scope', 'app', '--json', '--render', '--url', target, '--url', target + '?hallmarkBaseline=1',
					'--url', loopback + '/admin/pricing', '--url', loopback + '/admin/pricing?hallmarkBaseline=1'],
				{ stdio: ['ignore', 'pipe', 'inherit'] });
			const report: Buffer[] = [];
			lint.stdout.on('data', (chunk) => report.push(chunk));
			const code = await new Promise((resolve, reject) => { lint.on('error', reject); lint.on('close', resolve); });
			const output = Buffer.concat(report).toString('utf8');
			console.log(output);
			expect([0, 1]).toContain(code);
			const checked = JSON.parse(output) as {
				summary: { render: string }; findings: { file: string; grade: string; gate: string; evidence: string }[];
			};
			expect(checked.summary.render).toBe('ran');
			const baselineFindings = checked.findings.filter((finding) => finding.file.includes('hallmarkBaseline=1'));
			const introduced = checked.findings.filter((finding) =>
				['FAIL', 'REFLEX'].includes(finding.grade) && !baselineFindings.some((baseline) =>
					baseline.gate === finding.gate && baseline.evidence === finding.evidence &&
					baseline.file.split('?')[0] === finding.file.split('?')[0])
			);
			expect(introduced).toEqual([]);
		} finally {
			proxy.close();
		}
	}
	await page.getByRole('button', { name: 'Activate pricing model' }).click();
	await expect(page.getByText('State: ACTIVE', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Activate pricing model' })).toHaveCount(0);
	setStaffState(admin.userId, 'SUSPENDED');
	for (const action of ['submit', 'approve', 'activate']) expect((await post(action, form)).status()).toBe(403);

	await context.close();
	await Promise.all([admin.cleanup(), viewer.cleanup()]);
});
