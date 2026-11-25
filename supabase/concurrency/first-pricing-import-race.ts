import { GOAT_ACCOUNTING_STARTER_V1_DRAFT as candidate } from '../pricing-candidates/goat-accounting-starter-v1';
import { serializeDraftFingerprintInput, fingerprintDraft } from '../../src/lib/server/pricing/run-pricing-corpus';

const container = process.argv[2] ?? '';
if (!/^supabase_db_goat-t13-[a-f0-9]{12}$/.test(container)) throw new Error('Expected a disposable GOAT test container.');
const actor = '23000000-0000-4000-8000-000000000001';
const definition = serializeDraftFingerprintInput(candidate);
const fingerprint = await fingerprintDraft(candidate);
const authorization = 'GOAT-23#test';

async function sql(statement: string) {
 const ps = Bun.spawn(['docker', 'exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-v', `definition=${definition}`, '-v', `fingerprint=${fingerprint}`],
  { stdin: new Blob([statement]), stdout: 'pipe', stderr: 'pipe' });
 const [out, err, code] = await Promise.all([new Response(ps.stdout).text(), new Response(ps.stderr).text(), ps.exited]);
 return { out: out.trim(), err, code };
}

const setup = await sql(`BEGIN;
INSERT INTO auth.users(id,email) VALUES ('${actor}','pricing-test@example.invalid');
INSERT INTO estimator.staff_users(user_id,role,state) VALUES ('${actor}','admin','ACTIVE');
COMMIT;`);
if (setup.code) throw new Error(setup.err);

const tap = await Bun.file(new URL('./first_pricing_import_test.sql', import.meta.url)).text();
const checks = await sql(`BEGIN;\n${tap}\nROLLBACK;`);
if (checks.code || /^not ok /m.test(checks.out) || (checks.out.match(/^ok /gm) ?? []).length !== 14) {
 throw new Error(checks.err + checks.out);
}
console.log(checks.out);

const importCall = `SELECT estimator.import_first_pricing_draft('${actor}', :'definition', :'fingerprint', '${authorization}');`;
const competing = Promise.all([
 sql(`BEGIN; SET LOCAL ROLE service_role; ${importCall}\nSELECT pg_sleep(4); COMMIT;`),
 sql(`BEGIN; SET LOCAL ROLE service_role; ${importCall}\nSELECT pg_sleep(4); COMMIT;`)
]);
let sawWaiter = false;
for (let i = 0; i < 12 && !sawWaiter; i++) {
 const locks = await sql(`SELECT EXISTS (SELECT FROM pg_locks WHERE locktype = 'advisory' AND classid = 20261124 AND objid = 23 AND NOT granted);`);
 if (locks.code) throw new Error(locks.err);
 sawWaiter = locks.out === 't';
 if (!sawWaiter) await Bun.sleep(100);
}
const outcomes = await competing;
if (!sawWaiter) throw new Error('Did not observe an import waiting on the transaction lock.');
if (outcomes.filter(r => r.code === 0 && r.out === candidate.id).length !== 1 ||
    outcomes.filter(r => r.code !== 0 && r.err.includes('23505') && r.err.includes('First pricing draft already exists')).length !== 1) {
 throw new Error('Expected one success and one duplicate rejection. ' + outcomes.map(r => r.err).join('\n'));
}
const persisted = await sql(`SELECT
 (SELECT count(*) FROM estimator.pricing_models WHERE state='DRAFT'),
 (SELECT count(*) FROM estimator.pricing_rules WHERE pricing_model_id='${candidate.id}'),
 (SELECT count(*) FROM estimator.first_pricing_import_audit WHERE model_id='${candidate.id}' AND actor_id='${actor}' AND fingerprint=:'fingerprint' AND owner_authorization_ref='${authorization}'),
 (SELECT count(*) FROM estimator.pricing_models WHERE state='ACTIVE'),
 (SELECT count(*) FROM estimator.first_pricing_import_audit),
 (SELECT count(*) FROM estimator.pricing_models),
 estimator.pricing_model_activation_projection('${candidate.id}') = (:'definition'::jsonb->'model');`);
if (persisted.code || persisted.out !== `1|${candidate.rules.length}|1|0|1|1|t`) throw new Error('Unexpected race result: ' + persisted.out + persisted.err);
console.log(`Two independent sessions: one import, one duplicate rejection, one DRAFT, ${candidate.rules.length} rules, one audit event and zero ACTIVE models.`);
