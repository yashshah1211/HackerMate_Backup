/* eslint-disable @typescript-eslint/no-require-imports -- Real installed SDK + public-source transport, no network forwarding. SQL semantics are separately qualified on PG17.6. */
const assert=require('node:assert/strict'),{test}=require('node:test'),{createClient}=require('@supabase/supabase-js'),{harness}=require('./ppt-vision-harness.cjs');
const facts=require('../qa/fixtures/aggregator/provider-facts.cjs'),fs=require('node:fs');
function fixture({failedRead,providerFailure,missingWriter}={}){
 const calls=[],writes=[],sources=[],linked=['team_submissions','team_hackathons','team_github_repos','team_links','hackathon_resources','hackathon_registrations','saved_hackathons'];
 const loader=harness({}, {URLSearchParams}),parser=loader.load('src/lib/hackathons/providers.ts'),sync=loader.load('src/lib/hackathons/synchronize.ts'),{SourceTransport}=loader.load('src/lib/hackathons/sourceTransport.ts');
 const raw=structuredClone(facts.unstop);raw.data.competition.id=1001;
 const metadata=parser.parseUnstop(parser.identifySource('https://unstop.com/hackathons/owned-1001'),raw,Date.now(),'a'.repeat(64));
 const rows=[{id:'0001',name:'Legacy ended',type:'official',organizer_id:null,status:'approved',archived:false,website_url:'https://unstop.com/hackathons/legacy-1000',end_date:'2026-10-01',source_metadata:null},
 {id:'0002',name:'Old source name',type:'external',organizer_id:null,status:'approved',archived:false,website_url:metadata.canonical_url,source_metadata:JSON.parse(JSON.stringify(metadata))},
 {id:'0003',name:'Partner',type:'external',organizer_id:null,status:'approved',archived:false,website_url:'https://unstop.com/hackathons/partner-3000'},
 {id:'0004',name:'Owner managed',type:'external',organizer_id:'synthetic-owner',status:'approved',archived:false,website_url:'https://unstop.com/hackathons/managed-4000'}];
 const db={hackathons:rows,partner_configs:[{hackathon_id:'0003',features:{}}],organizer_leads:[{id:'crm-history'}]};for(const table of linked)db[table]=rows.map(r=>({id:table+r.id,hackathon_id:r.id}));const original=JSON.parse(JSON.stringify(db));
 const client=createClient('https://catalog.invalid','synthetic-service-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url),method=init?.method||'GET';calls.push([method,url.pathname]);assert.equal(url.origin,'https://catalog.invalid');
  if(url.pathname.includes('/rpc/')){
   const name=url.pathname.split('/').at(-1),body=JSON.parse(init.body);writes.push({name,body});assert(['begin_hackathon_source_check','apply_hackathon_source_check'].includes(name));
   if(missingWriter)return Response.json({code:'PGRST202',message:'Missing source function'},{status:404});
   const row=rows.find(r=>r.id===body.p_id);
   if(name==='begin_hackathon_source_check'){assert(row);const snapshot={...row};delete snapshot.source_metadata;row.source_metadata={...row.source_metadata,check_status:'checking'};return Response.json({status:'leased',snapshot});}
   if(body.p_failure){row.source_metadata.check_status='failed';return Response.json({status:'failed',id:row.id});}
   if(row){Object.assign(row,body.p_patch,{source_metadata:body.p_observation});return Response.json({status:'refreshed',id:row.id});}
   const created={id:'0005',...body.p_patch,type:'external',source_metadata:body.p_observation};rows.push(created);return Response.json({status:'created',id:created.id});
  }
  assert.equal(method,'GET','No raw catalog mutation, CRM mutation or outreach request');const table=url.pathname.split('/').at(-1);assert(['hackathons','partner_configs'].includes(table));
  if(table===failedRead)return Response.json({code:'42501',message:'Isolated denied read'},{status:403});
  const cursor=url.searchParams.get('id');return Response.json(table==='hackathons'?rows.filter(r=>!cursor||r.id>cursor.slice(3)):db.partner_configs);
 }}});
 const fetcher=async input=>{const url=new URL(input);sources.push(url.href);if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /');
  if(url.pathname.endsWith('search-result'))return Response.json({data:{data:url.searchParams.get('page')==='1'&&url.searchParams.get('oppstatus')==='open'?[{id:1234,public_url:'hackathons/synthetic-1234'},{id:1000,public_url:'hackathons/renamed-1000'}]:[]}});
  if(url.hostname==='devfolio.co')return new Response('<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{dehydratedState:{queries:[{queryKey:'fetchAllHackathonTypes',state:{data:{open_hackathons:[],upcoming_hackathons:[]}}}]}}}})+'</script>');
  if(url.pathname.endsWith('/event/list'))return Response.json({data:{flagshipEvents:[],communityEvents:[]}});
  if(url.pathname.includes('/competition/')){if(providerFailure)return new Response('Unavailable',{status:503});const data=structuredClone(facts.unstop);data.data.competition.id=Number(url.pathname.split('/').at(-1));return Response.json(data);}
  throw Error('Unexpected source '+url.href);
 };
 const transport=new SourceTransport(fetcher,240000,0);
 return {db,original,linked,calls,writes,sources,client,transport,loader,run:dryRun=>sync.synchronizeCatalog(client,{dryRun,transport})};
}
for(const dryRun of [true,false])test('catalog '+(dryRun?'preview':'sync')+' preserves historical, partner, owner, CRM and linked identities without outreach',async()=>{
 const f=fixture(),result=await f.run(dryRun);assert.equal(result.success,true);
 for(const table of [...f.linked,'organizer_leads','partner_configs'])assert.deepEqual(f.db[table],f.original[table]);
 for(const i of [0,2,3])assert.deepEqual(f.db.hackathons[i],f.original.hackathons[i]);assert.equal(f.calls.some(c=>c[0]==='DELETE'),false);
 if(dryRun){assert.equal(f.writes.length,0);assert.deepEqual(f.db,f.original);assert(result.results.some(r=>r.requires_adoption));}
 else{assert.equal(f.db.hackathons.length,5);assert.equal(f.db.hackathons[1].name,'Synthetic city build');assert.equal(f.db.hackathons[1].id,'0002');assert(result.results.some(r=>r.status==='requires_adoption'));assert(f.writes.every(w=>!w.body.p_adopt_fields));}
});
for(const failedRead of ['hackathons','partner_configs'])test(failedRead+' denied read stops before source checks and writes',async()=>{const f=fixture({failedRead});await assert.rejects(f.run(false));assert.equal(f.writes.length,0);assert.equal(f.sources.length,0);assert.deepEqual(f.db,f.original);});
test('provider failure preserves facts, commits failed evidence and does not create guessed listings',async()=>{const f=fixture({providerFailure:true});await f.run(false);assert.equal(f.db.hackathons[1].name,f.original.hackathons[1].name);assert.equal(f.db.hackathons[1].source_metadata.check_status,'failed');assert.equal(f.db.hackathons.length,4);for(const table of f.linked)assert.deepEqual(f.db[table],f.original[table]);});
test('missing source RPC stops without raw INSERT/upsert fallback',async()=>{const f=fixture({missingWriter:true});await assert.rejects(f.run(false),/without fallback/);assert.equal(f.writes.length,1);assert.deepEqual(f.db,f.original);});
for(const entry of ['admin','cron'])test(entry+' delegates exclusively to catalog sync with authorization and intended write mode',async()=>{
 const f=fixture(),calls=[];const overrides={'@/lib/admin/requireOutreachAdmin':{requireOutreachAdmin:async()=>({supabaseAdmin:f.client})},'@supabase/supabase-js':{createClient:()=>f.client},'@/lib/hackathons/synchronize':{synchronizeCatalog:async(client,options)=>{assert.equal(client,f.client);calls.push(options);return {success:true,message:'No organizer emails sent.'};}}};
 const h=harness(overrides);Object.assign(h.env,{CRON_SECRET:'fake-only',NEXT_PUBLIC_SUPABASE_URL:'https://catalog.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake-only'});
 const route=h.load(entry==='admin'?'src/app/api/admin/scrape-unstop/route.ts':'src/app/api/cron/auto-scrape-leads/route.ts');
 const response=entry==='admin'?await route.POST(new Request('https://local.invalid',{method:'POST'})):await route.GET(new Request('https://local.invalid',{headers:{Authorization:'Bearer fake-only'}}));assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].dryRun,entry==='admin');
});
test('cron never permits missing/invalid credentials, including development',async()=>{let called=0;const h=harness({'@/lib/hackathons/synchronize':{synchronizeCatalog:()=>{called++;}}});h.env.NODE_ENV='development';const route=h.load('src/app/api/cron/auto-scrape-leads/route.ts');for(const secret of [undefined,'fake-only']){h.env.CRON_SECRET=secret;assert.equal((await route.GET(new Request('https://local.invalid'))).status,401);}assert.equal(called,0);});
test('catalog dependency graph has no lead/email/Gmail dispatch or unsafe direct hackathon writes',()=>{for(const file of ['src/app/api/admin/scrape-unstop/route.ts','src/app/api/cron/auto-scrape-leads/route.ts','src/lib/hackathons/synchronize.ts','src/lib/hackathons/sourceTransport.ts','src/lib/hackathons/providers.ts']){const code=fs.readFileSync(file,'utf8');assert(!/autoSendPitch|executeGmail|autoRemoveUnopened|organizer_leads|api\.resend|\.upsert\(|\.insert\(/.test(code),file);}});

test('complete database snapshot timeout is bounded before any provider or writer operation',async()=>{
 const h=harness({}, {URLSearchParams}),{synchronizeCatalog}=h.load('src/lib/hackathons/synchronize.ts');let requests=0;
 const client=createClient('https://timeout.invalid','synthetic-only',{auth:{persistSession:false},global:{fetch:async(input,init)=>{requests++;assert.equal(new URL(input).hostname,'timeout.invalid');return new Promise((resolve,reject)=>{const abort=()=>reject(new DOMException('Synthetic aborted request','AbortError'));if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});});}}});
 const keepAlive=setTimeout(()=>{},1000); // AbortSignal.timeout is unreferenced on Linux; keep the simulated network request alive.
 try{const start=Date.now();await assert.rejects(synchronizeCatalog(client,{dryRun:false,transport:{remaining:()=>30}}));assert(Date.now()-start<1000);assert.equal(requests,1);}finally{clearTimeout(keepAlive);}
});
