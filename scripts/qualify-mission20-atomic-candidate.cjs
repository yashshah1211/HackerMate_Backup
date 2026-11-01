/* eslint-disable @typescript-eslint/no-require-imports -- Fresh owned cluster only; no existing DB inputs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {main}=require('./qualify-mission20-c1-postgres.cjs');
const {extension:c2}=require('./qualify-mission20-c2-writers.cjs');
const {build,definition,body,dependencies,DIR}=require('./mission20-atomic-candidate.cjs');
// Inline only known repository fixture includes so temporary scripts retain the
// original relative-include meaning. Never accepts a user SQL/connection path.
function expanded(file){return fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').replace(/^\\ir (.+)$/gm,(_,f)=>expanded(path.resolve(path.dirname(file),f.trim())));}
async function qualifyAtomic(c){
 if(c.variant!=='per-team')return;
 const {ROOT,SQL,ownedRoot,run,uid,identity,passed}=c;
 const fixture=c.allocateFixtureDatabase('mission20_fixture_atomic');
 const connection=fixture.connection,admin=fixture.session('atomic_admin');
 let checks=0;const pass=s=>{checks++;passed('atomic candidate: '+s);};
 const execute=file=>run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f',file]);
 const temp=(name,sql)=>{const f=path.join(ownedRoot,name+'.sql');fs.writeFileSync(f,sql);return f;};
 const source=f=>path.join(ROOT,f);
 const frozenInsert=(event,actor)=>`${identity(actor)} DO $atomic_frozen$ BEGIN
  BEGIN INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES('${uid(event)}','${uid(actor)}');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM='new_admission_frozen' THEN RETURN; END IF; RAISE;
  END;
  RAISE EXCEPTION 'expected exact admission freeze rejection';
 END; $atomic_frozen$; RESET ROLE;`;
 const {sql}=build();assert.equal(fs.readFileSync(source(DIR+'/01-final-expansion.review.sql'),'utf8').replace(/\r\n/g,'\n'),sql);
 const rawFixtures=JSON.parse(fs.readFileSync(source(DIR+'/deployed-body-fixtures.review.json'),'utf8')).functions;
 const withBody=(dep,prosrc)=>{
  const original=definition(dep.file,dep.signature.split('(')[0]),start=original.match(/\bAS\s+(\$(?:\w+)?\$)/i).index;
  assert(!prosrc.includes('$atomic_body$'));return original.slice(0,start)+'AS $atomic_body$'+prosrc+'$atomic_body$;';
 };
 const selectedBody=dep=>rawFixtures.find(f=>f.signature===dep.signature)?.prosrc||body(definition(dep.file,dep.signature.split('(')[0]));
 const prefix=fs.readFileSync(path.join(SQL,'04-security-tests.review.sql'),'utf8').split('\\ir 00-preflight.review.sql')[0];
 // Shared roles were created by the baseline fixture in this same owned
 // cluster; this second database gets independent schemas, records and ACLs.
 let seed=prefix.replace(/^\\ir (.+)$/gm,(_,f)=>expanded(path.resolve(SQL,f.trim())))
  .replace(/^CREATE ROLE (?:authenticated|anon|service_role) [^\n]+\n/gm,'')
  .replaceAll('partner_authz_fixture','mission20_fixture_atomic');
 // Establish confirmed types at CREATE TABLE, before dependent policies are
 // installed. Never drop/relax policies to accommodate a fixture ALTER TYPE.
 for(const [before,after] of [
  ['organizer_id uuid REFERENCES public.profiles(id), type text,','organizer_id uuid REFERENCES public.profiles(id), type varchar(50),'],
  ['start_date timestamptz, end_date timestamptz,','start_date date, end_date date,']
 ]){assert.equal(seed.split(before).length,2,'exact original fixture DDL');seed=seed.replace(before,after);}
 const baseline=execute(temp('atomic-baseline',seed));
 // VERBOSITY=verbose adds the informational SQLSTATE before the same PASS
 // label. Retain the original 209 minimum and every original SQL assertion.
 const baselineAssertions=(baseline.match(/NOTICE:\s+(?:00000:\s+)?PASS:/g)||[]).length;
 assert(baselineAssertions>=209,`retain complete existing privacy assertions (observed ${baselineAssertions})`);
 await admin.query(`ALTER TABLE public.profiles ADD COLUMN is_available boolean DEFAULT true,ADD COLUMN hackathon_participations integer DEFAULT 0,
  ADD COLUMN hackathon_wins integer DEFAULT 0,ADD COLUMN has_won_hackathon boolean DEFAULT false,ADD COLUMN year_of_study text;
  ALTER TABLE public.teams ADD COLUMN skills text[],ADD COLUMN college text;
  ALTER TABLE public.team_members ADD COLUMN project_role text;
  CREATE TABLE public.blocked_users(blocker_id uuid,blocked_id uuid);
  CREATE TABLE public.team_join_requests(team_id uuid,user_id uuid,status text);
  CREATE TABLE public.team_invites(team_id uuid,invited_user_id uuid,status text);`);
 execute(source('supabase/migrations/20260925221500_matchmaking_v2_engine.sql'));
 execute(temp('atomic-writer-fixture',expanded(path.join(SQL,'09-writer-fixture.review.sql')).replaceAll('partner_authz_fixture','mission20_fixture_atomic')));
 for(const dep of dependencies)await admin.query(definition(dep.file,dep.signature.split('(')[0]));
 await admin.query(`REVOKE ALL ON FUNCTION public.add_user_to_team(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
  REVOKE ALL ON FUNCTION public.accept_team_invite(uuid),public.accept_team_join_request(uuid),public.ensure_team_conversation(uuid) FROM PUBLIC,anon,service_role;
  GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid),public.accept_team_join_request(uuid),public.ensure_team_conversation(uuid) TO authenticated;
  ALTER TABLE public.team_hackathons DROP CONSTRAINT team_hackathons_team_id_fkey;
  ALTER TABLE public.team_hackathons ADD FOREIGN KEY(team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
  ALTER TABLE public.team_hackathons DROP CONSTRAINT team_hackathons_hackathon_id_fkey;
  ALTER TABLE public.team_hackathons ADD FOREIGN KEY(hackathon_id) REFERENCES public.hackathons(id) ON DELETE CASCADE;
  CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text);
  INSERT INTO supabase_migrations.schema_migrations SELECT '19000101'||lpad(n::text,6,'0'),'synthetic-ledger' FROM generate_series(1,146)n;
  INSERT INTO supabase_migrations.schema_migrations VALUES('20261025081515','synthetic-latest-marker');
  ALTER TABLE public.team_hackathons ENABLE ROW LEVEL SECURITY;
  GRANT SELECT,DELETE ON public.team_hackathons TO authenticated;
  CREATE POLICY atomic_link_read ON public.team_hackathons FOR SELECT TO authenticated USING(true);
  CREATE POLICY atomic_link_delete ON public.team_hackathons FOR DELETE TO authenticated USING(public.is_team_owner(team_id));`);
 assert.equal(await admin.query(`SELECT string_agg(format_type(atttypid,atttypmod),',' ORDER BY attname) FROM pg_attribute
  WHERE attrelid='public.hackathons'::regclass AND attname IN('start_date','end_date','registration_start','registration_end','type');`),'date,timestamp with time zone,timestamp with time zone,date,character varying(50)');
 pass('fresh second database models confirmed DATE/TIMESTAMPTZ/VARCHAR(50), defaults, identity/unique and CASCADE contracts; dummy 147-entry ledger');
 const absent=async()=>assert.equal(await admin.query("SELECT to_regnamespace('mission20_private') IS NULL AND to_regprocedure('public.register_native_hackathon(uuid,uuid,boolean)') IS NULL;"),'t');
 const rejected=(file,re)=>{let error;try{execute(file);}catch(e){error=e;}assert.match(error?.message||'',re);};
 const candidate=source(DIR+'/01-final-expansion.review.sql');
 rejected(candidate,/separately_committed_freeze/);await absent();
 execute(path.join(SQL,'00-freeze-admission.proposed.sql'));
 // Model the future migration loader's separately committed freeze receipt.
 // This is synthetic fixture history, never an operator ledger repair.
 await admin.query("INSERT INTO supabase_migrations.schema_migrations VALUES('20261102090000','synthetic-freeze-loader-receipt');");
 assert.equal(await admin.query("SELECT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT');"),'f');
 pass('missing freeze rejects install; separately committed freeze removes exposed INSERT columns');
 // Exercise the actual emitted exact-digest predicate, including all supplied
 // live hashes. This is NOT installation proof for a missing raw byte fixture.
 const values=sql.match(/\(VALUES\n([\s\S]+?)\n \) AS required\(signature,sha256,authenticated_execute,service_execute_allowed\)/)[1];
 assert.equal(await admin.query(`WITH required(signature,sha256,authenticated_execute,service_execute_allowed) AS (VALUES ${values})
  SELECT bool_and(array_length(sha256,1) BETWEEN 1 AND 2 AND '${'0'.repeat(64)}'<>ALL(sha256)) FROM required;`),'t');
 pass('emitted exact-digest sets contain only source/live hashes and reject an unknown digest; missing conversation bytes remain UNQUALIFIED');
 execute(temp('atomic-source-positive-rollback',sql.replace(/COMMIT;\n$/,'ROLLBACK;\n')));await absent();
 pass('complete source-only approved body bundle installs successfully inside a rolled-back transaction');
 let probe=0;
 const rejectMutation=async(mutation,re)=>{
  const changed=sql.replace('\nBEGIN;\n','\nBEGIN;\n'+mutation+'\n');assert.notEqual(changed,sql);
  rejected(temp('atomic-negative-'+ ++probe,changed),re);await absent();
  assert.equal(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_release_freeze');"),'t');
 };
 for(const dep of dependencies){
  await rejectMutation(withBody(dep,"\nBEGIN RAISE EXCEPTION 'synthetic third-party writer'; END;\n"),/unreviewed_function_variant_stop/);
  await rejectMutation(withBody(dep,body(definition(dep.file,dep.signature.split('(')[0]))+'\n '),/unreviewed_function_variant_stop/);
 }
 pass('all five unknown third-party and whitespace-only third bodies reject byte-exactly before expansion, with full probe rollback');
 for(const role of ['PUBLIC','anon','authenticated','service_role'])await rejectMutation(`GRANT EXECUTE ON FUNCTION public.add_user_to_team(uuid,uuid,text) TO ${role};`,/function_acl_drift_stop/);
 for(const role of ['PUBLIC','anon'])await rejectMutation(`GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO ${role};`,/function_acl_drift_stop/);
 await rejectMutation('CREATE ROLE mission20_fixture_unexpected NOLOGIN; GRANT EXECUTE ON FUNCTION public.ensure_team_conversation(uuid) TO mission20_fixture_unexpected;',/function_acl_drift_stop/);
 await rejectMutation('GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated WITH GRANT OPTION;',/function_acl_drift_stop/);
 await rejectMutation('REVOKE EXECUTE ON FUNCTION public.ensure_team_conversation(uuid) FROM authenticated;',/function_acl_drift_stop/);
 await rejectMutation('GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO service_role;',/function_acl_drift_stop/);
 pass('helper/PUBLIC/anon/unknown-role/grant-option ACL expansion and required-client EXECUTE revocation all reject without altering saved ACLs');
 await rejectMutation('CREATE ROLE mission20_fixture_owner NOLOGIN; ALTER FUNCTION public.accept_team_invite(uuid) OWNER TO mission20_fixture_owner;',/unreviewed_function_variant_stop/);
 await rejectMutation('ALTER FUNCTION public.add_user_to_team(uuid,uuid,text) RENAME TO mission20_fixture_hidden_helper;',/missing_baseline_function/);
 for(const dep of dependencies){
  await rejectMutation(`ALTER FUNCTION ${dep.signature} SET search_path=public;`,/unreviewed_function_variant_stop/);
  await rejectMutation(`ALTER FUNCTION ${dep.signature} SECURITY INVOKER;`,/unreviewed_function_variant_stop/);
 }
 pass('unexpected owner, missing helper, altered search_path and SECURITY INVOKER drift reject before any replacement');
 await rejectMutation('CREATE SCHEMA mission20_private;',/mission20_namespace_drift_stop/);
 await rejectMutation("CREATE FUNCTION public.register_native_hackathon(uuid,uuid,boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb; $$;",/register_native_hackathon.*already exists/);
 pass('partial namespace or stray public RPC cannot be overwritten; failed probes leave only the committed freeze');
 // Also model previously COMMITTED partial state, not only transactional
 // probes. Failed candidate execution must preserve that exact prior object.
 await admin.query("CREATE SCHEMA mission20_private; COMMENT ON SCHEMA mission20_private IS 'synthetic committed partial marker';");
 rejected(candidate,/mission20_namespace_drift_stop/);
 assert.equal(await admin.query("SELECT obj_description(oid,'pg_namespace') FROM pg_namespace WHERE nspname='mission20_private';"),'synthetic committed partial marker');
 await admin.query('DROP SCHEMA mission20_private;'); // Empty, fixture-owned; no CASCADE.
 await admin.query("CREATE FUNCTION public.register_native_hackathon(uuid,uuid,boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{\"fixture\":true}'::jsonb; $$;");
 const partial=()=>admin.query("SELECT oid::text||':'||encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')||':'||coalesce(proacl::text,'NULL') FROM pg_proc WHERE oid='public.register_native_hackathon(uuid,uuid,boolean)'::regprocedure;");
 const savedPartial=await partial();rejected(candidate,/register_native_hackathon.*already exists/);
 assert.equal(await partial(),savedPartial);
 assert.equal(await admin.query("SELECT to_regnamespace('mission20_private') IS NULL;"),'t');
 await admin.query('DROP FUNCTION public.register_native_hackathon(uuid,uuid,boolean);');await absent();
 pass('committed partial namespace/RPC survive failed install unchanged; no automatic overwrite, cleanup or ledger repair');
 for(const dep of dependencies)await admin.query(withBody(dep,selectedBody(dep)));
 // Existing historical audit grants for these three trusted service callers
 // are preserved, never added by the candidate. Only this fake DB gets them.
 await admin.query(`GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid),public.accept_team_join_request(uuid),public.ensure_team_conversation(uuid) TO service_role;`);
 for(const raw of rawFixtures)assert.equal(await admin.query(`SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='${raw.signature}'::regprocedure;`),raw.bodySha256);
 pass('four available exact deployed-byte fixtures match supplied hashes; existing optional trusted service EXECUTE retained, complete deployed set UNQUALIFIED');
 const before=await admin.query(`SELECT string_agg(p.oid::text||':'||coalesce(p.proacl::text,'NULL')||':'||p.proowner::text,'|' ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${dependencies.map(d=>`'${d.signature}'::regprocedure`).join(',')});`);
 const bodies=()=>admin.query(`SELECT string_agg(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'|' ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${dependencies.map(d=>`'${d.signature}'::regprocedure`).join(',')});`);
 const originalBodies=await bodies();
 await admin.query(`CREATE OR REPLACE FUNCTION public.add_user_to_team(p_team_id uuid,p_user_id uuid,p_role text DEFAULT 'member') RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'synthetic unreviewed deployed variant'; END; $$;`);
 rejected(candidate,/unreviewed_function_variant_stop/);await absent();
 await admin.query(withBody(dependencies[4],selectedBody(dependencies[4])));
 pass('unreviewed add_user_to_team body is never overwritten; exact-body drift fails before any expansion');
 await admin.query("INSERT INTO supabase_migrations.schema_migrations VALUES('20261102090001','synthetic-drift');");
 rejected(candidate,/migration_ledger_drift_stop/);await absent();
 await admin.query("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261102090001';");
 pass('ledger drift rejects install without repairing or writing the ledger');
 // Fail after all candidate DDL, before its only COMMIT: all function, trigger,
 // schema and grant writes must roll back, while the earlier freeze survives.
 const failed=sql.replace(/COMMIT;\n$/,`DO $$ BEGIN RAISE EXCEPTION 'injected_final_install_failure'; END; $$;\nCOMMIT;\n`);
 rejected(temp('atomic-injected-failure',failed),/injected_final_install_failure/);await absent();
 assert.equal(await bodies(),originalBodies,'failed installation restores every original body/configuration');
 assert.equal(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_release_freeze');"),'t');
 pass('failure after final DDL rolls back complete install and preserves committed freeze');
 // Pause before commit in a persistent session; another connection must see
 // neither namespace nor intermediate/final RPCs until the one commit.
 const installer=fixture.session('atomic_installer');
 await installer.query(sql.replace(/COMMIT;\n$/,'SELECT 1;\n'));
 await absent();await installer.query('COMMIT;');await installer.close();
 assert.equal(await admin.query("SELECT to_regprocedure('public.mission20_cancel_registration(uuid,uuid)') IS NOT NULL AND position('NOWAIT' in pg_get_functiondef('mission20_private.lock_roster_parents()'::regprocedure))>0;"),'t');
 assert.equal(await admin.query(`SELECT string_agg(p.oid::text||':'||coalesce(p.proacl::text,'NULL')||':'||p.proowner::text,'|' ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${dependencies.map(d=>`'${d.signature}'::regprocedure`).join(',')});`),before);
 pass('success publishes only final protocol at one commit, preserving existing function OIDs/owners/ACLs');
 await admin.query(`INSERT INTO public.hackathons(id,name,type,status,archived,organizer_id,min_team_size,max_team_size,max_participants,registration_start,registration_end,end_date)
 SELECT public.fixture_id(n),'Synthetic atomic event',CASE n WHEN 12102 THEN 'external' WHEN 12103 THEN 'official' ELSE 'native' END,'approved',false,'${uid(9501)}',1,20,1,
 clock_timestamp()-interval '2 days',clock_timestamp()+CASE WHEN n IN(12102,12103,12104) THEN interval '-1 day' ELSE interval '1 day' END,current_date+2 FROM generate_series(12101,12104)n;
 ${identity(9501)} SELECT public.fixture_error('SELECT public.register_native_hackathon(''${uid(12101)}'')','P0001','frozen after expansion'); RESET ROLE;`);
 rejected(path.join(SQL,'06-unfreeze-admission.proposed.sql'),/per_team_and_contract_release_gate_required/);
 execute(path.join(SQL,'02-contract.proposed.sql'));
 assert.equal(await admin.query("SELECT has_column_privilege('authenticated','public.hackathon_registrations','hackathon_id','INSERT') AND NOT has_column_privilege('authenticated','public.hackathon_registrations','id','INSERT') AND NOT has_table_privilege('authenticated','public.hackathon_registrations','INSERT');"),'t');
 await admin.query(frozenInsert(12102,9501));
 assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(12102)}';`),'0');
 pass('unfreeze fails before contract; contract restores only reviewed columns and keeps native/community frozen');
 execute(path.join(SQL,'06-unfreeze-admission.proposed.sql'));
 await admin.query(`${identity(9501)} SELECT public.fixture_assert(public.register_native_hackathon('${uid(12101)}')->>'status'='confirmed','native succeeds');
 SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(''${uid(12101)}'',''${uid(9501)}'')','42501','direct native denied');
 SELECT public.fixture_error('SELECT public.register_native_hackathon(''${uid(12104)}'')','P0001','closed admission denied');
 INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES('${uid(12102)}','${uid(9501)}'),('${uid(12103)}','${uid(9501)}'); RESET ROLE;
 ${identity(9502)} SELECT public.fixture_assert(public.register_native_hackathon('${uid(12101)}')->>'status'='waitlisted','waitlisted atomically'); RESET ROLE;`);
 pass('committed candidate admits native/waitlists, denies closed/direct native, preserves expired-deadline external/official community');
 const reg=await admin.query(`SELECT id FROM public.hackathon_registrations WHERE hackathon_id='${uid(12101)}' AND user_id='${uid(9501)}';`);
 await admin.query(`${identity(9501)} SELECT public.mission20_cancel_registration('${uid(12101)}','${reg}'); RESET ROLE;
 ${identity(9503)} SELECT public.fixture_assert(public.register_native_hackathon('${uid(12101)}')->>'status'='confirmed','capacity released'); RESET ROLE;`);
 pass('candidate cancellation releases capacity without promoting prior waitlist');
 execute(path.join(SQL,'00-freeze-admission.proposed.sql'));
 const grant=fs.readFileSync(path.join(SQL,'02-contract.proposed.sql'),'utf8').match(/GRANT INSERT\(hackathon_id, user_id, team_id, status, looking_for_team, metadata, is_hidden\)\s+ON public\.hackathon_registrations TO authenticated;/)[0];
 assert.equal(await admin.query("SELECT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT');"),'f');
 await admin.query(grant);
 await admin.query(frozenInsert(12102,9504));
 assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(12102)}' AND user_id='${uid(9504)}';`),'0');
 execute(path.join(SQL,'06-unfreeze-admission.proposed.sql'));
 await admin.query(`${identity(9504)} INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES('${uid(12102)}','${uid(9504)}'); RESET ROLE;`);
 assert.equal(await admin.query("SELECT has_table_privilege('authenticated','public.hackathon_registrations','INSERT') OR has_column_privilege('authenticated','public.hackathon_registrations','id','INSERT');"),'f');
 pass('second freeze revokes columns; exact reviewed community grant plus separately gated unfreeze restores only community payload, never broad INSERT');
 execute(path.join(SQL,'03-rollback-freeze.proposed.sql'));
 assert.equal(await admin.query("SELECT NOT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT') AND NOT has_function_privilege('authenticated','public.register_native_hackathon(uuid,uuid,boolean)','EXECUTE') AND to_regprocedure('public.mission20_cancel_registration(uuid,uuid)') IS NOT NULL;"),'t');
 const rollbackRegistration=await admin.query(`SELECT id FROM public.hackathon_registrations WHERE hackathon_id='${uid(12101)}' AND user_id='${uid(9503)}';`);
 await admin.query(`${identity(9503)} UPDATE public.hackathon_registrations SET looking_for_team=true WHERE id='${rollbackRegistration}';
  SELECT public.mission20_cancel_registration('${uid(12101)}','${rollbackRegistration}'); RESET ROLE;`);
 assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE id='${rollbackRegistration}';`),'0');
 pass('postcommit fail-closed rollback revokes admission/INSERT, preserves cancellation and final protocol');
 // 06 must NOT serve as recovery from 03. Its guard currently checks structural
 // presence only, so this proves the operational blocker explicitly.
 rejected(path.join(SQL,'06-unfreeze-admission.proposed.sql'),/mission20_release_freeze.*does not exist/);
 assert.equal(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_admission_frozen');"),'t');
 pass('policy-only unfreeze cannot recover rollback; emergency freeze remains and no unsafe automatic ACL recovery is attempted');
 const version=await admin.query('SHOW server_version;');
 await admin.close();console.log(JSON.stringify({atomicCandidate:true,checks,baselineAssertions,version,exactDeployedFixtures:rawFixtures.length,
  completeDeployedBodyInstallation:'UNQUALIFIED',productionConnections:0,hostedAuth:false,backupRestore:false}));
}
module.exports={qualifyAtomic};
if(require.main===module)main({setup:c2.setup,async qualify(c){await c2.qualify(c);await qualifyAtomic(c);}}).catch(e=>{console.error(e.stack);process.exitCode=1;});
