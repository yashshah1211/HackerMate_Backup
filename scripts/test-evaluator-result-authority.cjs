/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-route authority and migration contracts. */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { NextRequest } = require('next/server');
const { harness, ROOT } = require('./ppt-vision-harness.cjs');
const pg = require('./test-evaluator-result-authority-pg17.cjs');
const USER='00000000-0000-4000-8000-000000000001', OTHER='00000000-0000-4000-8000-000000000002';
const ID='00000000-0000-4000-8000-000000000003', TEAM='00000000-0000-4000-8000-000000000004';
const PRIVATE='do-not-log-private-fixture-details';
const normalize=value=>JSON.parse(JSON.stringify(value));
function setup(options={}) {
  const state={queries:[],writes:[],logs:[],user:USER,owner:USER,member:false,profile:{id:USER,is_banned:false,role:'user'},...options};
  state.rows={user_pitch_evaluations:[{id:ID,user_id:USER,team_id:null,ps_title:'Synthetic idea',total_score:80,grade:'Strong',evaluation_result:{proof:'fixture'}}],
    team_ppt_evaluations:[{id:ID,team_id:TEAM,submitted_by:USER,status:'completed',total_score:80,ai_feedback:{analysis:{mode:'text_only'}}}],
    challenge_submissions:[{id:ID,challenge_id:ID,user_id:USER,team_id:TEAM,ppt_url:'https://example.invalid/deck',status:'completed',total_score:80,ai_raw_feedback:{analysis:{mode:'text_only'}}}]};
  const client={auth:{async getUser(){return{data:{user:state.user?{id:state.user}:null},error:state.authError||null}}},from(table){
    let columns,operation='select',payload;const filters=[];
    async function execute(single=false){
      const q={table,columns,operation,payload,filters};state.queries.push(q);
      if(state.fail===table)return{data:null,error:{code:'42501',message:PRIVATE}};
      let rows;
      if(table==='profiles')rows=state.profile?[state.profile]:[];
      else if(table==='teams')rows=[{id:TEAM,name:'Synthetic team',owner_id:state.owner}];
      else if(table==='team_members')rows=state.member?[{id:ID,team_id:TEAM,user_id:USER}]:[];
      else if(table==='weekly_challenges')rows=[{id:ID,slug:'fixture',title:'Synthetic challenge'}];
      else {assert(Object.hasOwn(state.rows,table));rows=state.rows[table];}
      rows=rows.filter(row=>filters.every(([key,value])=>row[key]===value));
      if(operation!=='select'){
        state.writes.push(q);
        if(operation==='update')rows.forEach(row=>Object.assign(row,payload));
        if(operation==='delete')state.rows[table]=state.rows[table].filter(row=>!rows.includes(row));
      }
      const projected=columns?rows.map(row=>Object.fromEntries(columns.split(',').map(c=>c.trim()).filter(c=>Object.hasOwn(row,c)).map(c=>[c,row[c]]))):[];
      if(state.lostSave&&operation==='update')return{data:null,error:null};
      return{data:single?(projected[0]||null):projected,error:null};
    }
    const q={select(c){columns=c;return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},abortSignal(signal){assert(signal instanceof AbortSignal);return q},
      update(value){operation='update';payload=value;return q},delete(){operation='delete';return q},maybeSingle(){return execute(true)},then(resolve,reject){return execute().then(resolve,reject)}};return q;
  }};
  const loader=harness({'@supabase/supabase-js':{createClient(url,key){assert.equal(url,'https://fixture.invalid');assert.equal(key,'offline-service');return client}}},
    {console:Object.fromEntries(['log','warn','error'].map(level=>[level,(...args)=>state.logs.push(args)]))});
  Object.assign(loader.env,{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'offline-service'});
  async function call(file,method='GET',body,params,query=''){
    const req=new NextRequest('https://fixture.invalid/api/test'+query,{method,headers:{authorization:'Bearer fixture','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const response=await loader.load(file)[method](req,{params:Promise.resolve(params||{})});return{status:response.status,body:await response.json()};
  }
  return{state,loader,call};
}
const history='src/app/api/evaluator/history/route.ts';
test('trusted API attachment changes only team_id despite forged body fields',async()=>{
  const f=setup(),before=normalize(f.state.rows.user_pitch_evaluations[0]);
  const result=await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM,total_score:100,status:'completed',evaluation_result:{forged:true}});
  assert.equal(result.status,200);assert.deepEqual(normalize(f.state.writes[0].payload),{team_id:TEAM});
  assert.deepEqual(normalize(f.state.rows.user_pitch_evaluations[0]),{...before,team_id:TEAM});
});
test('destination member retains attachment access',async()=>{
  const f=setup({owner:OTHER,member:true});assert.equal((await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM})).status,200);
});
for(const scenario of ['banned','missing-profile','nonmember','foreign-evaluation','membership-error','team-error','evaluation-error','bad-id'])test('attachment fails closed: '+scenario,async()=>{
  const f=setup();
  if(scenario==='banned')f.state.profile.is_banned=true;
  if(scenario==='missing-profile')f.state.profile=null;
  if(scenario==='nonmember')f.state.owner=OTHER;
  if(scenario==='foreign-evaluation')f.state.rows.user_pitch_evaluations[0].user_id=OTHER;
  if(scenario==='membership-error')f.state.fail='team_members';
  if(scenario==='team-error')f.state.fail='teams';
  if(scenario==='evaluation-error')f.state.fail='user_pitch_evaluations';
  const result=await f.call(history,'PATCH',{evaluationId:scenario==='bad-id'?'invalid':ID,teamId:TEAM});
  assert([400,403,503].includes(result.status));assert.equal(f.state.writes.length,0);assert(!JSON.stringify({body:result.body,logs:f.state.logs}).includes(PRIVATE));
  if(scenario.endsWith('error'))assert(f.state.logs.length>0);
});
test('lost attachment save never reports confirmed success',async()=>{
  const f=setup({lostSave:true}),result=await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM});assert.equal(result.status,409);assert.equal(result.body.code,'persistence_uncertain');
});
test('existing suspended-account ownership read/delete semantics are preserved',async()=>{
  const f=setup();f.state.profile.is_banned=true;
  assert.equal((await f.call(history)).body.history.length,1);
  assert.equal((await f.call(history,'DELETE',undefined,{},'?id='+ID)).status,200);assert.equal(f.state.rows.user_pitch_evaluations.length,0);
});
test('Idea read/delete remains scoped to verified owner',async()=>{
  const f=setup({user:OTHER});assert.equal((await f.call(history)).body.history.length,0);
  await f.call(history,'DELETE',undefined,{},'?id='+ID);assert.equal(f.state.rows.user_pitch_evaluations.length,1);
});
test('generation closed preserves history, authorized attachment and delete without score changes',async()=>{
  const f=setup();delete f.loader.env.EVALUATOR_GENERATION_ENABLED;
  const before=normalize(f.state.rows.user_pitch_evaluations[0]);
  assert.equal((await f.call(history)).body.history.length,1);
  assert.equal((await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM,evaluation_result:{forged:true}})).status,200);
  assert.deepEqual(normalize(f.state.rows.user_pitch_evaluations[0]),{...before,team_id:TEAM});
  assert.equal((await f.call(history,'DELETE',undefined,{},'?id='+ID)).status,200);
  assert.equal(f.state.rows.user_pitch_evaluations.length,0);
});
for(const scenario of ['banned','nonmember','foreign-evaluation'])test('generation closed does not relax attachment '+scenario,async()=>{
  const f=setup();delete f.loader.env.EVALUATOR_GENERATION_ENABLED;
  if(scenario==='banned')f.state.profile.is_banned=true;
  if(scenario==='nonmember')f.state.owner=OTHER;
  if(scenario==='foreign-evaluation')f.state.rows.user_pitch_evaluations[0].user_id=OTHER;
  assert.equal((await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM})).status,403);assert.equal(f.state.writes.length,0);
});
test('generation closed preserves authorized PPT and Challenge read/delete routes',async()=>{
  const f=setup();f.loader.env.EVALUATOR_GENERATION_ENABLED='false';
  const ppt='src/app/api/teams/[id]/ppt-evaluations/route.ts',challenge='src/app/api/challenges/[slug]/submissions/[id]/route.ts';
  assert.equal((await f.call(ppt,'GET',undefined,{id:TEAM})).body.evaluations.length,1);
  assert.equal((await f.call(challenge,'GET',undefined,{slug:'fixture',id:ID})).body.submission.total_score,80);
  assert.equal((await f.call(ppt,'DELETE',undefined,{id:TEAM},'?evalId='+ID)).status,200);
  assert.equal((await f.call(challenge,'DELETE',undefined,{slug:'fixture',id:ID})).status,200);
});
test('PPT service read and authorized delete remain functional',async()=>{
  const f=setup(),route='src/app/api/teams/[id]/ppt-evaluations/route.ts';
  assert.equal((await f.call(route,'GET',undefined,{id:TEAM})).body.evaluations.length,1);
  assert.equal((await f.call(route,'DELETE',undefined,{id:TEAM},'?evalId='+ID)).status,200);assert.equal(f.state.rows.team_ppt_evaluations.length,0);
});
test('Challenge service detail and author delete remain functional',async()=>{
  const f=setup(),route='src/app/api/challenges/[slug]/submissions/[id]/route.ts';
  assert.equal((await f.call(route,'GET',undefined,{slug:'fixture',id:ID})).body.submission.total_score,80);
  assert.equal((await f.call(route,'DELETE',undefined,{slug:'fixture',id:ID})).status,200);assert.equal(f.state.rows.challenge_submissions.length,0);
});
test('profile cancellation preserves the deadline outcome',async()=>{
  const abort=new AbortController();const loader=harness();let reads=0;
  const admin={auth:{getUser:async()=>({data:{user:{id:USER}},error:null})},from(){reads++;return{select(){return this},eq(){return this},abortSignal(){return this},maybeSingle(){abort.abort();return Promise.resolve({data:{id:USER,is_banned:false},error:null})}}}};
  await assert.rejects(loader.load('src/lib/evaluator/evaluationContract.ts').verifiedEvaluationActor(admin,new Request('https://fixture.invalid',{headers:{authorization:'Bearer fixture'}}),{deadlineAt:Date.now()+5000,signal:abort.signal,attempts:0}),e=>e.code==='deadline_exceeded');assert.equal(reads,1);
});
test('signal-aware profile timeout retains deadline instead of database unavailability',async()=>{
  const loader=harness();let reads=0;
  const admin={auth:{getUser:async()=>({data:{user:{id:USER}},error:null})},from(){let signal;return{select(){return this},eq(){return this},abortSignal(value){signal=value;return this},maybeSingle(){reads++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('fixture abort','AbortError')),{once:true}))}}}};
  await assert.rejects(loader.load('src/lib/evaluator/evaluationContract.ts').verifiedEvaluationActor(admin,new Request('https://fixture.invalid',{headers:{authorization:'Bearer fixture'}}),{deadlineAt:Date.now()+60,attempts:0}),e=>e.code==='deadline_exceeded');assert.equal(reads,1);
});
for(const phase of ['auth','profile'])test('late '+phase+' response cannot replace the expired deadline outcome',async()=>{
  let now=1000;class Clock extends Date{static now(){return now}}
  const loader=harness({}, {Date:Clock});
  const admin={auth:{async getUser(){await Promise.resolve();if(phase==='auth'){now=1100;return{data:{user:null},error:{status:503}}}return{data:{user:{id:USER}},error:null}}},from(){return{select(){return this},eq(){return this},abortSignal(){return this},async maybeSingle(){await Promise.resolve();now=1100;return{data:{id:USER,is_banned:true},error:null}}}}};
  await assert.rejects(loader.load('src/lib/evaluator/evaluationContract.ts').verifiedEvaluationActor(admin,new Request('https://fixture.invalid',{headers:{authorization:'Bearer fixture'}}),{deadlineAt:1050,attempts:0}),e=>e.code==='deadline_exceeded');
});
const migration=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql'),'utf8');
test('permission/assertion suffix matches the independently reviewed SHA-256',()=>{
  const sql=migration.replace(/\r\n/g,'\n');
  const starts=[...sql.matchAll(/^[ \t]*IF current_user\b/gm)];
  const ends=[...sql.matchAll(/^\$migration\$;/gm)];
  assert.equal(starts.length,1);assert.equal(ends.length,1);
  assert(ends[0].index>starts[0].index);
  // Preserve first-line indentation; exclude the newline after the closing semicolon.
  const suffix=sql.slice(starts[0].index,ends[0].index+ends[0][0].length);
  assert.equal(createHash('sha256').update(suffix,'utf8').digest('hex'),
    'fbdd5df7d3be36d14da069bddd21747fa9c0371fd2acc6ba50926ca7cc12b7d4');
});
test('permission migration keeps only the statement-timeout hint outside the CLI-managed DO',()=>{
  const sql=migration.replace(/--[^\n]*/g,'');
  const outsideBody=sql.replace(/DO \$migration\$[\s\S]*?\$migration\$;/g,'DO_BODY;');
  assert.equal((outsideBody.match(/DO_BODY;/g)||[]).length,1);
  assert(!/\b(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION)\s*;/i.test(outsideBody));
  assert(!/^\s*(?:COMMIT|ROLLBACK|ABORT|START\s+TRANSACTION|PREPARE\s+TRANSACTION|END\s+(?:WORK|TRANSACTION))\b/im.test(sql),'DO must not end the transaction before migration history');
  assert(!migration.includes('-- pg-delta: transaction=false'));
  assert(!/\b(?:VACUUM|ALTER\s+SYSTEM|CLUSTER|(?:CREATE|DROP|REINDEX)[^;]*\bCONCURRENTLY)\b/i.test(outsideBody));
  assert.match(outsideBody,/^\s*SET LOCAL statement_timeout = '15s';\s*DO_BODY;\s*$/);
});
test('permission migration bounds effective local lock waits before acquiring locks',()=>{
  const sql=migration.replace(/--[^\n]*/g,'');
  const body=sql.match(/DO \$migration\$([\s\S]*?)\$migration\$;/)?.[1];
  assert(body);
  assert.match(body,/PERFORM pg_catalog\.set_config\('lock_timeout', '3s', true\);/);
  assert.match(body,/lock_timeout_value := pg_catalog\.current_setting\('lock_timeout'\)::interval;/);
  assert.match(body,/IF lock_timeout_value IS NULL OR lock_timeout_value <= interval '0 seconds'\s+OR lock_timeout_value > interval '3 seconds' THEN\s+RAISE EXCEPTION 'Mission05: bounded lock timeout unavailable';\s+END IF;/);
  const order=["PERFORM pg_catalog.set_config('lock_timeout', '3s', true)","lock_timeout_value :=",'IF lock_timeout_value IS NULL',"RAISE EXCEPTION 'Mission05: bounded lock timeout unavailable'",'LOCK TABLE public.challenge_submissions'];
  const positions=order.map(value=>body.indexOf(value));
  assert(positions.every((position,i)=>position>=0&&(i===0||position>positions[i-1])));
  assert(!/EXCEPTION\s+WHEN/i.test(body),'timeout or lock failures must not be swallowed');
});
test('permission migration locks before resolving result OIDs or changing permissions',()=>{
  const sql=migration.replace(/--[^\n]*/g,'');
  assert.match(sql,/DECLARE\s+targets oid\[\];\s+public_view oid;/);
  assert.match(sql,/LOCK TABLE public\.challenge_submissions, public\.team_ppt_evaluations,\s*public\.user_pitch_evaluations IN ACCESS EXCLUSIVE MODE;/);
  const lockEnd=sql.indexOf('IN ACCESS EXCLUSIVE MODE;')+'IN ACCESS EXCLUSIVE MODE;'.length;
  assert(!sql.slice(0,lockEnd).includes('::regclass'),'no target OID resolution before locks');
  const order=['LOCK TABLE public.challenge_submissions','targets := ARRAY[',"public_view := 'public.team_ppt_evaluations_public'::regclass::oid",'IF current_user',"RAISE EXCEPTION 'Mission05: unexpected function/view/rule dependency'",'INTO preserved_policies','REVOKE INSERT, UPDATE, TRUNCATE, TRIGGER'];
  const positions=order.map(value=>sql.indexOf(value));
  assert(positions.every((position,i)=>position>=0&&(i===0||position>positions[i-1])));
});
test('permission migration contract closes base, column and view writers without SELECT/DELETE changes',()=>{
  const sql=migration.replace(/--[^\n]*/g,'');
  assert.match(sql,/REVOKE INSERT, UPDATE, TRUNCATE, TRIGGER ON TABLE public.challenge_submissions,\s*public.team_ppt_evaluations, public.user_pitch_evaluations FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/REVOKE UPDATE \(team_id\) ON TABLE public.user_pitch_evaluations FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/REVOKE INSERT, UPDATE ON TABLE public.team_ppt_evaluations_public FROM PUBLIC, anon, authenticated/);
  assert(!/\bGRANT\s|REVOKE\s+(?:ALL|SELECT|DELETE)|(?:CREATE|ALTER|DROP)\s+VIEW|^\s*(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE public\.)/im.test(sql));
  assert.equal((sql.match(/DROP POLICY IF EXISTS/g)||[]).length,6);assert.match(sql,/has_column_privilege/);assert.match(sql,/SELECT\/DELETE policy changed/);
});
test('PG17 runner refuses production, absent approval and connection overrides before connection',()=>{
  const env={HM_EVALUATOR_PG17_APPROVAL:'APPROVED_NONPRODUCTION_PERMISSION_CHECK',HM_EVALUATOR_PG17_PROJECT:'qusshzpkvwzfhdcmsosp',PGHOST:'db.qusshzpkvwzfhdcmsosp.supabase.co',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',GEMINI_API_KEY:PRIVATE};
  assert.throws(()=>pg.configuration({}),/approval/);assert.throws(()=>pg.configuration({...env,HM_EVALUATOR_PG17_PROJECT:'rhryjrbebfrrfhtyyzbs'}),/non-production/);
  for(const key of ['PGSERVICE','PGSERVICEFILE','PGHOSTADDR','PGOPTIONS'])assert.throws(()=>pg.configuration({...env,[key]:'override'}),/overrides/);
  assert.equal(pg.configuration(env).GEMINI_API_KEY,undefined);assert.equal(pg.configuration(env).PGSSLMODE,'verify-full');
  let calls=0;assert.throws(()=>pg.run({},()=>{calls++}),/approval/);assert.equal(calls,0);
});
test('PG17 runner performs only nonexecuting write plans in a read-only rolled-back session',()=>{
  const sql=pg.permissionSql();assert(sql.startsWith('BEGIN READ ONLY;'));assert(sql.endsWith('ROLLBACK;'));assert(!/EXPLAIN\s+ANALYZE|CREATE\s|GRANT\s|REVOKE\s|ALTER\s/i.test(sql));
  assert(sql.includes('170000 AND 179999'));assert(sql.includes('SET LOCAL ROLE authenticated'));assert(sql.includes('SET LOCAL ROLE service_role'));
  assert(sql.includes('relrowsecurity'));assert(sql.includes('security_invoker=true'));assert(sql.includes("polcmd NOT IN ('r','d')"));assert(sql.includes('rolbypassrls'));
  assert(sql.includes('insufficient_privilege'));assert(sql.includes('ON CONFLICT'));assert(sql.includes('team_ppt_evaluations_public'));assert(sql.includes('has_column_privilege'));
});

// R3: source contracts only. None of these tests execute SQL or emulate PostgreSQL
// ACL/RLS decisions. Each negative control alters only an in-memory string.
const m1Contracts = {
  owner: /IF current_user <> 'postgres' AND NOT \(SELECT rolsuper FROM pg_roles WHERE rolname = current_user\) THEN/,
  inheritance: /FROM pg_auth_members WHERE member IN\s*\('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole\)/,
  rls: /relkind <> 'r' OR NOT relrowsecurity OR pg_get_userbyid\(relowner\) <> 'postgres'/,
  invoker: /'security_invoker=true' = ANY\(coalesce\(reloptions, ARRAY\[\]::text\[\]\)\)/,
  grantor: /a\.grantor <> c\.relowner/,
  columnDrift: /g\.privilege_type IN \('INSERT', 'UPDATE'\) AND NOT[\s\S]*?g\.grantee = 'authenticated'::regrole[\s\S]*?NOT g\.is_grantable/,
  policyDrift: /p\.polcmd NOT IN \('r', 'd'\) AND NOT \(/,
  dependencies: /p\.prosrc ~ '\(challenge_submissions\|team_ppt_evaluations\|user_pitch_evaluations\)'/,
  tableDenial: /IF has_table_privilege\(client_role, relation\.oid, 'INSERT'\) OR has_table_privilege\(client_role, relation\.oid, 'UPDATE'\) THEN/,
  allColumns: /FOR column_row IN SELECT attnum FROM pg_attribute WHERE attrelid = relation\.oid AND attnum > 0 AND NOT attisdropped LOOP/,
  columnDenial: /IF has_column_privilege\(client_role, relation\.oid, column_row\.attnum, 'INSERT'\) OR\s*has_column_privilege\(client_role, relation\.oid, column_row\.attnum, 'UPDATE'\) THEN/,
  destructiveDenial: /has_table_privilege\(client_role, relation\.oid, 'TRUNCATE'\) OR\s*has_table_privilege\(client_role, relation\.oid, 'TRIGGER'\)/,
  service: /IF NOT has_table_privilege\('service_role', relation\.oid, 'SELECT'\) OR\s*NOT has_table_privilege\('service_role', relation\.oid, 'INSERT'\) OR\s*NOT has_table_privilege\('service_role', relation\.oid, 'UPDATE'\) OR\s*NOT has_table_privilege\('service_role', relation\.oid, 'DELETE'\) THEN/,
  serviceBypass: /IF NOT \(SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'\) OR/,
  preservedPolicies: /IF current_snapshot IS DISTINCT FROM preserved_policies THEN/,
  preservedAccessView: /IF current_snapshot IS DISTINCT FROM preserved_access OR pg_get_viewdef\(public_view, true\) IS DISTINCT FROM preserved_view THEN/,
};
function assertM1Source(sql) {
  const code = sql.replace(/--[^\n]*/g, '');
  for(const [name,pattern] of Object.entries(m1Contracts))assert.match(code,pattern,name);
  assert(!/EXCEPTION\s+WHEN/i.test(code),'No suppressed migration assertion');
  assert.equal((code.match(/RAISE EXCEPTION 'Mission05:/g)||[]).length,15);
  assert.match(code,/FOREACH client_role IN ARRAY ARRAY\['anon', 'authenticated'\] LOOP/);
  assert.match(code,/FOR relation IN SELECT oid FROM pg_class WHERE oid = ANY\(targets\) OR oid = public_view LOOP/);
}
test('R3 full M1 artifact matches frozen LF checksum',()=>assert.equal(createHash('sha256').update(migration.replace(/\r\n/g,'\n')).digest('hex'),'35336ee3c43dddb513dc92ce235c17b4ee3d6811eff18eade9b7b7a0c86ff5a3'));
test('R3 source verified: M1 effective privilege assertions cover base/view, both clients and live columns',()=>assertM1Source(migration));
for(const [name,pattern] of Object.entries(m1Contracts))test('R3 negative source control detects removal of '+name,()=>{
  const altered = migration.replace(pattern,'FALSE /* in-memory negative control */');
  assert.notEqual(altered,migration);assert.throws(()=>assertM1Source(altered));
});
test('R3 negative source control rejects a swallowed assertion',()=>{
  const altered=migration.replace(/END;\r?\n\$migration\$;/,"EXCEPTION WHEN OTHERS THEN NULL;\nEND;\n$migration$;");
  assert.notEqual(altered,migration);assert.throws(()=>assertM1Source(altered));
});

// Definitions for later approval only. Dynamic pg_attribute enumeration is
// essential: a hardcoded column list would miss future/unknown granted columns.
// EXPLAIN (without ANALYZE) checks planning, never actual persistence or row RLS.
function clientDenialDefinitions(role,table) {
  assert(['anon','authenticated'].includes(role));
  assert(['challenge_submissions','team_ppt_evaluations','user_pitch_evaluations','team_ppt_evaluations_public'].includes(table));
  const jsonColumn=table==='challenge_submissions'?'ai_raw_feedback':table==='user_pitch_evaluations'?'evaluation_result':'ai_feedback';
  const spoof=JSON.stringify({serverVerified:true,usedAiEngine:true,analysis:{mode:'visual_text',pdfReceived:true,requestId:ID,revision:{source:'verified-server'}}}).replaceAll("'","''");
  const statements=[
    `INSERT INTO public.${table} DEFAULT VALUES`,
    `INSERT INTO public.${table}(id,total_score,grade,${jsonColumn}) VALUES ('${ID}',100,'forged','${spoof}'::jsonb)`,
    `INSERT INTO public.${table}(id) VALUES ('${ID}') ON CONFLICT(id) DO UPDATE SET total_score=100`,
    `UPDATE public.${table} SET total_score=100,grade='forged',${jsonColumn}='${spoof}'::jsonb WHERE false`,
    `UPDATE public.${table} SET team_id='${TEAM}' WHERE false`,
  ];
  if(table!=='team_ppt_evaluations_public')statements.push(`TRUNCATE public.${table}`);
  const perColumn=`SELECT a.attname, a.attnum,
    has_column_privilege('${role}',a.attrelid,a.attnum,'INSERT') AS can_insert,
    has_column_privilege('${role}',a.attrelid,a.attnum,'UPDATE') AS can_update,
    format('EXPLAIN INSERT INTO public.${table} (%I) VALUES (NULL)',a.attname) AS insert_plan,
    format('EXPLAIN UPDATE public.${table} SET %I=%I WHERE false',a.attname,a.attname) AS update_plan
    FROM pg_attribute a WHERE a.attrelid='public.${table}'::regclass AND a.attnum>0 AND NOT a.attisdropped`;
  return {role,table,expectedSqlstate:'42501',databaseExecuted:false,
    status:'SQL case defined but not executed',statements,perColumn,
    // Future runner must establish real role/JWT context; membership/admin claims
    // must not bypass ACL. Any error other than permission denial is a failure.
    actorContexts:['anonymous','owner','member','outsider','admin','banned'],
    limitations:['Plan-only INSERT/UPDATE are not persistence or row-visibility proof',
      'TRUNCATE requires separately approved rolled-back fixture execution',
      'View upsert/updatability must be resolved on actual catalog; unsupported view operation is not a denial pass']};
}
for(const role of ['anon','authenticated'])for(const table of ['challenge_submissions','team_ppt_evaluations','user_pitch_evaluations','team_ppt_evaluations_public'])test('R3 SQL case definition only: '+role+' '+table,()=>{
  const cases=clientDenialDefinitions(role,table);
  assert.equal(cases.databaseExecuted,false);assert.equal(cases.expectedSqlstate,'42501');
  assert.match(cases.perColumn,/attnum>0 AND NOT a.attisdropped/);assert.match(cases.perColumn,/has_column_privilege/);
  assert.match(cases.perColumn,/EXPLAIN INSERT/);assert.match(cases.perColumn,/EXPLAIN UPDATE/);
  assert(cases.statements.some(sql=>sql.includes('ON CONFLICT')));assert(cases.statements.some(sql=>sql.includes('team_id=')));
  assert(cases.statements.some(sql=>sql.includes('serverVerified')&&sql.includes('pdfReceived')));
  assert(!cases.statements.some(sql=>/EXPLAIN ANALYZE/.test(sql)));
});
test('R3 denial definitions reject unsafe identifiers instead of interpolating them',()=>{
  assert.throws(()=>clientDenialDefinitions('postgres','challenge_submissions'));assert.throws(()=>clientDenialDefinitions('anon','challenge_submissions; SELECT 1'));
});
for(const method of ['GET','DELETE','PATCH'])test('R3 mocked history rejects missing/invalid identity for '+method,async()=>{
  for(const options of [{user:null},{authError:{status:401}}]){
    const f=setup(options),result=await f.call(history,method,method==='PATCH'?{evaluationId:ID,teamId:TEAM}:undefined,{},method==='DELETE'?'?id='+ID:'');
    assert.equal(result.status,401);assert.equal(f.state.writes.length,0);
  }
});
test('R3 mocked admin cannot attach to an unrelated destination team',async()=>{
  const f=setup({owner:OTHER,profile:{id:USER,is_banned:false,role:'admin'}});
  assert.equal((await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM})).status,403);assert.equal(f.state.writes.length,0);
});
for(const role of ['user','admin'])test('R3 mocked banned '+role+' cannot attach forged score/provenance',async()=>{
  const f=setup({profile:{id:USER,is_banned:true,role}}),before=normalize(f.state.rows);
  assert.equal((await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM,total_score:100,serverVerified:true})).status,403);
  assert.deepEqual(normalize(f.state.rows),before);assert.equal(f.state.writes.length,0);
});
test('R3 mocked confirmed attachment preserves forged persisted JSON without certifying it',async()=>{
  const f=setup(),row=f.state.rows.user_pitch_evaluations[0];
  row.evaluation_result={serverVerified:true,usedAiEngine:true,evaluationMetadata:{requestId:ID,revision:{source:'verified-server'}}};
  const before=normalize(row);const result=await f.call(history,'PATCH',{evaluationId:ID,teamId:TEAM,evaluation_result:{serverVerified:true},total_score:100});
  assert.equal(result.status,200);assert.deepEqual(normalize(row),{...before,team_id:TEAM});
  assert.deepEqual(normalize(f.state.writes[0].payload),{team_id:TEAM});
  const display=harness().load('src/lib/ppt/analysisMetadata.ts').getAnalysisDisplay(row.evaluation_result);
  assert.equal(display.label,'Historical provenance unverified');
});
