/** Fail closed before destructive fixture setup or cleanup in the disposable local database. */
export async function task12Local() {
 const directory='/tmp/goat-task12-disposable-20261110';
 const config=await Bun.file(`${directory}/supabase/config.toml`).text();
 if(!/^project_id = "goat-task12-disposable-20261110"$/m.test(config)) throw new Error('Unexpected disposable project.');
 const marker=(await Bun.file(`${directory}/cluster-id`).text()).trim();
 if(!/^\d+$/.test(marker)) throw new Error('Missing disposable cluster identity.');
 const status=Bun.spawnSync(['supabase','status','--workdir',directory,'--output','json'],{stdout:'pipe',stderr:'ignore'});
 if(status.exitCode) throw new Error('Disposable Supabase is unavailable.');
 const result=JSON.parse(status.stdout.toString()); const database=new URL(result.DB_URL);
 if(database.hostname!=='127.0.0.1'||database.port!=='58322'||database.pathname!=='/postgres') throw new Error('Unexpected disposable database target.');
 const check=Bun.spawnSync(['psql',result.DB_URL,'-X','-At','-v','ON_ERROR_STOP=1','-c',"SELECT system_identifier FROM pg_control_system(); SELECT string_agg(version, ',' ORDER BY version) FROM supabase_migrations.schema_migrations;"],{stdout:'pipe',stderr:'ignore'});
 const [identity,migrations]=check.stdout.toString().trim().split('\n');
 const expected='20261103183011,20261105062524,20261105090000,20261105170000,20261105180000,20261110150000,20261110165306,20261111045053';
 if(check.exitCode || identity!==marker || migrations!==expected) throw new Error('Disposable cluster identity or migration history changed.');
 return result as {DB_URL:string;API_URL:string;ANON_KEY:string;PUBLISHABLE_KEY:string;SERVICE_ROLE_KEY:string;SECRET_KEY:string};
}
