import { expect, it } from 'bun:test';
import { chromium } from '@playwright/test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

it('renders a native six-digit TOTP pattern in the browser DOM', async () => {
	const sourcePath = fileURLToPath(new URL('./+page.svelte', import.meta.url));
	const compiled = compile(readFileSync(sourcePath, 'utf8'), {
		filename: sourcePath,
		generate: 'server'
	});
	const cacheRoot = join(process.cwd(), 'node_modules/.cache');
	mkdirSync(cacheRoot, { recursive: true });
	const temporaryDirectory = mkdtempSync(join(cacheRoot, 'task10-mfa-render-'));
	const modulePath = join(temporaryDirectory, 'mfa-page.mjs');
	writeFileSync(modulePath, compiled.js.code);

	let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
	try {
		const { default: MfaPage } = await import(pathToFileURL(modulePath).href);
		const { body } = render(MfaPage, {
			props: {
				data: { state: 'setup' },
				form: {
					enrollment: {
						qrCode: 'data:image/svg+xml;base64,AA==',
						secret: 'JBSWY3DPEHPK3PXP'
					}
				}
			}
		});

		browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
		const page = await browser.newPage();
		await page.setContent(body);
		const validation = await page.locator('#code').evaluate((node: HTMLInputElement) => {
			const input = node;
			const check = (value: string) => {
				input.value = value;
				return input.checkValidity();
			};
			return {
				pattern: input.pattern,
				labeled: input.labels?.[0]?.textContent?.trim() === 'Six-digit code',
				sixAsciiDigits: check('123456'),
				fiveDigits: check('12345'),
				sevenDigits: check('1234567'),
				containsLetter: check('12a456')
			};
		});

		expect(validation).toEqual({
			pattern: '[0-9]{6}',
			labeled: true,
			sixAsciiDigits: true,
			fiveDigits: false,
			sevenDigits: false,
			containsLetter: false
		});
	} finally {
		await browser?.close();
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
});
