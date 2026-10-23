/* eslint-disable @typescript-eslint/no-require-imports -- Offline admin authorization and aggregate contract tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const fixture = require('../docs/qa/team-formation-outcomes/report-fixture.json');
const clone = () => structuredClone(fixture);
const now = Date.parse(fixture.generatedAt);
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function setup(options = {}) {
  const calls = [], errors = [], events = [];
  const userClient = { auth: { getUser: async () => { events.push('identity'); return { data: { user: options.noUser ? null : { id: 'synthetic-admin', email: options.founder ? 'yashshah7117@gmail.com' : 'admin@example.invalid' } }, error: options.authError || null }; } },
    from(table) { assert.equal(table,'profiles'); return { select(columns) { assert.equal(columns,'role, is_banned'); return this; },eq() {return this;},async maybeSingle() { events.push('profile'); return { data: options.missingProfile ? null : { role: options.role || 'admin', is_banned: options.banned ?? false }, error: options.profileError || null }; } }; } };
  const admin = { async rpc(name,args) { calls.push({name,args}); if(options.throw) throw Error('PRIVATE exception'); return { data: options.data ?? clone(), error: options.error || null }; } };
  const h = harness({ '@supabase/ssr': { createServerClient: () => userClient }, '@supabase/supabase-js': { createClient: (_url,key) => {events.push('privileged');return options.limited || key==='anon' ? userClient : admin;} } }, { Date: FixedDate, URLSearchParams, console: { error: (...args) => errors.push(args), warn() {} } });
  Object.assign(h.env,{ NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:options.noService?'':'synthetic-service' });
  const lib = h.load('src/lib/admin/teamFormationReport.ts'), route = h.load('src/app/api/admin/team-formation/route.ts');
  return { lib,calls,events,errors,get:query=>route.GET(new NextRequest('https://fixture.invalid/api/admin/team-formation'+(query?'?'+query:''))) };
}
test('valid aggregate is bounded, no-store, contains no raw IDs and uses verified admin before service client',async()=>{
  const h=setup(),res=await h.get();assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'private, no-store');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{name:'get_team_formation_report',args:{p_start:fixture.start,p_end:fixture.end}}]);
  assert(h.events.indexOf('profile')<h.events.indexOf('privileged'));assert(!JSON.stringify(await res.json()).includes('synthetic-admin'));
});
for(const opts of [{noUser:true},{role:'user'},{banned:true},{missingProfile:true},{profileError:{message:'PRIVATE error'}},{authError:{message:'Denied'}}]) test(`shared admin authorization fails closed: ${JSON.stringify(opts)}`,async()=>{
  const h=setup(opts),res=await h.get();assert.equal(res.status,403);assert.equal(h.calls.length,0);assert(!h.events.includes('privileged'));
});
for(const opts of [{noService:true},{limited:true}]) test(`privileged global configuration required: ${JSON.stringify(opts)}`,async()=>{
  const h=setup(opts),res=await h.get();assert.equal(res.status,503);assert.equal(h.calls.length,0);
});
test('verified founder retains existing authorization',async()=>{assert.equal((await setup({founder:true,role:'user'}).get()).status,200);});
for(const query of ['start=invalid','start=2026-02-30T00:00:00Z','start=2026-10-24T00:00:00Z','end=2027-01-01T00:00:00Z','start=2026-01-01T00:00:00Z','start=2026-10-20T00:00:00Z&end=2026-10-10T00:00:00Z','start=x&start=y','offset=1','start=2026-09-18T00:00:00%2B05:30']) test(`invalid UTC window never reaches aggregate: ${query}`,async()=>{
  const h=setup(),res=await h.get(query);assert.equal(res.status,400);assert.equal(h.calls.length,0);
});
for(const change of [v=>{v.requests.mature=9;},v=>{v.requests.responded7=11;},v=>{v.requests.converted=9;},v=>{v.activation.activated7=99;},v=>{v.activation.joiners7=99;},v=>{v.memberships.episodes=8;},v=>{v.backlog.pending=-1;},v=>{v.generatedAt='bad';},v=>{delete v.cleanupAt;},v=>{v.requests.pending=Infinity;}]) test('inconsistent aggregate never becomes a measured report',async()=>{
  const data=clone();change(data);const h=setup({data}),res=await h.get();assert.equal(res.status,503);assert(h.errors.length);
});
for(const opts of [{error:{message:'PRIVATE database error'}},{throw:true},{data:{}},{data:{...clone(),coverage:'unavailable',endedAt:fixture.generatedAt}}]) test(`failed/unavailable aggregate contains no private error details: ${JSON.stringify(opts)}`,async()=>{
  const h=setup(opts),res=await h.get();assert.equal(res.status,503);assert(!JSON.stringify(await res.json()).includes('PRIVATE'));assert.equal(res.headers.get('Cache-Control'),'private, no-store');
});
test('partial coverage remains explicit and zero denominators validate without invented rates',async()=>{
  const data=clone();data.coverage='partial';const h=setup({data});assert.equal((await h.get()).status,200);
  for(const group of ['requests','memberships','activation'])for(const key of Object.keys(data[group]))data[group][key]=key.startsWith('decision_')?null:0;
  assert.equal(h.lib.isFormationReport(data),true);
});

test('aggregate DTO strips unexpected top-level and nested identifiers',async()=>{
  const data=clone();data.user_id='PRIVATE-ID';data.requests.email='PRIVATE-EMAIL';
  const res=await setup({data}).get();assert.equal(res.status,200);assert(!JSON.stringify(await res.json()).includes('PRIVATE'));
});
