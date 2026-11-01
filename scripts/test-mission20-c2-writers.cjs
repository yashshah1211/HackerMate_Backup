/* eslint-disable @typescript-eslint/no-require-imports -- Offline writer contract/security tests. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./ppt-vision-harness.cjs');
const api=harness().load('src/lib/writers.ts');
function fixture(options={}) {
 const calls=[],headers=[],from=[];let actor='actor';
 const client={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'test-token'}},error:null}),
   getUser:async token=>{assert.equal(token,'test-token');return {data:{user:{id:actor}},error:null};}},
  from(table){from.push(table);throw Error('No raw mutation fallback');},
  rpc(name,args){return {setHeader(k,v){headers.push([k,v]);return this;},retry(value){assert.equal(value,false);return this;},abortSignal(signal){assert(signal);return this;},
   then(resolve,reject){calls.push({name,args});return Promise.resolve().then(()=>options.run?options.run():{data:options.data??'member',error:options.error??null}).then(resolve,reject);}};}};
 return {client,calls,headers,from,actor:value=>{actor=value;}};
}
test('member removal pins verified actor token, scopes exact IDs and makes one RPC',async()=>{
 const f=fixture();assert.equal(await api.removeTeamMember(f.client,'team','member','actor'),'member');
 assert.deepEqual(f.calls.map(x=>JSON.parse(JSON.stringify(x))),[{name:'mission20_remove_team_member',args:{p_team_id:'team',p_member_id:'member'}}]);
 assert.deepEqual(f.headers,[['Authorization','Bearer test-token']]);assert.deepEqual(f.from,[]);
});
for(const code of ['55P03','40P01','40001','57014','42501','P0001','PGRST202','42883','23503','23505'])test('controlled SQLSTATE '+code+' never retries or falls back',async()=>{
 const f=fixture({error:{code,message:'private internal SQL detail'}});
 await assert.rejects(api.removeTeamMember(f.client,'team','member','actor'),error=>{
  assert(!error.message.includes('private'));assert(error.status>=400);assert.equal(error.retryable,['55P03','40P01','40001','57014'].includes(code));return true;
 });assert.equal(f.calls.length,1);assert.deepEqual(f.from,[]);
});
for(const data of [null,[],{},'wrong',1])test('malformed member confirmation '+JSON.stringify(data),async()=>{
 const f=fixture({run:()=>({data,error:null})});await assert.rejects(api.removeTeamMember(f.client,'team','member','actor'));assert.equal(f.calls.length,1);
});
test('project role and admin team delete use separate exact typed contracts',async()=>{
 const f=fixture();await api.setProjectRole(f.client,'team','member','Developer','actor');
 assert.equal(f.calls[0].name,'mission20_set_project_role');assert.equal(f.calls[0].args.p_role,'Developer');
 const d=fixture({data:'team'});await api.deleteTeam(d.client,'team','actor');assert.equal(d.calls[0].name,'mission20_delete_team');
});
test('account deletion requires exact void confirmation and never retries a lost response',async()=>{
 const ok=fixture({run:()=>({data:null,error:null})});await api.deleteAccount(ok.client,'target','actor');assert.equal(ok.calls.length,1);
 const lost=fixture({run:()=>{throw Error('lost response');}});await assert.rejects(api.deleteAccount(lost.client,'target','actor'),e=>e.outcomeUnknown&&!e.retryable);assert.equal(lost.calls.length,1);
 const malformed=fixture({data:'ok'});await assert.rejects(api.deleteAccount(malformed.client,'target','actor'));
});
test('cancellation uses atomic RPC with registration/event scope and no raw unlink',async()=>{
 const f=fixture({data:'registration'});await api.cancelRegistration(f.client,'event','registration','actor');
 assert.equal(f.calls[0].name,'mission20_cancel_registration');assert.equal(f.calls[0].args.p_registration_id,'registration');assert.equal(f.calls[0].args.p_event_id,'event');assert.deepEqual(f.from,[]);
});
test('native confirmation accepts only database status and explicit idempotency flag',()=>{
 for(const value of [{status:'confirmed'},{status:['confirmed'],alreadyRegistered:false},{status:'open',alreadyRegistered:false},[],null])assert.throws(()=>api.nativeResult(value));
 assert.equal(api.nativeResult({status:'waitlisted',alreadyRegistered:true}).alreadyRegistered,true);
});
test('ensure conversation requires a UUID rather than a success-like string',async()=>{
 const bad=fixture({data:'success'});await assert.rejects(api.ensureTeamConversation(bad.client,'team','actor'));
 const good=fixture({data:'00000000-0000-4000-8000-000000000001'});assert.equal(await api.ensureTeamConversation(good.client,'team','actor'),'00000000-0000-4000-8000-000000000001');
});
test('account switching before mutation prevents submission',async()=>{
 const f=fixture();f.actor('replacement');await assert.rejects(api.removeTeamMember(f.client,'team','member','actor'));assert.equal(f.calls.length,0);
});
test('account switching during a confirmed request suppresses success without replay',async()=>{
 let finish;const f=fixture({run:()=>new Promise(resolve=>{finish=resolve;})});const result=api.deleteTeam(f.client,'team','actor');
 while(!finish)await new Promise(resolve=>setImmediate(resolve));f.actor('replacement');finish({data:'team',error:null});
 await assert.rejects(result,e=>e.outcomeUnknown);assert.equal(f.calls.length,1);
});
test('one absolute budget covers authentication and prevents late mutation',async()=>{
 const f=fixture();let finish;f.client.auth.getSession=()=>new Promise(resolve=>{finish=resolve;});
 const started=Date.now();await assert.rejects(api.deleteTeam(f.client,'team','actor',new api.WriterBudget(35)),e=>e.status===504&&e.outcomeUnknown);
 assert(Date.now()-started<500);finish({data:{session:{user:{id:'actor'},access_token:'test-token'}},error:null});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,0);
});
test('timeout spans transport and confirmation, aborts signal and never confirms late success',async()=>{
 let finish,signal;const f=fixture({run:()=>new Promise(resolve=>{finish=resolve;})});const original=f.client.rpc;
 f.client.rpc=(...args)=>{const q=original(...args);q.abortSignal=s=>{signal=s;return q;};return q;};
 await assert.rejects(api.deleteTeam(f.client,'team','actor',new api.WriterBudget(35)),e=>e.status===504&&!e.retryable);
 assert(signal.aborted);finish({data:'team',error:null});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,1);
});
test('installed Supabase SDK sends one pinned RPC POST with exact payload and no raw insert',async()=>{
 const {createClient}=require('@supabase/supabase-js');const requests=[];
 const id='00000000-0000-4000-8000-000000000001';
 const client=createClient('http://127.0.0.1:1','fixture-anon',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const url=String(input);requests.push({url,init});
  if(url.endsWith('/auth/v1/user'))return Response.json({id,email:'fixture@example.invalid'});
  assert(url.endsWith('/rest/v1/rpc/register_native_hackathon'));assert.equal(init.method,'POST');
  assert.equal(new Headers(init.headers).get('authorization'),'Bearer test-token');
  const body=JSON.parse(init.body);assert.deepEqual(body,{p_hackathon_id:id,p_team_id:null,p_reviewed_unknown:true});
  return Response.json({status:'waitlisted',alreadyRegistered:false});
 }}});
 const result=api.nativeResult(await api.writerRpc(client,'register_native_hackathon',{p_hackathon_id:id,p_team_id:null,p_reviewed_unknown:true},id,new api.WriterBudget(),'test-token'));
 assert.equal(result.status,'waitlisted');assert.equal(requests.filter(x=>x.init.method==='POST').length,1);
});
test('SDK failure has one mutation attempt even for retry-like gateway responses',async()=>{
 const {createClient}=require('@supabase/supabase-js');let posts=0;const id='00000000-0000-4000-8000-000000000001';
 const client=createClient('http://127.0.0.1:1','fixture-anon',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{
  if(String(input).endsWith('/auth/v1/user'))return Response.json({id,email:'fixture@example.invalid'});
  posts++;return Response.json({message:'private gateway failure'},{status:520});
 }}});
 await assert.rejects(api.writerRpc(client,'mission20_delete_team',{p_team_id:id},id,new api.WriterBudget(),'test-token'),e=>e.outcomeUnknown&&!e.retryable);
 assert.equal(posts,1);
});
test('C2 preserves active migrations/config and models the confirmed production grants/policies',()=>{
 const fs=require('node:fs'),cp=require('node:child_process');
 const protectedChanges=cp.execFileSync('git',['diff','ac618ea003055c9c03495344234e32a1ed8dd07a','--name-only','--','supabase','package.json','package-lock.json','.env','.env.local'],{encoding:'utf8'});
 assert.equal(protectedChanges.trim(),'');
 const fixtureSQL=fs.readFileSync('docs/qa/mission20-c1/sql/09-writer-fixture.review.sql','utf8');
 assert.match(fixtureSQL,/USING\(owner_id=auth.uid\(\) OR public.is_admin\(auth.uid\(\)\)\)/);
 assert.match(fixtureSQL,/CREATE POLICY team_members_update[\s\S]*USING\(public.is_team_owner\(team_id\)\)/);
 assert.match(fixtureSQL,/GRANT UPDATE\(project_role\) ON public.team_members/);
 const native=fs.readFileSync('src/lib/hackathons/nativeRegistration.ts','utf8');assert(!/\.insert\(/.test(native));assert(native.includes('register_native_hackathon'));
});
test('actual native HTTP handler budgets route/body parsing before any writer starts',async()=>{
 let writes=0;
 const loader=harness({'@/lib/writers':{...api,WriterBudget:class extends api.WriterBudget{constructor(){super(30);}}},
  '@/lib/hackathons/nativeRegistration':{RegistrationError:class extends Error{},registerNativeEvent:async()=>{writes++;throw Error('Unexpected writer');}},
  '@supabase/supabase-js':{createClient(){throw Error('Unexpected client');}}});
 const route=loader.load('src/app/api/hackathons/[id]/register/route.ts');
 const response=await route.POST(new Request('http://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{}'}),{params:new Promise(()=>{})});
 assert.equal(response.status,504);const body=await response.json();assert.equal(body.outcomeUnknown,true);assert.equal(body.retryable,false);assert.equal(writes,0);
 const stalled={headers:new Headers({Authorization:'Bearer fixture'}),signal:new AbortController().signal,json:()=>new Promise(()=>{})};
 const second=await route.POST(stalled,{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000001'})});assert.equal(second.status,504);assert.equal(writes,0);
});
