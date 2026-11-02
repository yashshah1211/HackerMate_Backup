/* eslint-disable @typescript-eslint/no-require-imports -- Installed SDK; in-memory Auth/PostgREST only. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js');
const {harness}=require('./ppt-vision-harness.cjs');
const ORIGIN='https://mission20-auth.invalid',ANON='synthetic-anonymous-key';
const EVENT='00000000-0000-4000-8000-000000009901',TEAM='00000000-0000-4000-8000-000000009902';
const A='00000000-0000-4000-8000-000000009903',B='00000000-0000-4000-8000-000000009904';
const TOKEN_A='synthetic-bearer-a',TOKEN_B='synthetic-bearer-b';

function fixture(options={}) {
 const requests=[],unexpected=[];let authReads=0,eventReads=0;
 const token=options.token||TOKEN_A,actor=token===TOKEN_B?B:A;
 const iso=days=>new Date(Date.now()+days*86_400_000).toISOString();
 const event={id:EVENT,name:'Synthetic native admission',type:'native',status:'approved',archived:false,
  start_date:iso(7),end_date:iso(8),registration_start:iso(-2),registration_end:iso(2),
  min_team_size:options.team?2:1,max_team_size:options.team?2:4,max_participants:1};
 const authError=()=>Response.json({code:'bad_jwt',message:'private synthetic Auth rejection'},{status:401});
 const transport=async(input,init={})=>{
  const url=new URL(input.url||String(input)),method=init.method||input.method||'GET';
  const headers=new Headers(init.headers||input.headers),body=init.body?JSON.parse(init.body):null;
  requests.push({url,method,headers,body});
  try {
   assert.equal(url.origin,ORIGIN,'no existing/remote service may be reached');
   assert.equal(headers.get('apikey'),ANON);
   assert.equal(headers.get('authorization'),`Bearer ${token}`,'all reads and mutations keep the explicit caller token');
   if(url.pathname==='/auth/v1/user') {
    assert.equal(method,'GET');authReads++;
    if(options.invalidAuth||(options.revokedOnRecheck&&authReads===2))return authError();
    const id=options.switchIdentity&&authReads===2?B:actor;
    return Response.json({id,email:'synthetic-member@example.invalid',aud:'authenticated',role:'authenticated',
     is_anonymous:!!options.anonymous,user_metadata:{id:actor===A?B:A,role:'admin'}});
   }
   if(url.pathname==='/rest/v1/rpc/register_native_hackathon') {
    assert.equal(method,'POST');
    assert.deepEqual(body,{p_hackathon_id:EVENT,p_team_id:options.team?TEAM:null,p_reviewed_unknown:true});
    assert.equal(headers.get('content-profile'),'public');
    return Response.json(options.result||{status:'confirmed',alreadyRegistered:false});
   }
   assert.equal(method,'GET','no raw registration INSERT or other mutation is allowed');
   if(url.pathname==='/rest/v1/profiles') {
    assert.equal(url.searchParams.get('select'),'id,is_banned,onboarding_completed');
    assert.equal(url.searchParams.get('id'),`eq.${actor}`);
    return Response.json([{id:options.wrongProfile?B:actor,is_banned:false,onboarding_completed:true}]);
   }
   if(url.pathname==='/rest/v1/hackathons') {
    assert.equal(url.searchParams.get('id'),`eq.${EVENT}`);
    assert.equal(url.searchParams.get('status'),'eq.approved');assert.equal(url.searchParams.get('archived'),'eq.false');
    assert.equal(url.searchParams.get('select'),loader.load('src/lib/hackathons/publicBrowsing.ts').PUBLIC_EVENT_COLUMNS);
    eventReads++;
    return Response.json([{...event,...(options.closed||(options.closeDuringPreflight&&eventReads===2)?{registration_end:iso(-1)}:{})}]);
   }
   if(url.pathname==='/rest/v1/hackathon_registrations') {
    assert.equal(url.searchParams.get('select'),'id,status');
    assert.equal(url.searchParams.get('user_id'),`eq.${actor}`);assert.equal(url.searchParams.get('hackathon_id'),`eq.${EVENT}`);
    return Response.json([]);
   }
   if(url.pathname==='/rest/v1/teams') {
    assert(options.team);assert.equal(url.searchParams.get('select'),'id,owner_id');assert.equal(url.searchParams.get('id'),`eq.${TEAM}`);
    return Response.json([{id:TEAM,owner_id:options.wrongOwner?B:actor}]);
   }
   if(url.pathname==='/rest/v1/team_members') {
    assert(options.team);assert.equal(url.searchParams.get('select'),'user_id');assert.equal(url.searchParams.get('team_id'),`eq.${TEAM}`);
    assert.equal(headers.get('prefer'),'count=exact');
    // Legacy roster deliberately omits the owner; owner UNION member has size two.
    return Response.json([{user_id:B}],{headers:{'content-range':'0-0/1'}});
   }
   throw Error('Unexpected SDK endpoint '+url.pathname);
  }catch(error){unexpected.push(error.message);throw error;}
 };
 // No function/client/module mocks: only the network boundary is synthetic.
 const loader=harness({}, {fetch:transport});
 Object.assign(loader.env,{NEXT_PUBLIC_SUPABASE_URL:ORIGIN,NEXT_PUBLIC_SUPABASE_ANON_KEY:ANON});
 const route=loader.load('src/app/api/hackathons/[id]/register/route.ts');
 return {requests,transport,actor,token,
  client:(customHeader=true)=>createClient(ORIGIN,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   global:{...(customHeader?{headers:{Authorization:`Bearer ${token}`}}:{}),fetch:transport}}),
  async run(authorization=`Bearer ${token}`,payload={teamId:options.team?TEAM:null,reviewedUnknown:true}) {
   const headers={'Content-Type':'application/json'};if(authorization!==null)headers.Authorization=authorization;
   const response=await route.POST(new Request('https://application.invalid/api/hackathons/'+EVENT+'/register',
    {method:'POST',headers,body:JSON.stringify(payload)}),{params:Promise.resolve({id:EVENT})});
   assert.deepEqual(unexpected,[],'SDK transport invariants must never be swallowed');
   return {status:response.status,body:await response.json(),headers:response.headers};
  },
  mutations:()=>requests.filter(r=>r.method!=='GET'),
  assertClean:()=>assert.deepEqual(unexpected,[])};
}

test('installed SDK: sessionless custom-header server client verifies default and explicit bearer without storing a session',async()=>{
 const f=fixture(),client=f.client();assert.equal((await client.auth.getSession()).data.session,null);
 assert.equal((await client.auth.getUser()).data.user.id,A);
 assert.equal((await client.auth.getUser(TOKEN_A)).data.user.id,A);
 assert.equal((await client.auth.getSession()).data.session,null);
 assert.equal(f.requests.length,2);assert.equal(f.mutations().length,0);f.assertClean();
});
test('installed SDK: sessionless client without a bearer cannot infer an identity',async()=>{
 const f=fixture(),client=f.client(false),result=await client.auth.getUser();
 assert.equal(result.data.user,null);assert.equal(result.error.name,'AuthSessionMissingError');assert.equal(f.requests.length,0);
 assert.equal((await client.auth.getUser(TOKEN_A)).data.user.id,A);assert.equal(f.mutations().length,0);f.assertClean();
});
for(const token of [TOKEN_A,TOKEN_B])test('actual route/preflight/pinned RPC binds Auth identity for '+token,async()=>{
 const f=fixture({token});const result=await f.run();assert.equal(result.status,200);
 assert.deepEqual(result.body,{status:'confirmed',alreadyRegistered:false});assert.equal(result.headers.get('cache-control'),'no-store');
 assert.deepEqual(f.requests.map(r=>r.url.pathname),['/auth/v1/user','/rest/v1/profiles','/rest/v1/hackathons',
  '/rest/v1/hackathon_registrations','/rest/v1/hackathons','/auth/v1/user','/rest/v1/rpc/register_native_hackathon']);
 assert.equal(f.mutations().length,1);assert(!Object.hasOwn(f.mutations()[0].body,'user_id'));
});
test('actual route and installed SDK retain owner-inclusive legacy roster preflight',async()=>{
 const f=fixture({team:true});assert.equal((await f.run()).status,200);assert.equal(f.mutations().length,1);
 assert.equal(f.requests.filter(r=>r.url.pathname==='/rest/v1/team_members').length,1);
});
for(const authorization of [null,'Basic synthetic','Bearer','Bearer two tokens'])test('native HTTP rejects missing/malformed bearer '+authorization,async()=>{
 const f=fixture();assert.equal((await f.run(authorization)).status,401);assert.equal(f.requests.length,0);assert.equal(f.mutations().length,0);
});
for(const [name,options,reads] of [['invalid token',{token:'synthetic-invalid-bearer',invalidAuth:true},1],['anonymous Auth user',{anonymous:true},1],
 ['revoked token before pinned RPC',{revokedOnRecheck:true},2],['Auth identity changes before pinned RPC',{switchIdentity:true},2]])
 test('native HTTP authentication failure has no RPC mutation: '+name,async()=>{
  const f=fixture(options),result=await f.run();assert.equal(result.status,401);assert.equal(f.mutations().length,0);
  assert.equal(f.requests.filter(r=>r.url.pathname==='/auth/v1/user').length,reads);assert(!JSON.stringify(result.body).includes('private'));
  if(reads===1)assert.equal(f.requests.length,1,'initial authentication must precede all database reads');
 });
for(const [name,options,status] of [['closed registration',{closed:true},409],['closure during preflight',{closeDuringPreflight:true},409],
 ['unowned team',{team:true,wrongOwner:true},403],['profile identity mismatch',{wrongProfile:true},403]])
 test('real SDK native preflight blocks mutation: '+name,async()=>{
  const f=fixture(options);assert.equal((await f.run()).status,status);assert.equal(f.mutations().length,0);
 });
test('native HTTP rejects caller-supplied identity/status before Auth or PostgREST',async()=>{
 const f=fixture();const result=await f.run(undefined,{teamId:null,reviewedUnknown:true,user_id:B,status:'confirmed'});
 assert.equal(result.status,400);assert.equal(f.requests.length,0);assert.equal(f.mutations().length,0);
});
for(const result of [{status:'waitlisted',alreadyRegistered:false},{status:'confirmed',alreadyRegistered:true}])
 test('full native HTTP flow preserves authoritative RPC status '+JSON.stringify(result),async()=>{
  const f=fixture({result}),response=await f.run();assert.equal(response.status,200);assert.deepEqual(response.body,result);assert.equal(f.mutations().length,1);
 });
