/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-handler and UI regressions. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {harness,uiHarness,configRow,event,id,ADMIN,TARGET,EVENT,OTHER,PARTNER,LEAD,NextRequest,NextResponse}=require('./partner-admin-harness.cjs');
const config={slug:'new-fixture',partner_name:'Fixture Partner',hackathon_id:EVENT,portal_version:'organizer-v1'};
const methods=[['partner-config','GET',undefined],['partner-config','POST',{config}],['partner-config','PATCH',{partnerId:PARTNER,expectedRevision:'0'.repeat(64),config:{tagline:'Approved'}}],['partner-organizers','GET',undefined,'eventId='+EVENT],['partner-organizers','POST',{eventId:EVENT,userId:TARGET}],['partner-organizers','DELETE',{eventId:EVENT,userId:TARGET}]];
const denied=[['unauthenticated',{user:null}],['ordinary user',{profile:{role:'user'}}],['outreach-only',{user:{email:'outreach@example.invalid'},profile:{role:'user'}}],['banned admin',{profile:{is_banned:true}}],['banned user',{profile:{role:'user',is_banned:true}}],['missing profile',{profile:null}],['lookup failure',{lookupError:{code:'XX000',message:'PRIVATE_LOOKUP'}}],['lookup exception',{throwTable:'profiles'}],['unknown ban',{profile:{is_banned:null}}],['spoofed admin metadata',{user:{user_metadata:{role:'admin'},app_metadata:{role:'admin'}},profile:{role:'user'}}],['founder near match',{user:{email:'notyashshah7117@gmail.com'},profile:{role:'user'}}],['banned founder',{user:{email:'yashshah7117@gmail.com'},profile:{is_banned:true}}],['auth error with user payload',{authError:{message:'PRIVATE_AUTH_ERROR'}}]];
for(const [route,method,body,query] of methods)for(const [label,options]of denied)test(`${route} ${method}: denies ${label} before privileged work`,async()=>{
  const h=harness(options),r=await h.call(route,method,body,query);assert.equal(r.status,403);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(h.state.writes.length,0);assert(!h.state.clients.includes('service'));assert(!h.state.queries.some(q=>q.table!=='profiles'));assert(!JSON.stringify(r.data).includes('PRIVATE_'));
});
for(const founder of [false,true])for(const [route,method,body,query]of methods)test(`${route} ${method}: permits ${founder?'verified founder':'authoritative admin'}`,async()=>{
  const h=harness(founder?{user:{email:' YASHShah7117@gmail.com '},profile:{role:'user'}}:{});
  let payload=body;
  if(method==='PATCH')payload={...body,expectedRevision:(await h.call('partner-config')).data.partners[0].revision};
  const r=await h.call(route,method,payload,query);assert([200,201].includes(r.status),JSON.stringify(r));
});
for(const [route,method,body,query]of methods)test(`${route} ${method}: supports browser cookie sessions`,async()=>{
  const h=harness();const payload=method==='PATCH'?{...body,expectedRevision:(await h.call('partner-config')).data.partners[0].revision}:body;
  assert([200,201].includes((await h.call(route,method,payload,query,true)).status));
});
test('config associates an existing event without creating or editing event facts or inheriting defaults',async()=>{
  const h=harness();const r=await h.call('partner-config','POST',{config});assert.equal(r.status,201);assert.equal(r.data.partner.hackathon_id,EVENT);assert.equal(r.data.partner.portal_version,'organizer-v1');
  assert.deepEqual(h.state.writes.map(w=>w.table),['partner_configs']);const row=h.state.tables.partner_configs.at(-1);assert.equal(row.brand_color,null);assert.equal(row.accent_color,null);assert(!row.logo_url);assert(!row.tagline);assert.deepEqual(row.features,{portal_version:'organizer-v1'});
});
test('GET exposes explicit public configuration and event facts, never private feature payloads',async()=>{
  const h=harness({configs:[configRow({features:{internal_notes:'PRIVATE_NOTE',organizer_emails:['PRIVATE_EMAIL'],portal_version:'organizer-v1',official_website:'https://example.invalid'}})]});
  const r=await h.call('partner-config');assert.equal(r.status,200);assert(!JSON.stringify(r.data).includes('PRIVATE_'));assert(!('features'in r.data.partners[0]));assert.equal(r.headers.get('Cache-Control'),'private, no-store');
});
test('configuration selection includes existing events beyond the default thousand-row cap',async()=>{
  const events=Array.from({length:1005},(_,i)=>event(id(1000+i)));const h=harness({events});const r=await h.call('partner-config');assert.equal(r.status,200);assert.equal(r.data.events.length,1005);assert(r.data.events.some(row=>row.id===id(2004)));assert.equal(h.state.queries.filter(q=>q.table==='hackathons').length,3);
});
for(const [name,patch]of [
  ['unknown version',{portal_version:'future-v2'}],['unknown mode',{registration_mode:'guess'}],['unsafe website',{official_website:'javascript:alert(1)'}],['unsafe logo',{logo_url:'//evil.invalid/x'}],['credential URL',{official_website:'https://user:secret@example.invalid'}],['unsafe banner',{banner_url:'data:image/svg+xml,foo'}],['color expression',{accent_color:'url(foo)'}],['short color',{accent_color:'#abc'}],['bad slug',{slug:'Bad slug'}],['empty slug',{slug:''}],['long slug',{slug:'a'.repeat(101)}],['private feature object',{features:{organizer_email:'private@example.invalid'}}],['created_by spoof',{created_by:TARGET}],['unknown name',{admin:true}],['oversized name',{partner_name:'x'.repeat(201)}],['oversized introduction',{tagline:'x'.repeat(361)}],['control characters',{tagline:'bad\u0000text'}],['missing public URL',{public_contact:{label:'Contact',url:null}}],['mail authority',{public_contact:{label:'Contact',url:'mailto:person@example.invalid'}}],['extra link field',{approved_links:[{label:'Rules',url:'https://example.invalid',secret:'x'}]}],['too many links',{approved_links:Array.from({length:9},()=>({label:'Rules',url:'https://example.invalid'}))}],['malformed event',{hackathon_id:'event-A'}]
])test(`config rejects ${name}`,async()=>{const h=harness(),r=await h.call('partner-config','POST',{config:{...config,...patch}});assert.equal(r.status,400);assert.equal(h.state.writes.length,0);});
for(const route of ['partner-config','partner-organizers'])test(`${route}: rejects invalid JSON and unknown query fields after admin verification`,async()=>{
  const h=harness();const r=await h.load(`src/app/api/admin/${route}/route.ts`).POST(new NextRequest('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer fixture-session'},body:'{'}));assert.equal(r.status,400);assert.equal(h.state.writes.length,0);
  assert.equal((await h.call(route,'GET',undefined,'admin=true')).status,400);
});
test('config rejects unknown envelope fields and nonexistent event',async()=>{const h=harness();assert.equal((await h.call('partner-config','POST',{config,admin:true})).status,400);assert.equal((await h.call('partner-config','POST',{config:{...config,hackathon_id:id(999)}})).status,404);assert.equal(h.state.writes.length,0);});
test('config accepts exact C6 public fields and leaves legacy deliberate',async()=>{
  const h=harness();const r=await h.call('partner-config','POST',{config:{...config,portal_version:'legacy',tagline:'Approved intro',logo_url:'/partners/local.png',banner_url:'https://example.invalid/banner.png',accent_color:'#b4f461',official_website:'https://example.invalid/',registration_mode:'external',public_contact:{label:'Public help',url:'https://example.invalid/contact'},approved_links:[{label:'Rules',url:'https://example.invalid/rules'}]}});assert.equal(r.status,201);assert.equal(r.data.partner.portal_version,'legacy');assert.equal(r.data.partner.accent_color,'#b4f461');
});
async function update(h,patch,revision){const current=(await h.call('partner-config')).data.partners[0];return h.call('partner-config','PATCH',{partnerId:current.id,expectedRevision:revision||current.revision,config:patch});}
test('partial config merge preserves unrelated public features and legacy fields',async()=>{
  const features={legacy_layout:{showSponsors:true},official_website:'https://example.invalid/original'};
  const h=harness({configs:[configRow({features,logo_url:'/partners/existing.png',brand_color:'#123456',tagline:'Original'})]});
  const r=await update(h,{partner_name:'Renamed',portal_version:'organizer-v1'});assert.equal(r.status,200);const row=h.state.tables.partner_configs[0];assert.equal(row.tagline,'Original');assert.equal(row.logo_url,'/partners/existing.png');assert.equal(row.brand_color,'#123456');assert.deepEqual(row.features,{...features,portal_version:'organizer-v1'});
});
test('legacy remains legacy without explicit version change; event association changes no grants',async()=>{
  const h=harness({organizers:[{hackathon_id:EVENT,user_id:TARGET,created_by:ADMIN}]});const r=await update(h,{hackathon_id:OTHER,tagline:'Approved'});assert.equal(r.status,200);assert.equal(r.data.partner.portal_version,'legacy');assert.equal(h.state.tables.event_organizers[0].hackathon_id,EVENT);
});
test('malformed stored features are preserved; unsafe whole-object normalization is rejected',async()=>{
  const h=harness({configs:[configRow({features:['legacy-value']})]});assert.equal((await update(h,{tagline:'Approved'})).status,200);assert.deepEqual(h.state.tables.partner_configs[0].features,['legacy-value']);assert.equal((await update(h,{portal_version:'organizer-v1'})).status,409);assert.deepEqual(h.state.tables.partner_configs[0].features,['legacy-value']);
});
test('stale revision fails rather than overwriting newer changes',async()=>{const h=harness(),revision=(await h.call('partner-config')).data.partners[0].revision;assert.equal((await update(h,{tagline:'New'})).status,200);assert.equal((await update(h,{tagline:'Stale'},revision)).status,409);assert.equal(h.state.tables.partner_configs[0].tagline,'New');});
test('atomic snapshot guard detects legacy concurrent edits without updated_at change',async()=>{
  let ran=false;const h=harness({beforeMutation(read,state){if(read.table==='partner_configs'&&!ran){state.tables.partner_configs[0].features={concurrent_public_fact:'Retain'};ran=true;}}});const r=await update(h,{tagline:'Stale'});assert.equal(r.status,409);assert.equal(h.state.tables.partner_configs[0].tagline,null);assert.equal(h.state.writes.length,0);
});
test('duplicate slug create and update return conflicts',async()=>{const h=harness({configs:[configRow(),configRow({id:id(202),slug:'other-fixture'})]});assert.equal((await h.call('partner-config','POST',{config:{...config,slug:'fixture-partner'}})).status,409);assert.equal((await update(h,{slug:'other-fixture'})).status,409);});
for(const route of ['partner-config','partner-organizers'])test(`${route}: database failure is logged and never success or zero`,async()=>{const h=harness({failTable:route==='partner-config'?'partner_configs':'event_organizers'});const r=await h.call(route,'GET',undefined,route==='partner-config'?'':'eventId='+EVENT);assert.equal(r.status,500);assert(h.state.logs.length);assert(!JSON.stringify(r.data).includes('PRIVATE_DATABASE_ERROR'));});
for(const [route,method,body]of methods.filter(([,method])=>method!=='GET'))test(`${route} ${method}: mutation failure is explicit with no successful state`,async()=>{
  const operation=method==='POST'?'insert':method==='PATCH'?'update':'delete';const h=harness({failOperation:operation});
  const payload=method==='PATCH'?{...body,expectedRevision:(await h.call('partner-config')).data.partners[0].revision}:body;
  const result=await h.call(route,method,payload);assert.equal(result.status,500);assert.equal(h.state.writes.length,0);assert(h.state.logs.length);assert(!JSON.stringify(result.data).includes('PRIVATE_WRITE_ERROR'));
});
test('target profile and organizer account-name failures deny instead of appearing eligible or empty',async()=>{
  const grant=harness({failTargetProfile:true});assert.equal((await grant.call('partner-organizers','POST',{eventId:EVENT,userId:TARGET})).status,500);assert.equal(grant.state.writes.length,0);
  const list=harness({failTargetProfile:true,organizers:[{hackathon_id:EVENT,user_id:TARGET,created_at:'2026-01-01'}]});assert.equal((await list.call('partner-organizers','GET',undefined,'eventId='+EVENT)).status,500);
});
test('all organizer operations validate event IDs, existence, duplicate query keys and scope',async()=>{
  for(const method of ['GET','POST','DELETE']) {const h=harness();const result=await h.call('partner-organizers',method,method==='GET'?undefined:{eventId:id(999),userId:TARGET},method==='GET'?'eventId='+id(999):'');assert.equal(result.status,404);assert.equal(h.state.writes.length,0);}
  assert.equal((await harness().call('partner-organizers','GET',undefined,`eventId=${EVENT}&eventId=${OTHER}`)).status,400);
});
test('configuration rejects oversized body, malformed revision and absent target config',async()=>{
  const h=harness();assert.equal((await h.call('partner-config','POST',{config:{...config,tagline:'x'.repeat(33_000)}})).status,413);
  assert.equal((await h.call('partner-config','PATCH',{partnerId:PARTNER,expectedRevision:'guess',config:{tagline:'New'}})).status,400);
  assert.equal((await h.call('partner-config','PATCH',{partnerId:id(999),expectedRevision:'0'.repeat(64),config:{tagline:'New'}})).status,404);
});
test('grant uses Auth UUID and protected eligibility, created_by is the acting admin and JWT is retained',async()=>{
  const h=harness();const r=await h.call('partner-organizers','POST',{eventId:EVENT,userId:TARGET});assert.equal(r.status,201);assert.deepEqual(h.state.writes[0],{table:'event_organizers',kind:'session',operation:'insert',values:{hackathon_id:EVENT,user_id:TARGET,created_by:ADMIN}});assert(!JSON.stringify(r.data).includes('email'));assert.equal(h.state.tables.profiles[1].role,'user');
});
test('list is scoped to one event and contains only minimal account fields',async()=>{
  const h=harness({organizers:[{hackathon_id:EVENT,user_id:TARGET,created_at:'2026-01-01',created_by:ADMIN},{hackathon_id:OTHER,user_id:ADMIN,created_at:'2026-01-02'}]});const r=await h.call('partner-organizers','GET',undefined,'eventId='+EVENT);assert.equal(r.status,200);assert.deepEqual(r.data.organizers,[{user_id:TARGET,created_at:'2026-01-01',full_name:'Existing Builder'}]);assert(!JSON.stringify(r.data).includes(ADMIN));
});
test('zero organizers is intentional successful empty list',async()=>{const r=await harness().call('partner-organizers','GET',undefined,'eventId='+EVENT);assert.equal(r.status,200);assert.deepEqual(r.data.organizers,[]);});
test('organizer lists remain complete beyond the default row cap and name lookups stay event-scoped and bounded',async()=>{
  const organizers=Array.from({length:1005},(_,i)=>({hackathon_id:EVENT,user_id:id(1000+i),created_at:'2026-01-01'}));const h=harness({organizers});const r=await h.call('partner-organizers','GET',undefined,'eventId='+EVENT);assert.equal(r.status,200);assert.equal(r.data.organizers.length,1005);const lookups=h.state.queries.filter(q=>q.table==='profiles'&&q.kind==='service');assert.equal(lookups.length,11);assert(lookups.every(q=>q.filters[0][2].length<=100));
});
test('duplicate assignment is a clear conflict, with no extra row',async()=>{const h=harness();assert.equal((await h.call('partner-organizers','POST',{eventId:EVENT,userId:TARGET})).status,201);assert.equal((await h.call('partner-organizers','POST',{eventId:EVENT,userId:TARGET})).status,409);assert.equal(h.state.tables.event_organizers.length,1);});
for(const [label,options,status]of [['nonexistent Auth account',{target:null},404],['missing profile',{targetProfile:null},403],['banned target',{targetProfile:{is_banned:true}},403],['unknown target ban',{targetProfile:{is_banned:null}},403],['Auth mismatch',{target:{id:id(888)}},404],['Auth service failure',{targetAuthError:{status:503,message:'PRIVATE_AUTH'}},500],['missing service configuration',{env:{SUPABASE_SERVICE_ROLE_KEY:''}},503],['admin target',{targetProfile:{role:'admin'}},409],['founder target',{target:{email:' YASHShah7117@gmail.com '}},409]])test(`grant rejects ${label}`,async()=>{const h=harness(options),r=await h.call('partner-organizers','POST',{eventId:EVENT,userId:TARGET});assert.equal(r.status,status);assert.equal(h.state.writes.length,0);});
for(const body of [{eventId:EVENT,userId:TARGET,created_by:TARGET},{eventId:EVENT,email:'target@example.invalid'},{eventId:EVENT,userId:'target@example.invalid'},{eventId:EVENT,userId:TARGET,role:'admin'},{eventId:id(999),userId:TARGET}])test('grant rejects invalid scope or spoofed assignment: '+JSON.stringify(body),async()=>{const h=harness();assert([400,404].includes((await h.call('partner-organizers','POST',body)).status));assert.equal(h.state.writes.length,0);});
test('admins cannot create unnecessary self-assignments',async()=>{const h=harness();assert.equal((await h.call('partner-organizers','POST',{eventId:EVENT,userId:ADMIN})).status,409);assert.equal(h.state.writes.length,0);});
test('revoke removes only the event assignment; repeated revoke is a known harmless state',async()=>{
  const h=harness({organizers:[{hackathon_id:EVENT,user_id:TARGET},{hackathon_id:OTHER,user_id:TARGET}]});const r=await h.call('partner-organizers','DELETE',{eventId:EVENT,userId:TARGET});assert.equal(r.status,200);assert.equal(r.data.revoked,true);assert.deepEqual(h.state.tables.event_organizers,[{hackathon_id:OTHER,user_id:TARGET}]);assert.equal((await h.call('partner-organizers','DELETE',{eventId:EVENT,userId:TARGET})).data.revoked,false);assert.equal(h.state.tables.profiles[1].role,'user');
});
test('grant A does not authorize B; revocation is effective on next requirePartnerAccess request',async()=>{
  const h=harness();await h.call('partner-organizers','POST',{eventId:EVENT,userId:TARGET});h.state.caller=h.state.accounts.find(u=>u.id===TARGET);
  const helper=h.load('src/lib/partners/requirePartnerAccess.ts').requirePartnerAccess,req=new NextRequest('https://example.invalid',{headers:{Authorization:'Bearer fixture-session'}});
  assert(!((await helper(req,{hackathonId:EVENT}))instanceof NextResponse));assert.equal((await helper(req,{hackathonId:OTHER})).status,403);
  assert.equal((await h.call('partner-organizers','POST',{eventId:OTHER,userId:TARGET})).status,403);
  h.state.caller=h.state.accounts.find(u=>u.id===ADMIN);await h.call('partner-organizers','DELETE',{eventId:EVENT,userId:TARGET});h.state.caller=h.state.accounts.find(u=>u.id===TARGET);assert.equal((await helper(req,{hackathonId:EVENT})).status,403);
});
test('legacy explicit existing-event path never creates or edits an event and remains legacy',async()=>{
  const h=harness({configs:[]});const r=await h.call('create-partner-portal','POST',{leadId:LEAD,existingEventId:OTHER});assert.equal(r.status,200);assert(!h.state.writes.some(w=>w.table==='hackathons'));assert.equal(h.state.tables.partner_configs[0].hackathon_id,OTHER);assert.deepEqual(h.state.tables.partner_configs[0].features,{});assert.equal(h.state.tables.partner_configs[0].logo_url,null);assert.equal(h.state.tables.partner_configs[0].tagline,null);
});
test('ambiguous legacy matches require explicit event selection instead of creating another event',async()=>{
  const h=harness({events:[{...event(),name:'Fixture lead'},{...event(OTHER),website_url:'https://example.invalid/event'}],configs:[]});assert.equal((await h.call('create-partner-portal','POST',{leadId:LEAD})).status,409);assert.equal(h.state.writes.length,0);assert(!h.state.queries.some(q=>q.filters?.some(([op])=>op==='or')));
});
test('legacy keeps lead-driven creation and existing association behavior',async()=>{
  const created=harness({configs:[]});assert.equal((await created.call('create-partner-portal','POST',{leadId:LEAD})).status,200);assert(created.state.writes.some(w=>w.table==='hackathons'));
  const existing=harness({matchLegacy:true});const r=await existing.call('create-partner-portal','POST',{leadId:LEAD});assert.equal(r.status,200);assert.equal(r.data.alreadyExisted,true);assert.equal(existing.state.writes.length,0);
});
test('legacy rejects V1 fields and nonexistent explicit event instead of creating a guessed event',async()=>{const h=harness();assert.equal((await h.call('create-partner-portal','POST',{leadId:LEAD,portal_version:'organizer-v1'})).status,400);assert.equal((await h.call('create-partner-portal','POST',{leadId:LEAD,existingEventId:id(999)})).status,404);assert.equal(h.state.writes.length,0);});
for(const table of ['organizer_leads','hackathons','partner_configs'])test(`legacy existing-event ${table} failure cannot create defaults or claim success`,async()=>{const h=harness({failTable:table});assert.equal((await h.call('create-partner-portal','POST',{leadId:LEAD,existingEventId:EVENT})).status,500);assert.equal(h.state.writes.length,0);assert(h.state.logs.length);});
test('legacy provisioner still uses authoritative admin and rejects ordinary/banned/outreach callers',async()=>{for(const options of [{profile:{role:'user'}},{profile:{is_banned:true}},{profile:null},{lookupError:{code:'XX000'}}]){const h=harness(options);assert.equal((await h.call('create-partner-portal','POST',{leadId:LEAD,existingEventId:EVENT})).status,403);assert.equal(h.state.writes.length,0);}});

const managed = extra => ({id:PARTNER,revision:'0'.repeat(64),...config,slug:'fixture-partner',tagline:null,logo_url:null,banner_url:null,accent_color:null,official_website:null,public_contact:null,approved_links:[],registration_mode:null,...extra});
const formValues = extra => ({hackathon_id:EVENT,partner_name:'Fixture Partner',slug:'fixture-partner',portal_version:'organizer-v1',registration_mode:'',tagline:'',logo_url:'',banner_url:'',accent_color:'',official_website:'',contact_label:'',contact_url:'',approved_links:'',...extra});
test('admin editor distinguishes existing-event configuration, version controls and unknown facts',async()=>{
  const h=await uiHarness('PartnerConfigEditor',{partner:null,events:[event()],saved(){}},async()=>Response.json({}));assert.match(h.html,/Configure a partner using an existing event/);assert.match(h.html,/Legacy presentation/);assert.match(h.html,/Partner V1 public page and workspace/);await h.choose(EVENT);assert.match(h.html,/team limits unknown/);assert(!h.html.includes('NexHack'));assert.match(h.html,/does not create or edit an event/);
});
test('admin editor saves to existing-event API without legacy provisioner defaults',async()=>{
  let saved;const h=await uiHarness('PartnerConfigEditor',{partner:null,events:[event()],saved(v){saved=v;}},async()=>Response.json({partner:managed()}));await h.choose(EVENT);await h.submit(formValues());assert.equal(saved.id,PARTNER);const req=h.state.requests[0];assert.equal(req.url,'/api/admin/partner-config');assert.equal(req.init.method,'POST');assert.equal(JSON.parse(req.init.body).config.hackathon_id,EVENT);assert(!req.init.body.includes('axcentra'));
});
test('admin editor sends only deliberate changes with revision and preserves unknown legacy values',async()=>{
  const h=await uiHarness('PartnerConfigEditor',{partner:managed(),events:[event()],saved(){}},async()=>Response.json({partner:managed({partner_name:'Changed'})}));await h.submit(formValues({partner_name:'Changed'}));assert.deepEqual(JSON.parse(h.state.requests[0].init.body),{partnerId:PARTNER,expectedRevision:'0'.repeat(64),config:{partner_name:'Changed'}});
});
test('editor missing event/incomplete configuration prevents save and states why',async()=>{
  const h=await uiHarness('PartnerConfigEditor',{partner:managed({hackathon_id:OTHER}),events:[event()],saved(){}},async()=>Response.json({}));assert.match(h.html,/associated event is unavailable/);assert(h.controls.find(c=>c.type==='button'&&c.children==='Save public configuration').disabled);assert.match(h.html,/Unavailable event/);
});
test('editor API conflict is visible and not saved',async()=>{
  let saved=false;const h=await uiHarness('PartnerConfigEditor',{partner:managed(),events:[event()],saved(){saved=true;}},async()=>Response.json({error:'Configuration changed. Reload before saving.'},{status:409}));await h.submit(formValues({tagline:'Changed'}));assert(!saved);assert.match(h.html,/Configuration changed/);
});
test('editor rejects incomplete public contact and incomplete public links before request',async()=>{const h=await uiHarness('PartnerConfigEditor',{partner:null,events:[event()],saved(){}},async()=>Response.json({}));await h.choose(EVENT);await h.submit(formValues({contact_label:'Contact'}));assert.match(h.html,/needs both a label and a URL/);await h.click('Add public link');await h.submit(formValues({link_label_0:'Rules'}));assert.match(h.html,/Each public link needs both/);assert.equal(h.state.requests.length,0);});
test('management lists partners and gates workspace links by deliberate V1 version',async()=>{
  const h=await uiHarness('PartnerManagement',{onChanged:async()=>{}},async()=>Response.json({partners:[managed(),managed({id:id(202),slug:'legacy',portal_version:'legacy'})],events:[event()]}));await h.choose(PARTNER);assert.match(h.html,/href="\/partners\/fixture-partner"/);assert.match(h.html,/href="\/partners\/fixture-partner\/organizer"/);await h.choose(id(202));assert(!h.html.includes('Open organizer workspace'));
});
test('management zero partners, missing event and API failure have intentional states',async()=>{
  const empty=await uiHarness('PartnerManagement',{onChanged:async()=>{}},async()=>Response.json({partners:[],events:[]}));assert.match(empty.html,/No partner configurations yet/);
  const missing=await uiHarness('PartnerManagement',{onChanged:async()=>{}},async()=>Response.json({partners:[managed()],events:[]}));await missing.choose(PARTNER);assert.match(missing.html,/Organizer access is unavailable/);
  const failed=await uiHarness('PartnerManagement',{onChanged:async()=>{}},async()=>Response.json({error:'Fixture failure'},{status:500}));assert.match(failed.html,/role="alert"/);assert(!failed.html.includes('No partner configurations yet'));
});
test('late save for a previous partner cannot switch away from the currently selected editor',async()=>{
  const second=managed({id:id(202),partner_name:'Second partner',slug:'second-partner'});const h=await uiHarness('PartnerManagement',{onChanged:async()=>{}},async()=>Response.json({partners:[managed(),second],events:[event()]}));
  await h.choose(PARTNER);const saved=h.state.children.find(child=>child.saved).saved;await h.choose(second.id);saved(managed({revision:'1'.repeat(64)}));await h.flush();assert.equal(h.controls.find(c=>c.type==='select').value,second.id);assert.match(h.html,/\/partners\/second-partner/);
});
const organizer={user_id:TARGET,full_name:'Existing Builder',created_at:'2026-01-01T00:00:00Z'};
test('organizer UI lists accounts, grants UUID access, and never resolves emails in browser',async()=>{
  const h=await uiHarness('PartnerOrganizerAccess',{eventId:EVENT,eventName:'Fixture event'},async(url,init)=>init.method==='POST'?Response.json({eventId:EVENT,organizer}):Response.json({eventId:EVENT,organizers:[]}));assert.match(h.html,/No organizer accounts are assigned/);await h.submit({userId:TARGET});assert.match(h.html,/Organizer access granted/);assert.deepEqual(JSON.parse(h.state.requests.at(-1).init.body),{eventId:EVENT,userId:TARGET});assert.match(h.html,/No account is created/);
});
test('organizer UI requires explicit scoped confirmation before revoke and handles already revoked',async()=>{
  const h=await uiHarness('PartnerOrganizerAccess',{eventId:EVENT,eventName:'Fixture event'},async(url,init)=>init.method==='DELETE'?Response.json({eventId:EVENT,userId:TARGET,revoked:false}):Response.json({eventId:EVENT,organizers:[organizer]}));await h.click('Revoke assignment');assert.equal(h.state.requests.length,1);assert.match(h.html,/Confirm revocation/);assert.match(h.html,/other event assignments remain unchanged/);await h.click('Cancel');assert.equal(h.state.requests.length,1);await h.click('Revoke assignment');await h.click('Confirm revoke');assert.match(h.html,/already revoked/);assert.match(h.html,/No organizer accounts are assigned/);
});
test('organizer UI list failure is not an empty list; mutation failure preserves assignment',async()=>{
  const fail=await uiHarness('PartnerOrganizerAccess',{eventId:EVENT,eventName:'Fixture event'},async()=>Response.json({error:'Unavailable'},{status:500}));assert.match(fail.html,/Organizer list unavailable/);assert(!fail.html.includes('No organizer accounts are assigned'));
  const h=await uiHarness('PartnerOrganizerAccess',{eventId:EVENT,eventName:'Fixture event'},async(url,init)=>init.method==='DELETE'?Response.json({error:'Revoke failed'},{status:500}):Response.json({eventId:EVENT,organizers:[organizer]}));await h.click('Revoke assignment');await h.click('Confirm revoke');assert.match(h.html,/Revoke failed/);assert.match(h.html,/Existing Builder/);
});
test('static security boundaries: no profile role writes, email search, account creation, raw directory or organizer bypass',()=>{
  const root=path.resolve(__dirname,'..'),configSource=fs.readFileSync(path.join(root,'src/app/api/admin/partner-config/route.ts'),'utf8'),organizerSource=fs.readFileSync(path.join(root,'src/app/api/admin/partner-organizers/route.ts'),'utf8');
  assert.equal((configSource.match(/await requireAdmin\(req\)/g)||[]).length,3);assert.equal((organizerSource.match(/await requireAdmin\(req\)/g)||[]).length,3);assert(!/listUsers|createUser|updateUser|\.ilike\(|\.from\("profiles"\)\.update/.test(organizerSource));assert.match(organizerSource,/created_by: auth.user.id/);
  const tab=fs.readFileSync(path.join(root,'src/app/admin/_tabs/PartneringTab.tsx'),'utf8');assert.match(tab,/<PartnerManagement onChanged={loadLeads}/);assert.match(tab,/Create or match event \(legacy portal\)/);
});
