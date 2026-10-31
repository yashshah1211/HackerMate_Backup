/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');const {harness}=require('./ppt-vision-harness.cjs');
const ID='00000000-0000-4000-8000-000000000002',USER='00000000-0000-4000-8000-000000000001';
const NOW=Date.parse('2026-10-31T12:00:00+05:30');
function fixture(options={}) {
  const writes=[],reads=[];
  const event={id:ID,type:'native',status:'approved',archived:false,start_date:'2026-11-01',end_date:'2026-11-03',registration_start:'2026-10-01',registration_end:'2026-10-31',min_team_size:1,max_team_size:4,max_participants:2,...options.event};
  let eventReads=0;
  const client={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:USER,email:'test@example.invalid'}},error:null})},rpc:async()=>({data:[{registration_count:2,confirmed_count:2,waitlisted_count:0}],error:options.countError||null}),from(table){
    const filters=[];let payload;const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle(){return this;},insert(p){payload=p;return this;},then(resolve,reject){return Promise.resolve().then(()=>{
      reads.push({table,filters});if(payload){writes.push({table,payload});return {error:options.writeError||null};}
      if(table==='profiles')return {data:{id:USER,is_banned:false,onboarding_completed:true,...options.profile},error:null};
      if(table==='hackathons'){eventReads++;return {data:options.closeDuringChecks&&eventReads>1?{...event,registration_end:'2026-10-30'}:event,error:options.eventError||null};}
      if(table==='hackathon_registrations')return {data:options.existing||null,error:null};
      if(table==='teams')return {data:{id:'team',owner_id:options.otherOwner?'other':USER},error:null};
      if(table==='team_members')return {count:options.size??2,error:null};
      throw new Error('Unexpected query '+table);
    }).then(resolve,reject);}};return query;
  }};
  const api=harness().load('src/lib/hackathons/nativeRegistration.ts');
  return {client,writes,reads,run:(team=null,review=true,time=NOW)=>api.registerNativeEvent(client,ID,team,review,()=>time)};
}
test('server derives caller and waitlist status; never accepts caller-supplied identity/status',async()=>{const f=fixture();assert.equal((await f.run()).status,'waitlisted');assert.equal(f.writes[0].payload.user_id,USER);assert.equal(f.writes[0].payload.hackathon_id,ID);assert(f.reads.filter(r=>r.table==='hackathons').length>=2);});
for(const [name,options] of [['deadline',{event:{registration_end:'2026-10-30'}}],['not yet',{event:{registration_start:'2026-11-01',registration_end:'2026-11-02'}}],['ended',{event:{start_date:'2026-10-29',end_date:'2026-10-30'}}],['explicit closed',{event:{registration_status:'closed'}}],['suspended',{profile:{is_banned:true}}],['incomplete',{profile:{onboarding_completed:false}}],['signed out',{signedOut:true}],['late closure',{closeDuringChecks:true}],['counts unavailable',{countError:{code:'42501'}}],['external',{event:{type:'external'}}],['unapproved',{event:{status:'pending'}}],['archived',{event:{archived:true}}]])test('server blocks '+name+' before insert',async()=>{const f=fixture(options);await assert.rejects(f.run());assert.equal(f.writes.length,0);});
test('server honors final day, exact offsets, and unknown review consent',async()=>{
  const final=fixture();await final.run(null,true,Date.parse('2026-10-31T23:59:59.999+05:30'));assert.equal(final.writes.length,1);
  const midnight=fixture();await assert.rejects(midnight.run(null,true,Date.parse('2026-11-01T00:00:00+05:30')));assert.equal(midnight.writes.length,0);
  const unknown=fixture({event:{registration_start:null,registration_end:null}});await assert.rejects(unknown.run(null,false));assert.equal(unknown.writes.length,0);await unknown.run();assert.equal(unknown.writes.length,1);
});
test('team ownership and listed solo/team limits are enforced; existing rows survive',async()=>{for(const options of [{otherOwner:true},{size:5},{event:{min_team_size:3}}]){const f=fixture(options);await assert.rejects(f.run('team'));assert.equal(f.writes.length,0);}const f=fixture({existing:{id:'existing',status:'confirmed'}});assert.equal((await f.run()).alreadyRegistered,true);assert.equal(f.writes.length,0);});
test('actual HTTP handler requires bearer auth and validates UUID/body without provider operations',async()=>{
  const f=fixture();const loader=harness({'@supabase/supabase-js':{createClient:()=>f.client},'@/lib/hackathons/nativeRegistration':{registerNativeEvent:(_c,_id,team,review)=>f.run(team,review)}});Object.assign(loader.env,{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture'});
  const route=loader.load('src/app/api/hackathons/[id]/register/route.ts');const context={params:Promise.resolve({id:ID})};
  assert.equal((await route.POST(new Request('http://fixture.invalid',{method:'POST',body:'{}'}),context)).status,401);
  for(const body of [{userId:'other',reviewedUnknown:true},{teamId:'invalid',reviewedUnknown:true},{}])assert.equal((await route.POST(new Request('http://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify(body)}),context)).status,400);
  const response=await route.POST(new Request('http://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({teamId:null,reviewedUnknown:true})}),context);assert.equal(response.status,200);assert.equal((await response.json()).status,'waitlisted');assert.equal(f.writes.length,1);
});

test('client account changes cannot submit a registration for the replacement account',async()=>{let calls=0;const api=harness({}, {fetch:async()=>{calls++;throw Error('unexpected HTTP');}}).load('src/lib/hackathons/registrationClient.ts');await assert.rejects(api.submitNativeRegistration({auth:{getSession:async()=>({data:{session:{access_token:'replacement',user:{id:'replacement-user'}}},error:null})}},ID,null,true,USER),/account changed/);assert.equal(calls,0);});
