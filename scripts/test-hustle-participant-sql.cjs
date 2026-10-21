/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic disposable PostgreSQL only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFixture, installClock, IDS, quote } = require('./hustle-phase2-local-db.cjs');
let checks=0;
const check=(v,label)=>{assert(v,label);checks++;};
async function main(){
 const db=await createFixture();
 const ids=Object.fromEntries(['leader','member','solo','decliner','late','outsider'].map((n,i)=>[n,'70000000-0000-4000-8000-'+String(i+1).padStart(12,'0')]));
 const sid=id=>'71000000'+id.slice(8);
 const user=(name,q,session=sid(ids[name]))=>`SET ROLE authenticated; SET request.jwt.claim.sub=${quote(ids[name])}; SET request.jwt.claims=${quote(JSON.stringify({sub:ids[name],role:'authenticated',session_id:session}))}; ${q}`;
 const json=(name,q)=>JSON.parse(db.sql(user(name,q.replace(/;?$/, ''))+';').split(/\r?\n/).filter(s=>s!=='SET').at(-1)||'null');
 const denied=(name,q,label)=>{assert.throws(()=>db.sql(user(name,q)),/permission denied|access required|identity|Invitation|leader|required|reconciliation/i,label);checks++;};
 try{
  db.sql(`CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE supabase_auth_admin NOLOGIN;
   ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz DEFAULT now(),ADD COLUMN is_anonymous boolean DEFAULT false;
   ALTER TABLE auth.users OWNER TO supabase_auth_admin;
   CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
   ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT true;
   CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=user_id AND role='admin')$$;
   REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
   GRANT USAGE ON SCHEMA auth TO postgres,supabase_auth_admin; GRANT USAGE,CREATE ON SCHEMA public TO postgres;
   GRANT SELECT(id,email,email_confirmed_at,is_anonymous),REFERENCES(id) ON auth.users TO postgres;
   GRANT SELECT(id,user_id,not_after) ON auth.sessions TO postgres;`);
  for(const table of db.sql("SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'").split(/\r?\n/))db.sql(`ALTER TABLE public.${table} OWNER TO postgres`);
  for(const fn of db.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f'").split(/\r?\n/))db.sql(`ALTER FUNCTION public.${fn} OWNER TO postgres`);
  db.sql('SET ROLE postgres;'+fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261018174144_hustle_round2_auth_guards.sql'),'utf8'));
  const source=fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261020055415_hustle_participant_accounts.sql'),'utf8');
  db.sql('SET ROLE postgres;'+source);
  db.sql(Object.entries(ids).map(([name,id])=>`INSERT INTO auth.users(id,email)VALUES('${id}','${name}@example.invalid'); INSERT INTO profiles(id,role,is_banned)VALUES('${id}','user',false); INSERT INTO auth.sessions VALUES('${sid(id)}','${id}',NULL);`).join('\n'));
  db.sql('SET ROLE postgres;'+fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261020201500_hustle_google_sessions.sql'),'utf8'));
  // No Google proof: GitHub, old Google sessions and unverifiable provenance
  // all fail closed, even with forged Google account metadata in the JWT.
  for(const fn of ["hustle_phase2_claim()","hustle_phase2_participant()","hustle_phase2_inspect('"+'a'.repeat(64)+"')","hustle_phase2_respond('"+'a'.repeat(64)+"','confirmed')"])
   denied('leader','SELECT '+fn,'Unattested/GitHub session denied by direct RPC '+fn.split('(')[0]);
  const forged={sub:ids.leader,role:'authenticated',session_id:sid(ids.leader),app_metadata:{provider:'google',providers:['google']},amr:[{method:'oauth',provider:'google'}]};
  check(db.sql(`SET ROLE authenticated;SET request.jwt.claim.sub='${ids.leader}';SET request.jwt.claims=${quote(JSON.stringify(forged))};SELECT hustle_phase2_google_session()`).split(/\r?\n/).at(-1)==='f','Google metadata and oauth AMR do not manufacture proof');
  for(const role of ['anon','authenticated']){assert.throws(()=>db.sql(`SET ROLE ${role};SELECT hustle_phase2_attest_google_session('${ids.leader}','${sid(ids.leader)}')`),/permission denied/);checks++;}
  for(const role of ['anon','authenticated','service_role']){assert.throws(()=>db.sql(`SET ROLE ${role};SELECT * FROM hustle_phase2_google_sessions`),/permission denied/);checks++;}
  assert.throws(()=>db.sql(`SET ROLE service_role;SELECT hustle_phase2_attest_google_session('${ids.member}','${sid(ids.leader)}')`),/active session/);checks++;
  db.sql(`UPDATE profiles SET is_banned=true WHERE id='${ids.leader}'`);
  assert.throws(()=>db.sql(`SET ROLE service_role;SELECT hustle_phase2_attest_google_session('${ids.leader}','${sid(ids.leader)}')`),/active session/);checks++;
  db.sql(`UPDATE profiles SET is_banned=false WHERE id='${ids.leader}'`);
  for(const id of Object.values(ids))check(db.sql(`SET ROLE service_role;SELECT hustle_phase2_attest_google_session('${id}','${sid(id)}')`).split(/\r?\n/).at(-1)==='t','Trusted synthetic Google verification records one session proof');
  check(db.sql(user('leader','SELECT hustle_phase2_google_session()')).split(/\r?\n/).at(-1)==='t','Active attested Google session accepted');
  const proofBefore=db.sql(`SELECT row_to_json(g) FROM hustle_phase2_google_sessions g WHERE session_id='${sid(ids.leader)}'`);
  db.sql(`SET ROLE service_role;SELECT hustle_phase2_attest_google_session('${ids.leader}','${sid(ids.leader)}')`);
  check(db.sql(`SELECT row_to_json(g) FROM hustle_phase2_google_sessions g WHERE session_id='${sid(ids.leader)}'`)===proofBefore,'Replay cannot extend proof lifetime');
  const secondSession='72000000-0000-4000-8000-000000000001';
  db.sql(`INSERT INTO auth.sessions VALUES('${secondSession}','${ids.leader}',NULL)`);
  check(db.sql(user('leader','SELECT hustle_phase2_google_session()',secondSession)).split(/\r?\n/).at(-1)==='f','Another session of same Google-linked account cannot reuse proof');
  db.sql(`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='${secondSession}'`);
  assert.throws(()=>db.sql(`SET ROLE service_role;SELECT hustle_phase2_attest_google_session('${ids.leader}','${secondSession}')`),/active session/);checks++;
  check(db.sql(user('leader','SELECT hustle_phase2_google_session()',secondSession)).split(/\r?\n/).at(-1)==='f','Expired Auth session cannot attest or reuse Google proof');
  const googleMigration=fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261020201500_hustle_google_sessions.sql'),'utf8');
  assert.throws(()=>db.sql('SET ROLE service_role;'+googleMigration),/postgres executor/);checks++;
  assert.throws(()=>db.sql('SET ROLE postgres;'+googleMigration),/already exists/);checks++;
  check(db.sql(`SELECT row_to_json(g) FROM hustle_phase2_google_sessions g WHERE session_id='${sid(ids.leader)}'`)===proofBefore,'Rejected duplicate/executor transactions leave existing proof unchanged');
  db.sql(`UPDATE hustle_phase2_google_sessions SET verified_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE user_id='${ids.leader}'`);
  denied('leader','SELECT hustle_phase2_participant()','Expired proof denies direct access');
  db.sql(`UPDATE hustle_phase2_google_sessions SET verified_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' WHERE user_id='${ids.leader}'`);
  check(db.sql("SELECT bool_and(proowner='postgres'::regrole AND prosecdef AND proconfig=ARRAY['search_path=\"\"']) FROM pg_proc WHERE proname IN ('hustle_phase2_google_session','hustle_phase2_attest_google_session','hustle_phase2_participant_identity')")==='t','Proof functions trusted owner and locked path');
  installClock(db);
  db.sql('GRANT SELECT ON public.fixture_clock TO postgres');
  const row=(id,leader,member=null)=>({external_team_id:id,team_name:'Synthetic '+id,leader_name:'Synthetic '+leader,leader_email:leader+'@example.invalid',leader_whatsapp:null,second_member_name:member?'Synthetic '+member:null,second_member_email:member?member+'@example.invalid':null});
  const rows=[row('SYNTH-PAIR','leader','member'),row('SYNTH-SOLO','solo'),row('SYNTH-DECLINE','decliner','late')];
  const imported=JSON.parse(db.sql(`SET ROLE service_role;SELECT hustle_phase2_import('${IDS.admin}','${'b'.repeat(64)}',${quote(JSON.stringify(rows))});`).split(/\r?\n/).at(-1));
  check(imported.imported===3&&!imported.active,'Official slots import inactive');
  check(db.sql('SELECT count(*) FROM hustle_phase2_participants')==='5','One exact official slot per person');
  denied('leader',"SELECT hustle_phase2_claim()",'Inactive batch denies identity claim');
  db.sql(`SET ROLE service_role;SELECT hustle_phase2_activate('${IDS.admin}','${imported.batchId}','${'b'.repeat(64)}')`);
  const hashes={};for(const [name,team]of [['leader','SYNTH-PAIR'],['solo','SYNTH-SOLO'],['decliner','SYNTH-DECLINE']]){hashes[name]=name==='leader'?'a'.repeat(64):name==='solo'?'c'.repeat(64):'d'.repeat(64);db.sql(`SET ROLE service_role;SELECT hustle_phase2_invite('${IDS.admin}',(SELECT id FROM hustle_phase2_teams WHERE external_team_id='${team}'),'${hashes[name]}')`);}
  const claim=(name,hash=null)=>json(name,`SELECT hustle_phase2_claim(${quote(hash)})`);
  const respond=(name,decision,hash=hashes[name])=>json(name,`SELECT hustle_phase2_respond(${quote(hash)},'${decision}')`);
  check(claim('leader',hashes.leader).fully_onboarded===false,'Leader verified while member absent: onboarding incomplete');
  check(respond('leader','confirmed').status==='ok','Leader confirms without second account');
  check(respond('leader','confirmed').status==='ok','Same attendance replay is idempotent');
  check(respond('leader','declined').status==='conflict','Conflicting attendance cannot replace decision');
  check(claim('member').fully_onboarded===true,'Member later verifies independently');
  check(db.sql("SELECT decision FROM hustle_phase2_teams WHERE external_team_id='SYNTH-PAIR'")==='confirmed','Later member signup preserves confirmation');
  denied('member',`SELECT hustle_phase2_respond('${hashes.leader}','declined')`,'Second member cannot change attendance');
  const firstClaims=await Promise.all([db.asyncSql(user('solo',`SELECT hustle_phase2_claim('${hashes.solo}')`)),db.asyncSql(user('solo',`SELECT hustle_phase2_claim('${hashes.solo}')`))]);
  check(firstClaims.every(s=>JSON.parse(s.split(/\r?\n/).at(-1)).fully_onboarded),'Concurrent first solo claims bind once and fully onboard');
  check(db.sql(`SELECT count(*) FROM hustle_phase2_audit WHERE action='account_verified' AND actor_id='${ids.solo}'`)==='1','Concurrent first bindings produce one audit');
  check(claim('decliner',hashes.decliner).fully_onboarded===false,'Second pair starts partially verified');
  check(respond('decliner','declined').status==='ok','Verified leader may decline while member absent');
  db.sql("UPDATE fixture_clock SET value='2026-10-24T04:30:00Z'");
  check(claim('late').fully_onboarded===true,'No invented second-member signup cutoff');
  check(db.sql("SELECT decision FROM hustle_phase2_teams WHERE external_team_id='SYNTH-DECLINE'")==='declined','Later signup preserves decline');
  check(['closed','invalid'].includes(respond('solo','confirmed').status),'Attendance cutoff/expired invitation independent of onboarding');
  denied('outsider','SELECT hustle_phase2_claim()','Unrelated verified account cannot claim');
  denied('member',`SELECT hustle_phase2_claim('${hashes.leader}')`,'Member cannot use leader invitation');
  denied('solo',`SELECT hustle_phase2_inspect('${hashes.leader}')`,'Wrong account cannot inspect another team');
  for(const [column,value,reset]of [['email_confirmed_at','NULL','now()'],['is_anonymous','true','false']]){db.sql(`UPDATE auth.users SET ${column}=${value} WHERE id='${ids.leader}'`);denied('leader','SELECT hustle_phase2_participant()','Auth rejects '+column);db.sql(`UPDATE auth.users SET ${column}=${reset} WHERE id='${ids.leader}'`);}
  for(const [column,value,reset]of [['is_banned','true','false'],['is_banned','NULL','false'],['onboarding_completed','false','true']]){db.sql(`UPDATE profiles SET ${column}=${value} WHERE id='${ids.leader}'`);denied('leader','SELECT hustle_phase2_participant()','Protected profile rejects '+column+' '+value);db.sql(`UPDATE profiles SET ${column}=${reset} WHERE id='${ids.leader}'`);}
  db.sql(`UPDATE auth.users SET email='changed@example.invalid' WHERE id='${ids.leader}'`);check(json('leader','SELECT hustle_phase2_participant()')===null,'Changed email does not retain roster access');denied('leader','SELECT hustle_phase2_claim()','Changed email needs reconciliation');db.sql(`UPDATE auth.users SET email='leader@example.invalid' WHERE id='${ids.leader}'`);
  db.sql(`UPDATE auth.users SET email='leader@example.invalid' WHERE id='${ids.outsider}'`);
  const ambiguous=await Promise.allSettled(['leader','outsider'].map(name=>db.asyncSql(user(name,'SELECT hustle_phase2_claim()'))));
  check(ambiguous.every(r=>r.status==='rejected'&&/access required/.test(r.reason.message)),'Two verified UUIDs sharing an email both fail closed under concurrent claims');
  db.sql(`UPDATE auth.users SET email='outsider@example.invalid' WHERE id='${ids.outsider}'`);
  check(db.sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='hustle_phase2_teams'::regclass AND conname='hustle_phase2_teams_check1'").includes('decided_at'),'Original attendance consistency CHECK preserved');
  assert.throws(()=>db.sql("UPDATE hustle_phase2_teams SET decided_at=NULL WHERE decision='confirmed'"),/check constraint/);checks++;
  db.sql(`DELETE FROM auth.sessions WHERE user_id='${ids.leader}'`);denied('leader','SELECT hustle_phase2_participant()','Revoked signed session denied');db.sql(`INSERT INTO auth.sessions VALUES('${sid(ids.leader)}','${ids.leader}',NULL)`);
  assert.throws(()=>db.sql(user('leader','SELECT hustle_phase2_participant()','72000000-0000-4000-8000-000000000099')),/access required/);checks++;
  for(const role of ['anon','authenticated','service_role']){assert.throws(()=>db.sql(`SET ROLE ${role};SELECT * FROM hustle_phase2_participants`),/permission denied/);checks++;check(db.sql(`SELECT NOT has_any_column_privilege('${role}','auth.sessions','SELECT')`)==='t','No raw sessions for '+role);}
  for(const fn of ["hustle_phase2_inspect('"+hashes.leader+"')","hustle_phase2_respond('"+hashes.leader+"','confirmed')"]){assert.throws(()=>db.sql('SET ROLE service_role;SELECT '+fn),/permission denied/);checks++;}
  assert.throws(()=>db.sql('SET ROLE authenticated;SELECT hustle_phase2_participant_identity()'),/permission denied/);checks++;
  check(db.sql("SELECT bool_and(relrowsecurity AND relowner='postgres'::regrole) FROM pg_class WHERE relname='hustle_phase2_participants'")==='t','New raw table trusted owner and RLS');
  check(db.sql("SELECT count(*) FROM hustle_phase2_audit WHERE action IN ('confirmed','declined') AND actor_id IS NOT NULL")==='2','Response audit binds actual actors');
  const own=json('member','SELECT hustle_phase2_participant()');check(!JSON.stringify(own).includes('@')&&!JSON.stringify(own).includes(ids.leader),'Own-team projection exposes no emails or other account UUIDs');
  db.sql("UPDATE fixture_clock SET value='2026-10-23T04:29:59.999Z'");check(respond('solo','confirmed').status==='closed','Before opening denied');
  db.sql("UPDATE fixture_clock SET value='2026-10-23T04:30:00Z'");
  const attempts=await Promise.all([db.asyncSql(user('solo',`SELECT hustle_phase2_respond('${hashes.solo}','confirmed')`)),db.asyncSql(user('solo',`SELECT hustle_phase2_respond('${hashes.solo}','declined')`))]);
  check(attempts.filter(s=>JSON.parse(s.split(/\r?\n/).at(-1)).status==='ok').length===1,'Concurrent opposing responses have one authoritative winner');
  const claims=await Promise.all([db.asyncSql(user('member','SELECT hustle_phase2_claim()')),db.asyncSql(user('member','SELECT hustle_phase2_claim()'))]);check(claims.length===2&&db.sql(`SELECT count(*) FROM hustle_phase2_audit WHERE action='account_verified' AND actor_id='${ids.member}'`)==='1','Concurrent repeated claims do not duplicate binding/audit');
  for(const bad of [row('SYNTH-DUP','outsider','leader'),row('SYNTH-SELF','outsider','outsider'),{...row('SYNTH-MISSING','outsider','missing'),second_member_email:null}]){assert.throws(()=>db.sql(`SET ROLE service_role;SELECT hustle_phase2_import('${IDS.admin}','${Math.random().toString(16).slice(2).padEnd(64,'0')}',${quote(JSON.stringify([bad]))})`),/duplicate key|together/);checks++;}
  check(db.sql('SELECT count(*) FROM hustle_phase2_teams')==='3','Rejected roster imports roll back atomically');
  const namesakes={...row('SYNTH-NAMESAKES','unused','unusedmember'),leader_name:'Synthetic Namesake',second_member_name:'Synthetic Namesake'};
  db.sql(`SET ROLE service_role;SELECT hustle_phase2_import('${IDS.admin}','${'f'.repeat(64)}',${quote(JSON.stringify([namesakes]))})`);
  check(db.sql("SELECT count(*) FROM hustle_phase2_participants p JOIN hustle_phase2_teams t ON t.id=p.team_id WHERE t.external_team_id='SYNTH-NAMESAKES'")==='2','Namesakes accepted with distinct official emails without weakening attendance constraints');
  for(const [at,want]of [['2026-10-23T04:29:59.999Z','before'],['2026-10-23T04:30:00Z','open'],['2026-10-23T17:29:59.999Z','open'],['2026-10-23T17:30:00Z','closed']])check(db.sql(`SELECT hustle_phase2_window('${at}')`)===want,'Exact SQL window '+at);
  const blocker=db.asyncSql(`BEGIN;SELECT id FROM hustle_phase2_teams WHERE external_team_id='SYNTH-SOLO' FOR UPDATE;SELECT pg_sleep(0.4);UPDATE fixture_clock SET value='2026-10-23T17:30:00Z';COMMIT;`);
  await new Promise(r=>setTimeout(r,80));
  const waiting=await db.asyncSql(user('solo',`SELECT hustle_phase2_respond('${hashes.solo}','confirmed')`));await blocker;
  check(['invalid','closed'].includes(JSON.parse(waiting.split(/\r?\n/).at(-1)).status),'Response waiting on team lock rechecks closing time after lock');
  check(db.sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'hustle_phase2_%'")==='17','Exactly seventeen Phase 2 functions including two Google proof helpers');
  check(db.sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'hustle_phase2_%'")==='7','Exactly seven Phase 2 tables with isolated Google proof table');
  check(db.sql("SELECT NOT has_column_privilege('service_role','hustle_phase2_participants','user_id','INSERT') AND NOT has_column_privilege('service_role','hustle_phase2_participants','verified_at','INSERT')")==='t','Service cannot fabricate verified bindings');
  for(const role of ['anon','service_role'])check(db.sql(`SELECT NOT has_function_privilege('${role}','hustle_phase2_claim(text)','EXECUTE') AND NOT has_function_privilege('${role}','hustle_phase2_participant(text)','EXECUTE')`)==='t','Private participant functions denied to '+role);
  const before=fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261018082156_hustle_phase2_shortlist.sql'),'utf8').replace(/\r\n/g,'\n');check(require('node:crypto').createHash('sha256').update(before).digest('hex')==='4fc87a833b6e3c4687cba372a05717383cb8f35fdd60f03a7f90e166038f45e7','Historical migration immutable');
  console.log(`Participant SQL/RLS/concurrency: ${checks} passed, 0 failed (synthetic PostgreSQL only; Auth claims are substitutes).`);
 }finally{await db.close();console.log('Disposable PostgreSQL cleanup complete.');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
