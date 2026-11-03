import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const config = readFileSync('supabase/config.toml', 'utf8');
const projectId = config.match(/^project_id = "([^"]+)"$/m)?.[1];
const localPort = config.match(/^\[db\][\s\S]*?^port = (\d+)$/m)?.[1];

assert.equal(projectId, 'goat-accounting-estimator-local', 'refusing to use an unidentified Supabase project');
assert.ok(localPort, 'local Supabase database port must be configured');

const statusOutput = execFileSync('supabase', ['status', '--output', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore']
});
const jsonStart = statusOutput.indexOf('{');
const jsonEnd = statusOutput.lastIndexOf('}');
assert.ok(jsonStart >= 0 && jsonEnd > jsonStart, 'local Supabase status did not return JSON');

const databaseUrl = JSON.parse(statusOutput.slice(jsonStart, jsonEnd + 1)).DB_URL;
assert.ok(databaseUrl, 'local Supabase status did not return a database URL');
const database = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(database.hostname), 'refusing a non-local database host');
assert.equal(database.port, localPort, 'refusing a database outside this worktree local port');
assert.equal(database.pathname, '/postgres', 'refusing an unexpected database name');

const adminId = randomUUID();
const firstModelId = randomUUID();
const secondModelId = randomUUID();
const firstRuleId = randomUUID();
const secondRuleId = randomUUID();
const versionNonce = randomUUID().replaceAll('-', '');

function runPsql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      [
        databaseUrl,
        '--no-psqlrc',
        '--set',
        'ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--command',
        sql
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`psql exited ${code}: ${stderr.trim()}`));
    });
  });
}

await runPsql(`
  BEGIN;
  INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '${adminId}', 'authenticated', 'authenticated', 'activation-race-${adminId}@example.invalid',
    '{}', '{}', now(), now()
  );
  INSERT INTO estimator.staff_users (user_id, role, state)
  VALUES ('${adminId}', 'admin', 'ACTIVE');
  INSERT INTO estimator.pricing_models (
    id, version, name, engine_contract_version,
    confidence_high_max_points, confidence_good_max_points, created_by
  ) VALUES
    ('${firstModelId}', '99.0.0+${versionNonce}.a', 'Activation race A', '1.0.0', 0, 1, '${adminId}'),
    ('${secondModelId}', '99.0.1+${versionNonce}.b', 'Activation race B', '1.0.0', 0, 1, '${adminId}');
  INSERT INTO estimator.pricing_rules (
    id, pricing_model_id, code, label, scope, category, rule_type,
    explanation, conditions, parameters
  ) VALUES
    ('${firstRuleId}', '${firstModelId}', 'activation_race', 'Activation race A', 'business', 'catchup', 'FIXED_RANGE', 'Race test', '{}', '{"range":{"minCents":1,"maxCents":1}}'),
    ('${secondRuleId}', '${secondModelId}', 'activation_race', 'Activation race B', 'business', 'catchup', 'FIXED_RANGE', 'Race test', '{}', '{"range":{"minCents":1,"maxCents":1}}');
  COMMIT;
`);

await Promise.all([
  runPsql(`SELECT pg_catalog.pg_sleep(0.35); SELECT estimator.activate_pricing_model('${firstModelId}', '${adminId}', estimator.pricing_model_activation_projection('${firstModelId}'));`),
  runPsql(`SELECT pg_catalog.pg_sleep(0.35); SELECT estimator.activate_pricing_model('${secondModelId}', '${adminId}', estimator.pricing_model_activation_projection('${secondModelId}'));`)
]);

const finalState = await runPsql(`
  SELECT count(*) FILTER (WHERE state = 'ACTIVE')::text || ':' ||
    count(*) FILTER (WHERE id IN ('${firstModelId}', '${secondModelId}') AND state = 'ACTIVE')::text
  FROM estimator.pricing_models;
`);
assert.equal(finalState, '1:1', `expected one active model after concurrent activation, received ${finalState}`);

process.stdout.write('Activation race passed: both concurrent activations committed with exactly one active model.\n');
