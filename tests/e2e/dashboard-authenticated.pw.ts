import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
	cookiesForSession,
	createStaffFixture,
	dashboardOrigins,
	logAal1StageEvidence,
	setDashboardRpcEnabled,
	setStaffState
} from './dashboard-authenticated.support';

test.describe.configure({ mode: 'serial' });

function reportMismatch(scenario: string, path: string, response: { status(): number; headers(): Record<string, string>; url(): string }) {
	const location = response.headers().location;
	console.error(
		`DASHBOARD_HTTP scenario=${scenario} requested_path=${path} response_path=${new URL(response.url()).pathname} status=${response.status()} location=${location ? new URL(location, response.url()).pathname : 'none'}`
	);
}

async function installSession(context: BrowserContext, session: Parameters<typeof cookiesForSession>[0], origin: string) {
	await context.clearCookies();
	await context.addCookies(cookiesForSession(session, origin));
}

async function assertAal1Redirect(context: BrowserContext, userId: string, session: Parameters<typeof cookiesForSession>[0], scenario: string) {
	const origins = dashboardOrigins();
	await installSession(context, session, origins.enabled);
	const path = '/admin/dashboard';
	const response = await context.request.get(`${origins.enabled}${path}`, { maxRedirects: 0 });
	if (response.status() !== 303 || response.headers().location !== '/admin/login/mfa') {
		reportMismatch(scenario, path, response);
		if (response.status() === 503) await logAal1StageEvidence(session, userId);
	}
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe('/admin/login/mfa');
	console.log(`DASHBOARD_AAL1 scenario=${scenario} path=${path} status=303 location=/admin/login/mfa`);
}

async function assertDisabledGate(context: BrowserContext, session: Parameters<typeof cookiesForSession>[0], scenario: string) {
	const origins = dashboardOrigins();
	await installSession(context, session, origins.defaultOff);
	const path = '/admin/dashboard?DASHBOARD_RELEASE_ENABLED=true';
	const response = await context.request.get(`${origins.defaultOff}${path}`, {
		maxRedirects: 0,
		headers: { DASHBOARD_RELEASE_ENABLED: 'true' }
	});
	if (response.status() !== 404) reportMismatch(scenario, '/admin/dashboard', response);
	expect(response.status()).toBe(404);

	const page = await context.newPage();
	const navigation = await page.goto(`${origins.defaultOff}/admin/estimates`);
	expect(navigation?.status()).toBe(200);
	await expect(page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
	await page.close();
}

async function dashboardPage(context: BrowserContext, origin = dashboardOrigins().enabled): Promise<{ page: Page; response: Awaited<ReturnType<Page['goto']>> }> {
	const page = await context.newPage();
	const response = await page.goto(`${origin}/admin/dashboard`);
	return { page, response };
}

test('fresh active viewer keeps the default gate off and follows real AAL1/AAL2 authorization', async ({ browser }) => {
	const origins = dashboardOrigins();
	const fixture = await createStaffFixture('viewer');
	const context = await browser.newContext({ viewport: { width: 375, height: 844 }, reducedMotion: 'reduce' });
	let testFailed = false;
	try {
		await assertDisabledGate(context, fixture.aal2, 'viewer-default-off');
		await assertAal1Redirect(context, fixture.userId, fixture.aal1, 'viewer');
		await installSession(context, fixture.aal2, origins.enabled);

		const { page, response } = await dashboardPage(context);
		expect(response?.status()).toBe(200);
		expect(response?.headers()['cache-control']).toContain('no-store');
		await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Dashboard' })).toBeVisible();
		await expect(page.getByLabel('Period')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
		await expect(page.getByRole('status')).toContainText('No estimates were saved in this period.');
		await expect(page.getByText('Failed notifications', { exact: true })).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

		for (const state of ['SUSPENDED', 'DEACTIVATED'] as const) {
			setStaffState(fixture.userId, state);
			const path = '/admin/dashboard';
			const response = await context.request.get(`${origins.enabled}${path}`, { maxRedirects: 0 });
			const scenario = `viewer-${state.toLowerCase()}`;
			if (response.status() !== 403) reportMismatch(scenario, path, response);
			expect(response.status()).toBe(403);
			console.log(`DASHBOARD_AUTH scenario=${scenario} status=403`);
		}
		await page.close();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await context.close();
		try {
			await fixture.cleanup();
		} catch (error) {
			console.error('DASHBOARD_CLEANUP scenario=viewer status=failed');
			if (!testFailed) throw error;
		}
	}
});

test('fresh active administrator sees authorized metrics and passes dashboard accessibility checks', async ({ browser }) => {
	const origins = dashboardOrigins();
	const fixture = await createStaffFixture('admin');
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
	let rpcGrantRevoked = false;
	let testFailed = false;
	try {
		await assertDisabledGate(context, fixture.aal2, 'admin-default-off');
		await assertAal1Redirect(context, fixture.userId, fixture.aal1, 'admin');
		await installSession(context, fixture.aal2, origins.enabled);

		const { page, response } = await dashboardPage(context);
		expect(response?.status()).toBe(200);
		expect(response?.headers()['cache-control']).toContain('no-store');
		await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Dashboard' })).toBeVisible();
		await expect(page.getByLabel('Period')).toBeVisible();
		await expect(page.getByText('No estimates were saved in this period.')).toBeVisible();
		await expect(page.getByText('Failed notifications', { exact: true })).toBeVisible();
		await expect(page.locator('dt').filter({ hasText: 'Failed notifications' }).locator('xpath=following-sibling::dd')).toHaveText('0');

		const contrast = await page.evaluate(() => {
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			const context = canvas.getContext('2d', { colorSpace: 'srgb' });
			if (!context) throw new Error('Canvas contrast check unavailable.');
			const rgb = (color: string) => {
				if (!CSS.supports('color', color)) throw new Error('Unsupported computed color.');
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => {
					const channel = value / 255;
					return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
				});
			};
			const ratio = (foreground: string, background: string) => {
				const [first, second] = [rgb(foreground), rgb(background)].map((channels) =>
					0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
				).sort((left, right) => right - left);
				return (first + 0.05) / (second + 0.05);
			};
			const main = document.querySelector('#admin-main');
			const shell = main?.closest('.bg-background');
			const heading = document.querySelector('h1');
			const description = document.querySelector('section[aria-labelledby="dashboard-heading"] > header p');
			const label = document.querySelector('dl dt');
			const card = label?.closest('div.bg-card');
			const foreground = getComputedStyle(heading!).color;
			const muted = getComputedStyle(description!).color;
			const labelColor = getComputedStyle(label!).color;
			const pageBackground = getComputedStyle(shell!).backgroundColor;
			const cardBackground = getComputedStyle(card!).backgroundColor;
			return {
				bodyText: ratio(foreground, pageBackground),
				mutedText: ratio(muted, pageBackground),
				metricLabel: ratio(labelColor, cardBackground),
				focusRing: ratio(getComputedStyle(document.documentElement).getPropertyValue('--ring'), pageBackground)
			};
		});
		expect(contrast.bodyText).toBeGreaterThanOrEqual(4.5);
		expect(contrast.mutedText).toBeGreaterThanOrEqual(4.5);
		expect(contrast.metricLabel).toBeGreaterThanOrEqual(4.5);
		expect(contrast.focusRing).toBeGreaterThanOrEqual(3);

		await page.keyboard.press('Tab');
		const skipLink = page.locator('a[href="#admin-main"]');
		await expect(skipLink).toBeFocused();
		await expect(skipLink).toBeVisible();
		const skipFocus = await skipLink.evaluate((element) => {
			const style = getComputedStyle(element);
			return { outline: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
		});
		expect(skipFocus.outline).not.toBe('none');
		expect(skipFocus.width).toBeGreaterThanOrEqual(2);

		await page.reload();
		let periodFocused = false;
		for (let index = 0; index < 16; index += 1) {
			periodFocused = await page.evaluate(() => document.activeElement?.id === 'days');
			if (periodFocused) break;
			await page.keyboard.press('Tab');
		}
		expect(periodFocused).toBe(true);
		await page.keyboard.press('End');
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Apply' })).toBeFocused();
		await page.keyboard.press('Enter');
		await page.waitForURL('**/admin/dashboard?days=90');
		await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

		// A 1280px baseline narrows to 640px at 200% and 320px at 400% reflow.
		await page.setViewportSize({ width: 640, height: 900 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		await page.setViewportSize({ width: 320, height: 844 });
		const mobileLayout = await page.evaluate(() => ({
			viewport: window.innerWidth,
			document: document.documentElement.scrollWidth,
			overflowing: Array.from(document.querySelectorAll('body *'))
				.map((element) => {
					const bounds = element.getBoundingClientRect();
					return {
						tag: element.tagName.toLowerCase(),
						id: element.id || undefined,
						className: typeof element.className === 'string' ? element.className.slice(0, 120) : undefined,
						left: Math.round(bounds.left),
						right: Math.round(bounds.right),
						width: Math.round(bounds.width)
					};
				})
				.filter((element) => element.right > window.innerWidth + 1 || element.left < -1)
				.sort((left, right) => right.right - left.right)
				.slice(0, 8)
		}));
		if (mobileLayout.document > mobileLayout.viewport) console.error(`DASHBOARD_OVERFLOW ${JSON.stringify(mobileLayout)}`);
		expect(mobileLayout.document <= mobileLayout.viewport).toBe(true);
		await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

		try {
			setDashboardRpcEnabled(false);
			rpcGrantRevoked = true;
			const path = '/admin/dashboard';
			const failure = await page.goto(`${origins.enabled}${path}`);
			if (failure?.status() !== 503) reportMismatch('missing-dashboard-rpc', path, failure ?? { status: () => 0, headers: () => ({}), url: () => `${origins.enabled}${path}` });
			expect(failure?.status()).toBe(503);
			expect(failure?.headers()['cache-control']).toContain('no-store');
			await expect(page.getByText(/dashboard unavailable|staff page could not be loaded/i).first()).toBeVisible();
		} finally {
			if (rpcGrantRevoked) {
				setDashboardRpcEnabled(true);
				rpcGrantRevoked = false;
			}
		}
		await page.close();
		console.log('DASHBOARD_ACCESSIBILITY scenario=admin keyboard=pass focus=pass contrast=pass reflow_200_percent=pass reflow_400_percent=pass');
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		if (rpcGrantRevoked) {
			try {
				setDashboardRpcEnabled(true);
			} catch {
				console.error('DASHBOARD_CLEANUP rpc_grant=restore_failed');
			}
		}
		await context.close();
		try {
			await fixture.cleanup();
		} catch (error) {
			console.error('DASHBOARD_CLEANUP scenario=admin status=failed');
			if (!testFailed) throw error;
		}
	}
});
