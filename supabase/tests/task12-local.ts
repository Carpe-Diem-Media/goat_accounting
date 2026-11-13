import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TASK12_MIGRATION_VERSIONS = [
	'20261103183011',
	'20261105062524',
	'20261105090000',
	'20261105170000',
	'20261105180000',
	'20261110150000',
	'20261110165306',
	'20261111045053'
] as const;

const PORT_KEYS = ['api', 'db', 'shadow', 'studio', 'smtp', 'pooler', 'analytics', 'inspector'] as const;
const SAFE_TARGET_ERROR = 'Task 12 disposable environment failed identity preflight.';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export type Task12Target = {
	schemaVersion: 1;
	state: 'TESTING';
	projectId: string;
	workdir: string;
	sourceCommit: string;
	networkName: string;
	networkId: string;
	ports: Record<(typeof PORT_KEYS)[number], number>;
	systemIdentifier: string;
	databaseContainer: {
		id: string;
		name: string;
		createdAt: string;
		volumeName: string;
		volumeCreatedAt: string;
	};
	migrationVersions: string[];
};

type PortMapping = { containerPort: number; hostIp: string; hostPort: number };

export type Task12Runtime = {
	dbUrl: string;
	apiUrl: string;
	systemIdentifier: string;
	migrationVersions: string[];
	databaseContainer: {
		id: string;
		name: string;
		createdAt: string;
		projectLabel: string;
		supabaseProject: string;
		workdir: string;
		portMappings: PortMapping[];
		volumeName: string;
		networkId: string;
	};
	databaseVolume: { name: string; createdAt: string };
	network: { id: string; name: string; projectLabel: string; managedBy: string; hostBindingIpv4: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
	return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function sameValues(left: readonly unknown[], right: readonly unknown[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseTask12Target(value: unknown, targetPath: string): Task12Target {
	if (!isRecord(value)) throw new Error(SAFE_TARGET_ERROR);
	const projectId = value.projectId;
	if (
		value.schemaVersion !== 1 ||
		value.state !== 'TESTING' ||
		typeof projectId !== 'string' ||
		!/^goat-task12-r6-\d{8}-[a-f0-9]{32}$/.test(projectId) ||
		targetPath !== `/tmp/${projectId}/task12-target.json` ||
		value.workdir !== `/tmp/${projectId}` ||
		typeof value.sourceCommit !== 'string' ||
		!/^[a-f0-9]{40}$/.test(value.sourceCommit) ||
		typeof value.networkName !== 'string' ||
		!/^task12-r6-\d{8}-[a-f0-9]{32}$/.test(value.networkName) ||
		value.networkName !== projectId.replace(/^goat-/, '') ||
		typeof value.networkId !== 'string' ||
		!/^[a-f0-9]{64}$/.test(value.networkId) ||
		typeof value.systemIdentifier !== 'string' ||
		!/^[0-9]+$/.test(value.systemIdentifier) ||
		!isRecord(value.ports) ||
		!isRecord(value.databaseContainer) ||
		!Array.isArray(value.migrationVersions)
	) {
		throw new Error(SAFE_TARGET_ERROR);
	}

	const ports = value.ports;
	const portValues = PORT_KEYS.map((key) => ports[key]);
	if (
		portValues.some((port) => typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) ||
		new Set(portValues).size !== PORT_KEYS.length
	) {
		throw new Error(SAFE_TARGET_ERROR);
	}

	const databaseContainer = value.databaseContainer;
	if (
		typeof databaseContainer.id !== 'string' ||
		!/^[a-f0-9]{64}$/.test(databaseContainer.id) ||
		databaseContainer.name !== `supabase_db_${projectId}` ||
		!validTimestamp(databaseContainer.createdAt) ||
		databaseContainer.volumeName !== `supabase_db_${projectId}` ||
		!validTimestamp(databaseContainer.volumeCreatedAt) ||
		!sameValues(value.migrationVersions, TASK12_MIGRATION_VERSIONS)
	) {
		throw new Error(SAFE_TARGET_ERROR);
	}

	return value as unknown as Task12Target;
}

export function assertTask12Testable(target: Task12Target): void {
	if (
		target.state !== 'TESTING' ||
		target.projectId === 'goat-task12-disposable-20261110' ||
		target.workdir !== `/tmp/${target.projectId}` ||
		!sameValues(target.migrationVersions, TASK12_MIGRATION_VERSIONS)
	) {
		throw new Error(SAFE_TARGET_ERROR);
	}
}

export function assertTask12RuntimeMatches(target: Task12Target, runtime: Task12Runtime): void {
	assertTask12Testable(target);
	let dbUrl: URL;
	let apiUrl: URL;
	try {
		dbUrl = new URL(runtime.dbUrl);
		apiUrl = new URL(runtime.apiUrl);
	} catch {
		throw new Error(SAFE_TARGET_ERROR);
	}

	const database = runtime.databaseContainer;
	const volume = runtime.databaseVolume;
	const network = runtime.network;
	if (
		dbUrl.protocol !== 'postgresql:' && dbUrl.protocol !== 'postgres:'
	) throw new Error('Task 12 runtime preflight failed: the database URL protocol is invalid.');
	if (
		dbUrl.hostname !== '127.0.0.1' ||
		dbUrl.port !== String(target.ports.db) ||
		dbUrl.pathname !== '/postgres' ||
		apiUrl.protocol !== 'http:' ||
		apiUrl.hostname !== '127.0.0.1' ||
		apiUrl.port !== String(target.ports.api)
	) throw new Error('Task 12 runtime preflight failed: Supabase endpoints do not match the assigned loopback ports.');
	if (
		runtime.systemIdentifier !== target.systemIdentifier ||
		!sameValues(runtime.migrationVersions, target.migrationVersions) ||
		database.id !== target.databaseContainer.id ||
		database.name !== target.databaseContainer.name ||
		database.createdAt !== target.databaseContainer.createdAt ||
		database.projectLabel !== target.projectId ||
		database.supabaseProject !== target.projectId ||
		database.workdir !== target.workdir
	) throw new Error('Task 12 runtime preflight failed: database container identity changed.');
	if (
		database.portMappings.length !== 1 ||
		database.portMappings[0]?.containerPort !== 5432 ||
		database.portMappings[0]?.hostIp !== '127.0.0.1' ||
		database.portMappings[0]?.hostPort !== target.ports.db
	) throw new Error('Task 12 runtime preflight failed: database published ports are not restricted to the assigned IPv4 loopback endpoint.');
	if (
		database.volumeName !== target.databaseContainer.volumeName ||
		volume.name !== target.databaseContainer.volumeName ||
		volume.createdAt !== target.databaseContainer.volumeCreatedAt
	) throw new Error('Task 12 runtime preflight failed: PostgreSQL volume identity changed.');
	if (
		database.networkId !== target.networkId ||
		network.id !== target.networkId ||
		network.name !== target.networkName ||
		network.projectLabel !== target.projectId ||
		network.managedBy !== 'task12-disposable' ||
		network.hostBindingIpv4 !== '127.0.0.1'
	) throw new Error('Task 12 runtime preflight failed: isolated network identity or host binding changed.');
}

function runCaptured(command: string[], failureMessage: string): string {
	const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'ignore' });
	if (result.exitCode !== 0) throw new Error(failureMessage);
	return result.stdout.toString().trim();
}

function parseTomlPort(source: string, section: string, key: string): number {
	let currentSection = '';
	for (const line of source.split(/\r?\n/)) {
		const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
		if (sectionMatch) {
			currentSection = sectionMatch[1] ?? '';
			continue;
		}
		if (currentSection !== section) continue;
		const portMatch = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`));
		if (portMatch) return Number(portMatch[1]);
	}
	throw new Error(SAFE_TARGET_ERROR);
}

function safeJson<T>(value: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		throw new Error(SAFE_TARGET_ERROR);
	}
}

type DockerContainer = {
	Id: string;
	Name: string;
	Created: string;
	Config: { Labels: Record<string, string> };
	NetworkSettings: {
		Ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
		Networks: Record<string, { NetworkID: string }>;
	};
	Mounts: { Type: string; Name: string; Destination: string }[];
};

function inspectContainer(id: string): DockerContainer {
	const template = '{{.Id}}\n{{.Name}}\n{{.Created}}\n{{json .Config.Labels}}\n{{json .NetworkSettings.Ports}}\n{{json .Mounts}}\n{{json .NetworkSettings.Networks}}';
	const lines = runCaptured(
		['docker', 'inspect', '--type', 'container', '--format', template, id],
		SAFE_TARGET_ERROR
	).split('\n');
	if (lines.length !== 7) throw new Error(SAFE_TARGET_ERROR);
	const [containerId, name, createdAt, labels, ports, mounts, networks] = lines;
	return {
		Id: containerId ?? '',
		Name: name ?? '',
		Created: createdAt ?? '',
		Config: { Labels: safeJson(labels ?? '') },
		NetworkSettings: {
			Ports: safeJson(ports ?? ''),
			Networks: safeJson(networks ?? '')
		},
		Mounts: safeJson(mounts ?? '')
	};
}

async function currentMigrationVersions(workdir: string): Promise<string[]> {
	const migrationDirectory = join(workdir, 'supabase', 'migrations');
	const files = await readdir(migrationDirectory);
	return files
		.filter((file) => /^\d+_[^/]+\.sql$/.test(file))
		.map((file) => file.slice(0, file.indexOf('_')))
		.sort();
}

export async function assertTask12MigrationsMatch(workdir: string): Promise<void> {
	const sourceDirectory = join(REPOSITORY_ROOT, 'supabase', 'migrations');
	const targetDirectory = join(workdir, 'supabase', 'migrations');
	const sqlFiles = (files: string[]) => files.filter((file) => /^\d+_[^/]+\.sql$/.test(file)).sort();
	const sourceFiles = sqlFiles(await readdir(sourceDirectory));
	const targetFiles = sqlFiles(await readdir(targetDirectory));
	if (!sameValues(sourceFiles, targetFiles)) throw new Error('Task 12 migration files do not match the repository source.');
	for (const file of sourceFiles) {
		const [source, target] = await Promise.all([
			readFile(join(sourceDirectory, file)),
			readFile(join(targetDirectory, file))
		]);
		if (!source.equals(target)) throw new Error('Task 12 migration files do not match the repository source.');
	}
}

function assertConfigMatches(source: string, target: Task12Target): void {
	if (!new RegExp(`^project_id = "${target.projectId}"$`, 'm').test(source)) {
		throw new Error(SAFE_TARGET_ERROR);
	}
	const configPorts = [
		parseTomlPort(source, 'api', 'port'),
		parseTomlPort(source, 'db', 'port'),
		parseTomlPort(source, 'db', 'shadow_port'),
		parseTomlPort(source, 'studio', 'port'),
		parseTomlPort(source, 'local_smtp', 'port'),
		parseTomlPort(source, 'db.pooler', 'port'),
		parseTomlPort(source, 'analytics', 'port'),
		parseTomlPort(source, 'edge_runtime', 'inspector_port')
	];
	if (!sameValues(configPorts, PORT_KEYS.map((key) => target.ports[key]))) {
		throw new Error(SAFE_TARGET_ERROR);
	}
}

async function readRuntime(target: Task12Target, status: Record<string, unknown>): Promise<Task12Runtime> {
	if (typeof status.DB_URL !== 'string' || typeof status.API_URL !== 'string') {
		throw new Error(SAFE_TARGET_ERROR);
	}
	const sql = "SELECT 'system|' || system_identifier::text FROM pg_control_system(); SELECT 'migrations|' || COALESCE(string_agg(version, ',' ORDER BY version), '') FROM supabase_migrations.schema_migrations;";
	const databaseContainer = inspectContainer(target.databaseContainer.id);
	const query = runCaptured(
		['docker', 'exec', target.databaseContainer.id, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
		SAFE_TARGET_ERROR
	).split(/\r?\n/);
	if (query.length !== 2 || !query[0]?.startsWith('system|') || !query[1]?.startsWith('migrations|')) {
		throw new Error(SAFE_TARGET_ERROR);
	}
	const systemIdentifier = query[0].slice('system|'.length);
	const migrationVersions = query[1].slice('migrations|'.length).split(',').filter(Boolean);

	const containerName = databaseContainer.Name.replace(/^\//, '');
	const labels = databaseContainer.Config.Labels;
	const databaseMounts = databaseContainer.Mounts.filter(
		(mount) => mount.Type === 'volume' && mount.Destination === '/var/lib/postgresql/data'
	);
	if (databaseMounts.length !== 1) throw new Error(SAFE_TARGET_ERROR);
	const volumeName = databaseMounts[0]?.Name ?? '';
	const volumeFormat = '{{.Name}}\n{{.CreatedAt}}';
	const volumeLines = runCaptured(
		['docker', 'volume', 'inspect', '--format', volumeFormat, volumeName],
		SAFE_TARGET_ERROR
	).split('\n');
	if (volumeLines.length !== 2) throw new Error(SAFE_TARGET_ERROR);

	const networkId = Object.values(databaseContainer.NetworkSettings.Networks)
		.map((network) => network.NetworkID)
		.find((id) => id === target.networkId);
	const networkFormat = '{{.Id}}\n{{.Name}}\n{{index .Labels "com.goat.task12.r6.project-id"}}\n{{index .Labels "com.goat.task12.r6.managed-by"}}\n{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}';
	const networkLines = runCaptured(
		['docker', 'network', 'inspect', '--format', networkFormat, target.networkName],
		SAFE_TARGET_ERROR
	).split('\n');
	if (!networkId || networkLines.length !== 5) throw new Error(SAFE_TARGET_ERROR);

	const projectContainerIds = runCaptured(
		['docker', 'ps', '-aq', '--filter', `label=com.supabase.cli.project=${target.projectId}`],
		SAFE_TARGET_ERROR
	).split(/\r?\n/).filter(Boolean);
	if (projectContainerIds.length === 0) throw new Error(SAFE_TARGET_ERROR);
	const allowedPorts = new Set(Object.values(target.ports).map(String));
	const observedHostPorts = new Set<string>();
	for (const id of projectContainerIds) {
		const container = id === target.databaseContainer.id ? databaseContainer : inspectContainer(id);
		const containerLabels = container.Config.Labels;
		if (
			containerLabels['com.supabase.cli.project'] !== target.projectId ||
			containerLabels['com.supabase.cli.workdir'] !== target.workdir ||
			containerLabels['com.docker.compose.project'] !== target.projectId
		) throw new Error(SAFE_TARGET_ERROR);
		for (const mappings of Object.values(container.NetworkSettings.Ports)) {
			for (const mapping of mappings ?? []) {
				if (
					mapping.HostIp !== '127.0.0.1' ||
					!allowedPorts.has(mapping.HostPort) ||
					observedHostPorts.has(mapping.HostPort)
				) throw new Error('Task 12 runtime preflight failed: a service port is duplicated or not restricted to IPv4 loopback.');
				observedHostPorts.add(mapping.HostPort);
			}
		}
	}
	if (!observedHostPorts.has(String(target.ports.api)) || !observedHostPorts.has(String(target.ports.db))) {
		throw new Error(SAFE_TARGET_ERROR);
	}

	return {
		dbUrl: status.DB_URL,
		apiUrl: status.API_URL,
		systemIdentifier,
		migrationVersions,
		databaseContainer: {
			id: databaseContainer.Id,
			name: containerName,
			createdAt: databaseContainer.Created,
			projectLabel: labels['com.supabase.cli.project'] ?? '',
			supabaseProject: labels['com.supabase.cli.project'] ?? '',
			workdir: labels['com.supabase.cli.workdir'] ?? '',
			portMappings: Object.entries(databaseContainer.NetworkSettings.Ports).flatMap(([containerPort, mappings]) =>
				(mappings ?? []).map((mapping) => ({
					containerPort: Number(containerPort.replace(/\/tcp$/, '')),
					hostIp: mapping.HostIp,
					hostPort: Number(mapping.HostPort)
				}))
			),
			volumeName,
			networkId
		},
		databaseVolume: { name: volumeLines[0] ?? '', createdAt: volumeLines[1] ?? '' },
		network: {
			id: networkLines[0] ?? '',
			name: networkLines[1] ?? '',
			projectLabel: networkLines[2] ?? '',
			managedBy: networkLines[3] ?? '',
			hostBindingIpv4: networkLines[4] ?? ''
		}
	};
}

export async function assertTask12Path(path: string, expectedType: 'directory' | 'file'): Promise<void> {
	const stat = await lstat(path);
	if (stat.isSymbolicLink() || (expectedType === 'directory' ? !stat.isDirectory() : !stat.isFile())) {
		throw new Error(SAFE_TARGET_ERROR);
	}
	if ((await realpath(path)) !== path) throw new Error(SAFE_TARGET_ERROR);
}

export async function task12Local() {
	const targetPath = Bun.env.GOAT_TASK12_LOCAL_TARGET;
	if (!targetPath) throw new Error('GOAT_TASK12_LOCAL_TARGET is required');
	const targetPathMatch = targetPath.match(/^\/tmp\/(goat-task12-r6-\d{8}-[a-f0-9]{32})\/task12-target\.json$/);
	if (!targetPathMatch) throw new Error(SAFE_TARGET_ERROR);
	let target: Task12Target;
	try {
		await assertTask12Path('/tmp', 'directory');
		await assertTask12Path(`/tmp/${targetPathMatch[1]}`, 'directory');
		await assertTask12Path(targetPath, 'file');
		const raw = await Bun.file(targetPath).json();
		target = parseTask12Target(raw, targetPath);
		assertTask12Testable(target);
		await assertTask12Path(join(target.workdir, 'supabase'), 'directory');
		await assertTask12Path(join(target.workdir, 'supabase', 'migrations'), 'directory');
		await assertTask12Path(join(target.workdir, 'supabase', 'config.toml'), 'file');
		const config = await readFile(join(target.workdir, 'supabase', 'config.toml'), 'utf8');
		assertConfigMatches(config, target);
		const marker = (await readFile(join(target.workdir, 'cluster-id'), 'utf8')).trim();
		if (marker !== target.systemIdentifier) throw new Error(SAFE_TARGET_ERROR);
		const localVersions = await currentMigrationVersions(target.workdir);
		if (!sameValues(localVersions, target.migrationVersions)) throw new Error(SAFE_TARGET_ERROR);
		await assertTask12MigrationsMatch(target.workdir);
	} catch (error) {
		if (error instanceof Error && error.message === 'GOAT_TASK12_LOCAL_TARGET is required') throw error;
		throw new Error(SAFE_TARGET_ERROR);
	}

	const output = runCaptured(
		['supabase', 'status', '--workdir', target.workdir, '--output', 'json'],
		'Task 12 disposable Supabase is unavailable.'
	);
	const status = safeJson<Record<string, unknown>>(output);
	const runtime = await readRuntime(target, status);
	assertTask12RuntimeMatches(target, runtime);
	return status as {
		DB_URL: string;
		API_URL: string;
		ANON_KEY: string;
		PUBLISHABLE_KEY: string;
		SERVICE_ROLE_KEY: string;
		SECRET_KEY: string;
	};
}
