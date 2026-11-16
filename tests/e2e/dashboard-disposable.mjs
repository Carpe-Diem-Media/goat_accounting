import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tempRoot = mkdtempSync(join(tmpdir(), 'goat-t13-dashboard-'));
const projectId = `goat-t13-${randomBytes(6).toString('hex')}`;
const projectRoot = join(tempRoot, projectId);
const supabaseDir = join(projectRoot, 'supabase');
const workerDir = join(tempRoot, 'workers');
const expectedMigrations = [
	'20261103183011',
	'20261105062524',
	'20261105090000',
	'20261105170000',
	'20261105180000',
	'20261110150000',
	'20261110170000'
];

function run(command, args, options = {}) {
	const { phase: _phase, ...spawnOptions } = options;
	const result = spawnSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 8 * 1024 * 1024,
		...spawnOptions
	});
	if (result.error || result.status !== 0) throw new Error(`Command failed during ${options.phase ?? 'test setup'}.`);
	return result.stdout ?? '';
}

function startDisposableSupabase() {
	const result = spawnSync('supabase', [
		'start', '--workdir', projectRoot,
		'--exclude', 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
	], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 8 * 1024 * 1024,
		timeout: 300_000
	});
	if (result.error || result.status !== 0) {
		const raw = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
		const safeLines = raw.split(/\r?\n/)
			.filter((line) => /error|failed|fatal|unhealthy/i.test(line))
			.map((line) => line
				.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[database-url]')
				.replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[redacted-token]')
				.replace(/(password|secret|token|key)\s*([:=])\s*[^\s,]+/gi, '$1$2[redacted]')
				.slice(0, 1_000))
			.slice(-4);
		console.error(`SUPABASE_LOCAL_START status=${result.status ?? 'unknown'} signal=${result.signal ?? 'none'} details=${safeLines.length ? safeLines.join(' | ') : 'no safe error line available'}`);
		throw new Error('Could not start the disposable local Supabase project.');
	}
}

function updateSection(text, section, updates) {
	const header = `[${section}]`;
	const start = text.indexOf(header);
	if (start < 0) throw new Error(`Missing local Supabase section ${section}.`);
	const next = text.indexOf('\n[', start + header.length);
	const end = next < 0 ? text.length : next + 1;
	let block = text.slice(start, end);
	for (const [key, value] of Object.entries(updates)) {
		const expression = new RegExp(`^${key}\\s*=.*$`, 'm');
		if (!expression.test(block)) throw new Error(`Missing local Supabase setting ${section}.${key}.`);
		block = block.replace(expression, `${key} = ${value}`);
	}
	return text.slice(0, start) + block + text.slice(end);
}

async function freePort() {
	const server = net.createServer();
	await new Promise((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(0, '0.0.0.0', resolveListen);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Could not reserve a local test port.');
	const port = address.port;
	await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
	return port;
}

function copyMigrations() {
	mkdirSync(join(supabaseDir, 'migrations'), { recursive: true });
	for (const name of readdirSync(join(root, 'supabase/migrations'))) {
		if (!name.endsWith('.sql')) continue;
		copyFileSync(join(root, 'supabase/migrations', name), join(supabaseDir, 'migrations', name));
	}
	const present = readdirSync(join(supabaseDir, 'migrations'));
	for (const version of expectedMigrations) {
		if (!present.some((name) => name.startsWith(version))) throw new Error(`Required local migration ${version} is missing.`);
	}
}

function copyAuthEmailTemplates(config) {
	const templatePaths = [...config.matchAll(/^[\t ]*content_path\s*=\s*"([^"]+)"\s*$/gm)]
		.map(([, templatePath]) => templatePath);
	for (const templatePath of templatePaths) {
		const match = /^\.\/supabase\/templates\/([^/]+)$/.exec(templatePath);
		if (!match) throw new Error('Configured Auth email templates must be under supabase/templates.');
		const fileName = match[1];
		const destination = join(supabaseDir, 'templates');
		mkdirSync(destination, { recursive: true });
		copyFileSync(join(root, 'supabase/templates', fileName), join(destination, fileName));
	}
}

function makeWorkerConfig(lane, port, apiUrl, publishableKey) {
	const directory = join(workerDir, lane);
	mkdirSync(directory, { recursive: true });
	const worker = resolve(root, '.svelte-kit/cloudflare/_worker.js');
	const assets = resolve(root, '.svelte-kit/cloudflare');
	writeFileSync(join(directory, 'wrangler.toml'), [
		`name = "goat-t13-dashboard-${lane}-${projectId}"`,
		`main = ${JSON.stringify(worker)}`,
		'compatibility_date = "2026-11-03"',
		'compatibility_flags = ["nodejs_compat"]',
		'workers_dev = false',
		'[assets]',
		`directory = ${JSON.stringify(assets)}`,
		'binding = "ASSETS"',
		''
	].join('\n'));
	const vars = [`SUPABASE_URL=${apiUrl}`, `SUPABASE_PUBLISHABLE_KEY=${publishableKey}`];
	if (lane === 'enabled') vars.push('DASHBOARD_RELEASE_ENABLED=true');
	writeFileSync(join(directory, '.dev.vars'), `${vars.join('\n')}\n`, { mode: 0o600 });
	return { directory, port };
}

let supabaseStartAttempted = false;
let phase = 'isolated local Supabase setup';

try {
	const apiPort = await freePort();
	const dbPort = await freePort();
	const shadowPort = await freePort();
	mkdirSync(projectRoot, { recursive: true });
	mkdirSync(supabaseDir, { recursive: true });
	copyMigrations();
	let config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
	config = config.replace(/^project_id = .*$/m, `project_id = "${projectId}"`);
	config = updateSection(config, 'api', { port: String(apiPort) });
	config = updateSection(config, 'db', { port: String(dbPort), shadow_port: String(shadowPort) });
	config = updateSection(config, 'auth', { enable_signup: 'true' });
	config = updateSection(config, 'auth.email', { enable_signup: 'true', enable_confirmations: 'false' });
	for (const section of ['realtime', 'studio', 'local_smtp', 'storage', 'storage.s3_protocol', 'storage.vector', 'analytics', 'edge_runtime']) {
		config = updateSection(config, section, { enabled: 'false' });
	}
	copyAuthEmailTemplates(config);
	writeFileSync(join(supabaseDir, 'config.toml'), config, { mode: 0o600 });

	phase = 'starting disposable Supabase';
	supabaseStartAttempted = true;
	startDisposableSupabase();
	phase = 'local service identity checks';
	const status = JSON.parse(run('supabase', ['status', '--workdir', projectRoot, '--output', 'json'], { phase }));
	const api = new URL(status.API_URL);
	const db = new URL(status.DB_URL);
	if (api.hostname !== '127.0.0.1' || api.port !== String(apiPort) || db.hostname !== '127.0.0.1' || db.port !== String(dbPort)) {
		throw new Error('The disposable database endpoint does not match its local allocation.');
	}
	if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Local Supabase did not return test credentials.');
	const health = await fetch(`${api.origin}/auth/v1/health`, { signal: AbortSignal.timeout(5_000) });
	if (!health.ok) throw new Error('Local Supabase Auth health check failed.');

	phase = 'local migration checks';
	const container = `supabase_db_${projectId}`;
	const migrationRows = run('docker', [
		'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
		'-c', `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${expectedMigrations.map((version) => `'${version}'`).join(',')});`
	], { phase }).trim();
	if (migrationRows !== String(expectedMigrations.length)) throw new Error('The disposable project did not apply all required migrations.');

	phase = 'Worker build';
	run('bunx', ['vite', 'build'], { stdio: 'inherit', timeout: 300_000, phase });
	const offWorker = makeWorkerConfig('default-off', 8795, api.origin, status.ANON_KEY);
	const enabledWorker = makeWorkerConfig('enabled', 8796, api.origin, status.ANON_KEY);

	phase = 'authenticated Playwright suite';
	const result = spawnSync('bunx', ['playwright', 'test', '--config=playwright.dashboard.config.ts', ...process.argv.slice(2)], {
		cwd: root,
		stdio: 'inherit',
		timeout: 600_000,
		env: {
			...process.env,
			DASHBOARD_E2E_WORKER_DEFAULT_DIR: offWorker.directory,
			DASHBOARD_E2E_WORKER_ENABLED_DIR: enabledWorker.directory,
			DASHBOARD_E2E_DEFAULT_PORT: String(offWorker.port),
			DASHBOARD_E2E_ENABLED_PORT: String(enabledWorker.port),
			DASHBOARD_E2E_SUPABASE_URL: api.origin,
			DASHBOARD_E2E_ANON_KEY: status.ANON_KEY,
			DASHBOARD_E2E_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
			DASHBOARD_E2E_DB_CONTAINER: container,
			DASHBOARD_E2E_PROJECT_ID: projectId
		}
	});
	if (result.error || result.status !== 0) process.exitCode = 1;
} catch {
	console.error(`Dashboard E2E setup failed during ${phase}. Sensitive command output was withheld.`);
	process.exitCode = 1;
} finally {
	if (supabaseStartAttempted) {
		const stopped = spawnSync('supabase', ['stop', '--workdir', projectRoot, '--no-backup'], {
			cwd: root,
			stdio: 'ignore',
			timeout: 120_000
		});
		if (stopped.error || stopped.status !== 0) {
			console.error('Disposable Supabase cleanup failed. Check the local test project before retrying.');
			process.exitCode = 1;
		}
	}
	rmSync(tempRoot, { recursive: true, force: true });
}
