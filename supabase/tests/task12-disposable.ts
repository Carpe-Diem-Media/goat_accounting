import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTask12MigrationsMatch, assertTask12Path, parseTask12Target, task12Local, TASK12_MIGRATION_VERSIONS, type Task12Target } from './task12-local';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_CONFIG = join(PROJECT_ROOT, 'supabase', 'config.toml');
const SAFE_FAILURE = 'Task 12 disposable project operation failed. Check the recorded project state before retrying.';
const PORT_NAMES = ['api', 'db', 'shadow', 'studio', 'smtp', 'pooler', 'analytics', 'inspector'] as const;
let activeStage = 'initialization';

export type Task12FailureClassification =
	| 'cli_compatibility'
	| 'docker_unavailable'
	| 'port_binding_conflict'
	| 'docker_network_failure'
	| 'container_start_failure'
	| 'container_health_failure'
	| 'database_container_missing'
	| 'migration_failure'
	| 'filesystem_failure'
	| 'resource_identity_check'
	| 'cleanup_failure'
	| 'unclassified_failure';

export type Task12FailureEvidence = {
	event: 'task12_stage_failure';
	stage: string;
	operation: string;
	exitCode: number | null;
	classification: Task12FailureClassification;
};

export function classifyTask12Failure(diagnostic: string, stage: string): Task12FailureClassification {
	if (/unknown (?:flag|option|command)|unknown shorthand flag|flag provided but not defined|accepts? \d+ arg/i.test(diagnostic)) {
		return 'cli_compatibility';
	}
	if (/cannot connect to (?:the )?docker daemon|is the docker daemon running|error during connect|dial unix.*docker/i.test(diagnostic)) {
		return 'docker_unavailable';
	}
	if (/postgres_cluster_identity_capture/.test(stage) && /no such (?:object|container)|not found/i.test(diagnostic)) {
		return 'database_container_missing';
	}
	if (/port is already allocated|address already in use|bind:.*in use|listen tcp.*address/i.test(diagnostic)) {
		return 'port_binding_conflict';
	}
	if (/network (?:.* )?(?:not found|does not exist|failed|invalid)|failed to create.*network|network.*active endpoints/i.test(diagnostic)) {
		return 'docker_network_failure';
	}
	if (/failed to (?:create|start|pull).*container|container .*failed to start/i.test(diagnostic)) {
		return 'container_start_failure';
	}
	if (/health ?check|unhealthy|timed? ?out.*healthy|waiting for.*healthy/i.test(diagnostic)) {
		return 'container_health_failure';
	}
	if (/migration|syntax error at or near|error applying|could not execute/i.test(diagnostic)) {
		return 'migration_failure';
	}
	if (/\bE(?:ACCES|EXIST|NOENT|PERM)\b|permission denied|read-only file system|no such file or directory|file exists/i.test(diagnostic)) {
		return 'filesystem_failure';
	}
	if (/identity|resource|container inspection/i.test(stage)) return 'resource_identity_check';
	if (/cleanup/i.test(stage)) return 'cleanup_failure';
	if (/migration/i.test(stage)) return 'migration_failure';
	return 'unclassified_failure';
}

function safeOperation(command: string[]): string {
	if (!command[0]) return 'task12';
	const executable = command[0]?.split('/').pop() ?? 'command';
	const subcommand = command[1];
	const candidate = `${executable} ${subcommand ?? ''}`.trim();
	const allowed = new Set([
		'docker info', 'docker ps', 'docker volume', 'docker network', 'docker inspect', 'docker exec',
		'git rev-parse', 'supabase start', 'supabase migration', 'supabase stop'
	]);
	return allowed.has(candidate) ? candidate : ['docker', 'git', 'supabase'].includes(executable) ? executable : 'command';
}

export function formatTask12FailureEvidence(
	stage: string,
	command: string[],
	exitCode: number | null,
	diagnostic: string
): Task12FailureEvidence {
	return {
		event: 'task12_stage_failure',
		stage,
		operation: safeOperation(command),
		exitCode,
		classification: classifyTask12Failure(diagnostic, stage)
	};
}

class Task12StageFailure extends Error {
	constructor(readonly evidence: Task12FailureEvidence) {
		super('Task 12 stage failed.');
	}
}

function failureForError(error: unknown, stage: string, command: string[] = []): Task12StageFailure {
	if (error instanceof Task12StageFailure) return error;
	const errorCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
		? error.code
		: '';
	const diagnostic = `${errorCode} ${error instanceof Error ? error.message : ''}`;
	return new Task12StageFailure(formatTask12FailureEvidence(stage, command, null, diagnostic));
}

function reportFailure(error: Task12StageFailure): void {
	console.error(JSON.stringify(error.evidence));
}

type Ports = Record<(typeof PORT_NAMES)[number], number>;
export type OwnedResources = {
	projectId: string;
	workdir: string;
	networkName: string;
	networkId: string;
	containers: { id: string; name: string }[];
	volumes: { name: string; createdAt: string }[];
};

export async function createExclusiveProjectDirectory(workdir: string): Promise<void> {
	if (!/^\/tmp\/goat-task12-r6-\d{8}-[a-f0-9]{32}$/.test(workdir)) throw new Error(SAFE_FAILURE);
	await mkdir(workdir, { mode: 0o700 });
}

type ResourceSnapshot = Pick<OwnedResources, 'containers' | 'volumes'>;

export function assertOwnedResourceSnapshot(expected: ResourceSnapshot, observed: ResourceSnapshot): void {
	const expectedContainers = expected.containers.map(({ id, name }) => `${id}\0${name}`).sort();
	const observedContainers = observed.containers.map(({ id, name }) => `${id}\0${name}`).sort();
	const expectedVolumes = expected.volumes.map(({ name, createdAt }) => `${name}\0${createdAt}`).sort();
	const observedVolumes = observed.volumes.map(({ name, createdAt }) => `${name}\0${createdAt}`).sort();
	const databaseContainers = expected.containers.filter(({ name }) => name.startsWith('supabase_db_'));
	if (
		expected.containers.length === 0 ||
		expected.volumes.length === 0 ||
		databaseContainers.length !== 1 ||
		expected.volumes.filter(({ name }) => name === databaseContainers[0]?.name).length !== 1 ||
		new Set(expected.containers.map(({ id }) => id)).size !== expected.containers.length ||
		new Set(expected.containers.map(({ name }) => name)).size !== expected.containers.length ||
		new Set(expected.volumes.map(({ name }) => name)).size !== expected.volumes.length ||
		JSON.stringify(expectedContainers) !== JSON.stringify(observedContainers) ||
		JSON.stringify(expectedVolumes) !== JSON.stringify(observedVolumes)
	) throw new Error(SAFE_FAILURE);
}

type CleanupActions = {
	verifyOwnership: () => void;
	stopProject: () => Promise<boolean>;
	markStopped: () => Promise<void>;
	remainingContainers: () => string;
	clearRecordedContainers: () => Promise<void>;
	removeVolumes: () => number;
	removeNetwork: () => void;
	markCleaned: () => Promise<void>;
};

async function stopProjectWithVerifiedOwnership(
	verifyOwnership: () => void,
	stopProject: () => Promise<boolean>
): Promise<boolean> {
	verifyOwnership();
	return stopProject();
}

export async function completeCleanup(
	state: 'TESTING' | 'STOPPED',
	actions: CleanupActions
): Promise<number> {
	if (state === 'TESTING') {
		if (!(await stopProjectWithVerifiedOwnership(actions.verifyOwnership, actions.stopProject))) {
			throw new Error(SAFE_FAILURE);
		}
		await actions.markStopped();
	}
	if (actions.remainingContainers()) throw new Error(SAFE_FAILURE);
	await actions.clearRecordedContainers();
	const removedVolumes = actions.removeVolumes();
	actions.removeNetwork();
	await actions.markCleaned();
	return removedVolumes;
}

function run(command: string[]): string {
	let result: ReturnType<typeof Bun.spawnSync>;
	try {
		result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
	} catch (error) {
		throw failureForError(error, activeStage, command);
	}
	if (result.exitCode !== 0) {
		const diagnostic = result.stderr.toString();
		const evidence = formatTask12FailureEvidence(activeStage, command, result.exitCode, diagnostic);
		throw new Task12StageFailure(evidence);
	}
	return result.stdout.toString().trim();
}

function runCode(command: string[], diagnosticStage?: string): { code: number; output: string } {
	let result: ReturnType<typeof Bun.spawnSync>;
	try {
		result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
	} catch (error) {
		if (diagnosticStage) throw failureForError(error, diagnosticStage, command);
		throw error;
	}
	if (diagnosticStage && result.exitCode !== 0) {
		throw new Task12StageFailure(formatTask12FailureEvidence(
			diagnosticStage,
			command,
			result.exitCode,
			result.stderr.toString()
		));
	}
	return { code: result.exitCode, output: result.stdout.toString().trim() };
}

function parseJson<T>(value: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		throw new Error(SAFE_FAILURE);
	}
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${randomBytes(4).toString('hex')}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
	await rename(temporary, path);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw error;
	}
}

async function portAvailable(port: number): Promise<boolean> {
	return await new Promise((resolveAvailable) => {
		const server = createServer();
		server.once('error', () => resolveAvailable(false));
		server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
			server.close(() => resolveAvailable(true));
		});
	});
}

async function allocatePorts(): Promise<Ports> {
	const start = 58000 + randomBytes(2).readUInt16BE(0) % 1800;
	for (let offset = 0; offset < 1800; offset += 1) {
		const base = 58000 + ((start - 58000 + offset) % 1800);
		const candidate = Object.fromEntries(PORT_NAMES.map((name, index) => [name, base + index])) as Ports;
		let available = true;
		for (const port of Object.values(candidate)) {
			if (!(await portAvailable(port))) {
				available = false;
				break;
			}
		}
		if (available) return candidate;
	}
	throw new Error('No free loopback port block is available for the Task 12 test project.');
}

function replacePort(source: string, section: string, key: string, port: number): string {
	const lines = source.split(/\r?\n/);
	let currentSection = '';
	let matches = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
		if (sectionMatch) {
			currentSection = sectionMatch[1] ?? '';
			continue;
		}
		if (currentSection === section && new RegExp(`^(\\s*${key}\\s*=\\s*)\\d+(\\s*(?:#.*)?)$`).test(line)) {
			lines[index] = line.replace(new RegExp(`^(\\s*${key}\\s*=\\s*)\\d+(\\s*(?:#.*)?)$`), `$1${port}$2`);
			matches += 1;
		}
	}
	if (matches !== 1) throw new Error(SAFE_FAILURE);
	return lines.join('\n');
}

function makeConfig(source: string, projectId: string, ports: Ports): string {
	let config = source.replace(/^project_id = "[^"]+"$/m, `project_id = "${projectId}"`);
	if (!config.includes(`project_id = "${projectId}"`)) throw new Error(SAFE_FAILURE);
	config = replacePort(config, 'api', 'port', ports.api);
	config = replacePort(config, 'db', 'port', ports.db);
	config = replacePort(config, 'db', 'shadow_port', ports.shadow);
	config = replacePort(config, 'studio', 'port', ports.studio);
	config = replacePort(config, 'local_smtp', 'port', ports.smtp);
	config = replacePort(config, 'db.pooler', 'port', ports.pooler);
	config = replacePort(config, 'analytics', 'port', ports.analytics);
	config = replacePort(config, 'edge_runtime', 'inspector_port', ports.inspector);
	return config;
}

function projectResourceCheck(projectId: string, networkName: string): void {
	const projectContainers = run(['docker', 'ps', '-aq', '--filter', `label=com.supabase.cli.project=${projectId}`]);
	const composeContainers = run(['docker', 'ps', '-aq', '--filter', `label=com.docker.compose.project=${projectId}`]);
	const databaseContainer = run(['docker', 'ps', '-aq', '--filter', `name=^/supabase_db_${projectId}$`]);
	const databaseVolume = run(['docker', 'volume', 'ls', '-q', '--filter', `name=^supabase_db_${projectId}$`]);
	const composeVolumes = run(['docker', 'volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectId}`]);
	const supabaseVolumes = run(['docker', 'volume', 'ls', '-q', '--filter', `label=com.supabase.cli.project=${projectId}`]);
	const network = run(['docker', 'network', 'ls', '-q', '--filter', `name=^${networkName}$`]);
	if (projectContainers || composeContainers || databaseContainer || databaseVolume || composeVolumes || supabaseVolumes || network) {
		throw new Error(SAFE_FAILURE);
	}
}

function inspectDatabaseContainer(projectId: string, workdir: string) {
	const template = '{{.Id}}\n{{.Name}}\n{{.Created}}\n{{json .Config.Labels}}\n{{json .Mounts}}\n{{json .NetworkSettings.Networks}}';
	const lines = run(['docker', 'inspect', '--type', 'container', '--format', template, `supabase_db_${projectId}`]).split('\n');
	if (lines.length !== 6) throw new Error(SAFE_FAILURE);
	const [id, name, createdAt, rawLabels, rawMounts, rawNetworks] = lines;
	const labels = parseJson<Record<string, string>>(rawLabels ?? '');
	const mounts = parseJson<{ Type: string; Name: string; Destination: string }[]>(rawMounts ?? '');
	const networks = parseJson<Record<string, { NetworkID: string }>>(rawNetworks ?? '');
	if (
		!id || !/^[a-f0-9]{64}$/.test(id) ||
		name !== `/supabase_db_${projectId}` ||
		!createdAt || !Number.isFinite(Date.parse(createdAt)) ||
		labels['com.supabase.cli.project'] !== projectId ||
		labels['com.supabase.cli.workdir'] !== workdir ||
		labels['com.docker.compose.project'] !== projectId
	) throw new Error(SAFE_FAILURE);
	const dbMounts = mounts.filter((mount) => mount.Type === 'volume' && mount.Destination === '/var/lib/postgresql/data');
	if (dbMounts.length !== 1 || !dbMounts[0]?.Name) throw new Error(SAFE_FAILURE);
	return { id, name: name.slice(1), createdAt, volumeName: dbMounts[0].Name, networks };
}

function inspectDatabaseVolume(name: string): { name: string; createdAt: string } {
	const lines = run(['docker', 'volume', 'inspect', '--format', '{{.Name}}\n{{.CreatedAt}}', name]).split('\n');
	if (lines.length !== 2 || lines[0] !== name || !Number.isFinite(Date.parse(lines[1] ?? ''))) {
		throw new Error(SAFE_FAILURE);
	}
	return { name, createdAt: lines[1] ?? '' };
}

function inspectProjectResourceSnapshot(projectId: string, workdir: string): ResourceSnapshot {
	const composeIds = run([
		'docker', 'ps', '-aq', '--filter', `label=com.docker.compose.project=${projectId}`
	]).split(/\r?\n/).filter(Boolean);
	const supabaseIds = run([
		'docker', 'ps', '-aq', '--filter', `label=com.supabase.cli.project=${projectId}`
	]).split(/\r?\n/).filter(Boolean);
	if (JSON.stringify([...composeIds].sort()) !== JSON.stringify([...supabaseIds].sort())) throw new Error(SAFE_FAILURE);

	const containers = composeIds.map((id) => {
		const lines = run([
			'docker', 'inspect', '--type', 'container', '--format', '{{.Id}}\n{{.Name}}\n{{json .Config.Labels}}', id
		]).split('\n');
		if (lines.length !== 3 || lines[0] !== id) throw new Error(SAFE_FAILURE);
		const name = (lines[1] ?? '').replace(/^\//, '');
		const labels = parseJson<Record<string, string>>(lines[2] ?? '');
		if (
			!name.startsWith('supabase_') ||
			!name.endsWith(projectId) ||
			labels['com.docker.compose.project'] !== projectId ||
			labels['com.supabase.cli.project'] !== projectId ||
			labels['com.supabase.cli.workdir'] !== workdir
		) throw new Error(SAFE_FAILURE);
		return { id, name };
	});

	const composeVolumeNames = run([
		'docker', 'volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectId}`
	]).split(/\r?\n/).filter(Boolean);
	const supabaseVolumeNames = run([
		'docker', 'volume', 'ls', '-q', '--filter', `label=com.supabase.cli.project=${projectId}`
	]).split(/\r?\n/).filter(Boolean);
	if (JSON.stringify([...composeVolumeNames].sort()) !== JSON.stringify([...supabaseVolumeNames].sort())) {
		throw new Error(SAFE_FAILURE);
	}
	const volumeNames = composeVolumeNames;
	const volumes = volumeNames.map((name) => {
		const lines = run([
			'docker', 'volume', 'inspect', '--format', '{{.Name}}\n{{.CreatedAt}}\n{{json .Labels}}', name
		]).split('\n');
		if (lines.length !== 3 || lines[0] !== name || !Number.isFinite(Date.parse(lines[1] ?? ''))) {
			throw new Error(SAFE_FAILURE);
		}
		const labels = parseJson<Record<string, string>>(lines[2] ?? '');
		if (
			!name.endsWith(projectId) ||
			labels['com.docker.compose.project'] !== projectId ||
			labels['com.supabase.cli.project'] !== projectId
		) throw new Error(SAFE_FAILURE);
		return { name, createdAt: lines[1] ?? '' };
	});
	return { containers, volumes };
}

function assertCurrentProjectResourcesMatch(
	projectId: string,
	workdir: string,
	expected: ResourceSnapshot
): void {
	const observed = inspectProjectResourceSnapshot(projectId, workdir);
	assertOwnedResourceSnapshot(expected, observed);
	const database = inspectDatabaseContainer(projectId, workdir);
	const volume = inspectDatabaseVolume(database.volumeName);
	if (
		!expected.containers.some(({ id, name }) => id === database.id && name === database.name) ||
		!expected.volumes.some(({ name, createdAt }) => name === volume.name && createdAt === volume.createdAt)
	) throw new Error(SAFE_FAILURE);
}

function remainingProjectContainers(projectId: string): string {
	const supabaseContainers = run([
		'docker', 'ps', '-aq', '--filter', `label=com.supabase.cli.project=${projectId}`
	]);
	const composeContainers = run([
		'docker', 'ps', '-aq', '--filter', `label=com.docker.compose.project=${projectId}`
	]);
	return [supabaseContainers, composeContainers].filter(Boolean).join('\n');
}

function readSystemIdentifier(containerId: string): string {
	const value = run([
		'docker', 'exec', containerId, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-At',
		'-v', 'ON_ERROR_STOP=1', '-c', 'SELECT system_identifier FROM pg_control_system();'
	]);
	if (!/^[0-9]+$/.test(value)) throw new Error(SAFE_FAILURE);
	return value;
}

function migrationVersions(directory: string): Promise<string[]> {
	return readdir(directory).then((files) => files
		.filter((file) => /^\d+_[^/]+\.sql$/.test(file))
		.map((file) => file.slice(0, file.indexOf('_')))
		.sort());
}

function createLoopbackNetwork(projectId: string, networkName: string): string {
	const id = run([
		'docker', 'network', 'create', '--driver', 'bridge',
		'--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
		'--label', `com.goat.task12.r6.project-id=${projectId}`,
		'--label', 'com.goat.task12.r6.managed-by=task12-disposable',
		networkName
	]);
	if (!/^[a-f0-9]{64}$/.test(id)) throw new Error(SAFE_FAILURE);
	try {
		const lines = run([
			'docker', 'network', 'inspect', '--format', '{{.Id}}\n{{.Name}}\n{{index .Labels "com.goat.task12.r6.project-id"}}\n{{index .Labels "com.goat.task12.r6.managed-by"}}\n{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}', id
		]).split('\n');
		if (lines.join('|') !== `${id}|${networkName}|${projectId}|task12-disposable|127.0.0.1`) throw new Error(SAFE_FAILURE);
		return id;
	} catch (error) {
		const inspected = runCode([
			'docker', 'network', 'inspect', '--format', '{{.Id}}\n{{.Name}}\n{{index .Labels "com.goat.task12.r6.project-id"}}\n{{index .Labels "com.goat.task12.r6.managed-by"}}\n{{json .Containers}}', id
		]);
		if (inspected.code === 0 && inspected.output === `${id}\n${networkName}\n${projectId}\ntask12-disposable\n{}`) {
			try { run(['docker', 'network', 'rm', id]); } catch { /* Preserve the original failure. */ }
		}
		throw error;
	}
}

function removeProjectVolumes(projectId: string, expectedVolumes: OwnedResources['volumes']): number {
	const composeNames = run(['docker', 'volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectId}`])
		.split(/\r?\n/).filter(Boolean);
	const supabaseNames = run(['docker', 'volume', 'ls', '-q', '--filter', `label=com.supabase.cli.project=${projectId}`])
		.split(/\r?\n/).filter(Boolean);
	if (JSON.stringify([...composeNames].sort()) !== JSON.stringify([...supabaseNames].sort())) throw new Error(SAFE_FAILURE);
	const names = composeNames;
	for (const name of names) {
		if (!/^[A-Za-z0-9_.-]+$/.test(name) || !name.endsWith(projectId)) throw new Error(SAFE_FAILURE);
		const inspected = run([
			'docker', 'volume', 'inspect', '--format', '{{.Name}}\n{{.CreatedAt}}\n{{json .Labels}}', name
		]).split('\n');
		if (inspected.length !== 3 || inspected[0] !== name) throw new Error(SAFE_FAILURE);
		const labels = parseJson<Record<string, string>>(inspected[2] ?? '');
		if (
			labels['com.docker.compose.project'] !== projectId ||
			labels['com.supabase.cli.project'] !== projectId
		) throw new Error(SAFE_FAILURE);
		const expected = expectedVolumes.find((volume) => volume.name === name);
		if (!expected || expected.createdAt !== inspected[1]) throw new Error(SAFE_FAILURE);
		if (run(['docker', 'ps', '-aq', '--filter', `volume=${name}`])) throw new Error(SAFE_FAILURE);
		run(['docker', 'volume', 'rm', name]);
	}
	if (run(['docker', 'volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectId}`])) {
		throw new Error(SAFE_FAILURE);
	}
	if (run(['docker', 'volume', 'ls', '-q', '--filter', `label=com.supabase.cli.project=${projectId}`])) {
		throw new Error(SAFE_FAILURE);
	}
	return names.length;
}

function removeProjectNetwork(projectId: string, networkId: string, networkName: string): void {
	const network = runCode(['docker', 'network', 'inspect', '--format', '{{.Id}}\n{{.Name}}\n{{index .Labels "com.goat.task12.r6.project-id"}}\n{{index .Labels "com.goat.task12.r6.managed-by"}}', networkId]);
	if (network.code === 0) {
		const details = run([
			'docker', 'network', 'inspect', '--format', '{{.Id}}\n{{.Name}}\n{{index .Labels "com.goat.task12.r6.project-id"}}\n{{index .Labels "com.goat.task12.r6.managed-by"}}\n{{json .Containers}}', networkId
		]);
		if (details !== `${networkId}\n${networkName}\n${projectId}\ntask12-disposable\n{}`) throw new Error(SAFE_FAILURE);
		run(['docker', 'network', 'rm', networkId]);
	} else if (runCode(['docker', 'network', 'ls', '-q', '--filter', `id=${networkId}`]).output) {
		throw new Error(SAFE_FAILURE);
	}
	if (run(['docker', 'network', 'ls', '-q', '--filter', `id=${networkId}`])) throw new Error(SAFE_FAILURE);
}

async function removeCreatedProject(
	workdir: string,
	projectId: string,
	networkId: string,
	networkName: string,
	expectedResources: ResourceSnapshot
): Promise<number> {
	activeStage = 'cleanup_identity_preflight';
	if (await pathExists(join(workdir, 'supabase', 'config.toml'))) {
		const stopped = await stopProjectWithVerifiedOwnership(
			() => {
				activeStage = 'cleanup_identity_preflight';
				assertCurrentProjectResourcesMatch(projectId, workdir, expectedResources);
				activeStage = 'cleanup_supabase_stop';
			},
			async () => runCode(['supabase', 'stop', '--no-backup', '--workdir', workdir], activeStage).code === 0
		);
		if (!stopped) throw new Error(SAFE_FAILURE);
	} else {
		assertCurrentProjectResourcesMatch(projectId, workdir, expectedResources);
	}
	activeStage = 'cleanup_resource_check';
	if (remainingProjectContainers(projectId)) throw new Error(SAFE_FAILURE);
	activeStage = 'cleanup_volume_removal';
	const removedVolumeCount = removeProjectVolumes(projectId, expectedResources.volumes);
	activeStage = 'cleanup_network_removal';
	removeProjectNetwork(projectId, networkId, networkName);
	return removedVolumeCount;
}

async function createProject(): Promise<void> {
	activeStage = 'docker_engine_preflight';
	run(['docker', 'info', '--format', '{{.ServerVersion}}']);
	activeStage = 'repository_revision';
	const sourceCommit = run(['git', '-C', PROJECT_ROOT, 'rev-parse', 'HEAD']);
	if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error(SAFE_FAILURE);
	const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
	let projectId = '';
	let networkName = '';
	let workdir = '';
	let ports: Ports | undefined;
	activeStage = 'target_allocation_preflight';
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const suffix = randomBytes(16).toString('hex');
		projectId = `goat-task12-r6-${date}-${suffix}`;
		networkName = `task12-r6-${date}-${suffix}`;
		workdir = `/tmp/${projectId}`;
		if (await pathExists(workdir)) continue;
		try {
			projectResourceCheck(projectId, networkName);
			ports = await allocatePorts();
			break;
		} catch (error) {
			if (error instanceof Task12StageFailure || (error instanceof Error && error.message === SAFE_FAILURE)) throw error;
		}
	}
	if (!projectId || !networkName || !workdir || !ports || await pathExists(workdir)) throw new Error(SAFE_FAILURE);

	activeStage = 'project_configuration_preparation';
	const configSource = await readFile(SOURCE_CONFIG, 'utf8');
	const migrationsSource = join(PROJECT_ROOT, 'supabase', 'migrations');
	activeStage = 'migration_source_preflight';
	const currentVersions = await migrationVersions(migrationsSource);
	if (currentVersions.join(',') !== TASK12_MIGRATION_VERSIONS.join(',')) throw new Error(SAFE_FAILURE);
	const config = makeConfig(configSource, projectId, ports);
	let networkId = '';
	let workdirCreated = false;
	let owned: OwnedResources | undefined;
	let resourcesRecorded = false;
	let startAttempted = false;
	try {
		activeStage = 'project_file_preparation';
		await createExclusiveProjectDirectory(workdir);
		workdirCreated = true;
		await mkdir(join(workdir, 'supabase'), { mode: 0o700 });
		await mkdir(join(workdir, 'supabase', 'migrations'), { mode: 0o700 });
		await writeFile(join(workdir, 'supabase', 'config.toml'), config, { mode: 0o600, flag: 'wx' });
		await cp(migrationsSource, join(workdir, 'supabase', 'migrations'), {
			recursive: true,
			filter: (source) => source.endsWith('.sql') || source === migrationsSource
		});
		activeStage = 'migration_copy_verification';
		await assertTask12MigrationsMatch(workdir);
		activeStage = 'isolated_network_creation';
		networkId = createLoopbackNetwork(projectId, networkName);
		owned = { projectId, workdir, networkName, networkId, containers: [], volumes: [] };
		activeStage = 'ownership_manifest_write';
		await writeJsonAtomically(join(workdir, 'task12-owned.json'), owned);

		startAttempted = true;
		activeStage = 'supabase_start';
		run(['supabase', 'start', '--yes', '--workdir', workdir, '--network-id', networkId]);
		activeStage = 'docker_resource_identity_inspection';
		const startedResources = inspectProjectResourceSnapshot(projectId, workdir);
		owned = { ...owned, ...startedResources };
		await writeJsonAtomically(join(workdir, 'task12-owned.json'), owned);
		resourcesRecorded = true;
		activeStage = 'postgres_cluster_identity_capture';
		const database = inspectDatabaseContainer(projectId, workdir);
		const systemIdentifier = readSystemIdentifier(database.id);
		await writeFile(join(workdir, 'cluster-id.tmp'), `${systemIdentifier}\n`, { mode: 0o600, flag: 'wx' });
		await rename(join(workdir, 'cluster-id.tmp'), join(workdir, 'cluster-id'));

		activeStage = 'migration_application';
		const volume = inspectDatabaseVolume(database.volumeName);
		run(['supabase', 'migration', 'up', '--local', '--yes', '--workdir', workdir]);
		activeStage = 'migration_history_verification';
		const appliedVersions = await migrationVersions(join(workdir, 'supabase', 'migrations'));
		if (appliedVersions.join(',') !== TASK12_MIGRATION_VERSIONS.join(',')) throw new Error(SAFE_FAILURE);
		const migrationQuery = run([
			'docker', 'exec', database.id, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-At',
			'-v', 'ON_ERROR_STOP=1', '-c', "SELECT string_agg(version, ',' ORDER BY version) FROM supabase_migrations.schema_migrations;"
		]);
		if (migrationQuery !== TASK12_MIGRATION_VERSIONS.join(',')) throw new Error(SAFE_FAILURE);
		assertOwnedResourceSnapshot(owned, inspectProjectResourceSnapshot(projectId, workdir));

		activeStage = 'target_manifest_write';
		const target: Task12Target = {
			schemaVersion: 1,
			state: 'TESTING',
			projectId,
			workdir,
			sourceCommit,
			networkName,
			networkId,
			ports,
			systemIdentifier,
			databaseContainer: {
				id: database.id,
				name: database.name,
				createdAt: database.createdAt,
				volumeName: volume.name,
				volumeCreatedAt: volume.createdAt
			},
			migrationVersions: [...TASK12_MIGRATION_VERSIONS]
		};
		await writeJsonAtomically(join(workdir, 'task12-target.json'), target);
		activeStage = 'target_identity_verification';
		assertCurrentProjectResourcesMatch(projectId, workdir, owned);
		const previousTarget = Bun.env.GOAT_TASK12_LOCAL_TARGET;
		Bun.env.GOAT_TASK12_LOCAL_TARGET = join(workdir, 'task12-target.json');
		try {
			activeStage = 'runtime_identity_verification';
			await task12Local();
		} finally {
			if (previousTarget === undefined) delete Bun.env.GOAT_TASK12_LOCAL_TARGET;
			else Bun.env.GOAT_TASK12_LOCAL_TARGET = previousTarget;
		}
		console.log(JSON.stringify({ state: 'TESTING', projectId, workdir, ports, sourceCommit, migrationCount: appliedVersions.length }));
	} catch (error) {
		const originalFailure = failureForError(error, activeStage);
		if (networkId) {
			try {
				activeStage = 'cleanup_identity_preflight';
				if (!owned) throw new Error(SAFE_FAILURE);
				if (resourcesRecorded) {
					assertOwnedResourceSnapshot(owned, inspectProjectResourceSnapshot(projectId, workdir));
				} else if (startAttempted) {
					// The random project ID was checked empty before this invocation started Supabase.
					owned = { ...owned, ...inspectProjectResourceSnapshot(projectId, workdir) };
					await writeJsonAtomically(join(workdir, 'task12-owned.json'), owned);
				}
				await removeCreatedProject(workdir, projectId, networkId, networkName, owned);
				activeStage = 'cleanup_failure_marker';
				const targetPath = join(workdir, 'task12-target.json');
				if (await pathExists(targetPath)) {
					const failedTarget = parseJson<Record<string, unknown>>(await readFile(targetPath, 'utf8'));
					if (failedTarget.projectId === projectId && failedTarget.networkId === networkId) {
						await writeJsonAtomically(targetPath, { ...failedTarget, state: 'CLEANED', attemptFailure: originalFailure.evidence });
					}
				}
			} catch (cleanupError) {
				reportFailure(failureForError(cleanupError, activeStage));
				console.error('New Task 12 resources require manual cleanup. Existing Task 12 resources were not targeted.');
			}
		} else if (workdirCreated) {
			try {
				activeStage = 'cleanup_project_directory';
				await rm(workdir, { recursive: true, force: true });
			} catch (cleanupError) {
				reportFailure(failureForError(cleanupError, activeStage));
			}
		}
		throw originalFailure;
	}
}

async function loadTargetForCleanup(): Promise<{
	target: Omit<Task12Target, 'state'> & { state: 'TESTING' | 'STOPPED' };
	owned: OwnedResources;
}> {
	const targetPath = Bun.env.GOAT_TASK12_LOCAL_TARGET;
	if (!targetPath) throw new Error('GOAT_TASK12_LOCAL_TARGET is required');
	const targetPathMatch = targetPath.match(/^\/tmp\/(goat-task12-r6-\d{8}-[a-f0-9]{32})\/task12-target\.json$/);
	if (!targetPathMatch) throw new Error(SAFE_FAILURE);
	const workdir = `/tmp/${targetPathMatch[1]}`;
	await assertTask12Path('/tmp', 'directory');
	await assertTask12Path(workdir, 'directory');
	await assertTask12Path(targetPath, 'file');
	await assertTask12Path(join(workdir, 'task12-owned.json'), 'file');
	const parsed = parseJson<Record<string, unknown>>(await readFile(targetPath, 'utf8'));
	if (parsed.state !== 'TESTING' && parsed.state !== 'STOPPED') throw new Error(SAFE_FAILURE);
	const validated = parseTask12Target({ ...parsed, state: 'TESTING' }, targetPath);
	const target: Omit<Task12Target, 'state'> & { state: 'TESTING' | 'STOPPED' } = { ...validated, state: parsed.state };
	const owned = parseJson<OwnedResources>(await readFile(join(target.workdir, 'task12-owned.json'), 'utf8'));
	if (
		!['TESTING', 'STOPPED'].includes(target.state) ||
		targetPath !== `/tmp/${target.projectId}/task12-target.json` ||
		owned.projectId !== target.projectId ||
		owned.workdir !== target.workdir ||
		owned.networkId !== target.networkId ||
		owned.networkName !== target.networkName ||
		!Array.isArray(owned.containers) ||
		owned.containers.some((container) => !/^[a-f0-9]{64}$/.test(container.id) || !container.name.startsWith(`supabase_`) || !container.name.endsWith(target.projectId)) ||
		!Array.isArray(owned.volumes) ||
		owned.volumes.some((volume) => !/^[A-Za-z0-9_.-]+$/.test(volume.name) || !volume.name.endsWith(target.projectId) || !Number.isFinite(Date.parse(volume.createdAt)))
	) throw new Error(SAFE_FAILURE);
	return { target, owned };
}

async function verifyProject(): Promise<void> {
	activeStage = 'target_verification_preflight';
	const { target } = await loadTargetForCleanup();
	if (target.state !== 'TESTING') throw new Error(SAFE_FAILURE);
	activeStage = 'target_runtime_verification';
	await task12Local();
	console.log(JSON.stringify({ state: target.state, projectId: target.projectId, workdir: target.workdir, systemIdentifier: target.systemIdentifier, migrationVersions: target.migrationVersions }));
}

async function cleanupProject(): Promise<void> {
	activeStage = 'cleanup_preflight';
	const { target, owned } = await loadTargetForCleanup();
	if (target.state === 'TESTING') {
		activeStage = 'cleanup_runtime_identity_verification';
		await task12Local();
	}
	activeStage = 'cleanup';
	const removedVolumeCount = await completeCleanup(target.state, {
		verifyOwnership: () => {
			activeStage = 'cleanup_identity_preflight';
			assertCurrentProjectResourcesMatch(target.projectId, target.workdir, owned);
			activeStage = 'cleanup_supabase_stop';
		},
		stopProject: async () => runCode(['supabase', 'stop', '--no-backup', '--workdir', target.workdir], 'cleanup_supabase_stop').code === 0,
		markStopped: async () => {
			await writeJsonAtomically(join(target.workdir, 'task12-target.json'), { ...target, state: 'STOPPED' });
		},
		remainingContainers: () => remainingProjectContainers(target.projectId),
		clearRecordedContainers: async () => {
			owned.containers = [];
			await writeJsonAtomically(join(target.workdir, 'task12-owned.json'), owned);
		},
		removeVolumes: () => removeProjectVolumes(target.projectId, owned.volumes),
		removeNetwork: () => removeProjectNetwork(target.projectId, target.networkId, target.networkName),
		markCleaned: async () => {
			await writeJsonAtomically(join(target.workdir, 'task12-target.json'), { ...target, state: 'CLEANED' });
		}
	});
	console.log(JSON.stringify({
		state: 'CLEANED',
		projectId: target.projectId,
		systemIdentifier: target.systemIdentifier,
		migrationsVerified: target.migrationVersions.length,
		containersStopped: owned.containers.length,
		recordedVolumes: owned.volumes.length,
		leftoverVolumesRemoved: removedVolumeCount,
		networkRemoved: target.networkId
	}));
}

async function main(): Promise<void> {
	const operation = Bun.argv[2];
	if (operation === 'create') return createProject();
	if (operation === 'verify') return verifyProject();
	if (operation === 'cleanup') return cleanupProject();
	throw new Error('Use: bun supabase/tests/task12-disposable.ts <create|verify|cleanup>');
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		reportFailure(failureForError(error, activeStage));
		process.exitCode = 1;
	});
}
