import { afterAll, beforeAll, expect, test } from 'bun:test';

const publicRef = 'd'.repeat(32);
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
			'tests/contact-worker/wrangler.toml',
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
			throw new Error(`Wrangler exited before serving the contact Worker: ${await workerStderr}`);
		}
		try {
			const response = await fetch(workerUrl, { signal: AbortSignal.timeout(500) });
			if (response.status === 404) return;
		} catch {
			// Wrangler is still starting its local Worker.
		}
		await Bun.sleep(100);
	}
	throw new Error(`Wrangler did not serve the contact Worker: ${await workerStderr}`);
}, 25_000);

afterAll(async () => {
	if (!workerProcess) return;
	workerProcess.kill('SIGTERM');
	await workerProcess.exited;
});


const payload = { fullName: 'Synthetic Prospect', email: 'synthetic@example.invalid', preferredContactMethod: 'email', contactConsent: true, requestedContact: true, requestedEstimateEmail: true };
function submit(token: string, changes = {}) {
 return fetch(`${workerUrl}/api/estimates/${publicRef}/contact`, { method: 'POST', headers: { 'content-type': 'application/json', origin: workerUrl }, body: JSON.stringify({ ...payload, ...changes, turnstileToken: token }) });
}

test('Worker rejects invalid and expired verification, preserves matching retries, and refuses changed actions', async () => {
 for (const token of ['', 'expired', 'upstream-down']) {
  const response = await submit(token);
  expect(response.status).toBe(token === '' ? 400 : token === 'expired' ? 403 : 503);
 }
 expect(await (await fetch(`${workerUrl}/state`)).json()).toEqual({ leads: 0, events: 0, deliveries: 0 });
 const response = await submit('fresh-first');
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({ saved: true });
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect((await submit('fresh-first', { requestedContact: false })).status).toBe(403);
 expect((await submit('fresh-retry')).status).toBe(200);
 expect((await submit('fresh-change', { requestedContact: false })).status).toBe(409);
 expect(await (await fetch(`${workerUrl}/state`)).json()).toEqual({ leads: 1, events: 1, deliveries: 2 });
});

test('the native Worker limiter blocks repeated requests before another contact write', async () => {
 let response: Response | undefined;
 for (let attempt = 0; attempt < 25; attempt++) {
  response = await submit(`throttle-${attempt}`);
  if (response.status === 429) break;
 }
 expect(response?.status).toBe(429);
 expect(response?.headers.get('retry-after')).toBe('60');
 expect(await (await fetch(`${workerUrl}/state`)).json()).toEqual({ leads: 1, events: 1, deliveries: 2 });
});
