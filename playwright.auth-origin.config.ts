import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: ['auth-origin.pw.ts'],
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 30_000,
	reporter: 'line',
	use: {
		baseURL: 'http://127.0.0.1:5173',
		browserName: 'chromium'
	},
	webServer: {
		command: 'bunx vite build && exec bunx wrangler dev --config tests/e2e/worker/wrangler.toml --local --ip 127.0.0.1 --port 5173 --show-interactive-dev-session=false',
		url: 'http://127.0.0.1:5173/admin/login',
		reuseExistingServer: false,
		timeout: 180_000
	}
});
