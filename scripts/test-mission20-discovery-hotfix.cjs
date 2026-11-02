/* eslint-disable @typescript-eslint/no-require-imports -- Offline production-schema discovery regressions. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness}=require('./ppt-vision-harness.cjs');
const loader=harness(),life=loader.load('src/lib/hackathons/lifecycle.ts'),discovery=loader.load('src/lib/hackathons/discovery.ts');
const now=Date.parse('2026-11-02T12:00:00+05:30');
const event=(id,extra={})=>({id,name:id,description:null,tags:[],start_date:'2026-11-05',end_date:'2026-11-07',
 registration_start:'2026-10-01',registration_end:'2026-11-03',location:null,mode:'online',prize_pool:null,website_url:'https://example.invalid/official',type:'native',...extra});
const results=(rows,q='',saved=new Set(),clock=now)=>Array.from(discovery.discoverEvents(rows,discovery.readDiscoverySettings(new URLSearchParams((q.includes('tab=')?'':'tab=recommended&')+q)),[],saved,clock),r=>r.id);
for(const [patch,expected] of [
 [{},'open'],[{registration_end:'2026-11-01'},'closed'],[{registration_start:null},'unknown'],
 [{registration_end:null},'unknown'],[{registration_status:'open',registration_start:null,registration_end:null},'open'],
 [{registration_status:'closed'},'closed'],[{registration_status:'cancelled'},'closed'],
 [{registration_start:'2026-11-04',registration_end:'2026-11-05'},'not-yet-open'],
 [{registration_start:'invalid'},'unknown'],[{registration_end:'2026-02-30'},'unknown'],
 [{registration_start:'2026-11-07'},'unknown'],[{registration_end:'2026-11-01',registration_status:'open'},'closed'],
])test('registration evidence '+JSON.stringify(patch),()=>assert.equal(life.registrationState(event('fixture',patch),now),expected));
test('event dates never prove registration availability or change a closed deadline',()=>{
 const ongoing=event('ongoing',{start_date:'2026-11-01',registration_end:'2026-10-31'});
 assert.equal(life.eventState(ongoing,now),'ongoing');assert.equal(life.registrationState(ongoing,now),'closed');
 assert.deepEqual(results([ongoing],'tab=ongoing'),['ongoing']);assert.deepEqual(results([ongoing],'tab=ongoing&registration=closed'),['ongoing']);
 assert.deepEqual(results([ongoing],'tab=all&registration=closed'),['ongoing']);
 assert.equal(life.registrationState(event('unknown',{registration_start:null,registration_end:null}),now),'unknown');
 assert.equal(life.registrationLabel({},now),'Registration availability unverified');
});
test('active discovery requires open or actual ongoing; All, Saved and Past retain filtered access',()=>{
 const rows=[event('open'),event('closed',{registration_status:'closed'}),event('unknown',{registration_start:null}),
  event('ongoing',{start_date:'2026-11-01'}),event('ended',{start_date:'2026-10-01',end_date:'2026-10-02',registration_end:'2026-09-30'})];
 assert.deepEqual(results(rows),['open','ongoing']);
 assert.deepEqual(results(rows,'registration=open'),['open','ongoing']);
 assert.deepEqual(results(rows,'registration=unknown'),[]);
 assert.deepEqual(results(rows,'registration=closed'),[]);
 assert.deepEqual(results(rows,'tab=all&registration=closed'),['closed','ended']);
 assert.deepEqual(results(rows,'registration=all'),['open','ongoing']);
 assert.deepEqual(results(rows,'registration=not-closed'),['open','ongoing']);
 assert.deepEqual(results(rows,'tab=saved',new Set(['closed','ended'])),['closed','ended']);
 assert.deepEqual(results(rows,'tab=past'),['ended']);
});
test('India date-only cutoff includes every millisecond of final day; explicit timestamps retain exact instant',()=>{
 const row=event('last-day',{registration_end:'2026-11-02'}),last=Date.parse('2026-11-02T23:59:59.999+05:30'),cutoff=last+1;
 assert.equal(life.registrationState(row,last),'open');assert.equal(life.registrationState(row,cutoff),'closed');
 assert.deepEqual(results([row],'',new Set(),last),['last-day']);assert.deepEqual(results([row],'',new Set(),cutoff),[]);
 const timestamp=event('timestamp',{registration_end:'2026-11-02T12:00:00+05:30'});
 assert.equal(life.registrationState(timestamp,now-1),'open');assert.equal(life.registrationState(timestamp,now),'closed');
 assert.equal(life.eventDate(timestamp.registration_end),life.eventDate('2026-11-02T06:30:00Z'));
});
test('naive, impossible and invalid-offset timestamps are never guessed',()=>{
 for(const date of ['2026-02-30','2026-11-02T12:00:00','2026-11-02T24:00:00Z','2026-11-02T12:00:00+24:00'])assert.equal(life.eventDate(date),null,date);
});
test('public read adds only existing main-schema columns; hotfix has no future RPC dependency',()=>{
 const publicApi=loader.load('src/lib/hackathons/publicBrowsing.ts');
 const schema=fs.readFileSync('src/types/supabase.ts','utf8');
 for(const name of ['registration_start','registration_end','registration_status']){
  assert(publicApi.PUBLIC_EVENT_COLUMNS.split(',').includes(name));assert(schema.includes(name+': string | null'));
 }
 for(const file of ['src/app/hackathons/[id]/page.tsx','src/lib/hackathons/discovery.ts','src/lib/hackathons/lifecycle.ts']){
  const source=fs.readFileSync(file,'utf8');assert(!/register_native_hackathon|mission20_remove_team_member|mission20_cancel_registration|\/api\/hackathons\/.+\/register/.test(source));
 }
});
