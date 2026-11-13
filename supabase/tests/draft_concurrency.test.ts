import { describe, expect, test } from 'bun:test';
import { task12Local } from './task12-local';
const enabled=Bun.env.GOAT_TASK12_LOCAL_TESTS==='1';
describe.skipIf(!enabled)('draft save concurrency in disposable Supabase',()=>{
 test('one of two writes at the same revision succeeds and the other conflicts',async()=>{
  const url=(await task12Local()).DB_URL;
  const actor=crypto.randomUUID(),model=crypto.randomUUID(),rule=crypto.randomUUID();
  const version=`900000.0.0+${crypto.randomUUID().replaceAll('-','')}`;
  const run=async(statement:string)=>{const p=Bun.spawn(['psql',url,'-X','-At','-q','-v','ON_ERROR_STOP=1','-c',statement],{stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);return {out,err,code};};
  const setup=await run(`BEGIN; INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES ('${actor}','authenticated','authenticated','${actor}@example.invalid','{}','{}',now(),now()); INSERT INTO estimator.staff_users(user_id,role,state) VALUES ('${actor}','admin','ACTIVE'); INSERT INTO estimator.pricing_models(id,version,name,engine_contract_version,confidence_high_max_points,confidence_good_max_points,created_by) VALUES ('${model}','${version}','Draft race fixture','1.0.0',0,1,'${actor}'); INSERT INTO estimator.pricing_rules(id,pricing_model_id,code,label,scope,category,rule_type,explanation,parameters,sort_order) VALUES ('${rule}','${model}','race_rule','Before','business','catchup','FIXED_RANGE','Synthetic','{"range":{"minCents":1,"maxCents":2}}',1); COMMIT;`);
  if(setup.code) throw new Error('Fixture setup failed: '+setup.err);
  try {
   const read=await run(`SELECT draft_revision FROM estimator.pricing_models WHERE id='${model}';`); if(read.code || !/^\d+$/.test(read.out.trim())) throw new Error('Could not read revision.'); const revision=Number(read.out.trim());
   const statement=(label:string)=>`BEGIN; SELECT estimator.save_pricing_draft('${model}','${actor}',${revision},0,1,'[{"id":"${rule}","label":"${label}","enabled":true,"conditions":{},"parameters":{"range":{"minCents":1,"maxCents":2}}}]'::jsonb); SELECT pg_sleep(0.5); COMMIT;`;
   const results=await Promise.all([run(statement('First')),run(statement('Second'))]);
   expect(results.filter(r=>r.code===0)).toHaveLength(1); expect(results.filter(r=>r.code!==0)).toHaveLength(1);
   expect(results.find(r=>r.code!==0)?.err).toContain('pricing draft changed');
   const check=await run(`SELECT label, (SELECT draft_revision FROM estimator.pricing_models WHERE id='${model}') FROM estimator.pricing_rules WHERE id='${rule}';`);
   expect(check.code).toBe(0); expect(['First','Second']).toContain(check.out.trim().split('|')[0]); expect(Number(check.out.trim().split('|')[1])).toBeGreaterThan(revision);
  } finally {
   await task12Local();
   const cleanup=await run(`BEGIN; SET LOCAL session_replication_role=replica; DELETE FROM estimator.pricing_rules WHERE pricing_model_id='${model}'; DELETE FROM estimator.pricing_models WHERE id='${model}'; DELETE FROM estimator.staff_users WHERE user_id='${actor}'; DELETE FROM auth.users WHERE id='${actor}'; COMMIT;`);
   if(cleanup.code) throw new Error('Fixture cleanup failed: '+cleanup.err);
  }
 });
});
