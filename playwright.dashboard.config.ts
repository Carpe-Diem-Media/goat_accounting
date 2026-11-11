import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Run the dashboard suite with its disposable local test runner (${name} is missing).`);
	return value;
}

function quote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

const defaultWorkerDir = required('DASHBOARD_E2E_WORKER_DEFAULT_DIR');
const enabledWorkerDir = required('DASHBOARD_E2E_WORKER_ENABLED_DIR');
const defaultPort = required('DASHBOARD_E2E_DEFAULT_PORT');
const enabledPort = required('DASHBOARD_E2E_ENABLED_PORT');
const workerCommand = (directory: string, port: string) =>
	`bunx wrangler dev --config ${quote(join(directory, 'wrangler.toml'))} --local --ip 127.0.0.1 --port ${port} --show-interactive-dev-session=false`;

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: ['dashboard-authenticated.pw.ts'],
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 120_000,
	reporter: 'line',
	use: {
		browserName: 'chromium'
	},
	webServer: [
		{
			command: workerCommand(defaultWorkerDir, defaultPort),
			url: `http://127.0.0.1:${defaultPort}/admin/login`,
			reuseExistingServer: false,
			timeout: 180_000,
			stdout: 'ignore',
			stderr: 'pipe'
		},
		{
			command: workerCommand(enabledWorkerDir, enabledPort),
			url: `http://127.0.0.1:${enabledPort}/admin/login`,
			reuseExistingServer: false,
			timeout: 180_000,
			stdout: 'ignore',
			stderr: 'pipe'
		}
	]
});
