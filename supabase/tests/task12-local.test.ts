import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import {
	assertTask12RuntimeMatches,
	assertTask12Testable,
	assertTask12MigrationsMatch,
	parseTask12Target,
	task12Local
} from './task12-local';
import {
	assertOwnedResourceSnapshot,
	classifyTask12Failure,
	completeCleanup,
	createExclusiveProjectDirectory,
	formatTask12FailureEvidence
} from './task12-disposable';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const migrationVersions = [
	'20261103183011',
	'20261105062524',
	'20261105090000',
	'20261105170000',
	'20261105180000',
	'20261110150000',
	'20261110165306',
	'20261111045053'
];

function targetFixture() {
	const projectId = `goat-task12-r6-20261111-${'a'.repeat(32)}`;
	const workdir = `/tmp/${projectId}`;
	return {
		schemaVersion: 1,
		state: 'TESTING',
		projectId,
		workdir,
		sourceCommit: 'b'.repeat(40),
		networkName: `task12-r6-20261111-${'a'.repeat(32)}`,
		networkId: 'a'.repeat(64),
		ports: {
			api: 58441,
			db: 58442,
			shadow: 58440,
			studio: 58443,
			smtp: 58444,
			pooler: 58445,
			analytics: 58446,
			inspector: 58447
		},
		systemIdentifier: '123456789',
		databaseContainer: {
			id: 'c'.repeat(64),
			name: `supabase_db_${projectId}`,
			createdAt: '2026-11-11T10:00:00.000Z',
			volumeName: `supabase_db_${projectId}`,
			volumeCreatedAt: '2026-11-11T10:00:00.000Z'
		},
		migrationVersions
	};
}

function runtimeFixture(target: ReturnType<typeof targetFixture>) {
	return {
		dbUrl: `postgresql://postgres:local-only@127.0.0.1:${target.ports.db}/postgres`,
		apiUrl: `http://127.0.0.1:${target.ports.api}`,
		systemIdentifier: target.systemIdentifier,
		migrationVersions,
		databaseContainer: {
			id: target.databaseContainer.id,
			name: target.databaseContainer.name,
			createdAt: target.databaseContainer.createdAt,
			projectLabel: target.projectId,
			supabaseProject: target.projectId,
			workdir: target.workdir,
			portMappings: [{ containerPort: 5432, hostIp: '127.0.0.1', hostPort: target.ports.db }],
			volumeName: target.databaseContainer.volumeName,
			networkId: target.networkId
		},
		databaseVolume: {
			name: target.databaseContainer.volumeName,
			createdAt: target.databaseContainer.volumeCreatedAt
		},
		network: {
			id: target.networkId,
			name: target.networkName,
			projectLabel: target.projectId,
			managedBy: 'task12-disposable',
			hostBindingIpv4: '127.0.0.1'
		}
	};
}

test('requires an explicitly created Task 12 R6 target instead of using the retired fixed path', async () => {
	const previousTarget = Bun.env.GOAT_TASK12_LOCAL_TARGET;
	delete Bun.env.GOAT_TASK12_LOCAL_TARGET;

	try {
		await expect(task12Local()).rejects.toThrow('GOAT_TASK12_LOCAL_TARGET is required');
	} finally {
		if (previousTarget === undefined) delete Bun.env.GOAT_TASK12_LOCAL_TARGET;
		else Bun.env.GOAT_TASK12_LOCAL_TARGET = previousTarget;
	}
});

test('accepts only a TESTING manifest rooted at its unique R6 project directory', () => {
	const target = targetFixture();
	const manifest = parseTask12Target(target, `${target.workdir}/task12-target.json`);

	expect(manifest.projectId).toBe(target.projectId);
	expect(() => parseTask12Target(target, '/tmp/another-target.json')).toThrow();
	expect(() => parseTask12Target({ ...target, projectId: 'goat-task12-disposable-20261110' }, `${target.workdir}/task12-target.json`)).toThrow();
	expect(() => parseTask12Target({ ...target, state: 'CREATED' }, `${target.workdir}/task12-target.json`)).toThrow();
});

test('rejects duplicate ports, malformed identity fields and incomplete migration history', () => {
	const target = targetFixture();
	expect(() => parseTask12Target({ ...target, ports: { ...target.ports, shadow: target.ports.db } }, `${target.workdir}/task12-target.json`)).toThrow();
	expect(() => parseTask12Target({ ...target, systemIdentifier: 'current-system' }, `${target.workdir}/task12-target.json`)).toThrow();
	expect(() => parseTask12Target({ ...target, sourceCommit: 'bad' }, `${target.workdir}/task12-target.json`)).toThrow();
	expect(() => parseTask12Target({ ...target, migrationVersions: migrationVersions.slice(1) }, `${target.workdir}/task12-target.json`)).toThrow();
});

test('requires the disposable migration copies to match repository SQL byte for byte', async () => {
	const repositoryRoot = process.cwd();
	await expect(assertTask12MigrationsMatch(repositoryRoot)).resolves.toBeUndefined();
	const scratch = await mkdtemp(join(tmpdir(), 'goat-task12-migration-check-'));
	const migrations = join(repositoryRoot, 'supabase', 'migrations');
	const copiedMigrations = join(scratch, 'supabase', 'migrations');
	try {
		await cp(migrations, copiedMigrations, { recursive: true });
		const files = (await readdir(copiedMigrations)).filter((file) => file.endsWith('.sql')).sort();
		const path = join(copiedMigrations, files[0] ?? '');
		await writeFile(path, `${await readFile(path, 'utf8')}\n-- altered copy`);
		await expect(assertTask12MigrationsMatch(scratch)).rejects.toThrow('migration files do not match');
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
});

test('accepts the assigned randomized loopback endpoints and rejects stale identity, endpoint, migration or binding', () => {
	const fixture = targetFixture();
	const target = parseTask12Target(fixture, `${fixture.workdir}/task12-target.json`);
	const runtime = runtimeFixture(target);

	expect(runtime.apiUrl).toBe('http://127.0.0.1:58441');
	expect(() => assertTask12Testable(target)).not.toThrow();
	expect(() => assertTask12RuntimeMatches(target, runtime)).not.toThrow();
	expect(() => assertTask12RuntimeMatches(target, { ...runtime, systemIdentifier: '987654321' })).toThrow();
	expect(() => assertTask12RuntimeMatches(target, { ...runtime, dbUrl: runtime.dbUrl.replace('127.0.0.1', 'localhost') })).toThrow();
	expect(() => assertTask12RuntimeMatches(target, { ...runtime, migrationVersions: migrationVersions.slice(1) })).toThrow();
	expect(() => assertTask12RuntimeMatches(target, { ...runtime, databaseContainer: { ...runtime.databaseContainer, portMappings: [{ containerPort: 5432, hostIp: '0.0.0.0', hostPort: target.ports.db }] } })).toThrow();
	expect(() => assertTask12RuntimeMatches(target, { ...runtime, databaseVolume: { ...runtime.databaseVolume, createdAt: '2026-11-11T10:01:00.000Z' } })).toThrow();
	expect(() => assertTask12RuntimeMatches(target, { ...runtime, network: { ...runtime.network, hostBindingIpv4: '0.0.0.0' } })).toThrow();
	expect(() => assertTask12RuntimeMatches(target, { ...runtime, network: { ...runtime.network, managedBy: 'other-tool' } })).toThrow();
});

test('rejects cleanup snapshots containing containers or volumes the current harness did not record', () => {
	const owned = {
		containers: [{ id: 'a'.repeat(64), name: 'supabase_db_goat-task12-r6-20261111-aabbccdd' }],
		volumes: [{ name: 'supabase_db_goat-task12-r6-20261111-aabbccdd', createdAt: '2026-11-11T10:00:00.000Z' }]
	};

	expect(() => assertOwnedResourceSnapshot(owned, owned)).not.toThrow();
	expect(() => assertOwnedResourceSnapshot(owned, {
		...owned,
		containers: [...owned.containers, { id: 'b'.repeat(64), name: 'supabase_db_goat-task12-r6-20261111-aabbccdd' }]
	})).toThrow();
	expect(() => assertOwnedResourceSnapshot(owned, {
		...owned,
		volumes: [{ ...owned.volumes[0]!, createdAt: '2026-11-11T10:01:00.000Z' }]
	})).toThrow();
	expect(() => assertOwnedResourceSnapshot(owned, { containers: owned.containers, volumes: [] })).toThrow();
});

test('does not claim or remove a project directory that already exists', async () => {
	const projectId = `goat-task12-r6-20261112-${randomBytes(16).toString('hex')}`;
	const path = `/tmp/${projectId}`;
	const sentinel = join(path, 'keep.txt');
	await mkdir(path);
	await writeFile(sentinel, 'pre-existing');
	try {
		await expect(createExclusiveProjectDirectory(path)).rejects.toThrow();
		expect(await readFile(sentinel, 'utf8')).toBe('pre-existing');
	} finally {
		await rm(path, { recursive: true, force: true });
	}
});

test('does not remove volumes or the network when the Supabase stop command fails', async () => {
	const calls: string[] = [];
	await expect(completeCleanup('TESTING', {
		stopProject: async () => { calls.push('stop'); return false; },
		markStopped: async () => { calls.push('mark-stopped'); },
		remainingContainers: () => { calls.push('check-containers'); return ''; },
		clearRecordedContainers: async () => { calls.push('clear-containers'); },
		removeVolumes: () => { calls.push('remove-volumes'); return 0; },
		removeNetwork: () => { calls.push('remove-network'); },
		markCleaned: async () => { calls.push('mark-cleaned'); }
	})).rejects.toThrow();
	expect(calls).toEqual(['stop']);
});

test('does not remove the network or mark the project cleaned when volume removal fails', async () => {
	const calls: string[] = [];
	await expect(completeCleanup('TESTING', {
		stopProject: async () => { calls.push('stop'); return true; },
		markStopped: async () => { calls.push('mark-stopped'); },
		remainingContainers: () => { calls.push('check-containers'); return ''; },
		clearRecordedContainers: async () => { calls.push('clear-containers'); },
		removeVolumes: () => { calls.push('remove-volumes'); throw new Error('volume removal failed'); },
		removeNetwork: () => { calls.push('remove-network'); },
		markCleaned: async () => { calls.push('mark-cleaned'); }
	})).rejects.toThrow();
	expect(calls).toEqual(['stop', 'mark-stopped', 'check-containers', 'clear-containers', 'remove-volumes']);
});

test('reports safe startup failure stage, operation, exit code and classification without stderr', () => {
	const stderr = 'failed to bind 127.0.0.1:58441: address already in use; password=do-not-log';
	const evidence = formatTask12FailureEvidence('supabase_start', ['supabase', 'start', '--password', 'do-not-log'], 1, stderr);

	expect(evidence).toEqual({
		event: 'task12_stage_failure',
		stage: 'supabase_start',
		operation: 'supabase start',
		exitCode: 1,
		classification: 'port_binding_conflict'
	});
	expect(JSON.stringify(evidence)).not.toContain('do-not-log');
});

test('classifies CLI compatibility and migration failures without retaining diagnostic text', () => {
	expect(classifyTask12Failure('unknown flag: --network-id', 'supabase start'))
		.toBe('cli_compatibility');
	expect(classifyTask12Failure('ERROR: migration failed: permission denied for schema estimator', 'migration'))
		.toBe('migration_failure');
	expect(classifyTask12Failure('secret=do-not-log', 'docker_identity_inspection'))
		.toBe('resource_identity_check');
	expect(classifyTask12Failure('Error response from daemon: no such object', 'postgres_cluster_identity_capture'))
		.toBe('database_container_missing');
});
