/* eslint-disable @typescript-eslint/no-require-imports -- Native loopback-only fixture; no hosted service. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
const {randomBytes,createHmac}=require('node:crypto');
const {main}=require('./qualify-mission20-c1-postgres.cjs');
const {extension:c2}=require('./qualify-mission20-c2-writers.cjs');
const ROOT=path.resolve(__dirname,'..');
const executable=path.join(ROOT,'scratch/postgrest',process.platform==='win32'?'postgrest.exe':'postgrest');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function qualifyHttp(c) {
 const {admin,uid,passed,session,ownedRoot,pgPort,run,connection,SQL}=c;
 const communityGrant=fs.readFileSync(path.join(SQL,'02-contract.proposed.sql'),'utf8').match(/GRANT INSERT\(hackathon_id, user_id, team_id, status, looking_for_team, metadata, is_hidden\)\s+ON public\.hackathon_registrations TO authenticated;/)?.[0];
 assert(communityGrant,'reviewed community column grant must match exactly');
 // The comparator/writer harness re-freezes AFTER its initial contract; 00
 // revokes column INSERT and 06 only drops the freeze policy. Model the future
 // final contract (which follows the LAST freeze) before HTTP acceptance.
 assert.equal(await admin.query("SELECT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT');"),'f');
 await admin.query(communityGrant);
 assert.equal(await admin.query("SELECT has_table_privilege('authenticated','public.hackathon_registrations','INSERT') OR has_column_privilege('authenticated','public.hackathon_registrations','id','INSERT');"),'f');
 assert.equal(path.dirname(fs.realpathSync(ownedRoot)),fs.realpathSync(require('node:os').tmpdir()));
 assert(path.basename(ownedRoot).startsWith('mission20-c1-pg-'));
 const ephemeral=fs.mkdtempSync(path.join(ownedRoot,'http-'));
 const reservation=net.createServer();await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
 const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const origin=`http://127.0.0.1:${port}`,secret=randomBytes(48).toString('base64url');
 const token=(actor,extra={},key=secret)=>{
  const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const data=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub:uid(actor),aud:'mission20-fixture',exp:Math.floor(Date.now()/1000)+600,...extra});
  return data+'.'+createHmac('sha256',key).update(data).digest('base64url');
 };
 // Fixture-only auth.uid supports PostgREST's real JSON claims GUC as Supabase
 // does. Existing psql suites used the legacy single-claim GUC; retain both.
 await admin.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$;
  CREATE ROLE mission20_http_login LOGIN NOINHERIT NOBYPASSRLS;
  GRANT anon,authenticated TO mission20_http_login;
  ALTER ROLE mission20_http_login SET statement_timeout='5s';
  ALTER ROLE authenticated SET statement_timeout='5s';
  -- Match the repository junction DDL; full live parity still needs catalog signoff.
  ALTER TABLE public.team_hackathons DROP CONSTRAINT team_hackathons_team_id_fkey;
  ALTER TABLE public.team_hackathons ADD FOREIGN KEY(team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
  ALTER TABLE public.team_hackathons DROP CONSTRAINT team_hackathons_hackathon_id_fkey;
  ALTER TABLE public.team_hackathons ADD FOREIGN KEY(hackathon_id) REFERENCES public.hackathons(id) ON DELETE CASCADE;
  RESET ROLE; RESET request.jwt.claim.sub;
  INSERT INTO auth.users(id,email) SELECT public.fixture_id(n),'http-'||n||'@example.invalid' FROM generate_series(11100,11112) n;
  INSERT INTO public.profiles(id,email,full_name,role,is_banned,onboarding_completed)
   SELECT id,email,'Synthetic HTTP',CASE WHEN id='${uid(11100)}' THEN 'admin' ELSE 'user' END,false,true FROM auth.users
    WHERE id BETWEEN '${uid(11100)}' AND '${uid(11112)}';
  INSERT INTO public.teams(id,name,owner_id,max_members) VALUES('${uid(11170)}','Synthetic HTTP team','${uid(11101)}',20);
  INSERT INTO public.team_members(team_id,user_id,role) VALUES('${uid(11170)}','${uid(11101)}','owner'),('${uid(11170)}','${uid(11102)}','member');
  INSERT INTO public.hackathons(id,name,type,status,archived,organizer_id,min_team_size,max_team_size,max_participants,registration_start,registration_end,end_date)
   SELECT public.fixture_id(n),'Synthetic HTTP event',CASE n WHEN 11151 THEN 'external' WHEN 11152 THEN 'official' ELSE 'native' END,
    'approved',false,'${uid(11101)}',1,20,1,clock_timestamp()-interval '2 days',
    clock_timestamp()+CASE WHEN n IN(11151,11152,11153) THEN interval '-1 day' ELSE interval '1 day' END,
    clock_timestamp()+interval '2 days' FROM generate_series(11150,11158) n;
  CREATE FUNCTION public.mission20_http_timeout() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
    UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id='${uid(11150)}' AND user_id=auth.uid();
    PERFORM pg_catalog.pg_sleep(8); END; $$;
  REVOKE ALL ON FUNCTION public.mission20_http_timeout() FROM PUBLIC,anon,service_role;
  GRANT EXECUTE ON FUNCTION public.mission20_http_timeout() TO authenticated;`);
 const config=path.join(ephemeral,'postgrest.conf');
 fs.writeFileSync(config,[`db-uri = "postgresql://mission20_http_login@127.0.0.1:${pgPort}/partner_authz_fixture"`,
  'db-schemas = "public"','db-anon-role = "anon"','db-config = false','db-pool = 4','db-pool-acquisition-timeout = 2',
  `jwt-secret = "${secret}"`,'jwt-aud = "mission20-fixture"','server-host = "127.0.0.1"',`server-port = ${port}`].join('\n'),{mode:0o600});
 const env={};for(const key of ['PATH','SystemRoot','WINDIR','COMSPEC','USERPROFILE','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
 // No inherited database/JWT/project settings. Empty files also disable libpq
 // per-user credentials/services, even though this cluster uses loopback trust.
 env.PGPASSFILE=path.join(ephemeral,'empty-pgpass');env.PGSERVICEFILE=path.join(ephemeral,'empty-pgservice');fs.writeFileSync(env.PGPASSFILE,'');fs.writeFileSync(env.PGSERVICEFILE,'');
 let logs='',httpChecks=0;const child=spawn(executable,[config],{cwd:ephemeral,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{logs+=b;});child.stderr.on('data',b=>{logs+=b;});child.on('error',e=>{logs+=e.message;});
 const closed=new Promise(resolve=>child.once('close',resolve));
 async function request(route,actor,body,options={}) {
  const url=new URL(route,origin);assert.equal(url.origin,origin);assert.equal(url.hostname,'127.0.0.1');
  const headers={'Content-Type':'application/json',...options.headers};
  if(actor!==null)headers.Authorization='Bearer '+(options.jwt||token(actor));
  const response=await fetch(url,{method:options.method||(body===undefined?'GET':'POST'),headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(9000)});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:response.status,data};
 }
 const rpc=(name,actor,args,options)=>request('/rpc/'+name,actor,args,options);
 const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
 const denied=r=>{assert([400,401,403,404,406].includes(r.status),JSON.stringify(r));};
 const check=label=>{httpChecks++;passed('real PostgREST: '+label);};
 try {
  let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)break;try{const r=await request('/',null);if(r.status===200){ready=true;break;}}catch{}await pause(100);}
  assert(ready,'PostgREST failed startup: '+logs.replaceAll(secret,'[redacted]'));
  const args={p_hackathon_id:uid(11150),p_team_id:uid(11170),p_reviewed_unknown:false};
  denied(await rpc('register_native_hackathon',null,args));
  for(const jwt of [token(11101,{},'wrong-signing-secret-with-at-least-thirty-two-chars'),token(11101,{exp:1}),token(11101,{aud:'wrong-audience'})])
   assert.equal((await rpc('register_native_hackathon',11101,args,{jwt})).status,401);
  denied(await rpc('register_native_hackathon',11101,args,{jwt:token(11101,{role:'postgres'})}));
  assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(11150)}';`),'0');
  check('anonymous, invalid/expired/wrong-audience JWT and forged privileged role cannot admit');
  denied(await request('/rpc/register_native',11101,args,{headers:{'Content-Profile':'mission20_private'}}));
  const admitted=ok(await rpc('register_native_hackathon',11101,args));assert.equal(admitted.status,'confirmed');
  assert.equal(ok(await rpc('register_native_hackathon',11101,args)).alreadyRegistered,true);
  const waiting=ok(await rpc('register_native_hackathon',11102,{...args,p_team_id:null}));assert.equal(waiting.status,'waitlisted');
  assert.equal((await rpc('register_native_hackathon',11103,{...args,p_hackathon_id:uid(11153),p_team_id:null})).status,400);
  check('real JWT subject binds native confirmed/idempotent/waitlisted results and closed admission rejects');
  denied(await request('/hackathon_registrations',11103,{hackathon_id:uid(11150),user_id:uid(11103),status:'confirmed'}));
  denied(await request('/hackathon_registrations',11103,{hackathon_id:uid(11151),user_id:uid(11101),status:'confirmed'}));
  assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(11150)}';`),'2');
  check('direct native INSERT and forged community identity denied with no extra rows');
  for(const n of [11151,11152])ok(await request('/hackathon_registrations',11103,{hackathon_id:uid(n),user_id:uid(11103),status:'confirmed'}),201);
  const own=ok(await request(`/hackathon_registrations?select=id,user_id,status&hackathon_id=eq.${uid(11150)}&user_id=eq.${uid(11101)}`,11101));
  assert.equal(own.length,1);assert.equal(own[0].user_id,uid(11101));
  assert.equal(ok(await request(`/hackathon_registrations?select=id&hackathon_id=eq.${uid(11150)}`,11101)).length,2,
   'native organizer retains the existing authorized participant read');
  assert.deepEqual(ok(await request(`/hackathon_registrations?select=id&user_id=eq.${uid(11101)}`,11102)),[]);
  denied(await request('/hackathon_registrations?select=id',null));
  check('external/official community joins ignore external registration deadline; private/anonymous reads remain scoped');
  const creation={organizer_id:uid(11101),name:'Synthetic HTTP approval',type:'native',status:'approved',archived:false};
  denied(await request('/hackathons',11101,{...creation,id:uid(11160)}));
  ok(await request('/hackathons',11101,{...creation,id:uid(11160),status:'pending'}),201);
  denied(await request(`/hackathons?id=eq.${uid(11160)}`,11101,{status:'approved'},{method:'PATCH'}));
  ok(await request('/hackathons',11101,{...creation,id:uid(11161),type:'external'}),201);
  denied(await request('/hackathons',11101,{...creation,id:uid(11162),type:'official'}));
  check('native approval cannot be forged, external cross-list creation works, official remains legacy only');
  await admin.query(`INSERT INTO public.team_hackathons(team_id,hackathon_id) VALUES('${uid(11170)}','${uid(11150)}');`);
  // Failure after unlink must undo that DELETE too; a returned error is not a
  // successful cancellation. The injected trigger exists only in this fixture.
  await admin.query(`CREATE FUNCTION public.http_reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.id='${own[0].id}' THEN RAISE EXCEPTION 'synthetic_cancel_rejection'; END IF; RETURN OLD; END; $$;
    CREATE TRIGGER http_reject_cancel BEFORE DELETE ON public.hackathon_registrations FOR EACH ROW EXECUTE FUNCTION public.http_reject_cancel();`);
  assert.equal((await rpc('mission20_cancel_registration',11101,{p_event_id:uid(11150),p_registration_id:own[0].id})).status,400);
  assert.equal(await admin.query(`SELECT count(*) FROM public.team_hackathons WHERE team_id='${uid(11170)}';`),'1');
  await admin.query('DROP TRIGGER http_reject_cancel ON public.hackathon_registrations; DROP FUNCTION public.http_reject_cancel();');
  const foreignCancel=await rpc('mission20_cancel_registration',11102,{p_event_id:uid(11150),p_registration_id:own[0].id});
  assert.equal(foreignCancel.status,500);assert.equal(foreignCancel.data.code,'55P03');
  assert.equal(ok(await rpc('mission20_cancel_registration',11101,{p_event_id:uid(11150),p_registration_id:own[0].id})),own[0].id);
  assert.equal(await admin.query(`SELECT count(*) FROM public.team_hackathons WHERE team_id='${uid(11170)}';`),'0');
  assert.equal(ok(await rpc('register_native_hackathon',11103,{...args,p_team_id:null})).status,'confirmed');
  assert.equal(await admin.query(`SELECT status FROM public.hackathon_registrations WHERE hackathon_id='${uid(11150)}' AND user_id='${uid(11102)}';`),'waitlisted');
  check('atomic cancellation rollback/authorization/unlink and capacity release; no automatic waitlist promotion');
  const race=await Promise.all([11104,11105].map(a=>rpc('register_native_hackathon',a,{p_hackathon_id:uid(11154)})));
  assert.deepEqual(race.map(r=>ok(r).status).sort(),['confirmed','waitlisted']);
  assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(11154)}' AND status='confirmed';`),'1');
  check('simultaneous real HTTP last-seat admissions serialize without oversubscription');
  const member=await admin.query(`SELECT id FROM public.team_members WHERE team_id='${uid(11170)}' AND user_id='${uid(11102)}';`);
  ok(await request(`/team_members?id=eq.${member}`,11101,{project_role:'Owner-authorized'},{method:'PATCH'}),204);
  ok(await request(`/team_members?id=eq.${member}`,11102,{project_role:'Forged'},{method:'PATCH'}),204);
  assert.equal(await admin.query(`SELECT project_role FROM public.team_members WHERE id='${member}';`),'Owner-authorized');
  denied(await request(`/team_members?id=eq.${member}`,11101,{user_id:uid(11109)},{method:'PATCH'}));
  check('actual owner UPDATE policy/column grant permits role edits but denies nonowner/identity changes');
  denied(await rpc('mission20_set_project_role',11102,{p_team_id:uid(11170),p_member_id:member,p_role:'Forged'}));
  assert.equal(ok(await rpc('mission20_set_project_role',11101,{p_team_id:uid(11170),p_member_id:member,p_role:'Developer'})),member);
  await admin.query(`INSERT INTO public.team_invites(id,team_id,invited_user_id,status) VALUES('${uid(11180)}','${uid(11170)}','${uid(11104)}','pending');
    INSERT INTO public.team_join_requests(id,team_id,user_id,status) VALUES('${uid(11181)}','${uid(11170)}','${uid(11105)}','pending');`);
  assert.equal(ok(await rpc('accept_team_invite',11104,{p_invite_id:uid(11180)})),uid(11170));
  assert.equal(ok(await rpc('accept_team_join_request',11101,{p_request_id:uid(11181)})),uid(11170));
  const conversation=ok(await rpc('ensure_team_conversation',11104,{p_team_id:uid(11170)}));assert.equal(typeof conversation,'string');
  assert.equal(ok(await rpc('mission20_remove_team_member',11101,{p_team_id:uid(11170),p_member_id:member})),member);
  assert.equal(await admin.query(`SELECT count(*) FROM public.conversation_participants WHERE conversation_id='${conversation}' AND user_id='${uid(11102)}';`),'0');
  check('owner role policy, invite/request/ensure and member removal execute real conversation/matchmaking hooks');
  // Parent holder forces a real RPC lock_timeout. HTTP errors leave no role or
  // membership change, and concurrent team deletion waits before child DML.
  const holder=session('http_parent_holder');
  try {
   await holder.query(`BEGIN; SELECT id FROM public.teams WHERE id='${uid(11170)}' FOR UPDATE;`);
   const r=await rpc('mission20_delete_team',11100,{p_team_id:uid(11170)});
   assert.equal(r.data.code,'55P03');assert.equal(r.status,500);
   assert.equal(await admin.query(`SELECT count(*) FROM public.teams WHERE id='${uid(11170)}';`),'1');
   await holder.query('ROLLBACK;');
  }finally{await holder.close();}
  check('parent contention yields actual 55P03 without partial team deletion');
  const timed=await rpc('mission20_http_timeout',11103,{});assert.equal(timed.status,500);assert.equal(timed.data.code,'57014');
  assert.equal(await admin.query(`SELECT looking_for_team FROM public.hackathon_registrations WHERE hackathon_id='${uid(11150)}' AND user_id='${uid(11103)}';`),'f');
  check('effective fixture connection statement timeout rolls back an earlier preference write');
  // Real HTTP fault proxy drops the reply only AFTER PostgREST confirms the
  // transaction. No mocked database result or disconnect-cancellation assumption.
  let upstreamCommitted=false,proxyCalls=0,proxyError;
  const fault=http.createServer(async(req,res)=>{
   try {
    proxyCalls++;assert.equal(req.method,'POST');assert.equal(req.url,'/lost-reply');for await(const chunk of req)void chunk;
    const r=await rpc('register_native_hackathon',11106,{p_hackathon_id:uid(11155)});assert.equal(ok(r).status,'confirmed');
    upstreamCommitted=true;res.destroy();
   }catch(error){proxyError=error;res.destroy();}
  });
  await new Promise((resolve,reject)=>{fault.once('error',reject);fault.listen(0,'127.0.0.1',resolve);});
  try {
   await assert.rejects(fetch(`http://127.0.0.1:${fault.address().port}/lost-reply`,{method:'POST',body:'{}',signal:AbortSignal.timeout(9000)}));
   if(proxyError)throw proxyError;assert(upstreamCommitted);assert.equal(proxyCalls,1);
   assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(11155)}';`),'1');
  }finally{fault.closeAllConnections();await new Promise(resolve=>fault.close(resolve));}
  check('lost HTTP response can hide a full committed admission; reconcile without replay');
  const missing=await rpc('mission20_rpc_not_installed',11101,{});assert.equal(missing.status,404);assert.equal(missing.data.code,'PGRST202');
  const stale=await rpc('register_native_hackathon',11107,{p_hackathon_id:uid(11156),p_user_id:uid(11108),p_status:'confirmed'});assert.equal(stale.status,404);
  assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(11156)}';`),'0');
  check('missing RPC and stale/forged signature fail closed with no mutation');
  // Retain confirmed member/registration/conversation CASCADE. The junction
  // CASCADE follows repository DDL and remains a separate live-catalog gate.
  ok(await rpc('register_native_hackathon',11101,{p_hackathon_id:uid(11158),p_team_id:uid(11170)}));
  await admin.query(`INSERT INTO public.team_hackathons(team_id,hackathon_id) VALUES('${uid(11170)}','${uid(11158)}');`);
  const racingMember=await admin.query(`SELECT id FROM public.team_members WHERE team_id='${uid(11170)}' AND user_id='${uid(11104)}';`);
  const deleteHolder=session('http_concurrent_delete_holder');
  try {
   await deleteHolder.query(`BEGIN; SELECT id FROM public.teams WHERE id='${uid(11170)}' FOR UPDATE;`);
   const removing=rpc('mission20_remove_team_member',11101,{p_team_id:uid(11170),p_member_id:racingMember});
   const deleting=rpc('mission20_delete_team',11100,{p_team_id:uid(11170)});
   let bothWaiting=false;for(let n=0;n<40;n++){
    if(Number(await admin.query("SELECT count(*) FROM pg_stat_activity WHERE usename='mission20_http_login' AND wait_event_type='Lock';"))>=2){bothWaiting=true;break;}
    await pause(40);
   }
   assert(bothWaiting,'both HTTP writers must wait on their parent before child DML');await deleteHolder.query('COMMIT;');
   assert.equal(ok(await deleting),uid(11170));const removed=await removing;
   if(removed.status===200)assert.equal(removed.data,racingMember);else{assert.equal(removed.status,500);assert.equal(removed.data.code,'55P03');}
  }finally{await deleteHolder.close();}
  assert.equal(await admin.query(`SELECT (SELECT count(*) FROM public.team_members WHERE team_id='${uid(11170)}')+(SELECT count(*) FROM public.conversations WHERE team_id='${uid(11170)}')+
   (SELECT count(*) FROM public.hackathon_registrations WHERE team_id='${uid(11170)}')+(SELECT count(*) FROM public.team_hackathons WHERE team_id='${uid(11170)}');`),'0');
  denied(await rpc('delete_user_completely',11102,{p_target_user_id:uid(11108)}));
  ok(await rpc('delete_user_completely',11100,{p_target_user_id:uid(11108)}),204);
  assert.equal(await admin.query(`SELECT count(*) FROM auth.users WHERE id='${uid(11108)}';`),'0');
  check('admin team deletion CASCADE and canonical protected user-deletion authorization');
  // Freeze intentionally pauses BOTH native admission and community INSERT.
  run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(SQL,'00-freeze-admission.proposed.sql')]);
  denied(await rpc('register_native_hackathon',11109,{p_hackathon_id:uid(11157)}));
  denied(await request('/hackathon_registrations',11109,{hackathon_id:uid(11151),user_id:uid(11109)}));
  assert.equal(await admin.query("SELECT has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT');"),'f');
  await admin.query(communityGrant);
  denied(await request('/hackathon_registrations',11109,{hackathon_id:uid(11151),user_id:uid(11109)}));
  run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(SQL,'06-unfreeze-admission.proposed.sql')]);
  ok(await request('/hackathon_registrations',11109,{hackathon_id:uid(11151),user_id:uid(11109)}),201);
  check('freeze denies new native AND community rows; reviewed unfreeze restores only final contract');
  // Syntax/privilege-query rehearsal against this fixture, NOT a live catalog
  // snapshot. The dummy ledger is not a Supabase project or migration history.
  await admin.query(`CREATE SCHEMA supabase_migrations;
   CREATE TABLE supabase_migrations.schema_migrations(version text,name text);
   INSERT INTO supabase_migrations.schema_migrations VALUES('fixture-only','not-a-deployed-migration');`);
  const catalog=run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(ROOT,'docs/qa/mission20-c2/release/CATALOG-REQUESTS.select-only.sql')]);
  assert(catalog.includes('fixture-only'));
  passed('SELECT-only catalog request syntax exercised on fixture, including dummy ledger; live parity not inferred');
  console.log(JSON.stringify({postgrest:'16.5',httpChecks,catalogChecks:1,realJwt:true,realPostgrest:true,hostedAuth:false,productionConnections:0}));
 }finally{
  if(child.exitCode===null){child.kill();const ended=await Promise.race([closed.then(()=>true),pause(3000).then(()=>false)]);if(!ended){child.kill('SIGKILL');await closed;}}
  // Files (including the one-off JWT key) live only below ownedRoot; the base
  // runner verifies/stops/deletes that exact root in its finally block.
 }
}
const {qualifyAtomic}=require('./qualify-mission20-atomic-candidate.cjs');
const extension={setup:c2.setup,async qualify(c){await c2.qualify(c);await qualifyHttp(c);await qualifyAtomic(c);}};
if(require.main===module){
 const probe=spawnSync(executable,['--version'],{encoding:'utf8',windowsHide:true,timeout:5000});
 if(probe.error||probe.status!==0||!/^PostgREST 16\.5\b/i.test(((probe.stdout||'')+(probe.stderr||'')).trim())){console.error('BLOCKED: checksum-pinned native PostgREST 16.5 is absent/not runnable; no existing database fallback.');process.exitCode=1;}
 else main(extension).catch(error=>{console.error(error.stack);process.exitCode=1;});
}
