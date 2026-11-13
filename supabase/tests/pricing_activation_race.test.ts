import { describe, expect, test } from 'bun:test';
import { task12Local } from './task12-local';
const enabled=Bun.env.GOAT_TASK12_LOCAL_TESTS==='1';
describe.skipIf(!enabled)('pricing activation transaction in disposable Supabase',()=>{
 test('competing synthetic activations leave exactly one active model',async()=>{
  const url=(await task12Local()).DB_URL;
  const actor=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID(),nonce=crypto.randomUUID().replaceAll('-','');
  const run=async(statement:string)=>{const p=Bun.spawn(['psql',url,'-X','-At','-q','-v','ON_ERROR_STOP=1','-c',statement],{stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);return {out,err,code};};
  const setup=await run(`BEGIN; INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES ('${actor}','authenticated','authenticated','${actor}@example.invalid','{}','{}',now(),now()); INSERT INTO estimator.staff_users(user_id,role,state) VALUES ('${actor}','admin','ACTIVE'); INSERT INTO estimator.pricing_models(id,version,name,engine_contract_version,confidence_high_max_points,confidence_good_max_points,created_by) VALUES ('${first}','920000.0.0+${nonce}','Synthetic candidate A','1.0.0',0,1,'${actor}'),('${second}','920001.0.0+${nonce}','Synthetic candidate B','1.0.0',0,1,'${actor}'); INSERT INTO estimator.pricing_rules(pricing_model_id,code,label,scope,category,rule_type,explanation,parameters,sort_order) SELECT id,'race_rule','Race','business','catchup','FIXED_RANGE','Synthetic','{"range":{"minCents":1,"maxCents":2}}',1 FROM estimator.pricing_models WHERE id IN ('${first}','${second}'); COMMIT;`);
  if(setup.code) throw new Error('Synthetic setup failed: '+setup.err);
  try {
   const activate=(id:string)=>`BEGIN; SELECT estimator.activate_pricing_model('${id}','${actor}',estimator.pricing_model_activation_projection('${id}')); SELECT pg_sleep(0.5); COMMIT;`;
   const results=await Promise.all([run(activate(first)),run(activate(second))]);expect(results.map(result=>result.code)).toEqual([0,0]);
   const check=await run(`SELECT count(*) FILTER (WHERE state='ACTIVE'), count(*) FILTER (WHERE state='RETIRED') FROM estimator.pricing_models WHERE id IN ('${first}','${second}');`);
   expect(check.code).toBe(0);expect(check.out.trim()).toBe('1|1');
  } finally {
   await task12Local();
   const cleanup=await run(`BEGIN; SET LOCAL session_replication_role=replica; DELETE FROM estimator.pricing_rules WHERE pricing_model_id IN ('${first}','${second}'); DELETE FROM estimator.pricing_models WHERE id IN ('${first}','${second}'); DELETE FROM estimator.staff_users WHERE user_id='${actor}'; DELETE FROM auth.users WHERE id='${actor}'; COMMIT;`);
   if(cleanup.code)throw Error('Synthetic cleanup failed: '+cleanup.err);
  }
 });
});
