import { afterAll, beforeAll, expect, test } from 'bun:test';

let workerProcess: ReturnType<typeof Bun.spawn> | undefined;
let workerStderr: Promise<string> | undefined;
let workerUrl: string;

beforeAll(async () => {
	const portProbe = Bun.serve({ port: 0, fetch: () => new Response() });
	const port = portProbe.port;
	portProbe.stop();
	workerProcess = Bun.spawn(
		[
			'node',
			'node_modules/wrangler/bin/wrangler.js',
			'dev',
			'--config',
			'tests/notifications-worker/wrangler.toml',
			'--local',
			'--ip',
			'127.0.0.1',
			'--port',
			String(port)
		],
		{ stdout: 'ignore', stderr: 'pipe' }
	);
	workerStderr = new Response(workerProcess.stderr).text();
	workerUrl = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		if (workerProcess.exitCode !== null) {
			throw new Error(`Wrangler exited before serving the notifications Worker: ${await workerStderr}`);
		}
		try {
			const response = await fetch(workerUrl, { signal: AbortSignal.timeout(500) });
			if (response.status === 404) return;
		} catch {
			// Wrangler is still starting its local Worker.
		}
		await Bun.sleep(100);
	}
	throw new Error(`Wrangler did not serve the notifications Worker: ${await workerStderr}`);
}, 25_000);

afterAll(async () => {
	if (!workerProcess) return;
	workerProcess.kill('SIGTERM');
	await workerProcess.exited;
});

async function send(path: string): Promise<Response> {
	return fetch(`${workerUrl}${path}`, { method: 'POST' });
}

test('runs the mailer in workerd with an injected provider acceptance response', async () => {
	const response = await send('/accepted');
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		classification: 'accepted',
		code: 'PROVIDER_ACCEPTED',
		providerId: '66000000-0000-4000-8000-000000000001',
		retryNotBefore: null,
		reconciliationRequired: false
	});
});

test('marks a provider body timeout as uncertain inside the configured deadline', async () => {
	const started = Date.now();
	const response = await send('/timeout');
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		classification: 'uncertain',
		code: 'PROVIDER_TIMEOUT',
		providerId: null,
		retryNotBefore: null,
		reconciliationRequired: true
	});
	expect(Date.now() - started).toBeLessThan(2_000);
});

test('reports disabled notification configuration without calling the provider mock', async () => {
	const response = await send('/disabled');
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ status: 'disabled' });
});
