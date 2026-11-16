import { expect, test } from '@playwright/test';

function isOriginOnlyReferrer(value: string | undefined, expectedOrigin: string): boolean {
	if (!value) return false;
	try {
		const referrer = new URL(value);
		return referrer.origin === expectedOrigin && referrer.pathname === '/' && !referrer.search && !referrer.hash;
	} catch {
		return false;
	}
}

test('staff callback native forms keep the trusted origin and hide callback query data', async ({ page, browser }) => {
	const baseURL = test.info().project.use.baseURL;
	expect(typeof baseURL).toBe('string');
	const trustedOrigin = new URL(baseURL as string).origin;
	const callbackUrl = new URL('/admin/auth/callback', trustedOrigin);
	callbackUrl.searchParams.set('token_hash', 'x');
	callbackUrl.searchParams.set('type', 'invite');

	const callbackGet = await page.goto(callbackUrl.toString(), { waitUntil: 'domcontentloaded' });
	expect(callbackGet?.status()).toBe(200);
	const callbackPolicy = callbackGet?.headers()['referrer-policy'];
	const metaPolicy = await page.locator('meta[name="referrer"]').getAttribute('content');
	const documentOrigin = await page.evaluate(() => location.origin);
	const formAction = await page.locator('form').evaluate((form) => (form as HTMLFormElement).action);
	expect(new URL(documentOrigin).origin === new URL(formAction).origin).toBe(true);

	const postRequestPromise = page.waitForRequest((request) => {
		try {
			return request.method() === 'POST' && new URL(request.url()).pathname === '/admin/auth/callback';
		} catch {
			return false;
		}
	});
	const postResponsePromise = page.waitForResponse((response) => {
		try {
			return response.request().method() === 'POST' && new URL(response.url()).pathname === '/admin/auth/callback';
		} catch {
			return false;
		}
	});
	await page.getByRole('button', { name: 'Continue', exact: true }).click();
	const postRequest = await postRequestPromise;
	const postResponse = await postResponsePromise;
	expect(postResponse.status()).toBe(303);

	const location = new URL(postResponse.headers()['location'] ?? '', trustedOrigin);
	expect(location.pathname).toBe('/admin/login');
	expect(location.searchParams.get('link')).toBe('invalid');
	expect(callbackPolicy).toBe('strict-origin');
	expect(metaPolicy).toBe('strict-origin');
	expect(isOriginOnlyReferrer(postRequest.headers()['referer'], trustedOrigin)).toBe(true);

	const crossOriginPage = await browser.newPage();
	await crossOriginPage.goto('data:text/html;charset=utf-8,%3Cform%20method%3D%22POST%22%3E%3Cbutton%20type%3D%22submit%22%3EContinue%3C%2Fbutton%3E%3C%2Fform%3E');
	await crossOriginPage.locator('form').evaluate((form, target) => {
		(form as HTMLFormElement).action = target as string;
	}, callbackUrl.toString());
	const crossResponsePromise = crossOriginPage.waitForResponse((response) => {
		try {
			return response.request().method() === 'POST' && new URL(response.url()).pathname === '/admin/auth/callback';
		} catch {
			return false;
		}
	});
	await crossOriginPage.getByRole('button', { name: 'Continue', exact: true }).click();
	const crossResponse = await crossResponsePromise;
	expect(crossResponse.status()).toBe(403);

	const passwordSetupResponsePromise = page.waitForResponse((response) => {
		try {
			return response.request().method() === 'GET' && new URL(response.url()).pathname === '/admin/login/set-password';
		} catch {
			return false;
		}
	});
	await page.goto('/admin/login/set-password');
	const passwordSetupResponse = await passwordSetupResponsePromise;
	expect(passwordSetupResponse.status()).toBe(303);
	expect(passwordSetupResponse.headers()['referrer-policy']).toBe('strict-origin');

	await page.goto('/admin/login');
	await expect(page.getByRole('link', { name: /reset link/i })).toHaveCount(0);

	const recoveryCallbackResponsePromise = page.waitForResponse((response) => {
		try {
			return response.request().method() === 'GET' && new URL(response.url()).pathname === '/admin/auth/callback';
		} catch {
			return false;
		}
	});
	await page.goto(`${callbackUrl.origin}/admin/auth/callback?token_hash=synthetic-recovery-hash&type=recovery`);
	const recoveryCallbackResponse = await recoveryCallbackResponsePromise;
	expect(recoveryCallbackResponse.status()).toBe(303);
	const recoveryLocation = new URL(recoveryCallbackResponse.headers()['location'] ?? '', trustedOrigin);
	expect(recoveryLocation.pathname).toBe('/admin/login');
	expect(recoveryLocation.searchParams.get('link')).toBe('invalid');
});
