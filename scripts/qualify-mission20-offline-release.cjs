/* eslint-disable @typescript-eslint/no-require-imports -- Fresh loopback-only PG17.6; no external database arguments. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {main}=require('./qualify-mission20-c1-postgres.cjs');
const {seedAtomicFixture}=require('./qualify-mission20-atomic-candidate.cjs');
const {loaderPackage}=require('./mission20-loader-package.cjs');
const {dependencies}=require('./mission20-atomic-candidate.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function qualifyOffline(c){
 if(c.variant!=='per-team')return;
 const {ROOT,SQL,ownedRoot,run,uid,passed}=c;
 const {fixture,connection,admin,baselineAssertions}=await seedAtomicFixture(c,'mission20_fixture_loader');
 assert.equal(await admin.query("SELECT current_setting('server_version_num');"),'170006');
 const exe=path.join(ROOT,'scratch/supabase-cli',process.platform==='win32'?'supabase.exe':'supabase');
 const work=path.join(ownedRoot,'loader-work'),migrations=path.join(work,'supabase/migrations');
 fs.mkdirSync(migrations,{recursive:true});fs.mkdirSync(path.join(work,'supabase/.temp'),{recursive:true});
 fs.writeFileSync(path.join(work,'supabase/.temp/cli-latest'),'v2.75.0');
 fs.writeFileSync(path.join(work,'supabase/config.toml'),`project_id = "mission20-disposable-only"\n[db]\nmajor_version = 17\nport = ${c.pgPort}\n`);
 const env={};for(const k of ['PATH','SystemRoot','WINDIR','COMSPEC','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{HOME:work,USERPROFILE:work,APPDATA:work,LOCALAPPDATA:work,
  HTTP_PROXY:'http://127.0.0.1:1',HTTPS_PROXY:'http://127.0.0.1:1',NO_PROXY:'127.0.0.1',
  PGPASSFILE:path.join(work,'empty-pgpass'),PGSERVICEFILE:path.join(work,'empty-pgservice')});
 fs.writeFileSync(env.PGPASSFILE,'');fs.writeFileSync(env.PGSERVICEFILE,'');
 let checks=0;const pass=s=>{checks++;passed('offline release: '+s);};
 const {files,manifest}=loaderPackage();
 const url=`postgresql://postgres@127.0.0.1:${c.pgPort}/mission20_fixture_loader?sslmode=disable`;
 const args=['migration','up','--db-url',url,'--workdir',work,'--yes'];
 const cli=()=>{
  const r=spawnSync(exe,args,{cwd:work,env,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2e6});
  assert(!r.error,r.error?.message);return {status:r.status,output:r.stdout+r.stderr};
 };
 const executeSql=sql=>{const f=path.join(ownedRoot,'loader-admin.sql');fs.writeFileSync(f,sql);return run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',f]);};
 const ledger=()=>admin.query("SELECT count(*)||':'||max(version) FROM supabase_migrations.schema_migrations;");
 const registrationSnapshot=()=>admin.query("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM public.hackathon_registrations r;");
 const graphSql=`SELECT jsonb_build_object('teams',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.teams t),
  'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.team_members m),
  'conversations',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM public.conversations v),
  'participants',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.conversation_id,p.user_id) FROM public.conversation_participants p));`;
 const frozen=async()=>assert.equal(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_release_freeze') AND NOT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT');"),'t');
 const absent=async()=>assert.equal(await admin.query("SELECT to_regnamespace('mission20_private') IS NULL AND to_regprocedure('public.register_native_hackathon(uuid,uuid,boolean)') IS NULL;"),'t');
 const writers=()=>admin.query(`SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'definition',pg_get_functiondef(p.oid),'owner',p.proowner::regrole::text,'acl',p.proacl,'config',p.proconfig) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p WHERE p.oid IN(${dependencies.map(d=>`'${d.signature}'::regprocedure`).join(',')});`);
 const stageFile=f=>path.join(migrations,`${f.version}_${f.stage}.sql`);
 const put=(stage,sql)=>{const f=files.find(f=>f.stage===stage);fs.writeFileSync(stageFile(f),sql??f.sql);return f;};
 const requireSuccess=()=>{const r=cli();assert.equal(r.status,0,r.output);return r.output;};
 const requireFailure=re=>{const r=cli();assert.notEqual(r.status,0);assert.match(r.output,re);};
 // Match ONLY this synthetic database's dummy history. Never create/repair
 // receipts for a real project or copy these marker files into the checkout.
 const versions=(await admin.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;')).split('\n');
 assert.equal(versions.length,147);
 for(const v of versions)fs.writeFileSync(path.join(migrations,v+'_synthetic_baseline.sql'),'-- Already present synthetic marker; must never execute.\nSELECT 1/0;\n');
 // Every historical registration, including team-linked confirmed and
 // waitlisted records, must survive freeze/failure/install/recovery bytewise.
 await admin.query(`INSERT INTO public.hackathons(id,name,type,status,archived,organizer_id,min_team_size,max_team_size,max_participants,registration_start,registration_end,end_date)
  VALUES('${uid(15100)}','Synthetic recovery native','native','approved',false,'${uid(9501)}',1,20,5,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',current_date+2);
  INSERT INTO public.teams(id,name,owner_id,max_members) VALUES('${uid(15101)}','Synthetic retained team','${uid(9501)}',20);
  INSERT INTO public.team_members(team_id,user_id,role) VALUES('${uid(15101)}','${uid(9501)}','owner');
  INSERT INTO public.hackathon_registrations(hackathon_id,user_id,team_id,status,metadata) VALUES
   ('${uid(15100)}','${uid(9501)}','${uid(15101)}','confirmed','{"synthetic":"retained"}'),
   ('${uid(15100)}','${uid(9502)}',NULL,'waitlisted','{"synthetic":"waiting"}');`);
 const registrations=await registrationSnapshot(),graph=await admin.query(graphSql),originalWriters=await writers();
 const dump=path.join(ownedRoot,'synthetic-pre-freeze.dump'),dumpStart=Date.now();
 run('pg_dump',[...connection,'-w','--format=custom','--file',dump]);
 const dumpMs=Date.now()-dumpStart,dumpSha256=createHash('sha256').update(fs.readFileSync(dump)).digest('hex');
 pass('native pg_dump custom backup captured synthetic pre-freeze schema/data/ACLs and existing confirmed/waitlisted registrations');
 // Actual pinned CLI, not a modeled manual ledger INSERT.
 const help=spawnSync(exe,['migration','up','--help'],{cwd:work,env,encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(help.status,0);assert.match(help.stdout,/--db-url/);
 const version=spawnSync(exe,['--version'],{cwd:work,env,encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(version.status,0);assert.equal(version.stdout.trim(),'2.75.0');
 put('freeze');requireSuccess();assert.equal(await ledger(),'148:'+files[0].version);await frozen();
 assert.equal(await admin.query(`SELECT name='freeze' AND cardinality(statements)>0 FROM supabase_migrations.schema_migrations WHERE version='${files[0].version}';`),'t');
 assert.equal(await registrationSnapshot(),registrations);
 pass('actual CLI separately commits freeze plus name/statements ledger receipt; all historical marker files skipped and registrations intact');
 // Reproduce unsafe proposal packaging: explicit COMMIT precedes the CLI's
 // ledger INSERT. A ledger-only failure then cannot roll back the DDL.
 const raw=fs.readFileSync(path.join(ROOT,'docs/qa/mission20-c2/release/atomic/01-final-expansion.review.sql'),'utf8');
 await admin.query(`CREATE FUNCTION public.fixture_reject_loader_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.version='${files[1].version}' THEN RAISE EXCEPTION 'synthetic_ledger_failure'; END IF;RETURN NEW;END;$$;
  CREATE TRIGGER fixture_reject_loader_receipt BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_loader_receipt();`);
 put('expansion',raw);requireFailure(/synthetic_ledger_failure/);
 assert.equal(await admin.query("SELECT to_regnamespace('mission20_private') IS NOT NULL;"),'t');
 assert.equal(await ledger(),'148:'+files[0].version);
 pass('UNSAFE raw candidate COMMIT reproduced committed expansion without receipt when CLI ledger INSERT fails; raw psql packaging is forbidden for this loader');
 // Recover the owned fixture by restoring the pre-freeze backup into a NEW
 // database, not by hand-repairing ledger or dropping a production schema.
 const restore=async name=>{
  const target=c.allocateFixtureDatabase(name),start=Date.now();
  run('pg_restore',[...target.connection,'-w','--exit-on-error','--single-transaction',dump]);
  const a=target.session(name+'_admin');
  assert.equal(await a.query("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM public.hackathon_registrations r;"),registrations);
  assert.equal(await a.query("SELECT count(*)||':'||max(version) FROM supabase_migrations.schema_migrations;"),'147:20261025081515');
  assert.equal(await a.query("SELECT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT') AND to_regnamespace('mission20_private') IS NULL;"),'t');
  assert.equal(await a.query(graphSql),graph);
  await a.close();return {target,ms:Date.now()-start};
 };
 const restored=await restore('mission20_fixture_restore');
 pass('pg_restore into new disposable database restores pre-freeze objects/ACLs, ledger and exact registration rows after interrupted/partial installation diagnostic');
 // Recreate loader test DB from the backup using only owned connections.
 await admin.close();run('psql',[...c.connection,'-X','-w','-v','ON_ERROR_STOP=1','-c',"DROP DATABASE mission20_fixture_loader;"]);
 run('createdb',['-h','127.0.0.1','-p',String(c.pgPort),'-U','postgres','mission20_fixture_loader']);
 run('pg_restore',[...connection,'-w','--exit-on-error','--single-transaction',dump]);
 const live=fixture.session('loader_recovered');
 // Stable proxy lets the existing helpers address only the restored owned DB.
 admin.query=live.query.bind(live);admin.close=live.close.bind(live);
 fs.unlinkSync(stageFile(files[1]));requireSuccess();await frozen();
 await admin.query(`CREATE FUNCTION public.fixture_reject_loader_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.version='${files[1].version}' THEN RAISE EXCEPTION 'synthetic_ledger_failure'; END IF;RETURN NEW;END;$$;
  CREATE TRIGGER fixture_reject_loader_receipt BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_loader_receipt();`);
 put('expansion');requireFailure(/synthetic_ledger_failure/);await absent();await frozen();assert.equal(await ledger(),'148:'+files[0].version);
 assert.equal(await registrationSnapshot(),registrations);assert.equal(await writers(),originalWriters);
 pass('loader-owned transaction rolls back final DDL AND failed ledger receipt; separately committed freeze survives');
 await admin.query('DROP TRIGGER fixture_reject_loader_receipt ON supabase_migrations.schema_migrations; DROP FUNCTION public.fixture_reject_loader_receipt();');
 put('expansion',files[1].sql+"\nSELECT 1/0;\n");requireFailure(/division by zero/);await absent();await frozen();
 assert.equal(await writers(),originalWriters);assert.equal(await ledger(),'148:'+files[0].version);
 pass('SQL failure after final expansion DDL rolls back objects and receipt without losing freeze or registrations');
 // Real backend termination before the loader appends its receipt.
 put('expansion',files[1].sql+'\nSELECT pg_sleep(20);\n');
 const child=spawn(exe,args,{cwd:work,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
 const done=new Promise(r=>child.once('exit',r));let pid;
 try{
  for(let i=0;i<100;i++){
   pid=await admin.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event='PgSleep' AND query LIKE '%pg_sleep(20)%';");
   if(pid)break;await pause(50);
  }
  assert.match(pid,/^\d+$/,'loader reached controlled precommit interruption');
  await absent();assert.equal(await ledger(),'148:'+files[0].version);
  assert.equal(await admin.query(`SELECT pg_terminate_backend(${pid});`),'t');
  const status=await Promise.race([done,pause(5000).then(()=>{throw Error('loader interruption did not terminate');})]);
  assert.notEqual(status,0,output);await absent();await frozen();assert.equal(await ledger(),'148:'+files[0].version);
  assert.equal(await registrationSnapshot(),registrations);
  assert.equal(await writers(),originalWriters);
 }finally{if(child.exitCode===null)child.kill();await done;}
 pass('backend interruption before receipt rolls back expansion with no partial namespace; committed freeze and all registration bytes survive');
 put('expansion');requireSuccess();assert.equal(await ledger(),'149:'+files[1].version);await frozen();
 assert.equal(await admin.query(`SELECT name='expansion' AND cardinality(statements)>0 FROM supabase_migrations.schema_migrations WHERE version='${files[1].version}';`),'t');
 assert.equal(await registrationSnapshot(),registrations);assert.match(requireSuccess(),/up to date|No pending/i);
 pass('retry only after read-only reconciliation commits final protocol plus receipt atomically; rerun skips applied stage even after lost response');
 put('contract');requireSuccess();assert.equal(await ledger(),'150:'+files[2].version);
 assert.equal(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_release_freeze') AND has_column_privilege('authenticated','public.hackathon_registrations','hackathon_id','INSERT');"),'t');
 put('unfreeze');requireSuccess();assert.equal(await ledger(),'151:'+files[3].version);
 assert.equal(await admin.query("SELECT NOT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_release_freeze') AND NOT has_table_privilege('authenticated','public.hackathon_registrations','INSERT');"),'t');
 assert.equal(await registrationSnapshot(),registrations);
 pass('separate contract/unfreeze invocations record independent receipts; community column ACLs restored only by contract and historical registrations intact');
 executeSql(fs.readFileSync(path.join(SQL,'03-rollback-freeze.proposed.sql'),'utf8'));
 assert.equal(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_admission_frozen') AND NOT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT');"),'t');
 assert.equal(await registrationSnapshot(),registrations);
 const frozenDump=path.join(ownedRoot,'synthetic-final-frozen.dump');run('pg_dump',[...connection,'-w','--format=custom','--file',frozenDump]);
 const final=c.allocateFixtureDatabase('mission20_fixture_finalrestore');run('pg_restore',[...final.connection,'-w','--exit-on-error','--single-transaction',frozenDump]);
 const finalAdmin=final.session('final_restored');
 assert.equal(await finalAdmin.query("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_admission_frozen') AND NOT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT') AND to_regprocedure('public.mission20_cancel_registration(uuid,uuid)') IS NOT NULL;"),'t');
 assert.equal(await finalAdmin.query("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM public.hackathon_registrations r;"),registrations);
 assert.equal(await finalAdmin.query(graphSql),graph);
 run('psql',[...final.connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(ROOT,'docs/qa/mission20-c2/release/CATALOG-CLOSURE.select-only.sql')]);
 await finalAdmin.close();await admin.close();
 pass('post-install logical backup/restore retains final protocol, emergency freeze, revoked admission ACLs and exact registration data');
 pass('complete catalog-closure SELECT packet executes on restored PG17.6 fixture; all team/member/conversation/participant snapshot bytes survive both restores');
 console.log(JSON.stringify({offlineRelease:true,postgres:'17.6',supabaseCli:manifest.cli,checks,baselineAssertions,
  dumpSha256,dumpMs,restoreMs:restored.ms,syntheticOnly:true,privateInput:false,hostedBackup:false,pitr:false,
  fsync:await c.admin.query('SHOW fsync;'),physicalCrashDurability:false,
  applicationDeployments:0,productionConnections:0,releaseApproved:false}));
}
module.exports={qualifyOffline};
if(require.main===module){
 assert.deepEqual(process.argv.slice(2),[],'No target or SQL arguments accepted');
 main({setup:async()=>{},qualify:qualifyOffline},['--local-pg17-only']).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
