/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-module workspace regressions. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { NextRequest } = require('next/server');
const { moduleLoader, serverHarness, dashboardHarness, identity, participant, team, id, USER, EVENT, OTHER, ROOT, renderToStaticMarkup } = require('./organizer-workspace-harness.cjs');
const load = moduleLoader();
const client = load('src/lib/partners/workspaceClient.ts');
const props = { params: Promise.resolve({ slug: 'fixture-event' }) };
const zero = { registration_count: 0, team_count: 0, participants_in_team: 0, participants_without_team: 0,
  confirmed_count: 0, waitlisted_count: 0, looking_for_team_count: 0, looking_without_team_count: 0 };
const metrics = { registration_count: 500, team_count: 120, participants_in_team: 312, participants_without_team: 188,
  confirmed_count: 450, waitlisted_count: 50, looking_for_team_count: 32, looking_without_team_count: 9 };
function apiData(section, extra = {}) { return { eventId: EVENT, section, retrievedAt: '2026-10-06T12:30:00Z', ...extra }; }
const response = data => Response.json(data);
function fixtureFetcher({ overview = metrics, rows = [participant(1)], teams = [team(1)], fail = null } = {}) {
  return async url => {
    const query = new URL(url,'https://example.invalid').searchParams;
    const section = query.get('section');
    if (section === fail) return Response.json({ error: 'PRIVATE_ERROR' }, { status: 500 });
    if (section === 'overview') return response(apiData(section,{metrics:overview}));
    const source = section === 'participants' ? rows : teams;
    const page = Number(query.get('page')), pageSize = Number(query.get('pageSize'));
    const result = source.slice((page-1)*pageSize,page*pageSize);
    return response(apiData(section,{rows:result,pagination:{page,pageSize,total:source.length,totalPages:Math.ceil(source.length/pageSize),hasNext:page*pageSize<source.length}}));
  };
}

test('unauthenticated page redirects to existing login with a local encoded return path', async () => {
  const h = serverHarness({ user: null });
  await assert.rejects(h.load('src/app/partners/[slug]/organizer/page.tsx').default(props), /NEXT_REDIRECT:\/login\?next=%2Fpartners%2Ffixture-event%2Forganizer/);
  assert.equal(h.state.queries.length,0);
});
test('login preserves only supported URL state and cannot accept an external return destination', async () => {
  const h = serverHarness({user:null});
  await assert.rejects(h.load('src/app/partners/[slug]/organizer/page.tsx').default({...props,
    searchParams:Promise.resolve({tab:'participants',pSearch:'Builder',next:'https://external.invalid',isAdmin:'true'})}),
    /NEXT_REDIRECT:\/login\?next=%2Fpartners%2Ffixture-event%2Forganizer%3Ftab%3Dparticipants%26pSearch%3DBuilder$/);
});
for (const [label, options] of [
  ['assigned organizer', {}], ['native owner', { assignedEvents: [], event:{ type:'native', organizer_id:USER } }],
  ['admin', { assignedEvents: [], profile:{role:'admin'} }], ['founder', { assignedEvents: [], user:{email:' YASHshah7117@GMAIL.COM '} }],
]) test(`server page authorizes ${label} before private rendering`, async () => {
  const h = serverHarness(options);
  const page = await h.load('src/app/partners/[slug]/organizer/page.tsx').default(props);
  assert.equal(page.props.identity.eventId,EVENT);
  assert.match(renderToStaticMarkup(page), /data-private="workspace"/);
  assert(h.state.rpcs.some(r=>r.name==='can_access_partner_event'&&r.args.p_hackathon_id===EVENT));
  const header = h.state.queries.find(q=>q.table==='hackathons'&&q.columns.includes('name'));
  assert(header); assert(!header.columns.includes('*')); assert(!header.columns.includes('organizer_id'));
  assert(h.state.clients.every(key=>key==='fixture-anon'));
});
for (const [label, options] of [
  ['wrong-event organizer',{assignedEvents:[OTHER]}], ['revoked organizer',{assignedEvents:[]}], ['banned organizer',{profile:{is_banned:true}}],
  ['banned admin',{profile:{role:'admin',is_banned:true}}], ['banned founder',{user:{email:'yashshah7117@gmail.com'},profile:{is_banned:true}}],
  ['unknown ban state',{profile:{is_banned:null}}], ['missing profile',{profile:null}], ['non-boolean predicate',{nonboolean:true}],
  ['external owner without assignment',{assignedEvents:[],event:{organizer_id:USER}}],
]) test(`server page denies ${label} without private content or event facts`, async () => {
  const h = serverHarness(options);
  const page = await h.load('src/app/partners/[slug]/organizer/page.tsx').default(props);
  const html = renderToStaticMarkup(page);
  assert.match(html,/Organizer access denied/); assert(!html.includes('data-private'));
  assert(!html.includes(identity.eventName)); assert(!h.state.queries.some(q=>q.table==='hackathons'&&q.columns.includes('name')));
});
test('unknown slug is not-found; missing event and legacy config are intentional unavailable states', async () => {
  const missing = serverHarness({ missingPartner:true });
  await assert.rejects(missing.load('src/app/partners/[slug]/organizer/page.tsx').default(props), /NEXT_NOT_FOUND/);
  for (const options of [{partner:{hackathon_id:null}}, {missingEvent:true}, {partner:{features:{}}}]) {
    const h = serverHarness(options);
    const page = await h.load('src/app/partners/[slug]/organizer/page.tsx').default(props);
    assert.match(renderToStaticMarkup(page),/Event information is being finalized/); assert(!page.props.identity);
  }
});
for (const table of ['profiles','partner_configs','hackathons']) test(`server ${table} error is logged and unavailable without false private content`, async () => {
  const h = serverHarness({ lookupError:table });
  const page = await h.load('src/app/partners/[slug]/organizer/page.tsx').default(props);
  const html = renderToStaticMarkup(page);
  assert.match(html,/temporarily unavailable/); assert(!html.includes('PRIVATE_ERROR')); assert(h.state.logs.length>0);
});
test('server predicate lookup failure denies private rendering as unavailable', async () => {
  const h = serverHarness({rpcError:{code:'XX000'}});
  const page = await h.load('src/app/partners/[slug]/organizer/page.tsx').default(props);
  assert.match(renderToStaticMarkup(page),/temporarily unavailable/);
});
test('header includes only confirmed facts and strips private extras', async () => {
  const h = serverHarness({ partner:{private_contact:'PRIVATE_CONTACT'},event:{name:identity.eventName,email:'PRIVATE_EMAIL',
    metadata:'PRIVATE_METADATA',min_team_size:4,max_team_size:2,start_date:'bad',end_date:'bad',mode:'unconfirmed',status:'secret'} });
  const result = await h.load('src/lib/partners/workspace.ts').resolveOrganizerWorkspace(await h.request(),'fixture-event');
  assert.equal(result.kind,'authorized'); assert.equal(result.identity.minTeamSize,null); assert.equal(result.identity.mode,null);
  assert(!JSON.stringify(result).includes('PRIVATE_')); assert.equal(result.identity.approvalStatus,null);
});
test('private metadata is generic and no-index', () => {
  const metadata = serverHarness().load('src/app/partners/[slug]/organizer/page.tsx').metadata;
  assert.equal(metadata.robots.index,false); assert(!JSON.stringify(metadata).includes(identity.eventName));
});
for (const [label, options, redirect] of [
  ['authorized V1',{},true], ['non-V1 native',{event:{type:'native',organizer_id:USER},partner:{features:{}}},false],
  ['revoked V1',{assignedEvents:[]},false], ['banned V1',{profile:{is_banned:true}},false], ['signed-out',{user:null},false],
  ['ambiguous associations',{associations:[{slug:'fixture-event',features:{portal_version:'organizer-v1'}},{slug:'other-event',features:{portal_version:'organizer-v1'}}]},false],
  ['malformed slug',{associations:[{slug:'//external.invalid',features:{portal_version:'organizer-v1'}}]},false],
]) test(`legacy organizer route: ${label}`, async () => {
  const h = serverHarness(options);
  const layout = h.load('src/app/hackathons/[id]/organizer/layout.tsx').default;
  const props = {params:Promise.resolve({id:EVENT}),children:'LEGACY_NATIVE_CONTENT'};
  if (redirect) await assert.rejects(layout(props),/NEXT_REDIRECT:\/partners\/fixture-event\/organizer/);
  else assert.equal(await layout(props),'LEGACY_NATIVE_CONTENT');
});
test('shell classifies only private partner organizer routes as bare and retains public marketing', () => {
  const nav = load('src/components/shell/navConfig.tsx');
  const layout = load('src/lib/layoutConfig.ts');
  for(const slug of ['fixture-event','another-partner']) {
    const path = `/partners/${slug}/organizer`;
    assert(nav.isBareRoute(path)); assert(!nav.isMarketingRoute(path)); assert(nav.isForcedDarkRoute(path)); assert(!layout.shouldRenderFooter(path));
    assert(nav.isMarketingRoute(`/partners/${slug}`)); assert(!nav.isBareRoute(`/partners/${slug}`));
  }
  assert(!nav.isBareRoute('/partners/fixture-event/organizer-notes'));
});
test('middleware refreshes private-route cookies; public partner pages remain public', async () => {
  let calls = 0;
  const load = moduleLoader({'@supabase/ssr':{createServerClient(_url,_key,options) {
    return {auth:{async getUser(){calls++;options.cookies.setAll([{name:'refreshed-session',value:'fixture',options:{httpOnly:true}}]);return {data:{user:{id:USER}}};}}};
  }}});
  const middleware = load('src/middleware.ts');
  assert(middleware.config.matcher.includes('/partners/:slug/organizer'));
  assert(middleware.config.matcher.includes('/api/partners/:slug/organizer/:path*'));
  const response = await middleware.middleware(new NextRequest('https://example.invalid/partners/fixture-event/organizer'));
  assert.equal(response.cookies.get('refreshed-session').value,'fixture'); assert.equal(calls,1);
  await middleware.middleware(new NextRequest('https://example.invalid/partners/fixture-event')); assert.equal(calls,1);
});
test('middleware authentication never substitutes for event authorization', async () => {
  const load = moduleLoader({'@supabase/ssr':{createServerClient() {return {auth:{async getUser(){return {data:{user:{id:USER}}};}}};}}});
  assert.equal((await load('src/middleware.ts').middleware(new NextRequest('https://example.invalid/partners/fixture-event/organizer'))).status,200);
  const h = serverHarness({assignedEvents:[]});
  assert.match(renderToStaticMarkup(await h.load('src/app/partners/[slug]/organizer/page.tsx').default(props)),/Organizer access denied/);
});
test('signed-out middleware API response is private JSON; page login retains local URL state', async () => {
  const load = moduleLoader({'@supabase/ssr':{createServerClient() {return {auth:{async getUser(){return {data:{user:null}};}}};}}});
  const middleware = load('src/middleware.ts').middleware;
  const api = await middleware(new NextRequest('https://example.invalid/api/partners/fixture-event/organizer/export'));
  assert.equal(api.status,401); assert.equal(api.headers.get('Cache-Control'),'private, no-store');
  const page = await middleware(new NextRequest('https://example.invalid/partners/fixture-event/organizer?tab=teams'));
  const redirect = new URL(page.headers.get('Location')); assert.equal(redirect.pathname,'/login');
  assert.equal(redirect.searchParams.get('next'),'/partners/fixture-event/organizer?tab=teams');
});
test('organizer middleware preserves bearer transport while API and export still authorize', async () => {
  const load = moduleLoader({'@supabase/ssr':{createServerClient() {throw Error('Bearer transport must reach its authoritative API');}}});
  const middleware = load('src/middleware.ts').middleware;
  const { harness } = require('./partner-organizer-harness.cjs');
  for (const kind of ['api','export']) {
    const suffix = kind === 'export' ? '/export' : '';
    for (const token of ['fixture-session','invalid-session']) {
      const response = await middleware(new NextRequest(`https://example.invalid/api/partners/fixture-event/organizer${suffix}`,{headers:{Authorization:`Bearer ${token}`}}));
      assert.equal(response.status,200);
    }
    assert.equal((await harness().call(kind)).status,200);
    assert.equal((await harness({allowedEvents:[]}).call(kind)).status,403);
    assert.equal((await harness({authError:{code:'invalid'}}).call(kind)).status,401);
  }
});

test('overview shows exact API zero metrics and useful community empty state', async () => {
  const h = await dashboardHarness({fetcher:fixtureFetcher({overview:zero,rows:[],teams:[]})});
  assert.equal((h.html.match(/<dd>0<\/dd>/g)||[]).length,4);
  assert.match(h.html,/No one has joined Fixture Build Weekend on HackerMate yet/);
  assert.match(h.html,/This says nothing about registrations on the organizer/);
  await h.click('Copy public event link'); assert.deepEqual(h.state.copied,['https://example.invalid/partners/fixture-event']);
  assert.match(h.html,/Public event link copied/);
});
test('populated overview renders exact metrics and actionable looking/unteamed context', async () => {
  const h = await dashboardHarness({fetcher:fixtureFetcher()});
  for(const number of [500,120,312,188,32,9]) assert(h.html.includes(`>${number}<`));
  assert.match(h.html,/pTeamState=without_team/); assert.match(h.html,/pLooking=true/);
  assert.match(h.html,/Recent HackerMate registrations/); assert.match(h.html,/Builder 1/);
  assert(h.state.queries.some(q=>q.url.includes('pageSize=5&sort=newest')));
});
test('overview API failure shows unavailable with retry, never false zeros', async () => {
  const h = await dashboardHarness({fetcher:fixtureFetcher({fail:'overview'})});
  assert(!h.html.includes('<dd>0</dd>')); assert(!h.html.includes('No one has joined'));
  assert.match(h.html,/Summary: This section is temporarily unavailable/);
  assert(h.controls.some(c=>c.type==='button'&&Array.isArray(c.children)&&c.children.join('')==='Retry summary'));
  assert(!h.html.includes('PRIVATE_ERROR'));
});
test('unconfirmed team limits suppress compliance requests, states, and filters', async () => {
  const h = await dashboardHarness();
  assert.match(h.html,/Team-size checks unavailable until event limits are confirmed/);
  assert(!h.state.queries.some(q=>q.url.includes('sizeState')));
  await h.navigate('tab=teams&tSizeState=below_min');
  assert(!h.html.includes('Event team-size check')); assert(!h.state.queries.at(-1).url.includes('sizeState'));
});
test('confirmed limits use API filtered totals for attention, and support team compliance filters', async () => {
  const h = await dashboardHarness({identity:{minTeamSize:2,maxTeamSize:4}});
  assert(h.state.queries.some(q=>q.url.includes('sizeState=below_min'))); assert(h.state.queries.some(q=>q.url.includes('sizeState=above_max')));
  await h.navigate('tab=teams&tSizeState=above_max');
  assert.match(h.html,/Event team-size check/); assert(h.state.queries.at(-1).url.includes('sizeState=above_max'));
});
test('participant rows render approved fields and public profile links without PII', async () => {
  const h = await dashboardHarness({query:'tab=participants'});
  for(const text of ['Builder 1','College A','react','Confirmed','Alpha','Joined HackerMate']) assert(h.html.includes(text));
  assert(h.html.includes(`/profile/${participant(1).user_id}`));
  for(const forbidden of ['PRIVATE_EMAIL','PRIVATE_PHONE','PRIVATE_METADATA','PRIVATE_ROLE','email','is_banned']) assert(!h.html.includes(forbidden));
});
test('all participant filters, search, and sort go to the API and reset pagination', async () => {
  const h = await dashboardHarness({query:'tab=participants&pPage=3'});
  await h.submit({pSearch:'Builder',pCollege:'College A',pSkill:'react',pStatus:'confirmed',pTeamState:'in_team',pLooking:'true',pSort:'name_desc'});
  const query = new URL(h.state.queries.at(-1).url,'https://example.invalid').searchParams;
  for(const [key,value] of Object.entries({section:'participants',page:'1',pageSize:'25',search:'Builder',college:'College A',skill:'react',status:'confirmed',teamState:'in_team',lookingForTeam:'true',sort:'name_desc'})) assert.equal(query.get(key),value);
  assert(!h.state.pushes.at(-1).includes('pPage=3')); assert.match(h.html,/1 matching participants/);
});
test('URL refresh/back navigation, pagination, and filter clearing remain predictable', async () => {
  const rows = Array.from({length:51},(_,i)=>participant(i+1));
  const h = await dashboardHarness({query:'tab=participants',rows});
  assert.match(h.html,/page 1 of 3/); assert(h.html.includes('pPage=2'));
  await h.navigate('tab=participants&pPage=2&pSearch=Builder'); assert.match(h.html,/page 2 of 3/);
  assert(h.html.includes('Builder 26')); assert(!h.html.includes('Builder 1</a>'));
  await h.navigate('tab=participants'); assert.match(h.html,/page 1 of 3/);
  await h.click('Clear filters'); assert(!h.state.pushes.at(-1).includes('pSearch'));
});
test('participant no-results, zero-data and API failure are distinct', async () => {
  const h = await dashboardHarness({query:'tab=participants&pSearch=does-not-exist'});
  assert.match(h.html,/No participants match these filters/);
  const zero = await dashboardHarness({query:'tab=participants',rows:[]}); assert.match(zero.html,/No HackerMate participants yet/);
  const failed = await dashboardHarness({query:'tab=participants',fetcher:fixtureFetcher({fail:'participants'})});
  assert.match(failed.html,/Participants: This section is temporarily unavailable/); assert(!failed.html.includes('No HackerMate participants yet'));
});
test('teams expose minimal roster, counts, recruiting, needs and normal team links', async () => {
  const h = await dashboardHarness({query:'tab=teams',identity:{minTeamSize:2,maxTeamSize:4}});
  for(const text of ['Team 1','Recruiting','Designer','View roster','Member 0','not joined this event on HackerMate']) assert(h.html.includes(text));
  assert(h.html.includes(`/teams/${team(1).team_id}`));
  for(const forbidden of ['PRIVATE_CHAT','PRIVATE_TASKS','PRIVATE_RESOURCES','PRIVATE_EVALUATION','PRIVATE_ROSTER_EMAIL','/workspace','/messages/']) assert(!h.html.includes(forbidden));
});
test('team filters are API-supported and do not cross into participant scope', async () => {
  const h = await dashboardHarness({query:'tab=teams',identity:{minTeamSize:2,maxTeamSize:4}});
  await h.submit({tSearch:'Team',tRecruiting:'true',tSizeState:'within_limits',tSort:'size_desc'});
  const query = new URL(h.state.queries.at(-1).url,'https://example.invalid').searchParams;
  for(const [key,value] of Object.entries({section:'teams',search:'Team',recruiting:'true',sizeState:'within_limits',sort:'size_desc'})) assert.equal(query.get(key),value);
  assert(!query.has('lookingForTeam'));
});
test('team empty/no-results/failure states avoid claiming external teams are absent', async () => {
  const h = await dashboardHarness({query:'tab=teams',teams:[]}); assert.match(h.html,/No event-linked teams yet/);
  assert.match(h.html,/Teams on the organizer’s site may be different/);
  const noResults = await dashboardHarness({query:'tab=teams&tSearch=nonexistent'}); assert.match(noResults.html,/No teams match these filters/);
  const failed = await dashboardHarness({query:'tab=teams',fetcher:fixtureFetcher({fail:'teams'})});
  assert.match(failed.html,/Teams: This section is temporarily unavailable/); assert(!failed.html.includes('No event-linked teams yet'));
});
test('team attention uses confirmed event bounds and recorded membership gap only', () => {
  const small = team(1,{member_count:1,registered_member_count:0});
  assert.equal(client.teamAttention(small,false).length,1);
  assert.equal(client.teamAttention(small,true).length,2);
  assert(client.teamAttention(team(5),true).some(reason=>reason.includes('Above')));
  assert(!client.teamAttention(team(1,{event_min_team_size:null,event_max_team_size:null}),true).some(reason=>reason.includes('minimum')));
});
test('export uses protected route, saved participant filters and every matching page', async () => {
  const h = await dashboardHarness({query:'tab=teams&pPage=9&pSearch=Builder&pCollege=College+A&pSkill=react&pStatus=confirmed&pTeamState=in_team&pLooking=true&pSort=name_desc&tSearch=Other&tRecruiting=false'});
  assert.match(h.html,/saved participant filters across all pages/);
  await h.click('Export participants');
  const exportRequest = h.state.queries.find(q=>q.url.includes('/organizer/export'));
  const query = new URL(exportRequest.url,'https://example.invalid').searchParams;
  for(const key of ['search','college','skill','status','teamState','lookingForTeam','sort']) assert(query.has(key));
  for(const key of ['page','pageSize','section','recruiting','sizeState']) assert(!query.has(key));
  assert.equal(h.state.downloads.length,1); assert(h.state.downloads[0].clicked); assert.deepEqual(h.state.revoked,['blob:fixture']);
  const text = await h.state.downloads[0].blob.text(); assert(!text.includes('PRIVATE_EMAIL')); assert(text.includes('Builder 1'));
});
test('export 500/error JSON cannot become a downloaded CSV or a false zero', async () => {
  const fallback = fixtureFetcher();
  const h = await dashboardHarness({fetcher:(url,init)=>url.includes('/export') ? Response.json({error:'PRIVATE_ERROR'},{status:500}) : fallback(url,init)});
  await h.click('Export participants'); assert.equal(h.state.downloads.length,0); assert.match(h.html,/Participant export is unavailable/);
});
test('export includes matches beyond the visible participant page', async () => {
  const rows = Array.from({length:101},(_,i)=>participant(i+1));
  const h = await dashboardHarness({query:'tab=participants&pPage=2&pSearch=Builder',rows});
  assert(h.html.includes('Builder 26')); assert(!h.html.includes('Builder 101</a>'));
  await h.click('Export participants');
  const text = await h.state.downloads[0].blob.text(); assert(text.includes('Builder 101')); assert(text.includes('Builder 1'));
});
for(const status of [401,403]) test(`export ${status} hides private workspace and releases no download`, async () => {
  const fallback = fixtureFetcher();
  const h = await dashboardHarness({fetcher:(url,init)=>url.includes('/export') ? Response.json({error:'private'},{status}) : fallback(url,init)});
  await h.click('Export participants'); assert.equal(h.state.downloads.length,0);
  assert(!h.html.includes(identity.eventName)); assert(!h.html.includes('Export participants'));
});
test('late responses from an earlier filter cannot replace the current participant result', async () => {
  let release;
  const fallback = fixtureFetcher({rows:[participant(1,{full_name:'Current Builder'})]});
  const h = await dashboardHarness({query:'tab=participants&pSearch=old',fetcher:(url,init)=>{
    const query = new URL(url,'https://example.invalid').searchParams;
    return query.get('section')==='participants'&&query.get('search')==='old' ? new Promise(resolve=>{release=resolve;}) : fallback(url,init);
  }});
  assert.match(h.html,/Loading participants/);
  await h.navigate('tab=participants&pSearch=new'); assert(h.html.includes('Current Builder'));
  release(response(apiData('participants',{rows:[participant(2,{full_name:'Stale Builder'})],pagination:{page:1,pageSize:25,total:1,totalPages:1,hasNext:false}})));
  await h.flush(); assert(h.html.includes('Current Builder')); assert(!h.html.includes('Stale Builder'));
});
for(const status of [401,403]) test(`API ${status} clears all private content after access/session changes`, async () => {
  let denied = false;
  const fallback = fixtureFetcher();
  const h = await dashboardHarness({query:'tab=participants',fetcher:(url,init)=>denied ? Response.json({error:'private'},{status}) : fallback(url,init)});
  assert(h.html.includes('Builder 1')); denied = true; await h.click('Refresh');
  assert(!h.html.includes('Builder 1')); assert(!h.html.includes(identity.eventName)); assert(!h.html.includes('Export participants'));
  assert.match(h.html,status===401 ? /Sign in to the organizer workspace/ : /Organizer access denied/);
});
test('manual refresh repeats current requests once without polling', async () => {
  const h = await dashboardHarness({query:'tab=participants'}); const before = h.state.queries.length;
  await h.click('Refresh'); assert.equal(h.state.queries.length,before+2);
  await h.flush(); assert.equal(h.state.queries.length,before+2);
  assert.equal(h.state.refreshes,1);
});
test('out-of-range pages with matching rows elsewhere are not presented as zero event data', async () => {
  for(const tab of ['participants','teams']) {
    const h = await dashboardHarness({query:`tab=${tab}&${tab==='participants'?'pPage':'tPage'}=9`});
    assert(h.html.includes(`No ${tab} on this page`)); assert.match(h.html,/Return to first page/);
    assert(!h.html.includes('No HackerMate participants yet')); assert(!h.html.includes('No event-linked teams yet'));
  }
});
test('URL normalization drops unsupported authority flags, malformed and duplicate filters', () => {
  const params = client.workspaceParams(new URLSearchParams('tab=teams&isAdmin=true&eventId=other&pPage=-1&pSort=bad&pSearch=a&pSearch=b&tSizeState=below_min'),false);
  assert.equal(params.toString(),'tab=teams');
  const text = client.workspaceParams(new URLSearchParams('pSkill='+ 'x'.repeat(101)),false); assert.equal(text.get('pSkill').length,100);
});
for(const corrupt of [
  {eventId:OTHER}, {metrics:{...zero,registration_count:-1}}, {metrics:{...zero,registration_count:'0'}}, {retrievedAt:'invalid'},
]) test(`invalid or wrong-event API data is unavailable rather than zero: ${JSON.stringify(corrupt)}`, () => {
  assert.throws(()=>client.decodeWorkspaceResponse(apiData('overview',{metrics:zero,...corrupt}),EVENT,new URLSearchParams('section=overview')));
});
test('response decoding strips injected private fields before presentation', () => {
  const value = apiData('participants',{rows:[participant(1)],pagination:{page:1,pageSize:25,total:1,totalPages:1,hasNext:false}});
  const decoded = client.decodeWorkspaceResponse(value,EVENT,new URLSearchParams('section=participants&page=1&pageSize=25'));
  assert(!JSON.stringify(decoded).includes('PRIVATE_')); assert.equal(decoded.rows[0].event_teams[0].team_id,id(3001));
});
test('workspace UI source has no raw database reads, client CSV generation or provisioning', () => {
  for(const file of ['src/components/partners/OrganizerDashboard.tsx','src/components/partners/OrganizerTables.tsx','src/components/partners/OrganizerFilters.tsx','src/lib/partners/workspaceClient.ts']) {
    const source = fs.readFileSync(path.join(ROOT,file),'utf8');
    for(const forbidden of ['.from(','.rpc(','createClient(', 'event_organizers', 'toCsv(', 'setInterval(']) assert(!source.includes(forbidden),file+':'+forbidden);
    assert(!/href=[^\n]*\/workspace/.test(source));
  }
});
test('native filter panel starts collapsed on mobile and open on desktop after hydration', () => {
  for(const desktop of [false,true]) {
    const panel = {open:true}, effects=[];
    const load = moduleLoader({react:{useRef:()=>({current:panel}),useEffect:callback=>effects.push(callback)}},
      {window:{matchMedia:()=>({matches:desktop})}});
    load('src/components/partners/OrganizerFilters.tsx').default({tab:'participants',params:new URLSearchParams(),confirmedLimits:false,apply(){},clear(){}});
    effects.forEach(fn=>fn()); assert.equal(panel.open,desktop);
  }
});
