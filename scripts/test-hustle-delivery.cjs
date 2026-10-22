/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic Auth/provider adapters; real handlers, browser and disposable PostgreSQL. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ts=require('typescript'); const {NextRequest,NextResponse}=require('next/server'); const {chromium}=require('@playwright/test');
const {deliveryFixture}=require('./hustle-delivery-fixture.cjs'); const {ROOT,IDS,quote,freePort}=require('./hustle-phase2-local-db.cjs');
const API='/api/partners/hustle-carnival/phase-2',BASE='/partners/hustle-carnival/phase-2';
const CLOCK=Date.parse('2026-10-22T14:00:00Z'),SCHEDULE='2026-10-23T04:15:00.000Z';
const q=v=>quote(v==null?null:typeof v==='object'?JSON.stringify(v):v);
const names={hustle_phase2_delivery_prepare:['p_actor','p_batch','p_digest','p_count','p_scheduled','p_entries'],hustle_phase2_delivery_claim:['p_actor','p_team','p_hash','p_payload'],hustle_phase2_delivery_finish:['p_actor','p_team','p_status','p_provider','p_code'],hustle_phase2_delivery_report:['p_actor'],hustle_phase2_limit:['p_key','p_max'],hustle_phase2_snapshot:[],hustle_phase2_has_active_session:[],can_access_partner_event:['p_hackathon_id'],has_partner_admin_access:[]};
async function main(){const db=await deliveryFixture();let server,browser;const results=[],logs=[],sent=[],rpcCalls=[];let providerMode=200,used=0,cleanup=false;
const check=(v,label)=>{assert(v,label);results.push({pass:true,label})};
const out=path.join(ROOT,'test-results/hustle-delivery');fs.mkdirSync(out,{recursive:true});
try{
 const migrations=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261022141142_hustle_round2_delivery.sql'),'utf8');
 check(db.sql("SELECT count(*) FROM pg_proc WHERE proname LIKE 'hustle_phase2_delivery_%' AND prosecdef AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=\"\"']")==='4','four trusted locked-path service RPCs');
 for(const role of ['anon','authenticated','service_role'])for(const table of ['hustle_phase2_deliveries','hustle_phase2_delivery_events']){assert.throws(()=>db.sql(`SET ROLE ${role};SELECT * FROM ${table}`),/permission denied/);check(true,role+' denied raw '+table)}
 for(const role of ['anon','authenticated'])for(const fn of ["hustle_phase2_delivery_prepare('"+IDS.admin+"',gen_random_uuid(),'a',1,now(),'[]')","hustle_phase2_delivery_finish('"+IDS.admin+"',gen_random_uuid(),'unknown',NULL,NULL)","hustle_phase2_delivery_report('"+IDS.admin+"')","hustle_phase2_delivery_claim('"+IDS.admin+"',gen_random_uuid(),'a','b')"]){assert.throws(()=>db.sql(`SET ROLE ${role};SELECT ${fn}`),/permission denied/);check(true,role+' denied delivery RPC')}
 check(db.sql("SELECT count(*) FROM pg_class WHERE relname IN ('hustle_phase2_deliveries','hustle_phase2_delivery_events') AND relrowsecurity AND relowner='postgres'::regrole")==='2','both new tables have trusted ownership and RLS');
 assert.throws(()=>db.sql('SET ROLE service_role;'+migrations),/Trusted postgres/);check(true,'wrong migration executor denied');
 assert.throws(()=>db.sql('SET ROLE postgres;'+migrations),/expected trusted Phase 2 baseline/);check(true,'duplicate migration refused atomically');
 const rows=Array.from({length:42},(_,i)=>({external_team_id:'SYNTH-LAUNCH-'+String(i+1).padStart(3,'0'),team_name:'Synthetic Solo '+(i+1),leader_name:'Synthetic Leader '+(i+1),leader_email:'leader'+(i+1)+'@example.invalid',leader_whatsapp:null,second_member_name:null,second_member_email:null}));
 const batch=JSON.parse(db.sql(`SET ROLE service_role;SELECT hustle_phase2_import('${IDS.admin}','${'a'.repeat(64)}',${q(rows)})`).split(/\r?\n/).at(-1)).batchId;
 const manifest={batches:[{batchId:batch,digest:'a'.repeat(64),count:42}],scheduledAt:SCHEDULE};
 const env={NODE_ENV:'test',HUSTLE_PHASE2_ENABLED:'true',HUSTLE_PHASE2_RELEASE_APPROVED:'true',HUSTLE_PHASE2_LOCAL_FIXTURE:'true',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9999',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',HUSTLE_PHASE2_DELIVERY_ENABLED:'true',HUSTLE_PHASE2_DELIVERY_RELEASE_APPROVED:'true',HUSTLE_PHASE2_LAUNCH_MANIFEST:JSON.stringify(manifest),HUSTLE_PHASE2_DELIVERY_TOKEN_SECRET:'d'.repeat(64),RESEND_API_KEY:'synthetic-provider',RESEND_FROM_EMAIL:'HackerMate <test@example.invalid>'};
 // Only the disposable fixture substitutes clock_timestamp, never production SQL/source.
 db.sql(`CREATE TABLE fixture_clock(value timestamptz); INSERT INTO fixture_clock VALUES('2026-10-22T14:00:00Z'); GRANT SELECT ON fixture_clock TO postgres,service_role;CREATE FUNCTION fixture_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$SELECT value FROM public.fixture_clock$$`);
 for(const fn of db.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE proname LIKE 'hustle_phase2_%' AND prosrc LIKE '%clock_timestamp()%'").split(/\r?\n/)){const definition=db.sql(`SELECT pg_get_functiondef('${fn}'::regprocedure)`);db.sql(definition.replaceAll('clock_timestamp()','public.fixture_now()'))}
 const signatures=Object.fromEntries(db.sql("SELECT proname||'|'||array_to_string(proargnames,',') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'hustle_phase2_%' AND pronargs>0").split(/\r?\n/).map(s=>{const [name,args]=s.split('|');return [name,args.split(',')]}));Object.assign(names,signatures);
 async function provider(url,options={}){
  check(url.startsWith('https://api.resend.com/'),'provider transport has fixed HTTPS destination');
  if(url.endsWith('/usage'))return Response.json({emails:{daily:{limit:100,used},monthly:{limit:3000,used}},rate_limit:{limit:10,duration:'1000ms'}});
  if(url.endsWith('/domains'))return Response.json({data:[{id:'synthetic-domain',name:'example.invalid'}]});
  if(url.endsWith('/domains/synthetic-domain'))return Response.json({status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false});
  assert(url.endsWith('/emails')); const body=JSON.parse(options.body);sent.push({body,key:options.headers['Idempotency-Key']});
  if(providerMode==='timeout')throw Error('synthetic interruption');
  used++;return Response.json(providerMode===200?{id:crypto.randomUUID()}:providerMode==='malformed'?{}:{error:'synthetic rejection'},{status:typeof providerMode==='number'?providerMode:200});
 }
 function harness(identity='admin',patch={}){
  const actor=identity==='revoked'?IDS.admin:IDS[identity];const cache=new Map();const testEnv={...env,...patch};
  class FixtureDate extends Date{constructor(...args){super(...(args.length?args:[CLOCK]))}static now(){return CLOCK}}
  function client(key){return {auth:{getUser:async()=>({data:{user:actor?{id:actor,email:identity+'@example.invalid',email_confirmed_at:'2026-01-01',is_anonymous:false}:null},error:null})},from(table){let columns='role,is_banned';return{select(value){columns=value;return this},eq(){return this},async maybeSingle(){return {data:actor?JSON.parse(db.sql(`SELECT row_to_json(p) FROM (SELECT ${columns} FROM ${table==='hackathons'?'hackathons':'profiles'} WHERE id='${table==='hackathons'?'0da43cba-90dc-449c-a126-a2fc8be8a379':actor}') p`)):null,error:null}}}},async rpc(name,args={}){
   rpcCalls.push(name);const role=key==='synthetic-service'?'service_role':'authenticated';const claims={sub:actor,role:'authenticated',session_id:actor?'82000000'+actor.slice(8):null};
   if(name==='hustle_phase2_has_active_session'&&identity==='revoked')return{data:false,error:null};
   const keys=names[name]||[];try{const result=await db.asyncSql(`SET ROLE ${role}; SET request.jwt.claim.sub=${q(actor||'')};SET request.jwt.claims=${q(claims)}; SELECT to_jsonb(public.${name}(${keys.map(k=>typeof args[k]==='number'?args[k]:q(args[k])).join(',')}))`);return{data:JSON.parse(result.split(/\r?\n/).at(-1)),error:null}}catch(error){console.error('Fixture SQL failure',name,error.message);return{data:null,error:{code:/permission denied|Access denied/.test(error.message)?'42501':'P0001',message:'Synthetic operation rejected'}}}
  }}}
  function load(file){if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(path.join(ROOT,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
   vm.runInNewContext(code,{module:m,exports:m.exports,Buffer,URL,URLSearchParams,Response,AbortSignal,Date:FixtureDate,console:{error:(...a)=>logs.push(a)},setTimeout,clearTimeout,process:{env:testEnv},fetch:provider,require(name){if(name==='server-only')return{};if(name==='next/server')return{NextRequest,NextResponse};if(name==='@supabase/supabase-js')return{createClient:(_,key)=>client(key)};if(name==='@supabase/ssr')return{createServerClient:()=>client('synthetic-anon')};if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.posix.join(path.posix.dirname(file),name)+'.ts');if(name==='node:crypto')return require(name);throw Error('Unmocked '+name)}},{filename:file});return m.exports}
  return {server:load('src/lib/hustle-phase2/server.ts'),pages:load('src/lib/hustle-phase2/pages.ts'),load};
 }
 const req=(action,data={},headers={})=>new NextRequest('http://localhost:4000'+API+'/'+action,{method:'POST',headers:{origin:'http://localhost:4000','content-type':'application/json',...headers},body:JSON.stringify(data)});
 const admin=harness(); const post=async(action,data,instance=admin,headers={})=>instance.server.handleApi(req(action,data,headers),action);
 for(const identity of ['none','unrelated','organizer','banned','revoked']){const r=await post('launch',{batchId:batch,confirm:'ACTIVATE AND PREPARE'},harness(identity));check([401,403].includes(r.status),identity+' denied administrative launch')}
 check((await post('launch',{},admin,{origin:'https://attacker.invalid'})).status===403,'cross-origin launch denied');
 check((await post('launch',{},harness('admin',{VERCEL_ENV:'preview',NODE_ENV:'production'}))).status===503,'hosted Preview cannot reach launch');
 check((await post('launch',{},harness('admin',{HUSTLE_PHASE2_IMPORT_ENABLED:'true'}))).status===503,'mixed import/participant modes fail closed');
 check((await post('launch',{},harness('admin',{HUSTLE_PHASE2_ENABLED:'false'}))).status===503,'disabled launch returns 503');
 {const r=await post('launch',{},harness('admin',{HUSTLE_PHASE2_DELIVERY_RELEASE_APPROVED:'false'}));check(r.status===503,'dispatch gate OFF fails closed; status='+r.status+' body='+await r.text())}
 check((await post('launch',{batchId:crypto.randomUUID(),confirm:'ACTIVATE AND PREPARE'})).status===503,'unapproved batch denied');
 check(db.sql('SELECT count(*) FROM hustle_phase2_invites')==='0','all denied requests leave invitations empty');
 // Wrong count/digest and invalid entries roll back activation and every invitation.
 for(const [digest,count]of [['b'.repeat(64),42],['a'.repeat(64),41]]){assert.throws(()=>db.sql(`SET ROLE service_role;SELECT hustle_phase2_delivery_prepare('${IDS.admin}','${batch}','${digest}',${count},'${SCHEDULE}','[]')`),/Approved batch mismatch/);check(true,'scope mismatch rejected atomically')}
 check(db.sql('SELECT count(*) FROM hustle_phase2_batches WHERE activated_at IS NOT NULL')==='0','invalid preparation never activates');
 const core=admin.load('src/lib/hustle-phase2/delivery-core.ts');
 for(const mode of [429,400,500,408,409,'timeout','malformed']){providerMode=mode;const r=await core.submitInvitation('synthetic',core.deliveryMessage({id:crypto.randomUUID(),team_name:'synthetic',leader_email:'leader@example.invalid'},'A'.repeat(43),SCHEDULE,env.RESEND_FROM_EMAIL),crypto.randomUUID());check(r.status===([429,400].includes(mode)?'rejected':'unknown'),'provider '+mode+' classified without retry')}
 providerMode=200;sent.length=0;used=0;
 for(const email of ['bad','name@example.invalid\r\nBcc:x@y.invalid',' Name@example.invalid']){assert.throws(()=>core.deliveryMessage({team_name:'Synthetic',leader_email:email},'A'.repeat(43),SCHEDULE,env.RESEND_FROM_EMAIL),/destination/);check(true,'malformed recipient rejected before SQL/provider')}
 used=59;check((await post('launch',{batchId:batch,confirm:'ACTIVATE AND PREPARE'})).status===503,'insufficient free quota blocks activation');used=0;
 db.sql(`CREATE FUNCTION fixture_fail_prepare() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF (SELECT count(*) FROM public.hustle_phase2_deliveries)>=42 THEN RAISE EXCEPTION 'synthetic late preparation failure';END IF; RETURN NEW; END$$;CREATE TRIGGER fixture_fail BEFORE INSERT ON hustle_phase2_delivery_events FOR EACH ROW EXECUTE FUNCTION fixture_fail_prepare()`);
 check((await post('launch',{batchId:batch,confirm:'ACTIVATE AND PREPARE'})).status===409,'late prepare failure aborts entire transaction');
 check(db.sql('SELECT count(*) FROM hustle_phase2_invites')==='0'&&db.sql('SELECT count(*) FROM hustle_phase2_deliveries')==='0'&&db.sql('SELECT count(*) FROM hustle_phase2_batches WHERE activated_at IS NOT NULL')==='0','no partial activation/invitations/ledger after late SQL error');
 db.sql('DROP TRIGGER fixture_fail ON hustle_phase2_delivery_events; DROP FUNCTION fixture_fail_prepare()');

 check((await post('launch',{batchId:batch,confirm:'ACTIVATE AND PREPARE'})).status===200,'42-team launch succeeds');
 check(db.sql('SELECT count(*) FROM hustle_phase2_invites')==='42','42 hashed invitations created atomically');
 check(db.sql('SELECT count(*) FROM hustle_phase2_deliveries')==='42','42 durable prepared deliveries');
 check((await post('launch',{batchId:batch,confirm:'ACTIVATE AND PREPARE'})).status===200,'launch replay idempotent');
 check(db.sql("SELECT count(*) FROM hustle_phase2_audit WHERE action='activate'")==='1','activation audited exactly once');
 check(db.sql("SELECT count(*) FROM hustle_phase2_delivery_events WHERE action='prepared'")==='42','preparation audited once per team');
 check((await post('dispatch',{batchId:batch,confirm:'SCHEDULE LEADER INVITATIONS'},harness('admin',{HUSTLE_PHASE2_DELIVERY_TOKEN_SECRET:'e'.repeat(64)}))).status===409&&sent.length===0,'secret/payload drift blocks dispatch without reissue');
 // Real browser renders the actual standalone organizer and drains real SQL via handlers.
 const port=await freePort();server=http.createServer(async(request,response)=>{try{const url='http://localhost:'+port+request.url;let body='';for await(const chunk of request)body+=chunk;const r=new NextRequest(url,{method:request.method,headers:request.headers,...(request.method==='POST'?{body}:{})});const result=request.url.startsWith(API)?await admin.server.handleApi(r,request.url.split('/').at(-1)):await admin.pages.handlePage(r,['organizer']);response.writeHead(result.status,Object.fromEntries(result.headers));response.end(await result.text())}catch{response.writeHead(500);response.end('Synthetic runtime error')}});await new Promise(r=>server.listen(port,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('http://localhost:'+port+BASE+'/organizer');
 check(await page.getByRole('button',{name:'Schedule approved leader invitations'}).count()===1,'mobile organizer exposes one batch dispatch control');
 await page.getByRole('button',{name:'Schedule approved leader invitations'}).click();await page.locator('#notice').filter({hasText:'Scheduling finished.'}).waitFor({timeout:120000});
 check(sent.length===42,'browser schedules all 42 intended leader messages');check(new Set(sent.map(s=>s.key)).size===42,'unique stable provider idempotency keys');check(new Set(sent.map(s=>s.body.to[0])).size===42,'one unique leader recipient per team');
 check(sent.every(s=>s.body.to.length===1&&s.body.to[0].endsWith('@example.invalid')&&s.body.scheduled_at===SCHEDULE),'no member recipients; exact approved schedule');
 check(sent.every(s=>/\/invite#[A-Za-z0-9_-]{43}/.test(s.body.text)&&!s.body.text.includes('?token=')),'tokens only in invitation fragments');
 check(errors.length===0,'organizer browser has no JavaScript errors');
 check(db.sql("SELECT count(*) FROM hustle_phase2_deliveries WHERE status='accepted'")==='42','42 provider acceptances persisted, not inbox-delivery claims');
 check((await post('dispatch',{batchId:batch,confirm:'SCHEDULE LEADER INVITATIONS'})).status===200&&sent.length===42,'completed dispatch replay sends nothing');
 check(db.sql('SELECT count(*) FROM hustle_phase2_delivery_events')==='126','append-only prepared/attempted/accepted audit entries');
 // Concurrency and unknown-persistence fault isolation use a second dedicated batch.
 const team0=db.sql('SELECT team_id FROM hustle_phase2_deliveries ORDER BY team_id LIMIT 1');const d0=JSON.parse(db.sql(`SELECT row_to_json(d) FROM hustle_phase2_deliveries d WHERE team_id='${team0}'`));
 const claim=`SET ROLE service_role;SELECT hustle_phase2_delivery_claim('${IDS.admin}','${team0}','${d0.token_hash}','${d0.payload_hash}')`;
 const replays=await Promise.all([db.asyncSql(claim),db.asyncSql(claim)]);check(replays.every(s=>s.split(/\r?\n/).at(-1)==='false'),'concurrent completed-worker replays cannot claim');
 db.sql(`UPDATE hustle_phase2_deliveries SET status='prepared',attempted_at=NULL,finished_at=NULL,provider_id=NULL WHERE team_id='${team0}'`);
 const race=await Promise.all([db.asyncSql(claim),db.asyncSql(claim)]);check(race.filter(s=>s.split(/\r?\n/).at(-1)!=='false').length===1,'concurrent initial claims produce one winner');
 check((await post('dispatch',{batchId:batch,confirm:'SCHEDULE LEADER INVITATIONS'})).status===503&&sent.length===42,'crash after reservation blocks automatic replay with no provider call');
 db.sql(`SET ROLE service_role;SELECT hustle_phase2_delivery_finish('${IDS.admin}','${team0}','unknown',NULL,NULL)`);
 check((await post('dispatch',{batchId:batch,confirm:'SCHEDULE LEADER INVITATIONS'})).status===503&&sent.length===42,'unknown outcome never retried or reissued');
 assert.throws(()=>db.sql(`SET ROLE service_role;SELECT hustle_phase2_delivery_finish('${IDS.admin}','${team0}','accepted',gen_random_uuid(),200)`),/no overwrite/);check(true,'terminal outcome cannot be overwritten');

 db.sql(`UPDATE hustle_phase2_deliveries SET status='prepared',attempted_at=NULL,finished_at=NULL,provider_id=NULL WHERE team_id='${team0}'; UPDATE hustle_phase2_invites SET revoked_at=public.fixture_now() WHERE team_id='${team0}'`);
 assert.throws(()=>db.sql(claim),/no longer eligible/);check(true,'revoked invitation cannot be dispatched');
 db.sql(`UPDATE hustle_phase2_invites SET revoked_at=NULL,expires_at=public.fixture_now()-interval '1 second' WHERE team_id='${team0}'`);
 assert.throws(()=>db.sql(claim),/no longer eligible/);check(true,'expired invitation cannot be dispatched');
 db.sql(`UPDATE hustle_phase2_invites SET expires_at='2026-10-23T17:30:00Z' WHERE team_id='${team0}'; UPDATE fixture_clock SET value='2026-10-23T17:30:00Z'`);
 assert.throws(()=>db.sql(claim),/no longer eligible/);check(true,'exact SQL cutoff prevents any new dispatch');

 const report=JSON.parse(db.sql(`SET ROLE service_role;SELECT hustle_phase2_delivery_report('${IDS.admin}')`).split(/\r?\n/).at(-1));check(report.counts.window==='closed'&&report.counts.pending===42&&report.counts.declined===0,'automatic SQL closure preserves pending separately from declines');
 const token=sent[0].body.text.match(/\/invite#([A-Za-z0-9_-]{43})/)[1];check(!JSON.stringify(logs).includes(token),'logs do not contain invitation token');
 check(db.sql("SELECT count(*) FROM information_schema.columns WHERE table_name IN ('hustle_phase2_deliveries','hustle_phase2_delivery_events') AND column_name IN ('token','html','text','leader_email')")==='0','delivery persistence contains no plaintext tokens, bodies or contact copies');
 check(fs.readFileSync(path.join(ROOT,'src/lib/hustle-phase2/server.ts'),'utf8').includes('ACCOUNT_ONBOARDING_RELEASE_APPROVED = false'),'production participant source approval remains OFF');
 console.log(results.length+'/'+results.length+' delivery checks passed. Synthetic provider/Auth; real disposable SQL and browser.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await db.close();cleanup=true;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,cleanup,provider:'synthetic; no real sends',auth:'synthetic adapter; not hosted acceptance'},null,2));console.log('Disposable database, browser and HTTP server cleaned up.')}}
main().catch(error=>{console.error(error);process.exitCode=1});
