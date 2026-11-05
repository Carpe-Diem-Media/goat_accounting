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
			'tests/pdf-worker/wrangler.toml',
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
			throw new Error(`Wrangler exited before serving the PDF Worker: ${await workerStderr}`);
		}
		try {
			const response = await fetch(workerUrl, { signal: AbortSignal.timeout(500) });
			if (response.status === 404) return;
		} catch {
			// Wrangler is still starting its local Worker.
		}
		await Bun.sleep(100);
	}
	throw new Error(`Wrangler did not serve the PDF Worker: ${await workerStderr}`);
}, 25_000);

afterAll(async () => {
	if (!workerProcess) return;
	workerProcess.kill('SIGTERM');
	await workerProcess.exited;
});

test('the saved estimate PDF endpoint returns a private attachment from a real Worker', async () => {
	const response = await fetch(`${workerUrl}/api/estimates/${publicRef}/pdf`);
	const bytes = new Uint8Array(await response.arrayBuffer());

	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toBe('application/pdf');
	expect(response.headers.get('content-disposition')).toBe(`attachment; filename="estimate-${publicRef}.pdf"`);
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
	expect(response.headers.get('referrer-policy')).toBe('no-referrer');
	expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
});
