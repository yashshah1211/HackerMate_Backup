/* eslint-disable @typescript-eslint/no-require-imports -- Offline, synthetic Auth/Google responses only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');
const BASE = '/partners/hustle-carnival/phase-2';
const uid = '80000000-0000-4000-8000-000000000001';
const sid = '81000000-0000-4000-8000-000000000001';
function load(file, overrides, globals = {}) {
 const mod = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>Object.hasOwn(overrides,n)?overrides[n]:n==='server-only'?{}:require(n),URL,AbortSignal,console:{error:()=>{}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9999',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'}},...globals});
 return mod.exports;
}
function proof(patch={}) {
 const calls=[];
 const session={access_token:'synthetic-session',provider_token:'synthetic-google-credential',user:{id:uid,email:'controlled@example.invalid',is_anonymous:false,email_confirmed_at:'2026-01-01',identities:[{provider:'google',identity_data:{sub:'synthetic-sub'}}]}};
 const auth={auth:{getClaims:async token=>{calls.push({kind:'claims',token});return {data:{claims:{sub:uid,role:'authenticated',session_id:sid,...patch.claims}},error:patch.claimError||null};}}};
 const loaded=load('src/lib/hustle-phase2/google-session.ts',{'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({kind:'rpc',name,args});return {data:patch.registered??true,error:patch.rpcError||null};}})}},{fetch:async(url,options)=>{calls.push({kind:'google',url,options});if(patch.networkError)throw Error('synthetic-secret-error');return {ok:patch.ok??true,text:async()=>patch.raw??JSON.stringify({sub:'synthetic-sub',email:'controlled@example.invalid',email_verified:true,...patch.info})};}});
 return {session,auth,calls,run:()=>loaded.attestGoogleSession(session,auth)};
}
test('Google credential from trusted PKCE exchange binds exact verified user and session',async()=>{
 const p=proof();assert.equal(await p.run(),true);
 const google=p.calls.find(c=>c.kind==='google');assert.equal(google.url,'https://openidconnect.googleapis.com/v1/userinfo');assert.equal(google.options.redirect,'error');assert.equal(google.options.cache,'no-store');assert.equal(google.options.headers.Authorization,'Bearer synthetic-google-credential');
 const rpc=p.calls.find(c=>c.kind==='rpc');assert.equal(rpc.name,'hustle_phase2_attest_google_session');assert.deepEqual({...rpc.args},{p_user:uid,p_session:sid});assert(!JSON.stringify(rpc).includes('credential'));
});
test('deferred GitHub credential fails Google verification even with linked Google identity',async()=>{
 const p=proof({ok:false});p.session.provider_token='synthetic-github-credential';p.session.user.identities.push({provider:'github',identity_data:{sub:'github-sub'}});
 assert.equal(await p.run(),false);assert(!p.calls.some(c=>c.kind==='rpc'));
});
for(const [label,patch] of [
 ['Google subject mismatch',{info:{sub:'another-sub'}}],['unverified Google email',{info:{email_verified:false}}],['Google email mismatch',{info:{email:'other@example.invalid'}}],
 ['missing email',{info:{email:null}}],['invalid JSON',{raw:'not-json'}],['oversize response',{raw:'x'.repeat(8193)}],['Google unavailable',{networkError:true}],
 ['JWT user mismatch',{claims:{sub:'another-user'}}],['service JWT',{claims:{role:'service_role'}}],['missing session',{claims:{session_id:null}}],['malformed session',{claims:{session_id:'bad'}}],['invalid JWT',{claimError:{code:'bad_jwt'}}],
 ['database failure',{rpcError:{code:'42501'}}],['unexpected proof response',{registered:false}],
]) test(label+' fails closed',async()=>{assert.equal(await proof(patch).run(),false);});
for(const [label,change] of [
 ['no provider credential',s=>delete s.provider_token],['no Google identity',s=>s.user.identities=[]],['anonymous user',s=>s.user.is_anonymous=true],['unconfirmed user',s=>s.user.email_confirmed_at=null],
 ['untrusted metadata only',s=>{s.user.identities=[];s.user.user_metadata={provider:'google'};}],
])test(label+' cannot create proof',async()=>{const p=proof();change(p.session);assert.equal(await p.run(),false);assert(!p.calls.some(c=>c.kind==='rpc'));});
function callback({enabled=true,next=BASE,accepted=true,complete=true,session=true}={}){
 const calls=[];
 const user={id:uid};
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{onboarding_completed:complete},error:null})};
 const route=load('src/app/auth/callback/route.ts',{
  '@supabase/ssr':{createServerClient:(_u,_k,c)=>({auth:{exchangeCodeForSession:async()=>{calls.push('exchange');c.cookies.setAll([{name:'synthetic-auth',value:'synthetic',options:{httpOnly:true,path:'/'}}]);return {data:{user,session:session?{user}:null},error:null};}},from:()=>query})},
  '@/lib/auth/returnPath':{safeAuthReturnPath:p=>p||'/dashboard'},'@/lib/auth/callbackOrigin':{trustedCallbackOrigin:()=> 'http://127.0.0.1:9998'},
  '@/lib/hustle-phase2/core':{BASE},'@/lib/hustle-phase2/server':{enabled:()=>enabled},
  '@/lib/hustle-phase2/google-session':{attestGoogleSession:async()=>{calls.push('attest');return accepted;}},
 });
 return {calls,run:()=>route.GET(new NextRequest('http://127.0.0.1:9998/auth/callback?code=synthetic&next='+encodeURIComponent(next)))};
}
test('ordinary HackerMate GitHub login is unchanged outside Round 2',async()=>{const c=callback({next:'/dashboard',accepted:false});const r=await c.run();assert.equal(r.status,307);assert(!c.calls.includes('attest'));assert.match(r.headers.get('location'),/dashboard$/);});
test('HARD-OFF callback never requests Google verification or a proof write',async()=>{const c=callback({enabled:false,accepted:false});assert.equal((await c.run()).status,307);assert(!c.calls.includes('attest'));});
test('Round 2 callback rejects GitHub/unknown provenance without exposing a credential',async()=>{const c=callback({accepted:false});const r=await c.run();assert.equal(r.status,403);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert(!JSON.stringify(await r.json()).includes('synthetic'));});
test('missing exchanged session denies Round 2',async()=>{const c=callback({session:false});assert.equal((await c.run()).status,403);assert(!c.calls.includes('attest'));});
test('new Google user receives proof before normal onboarding, without auto-completing it',async()=>{const c=callback({complete:false});const r=await c.run();assert.equal(r.status,307);assert.match(r.headers.get('location'),/\/onboarding\?next=/);assert(c.calls.includes('attest'));assert.match(r.headers.get('set-cookie'),/synthetic-auth/);});
test('verified Google user returns to Round 2',async()=>{const c=callback();const r=await c.run();assert.equal(r.status,307);assert(r.headers.get('location').endsWith(BASE));assert(c.calls.includes('attest'));});
