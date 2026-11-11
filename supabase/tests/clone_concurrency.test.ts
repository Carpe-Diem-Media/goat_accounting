import { describe, expect, test } from 'bun:test';
import { task12Local } from './task12-local';

// This integration test is opt-in and accepts only the disposable Task 12 database.
const enabled = Bun.env.GOAT_TASK12_LOCAL_TESTS === '1';
describe.skipIf(!enabled)('clone concurrency in disposable Supabase', () => {
 test('simultaneous identical versions produce one complete draft', async () => {
  const url = (await task12Local()).DB_URL;
  const actor = crypto.randomUUID(), model = crypto.randomUUID(), rule = crypto.randomUUID();
  const version = `800001.0.0+${crypto.randomUUID().replaceAll('-', '')}`;
  const sourceVersion = `800000.0.0+${crypto.randomUUID().replaceAll('-', '')}`;
  const sql = (statement: string) => Bun.spawn(['psql',url,'-X','-q','-v','ON_ERROR_STOP=1','-c',statement],{stdout:'pipe',stderr:'pipe'});
  const run = async (statement: string) => { const p=sql(statement); const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]); return {out,err,code}; };
  const setup = await run(`BEGIN;
    INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES ('${actor}','authenticated','authenticated','${actor}@example.invalid','{}','{}',now(),now());
    INSERT INTO estimator.staff_users(user_id,role,state) VALUES ('${actor}','admin','ACTIVE');
    INSERT INTO estimator.pricing_models(id,version,name,engine_contract_version,confidence_high_max_points,confidence_good_max_points,created_by) VALUES ('${model}','${sourceVersion}','Race fixture','1.0.0',0,1,'${actor}');
    INSERT INTO estimator.pricing_rules(id,pricing_model_id,code,label,scope,category,rule_type,explanation,parameters,sort_order) VALUES ('${rule}','${model}','race_rule','Race','business','catchup','FIXED_RANGE','Synthetic','{"range":{"minCents":1,"maxCents":2}}',1);
    SELECT estimator.activate_pricing_model('${model}','${actor}',estimator.pricing_model_activation_projection('${model}')); COMMIT;`);
  if(setup.code) throw new Error('Disposable race fixture setup failed: '+setup.err);
  try {
   const statement=`BEGIN; SELECT estimator.clone_pricing_model('${model}','${version}','${actor}'); SELECT pg_sleep(0.5); COMMIT;`;
   const results=await Promise.all([run(statement),run(statement)]);
   expect(results.filter((r)=>r.code===0)).toHaveLength(1);
   expect(results.filter((r)=>r.code!==0)).toHaveLength(1);
   expect(results.find((r)=>r.code!==0)?.err).toContain('duplicate key');
   const check=await run(`SELECT count(*) = 1 AND bool_and(state = 'DRAFT') AND (SELECT count(*) FROM estimator.pricing_rules r JOIN estimator.pricing_models m ON m.id = r.pricing_model_id WHERE m.version = '${version}') = 1 FROM estimator.pricing_models WHERE version = '${version}';`);
   expect(check.code).toBe(0); expect(check.out).toContain('t');
  } finally {
   await task12Local();
   const cleanup=await run(`BEGIN; SET LOCAL session_replication_role = replica; DELETE FROM estimator.pricing_rules WHERE pricing_model_id IN (SELECT id FROM estimator.pricing_models WHERE version IN ('${version}','${sourceVersion}')); DELETE FROM estimator.pricing_models WHERE version IN ('${version}','${sourceVersion}'); DELETE FROM estimator.staff_users WHERE user_id = '${actor}'; DELETE FROM auth.users WHERE id = '${actor}'; COMMIT;`);
   if(cleanup.code) throw new Error('Disposable race fixture cleanup failed: '+cleanup.err);
  }
 });
});
