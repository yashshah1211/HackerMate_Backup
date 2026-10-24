/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-route authority and migration contracts. */
const assert = require('node:assert/strict');
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
test('permission migration leaves transaction ownership to the verified CLI runner',()=>{
  const sql=migration.replace(/--[^\n]*/g,'');
  const outsideBody=sql.replace(/DO \$migration\$[\s\S]*?\$migration\$;/g,'DO_BODY;');
  assert.equal((outsideBody.match(/DO_BODY;/g)||[]).length,1);
  assert(!/\b(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION)\s*;/i.test(outsideBody));
  assert(!migration.includes('-- pg-delta: transaction=false'));
  assert(!/\b(?:VACUUM|ALTER\s+SYSTEM|CLUSTER|(?:CREATE|DROP|REINDEX)[^;]*\bCONCURRENTLY)\b/i.test(outsideBody));
  assert.match(outsideBody,/SET LOCAL lock_timeout = '3s';\s*SET LOCAL statement_timeout = '15s';\s*LOCK TABLE public\.challenge_submissions, public\.team_ppt_evaluations,\s*public\.user_pitch_evaluations IN ACCESS EXCLUSIVE MODE;\s*DO_BODY;\s*$/);
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
