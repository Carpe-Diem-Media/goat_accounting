import { defineConfig } from '@playwright/test';

const localWorkerCommand = [
	'bunx vite build',
	'&& exec bunx wrangler dev --config tests/e2e/worker/wrangler.toml --local --ip 127.0.0.1 --port 8788',
	'--show-interactive-dev-session=false',
	'--var ESTIMATOR_ENABLED:true',
	'--var ESTIMATE_READ_ENABLED:true',
	'--var ESTIMATE_CONTACT_ENABLED:true',
	'--var TURNSTILE_SITE_KEY:synthetic-site-key',
	'--var TURNSTILE_SECRET_KEY:synthetic-server-key',
	'--var TURNSTILE_HOSTNAME:example.invalid',
	'--var SUPABASE_URL:http://127.0.0.1:55191',
	'--var SUPABASE_SECRET_KEY:synthetic-test-key'
].join(' ');

const workerCommand = process.env.CI === 'true'
	? `sh -c '${localWorkerCommand}'`
	: `devcore-project run dev -- sh -c '${localWorkerCommand}'`;

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: ['estimate-business.spec.ts', 'estimate-personal.spec.ts', 'estimate-contact.spec.ts'],
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	reporter: 'line',
	use: {
		baseURL: 'http://127.0.0.1:8788',
		browserName: 'chromium'
	},
	webServer: {
		command: workerCommand,
		url: 'http://127.0.0.1:8788/estimate',
		reuseExistingServer: false,
		timeout: 120_000
	}
});
