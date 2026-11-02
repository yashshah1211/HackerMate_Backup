/* eslint-disable @typescript-eslint/no-require-imports -- Offline exact-record acceptance replay, no database or provider operations. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./ppt-vision-harness.cjs');
const {record}=require('../qa/fixtures/mission20-unverified/algorush.json');
const loader=harness(),life=loader.load('src/lib/hackathons/lifecycle.ts'),discovery=loader.load('src/lib/hackathons/discovery.ts');
const now=Date.parse('2026-11-02T12:00:00+05:30');
const list=(rows,query='',saved=new Set())=>Array.from(discovery.discoverEvents(rows,discovery.readDiscoverySettings(new URLSearchParams(query)),[],saved,now),r=>r.id);
test('exact AlgoRush imported dates do not establish an ongoing event',()=>{
 assert.equal(life.eventState(record,now),'unknown');
 assert.equal(life.registrationState(record,now),'unknown');
});
test('exact AlgoRush is absent from default recommendations and ongoing promotion',()=>{
 assert.deepEqual(list([record]),[]);assert.deepEqual(list([record],'tab=ongoing'),[]);
});
test('exact AlgoRush remains explicitly discoverable and saved without pretending it is closed in the database',()=>{
 assert.equal(discovery.readDiscoverySettings(new URLSearchParams('tab=all')).tab,'all');
 assert.deepEqual(list([record],'tab=all'),[record.id]);
 assert.deepEqual(list([record],'tab=all&registration=unknown'),[record.id]);
 assert.deepEqual(list([record],'tab=saved',new Set([record.id])),[record.id]);
 assert.equal(record.registration_status,null);assert.equal(record.end_date,'2026-12-18');
});
test('policy applies to other providers and unknown origins rather than a name, UUID or URL exception',()=>{
 for(const website_url of ['https://synthetic.devfolio.co','https://hack2skill.com/event/synthetic','https://example.invalid/contest']){
  const other={...record,id:'synthetic-'+website_url,name:'Different competition',website_url};
  assert.equal(life.eventState(other,now),'unknown');assert.deepEqual(list([other]),[]);
 }
});
test('a synthetic 132-record missing-deadline cohort is never promoted even with unbounded imported open strings',()=>{
 const rows=Array.from({length:132},(_,i)=>({...record,id:'synthetic-unverified-'+i,registration_status:i%2?'open':null}));
 assert.deepEqual(list(rows),[]);assert.equal(list(rows,'tab=all').length,132);
});
test('genuine recorded registration windows can be recommended without claiming their external event schedule is verified',()=>{
 const open={...record,id:'synthetic-open',registration_start:'2026-10-01',registration_end:'2026-11-03'};
 const closed={...record,id:'synthetic-closed',registration_status:'closed'};
 assert.deepEqual(list([record,open,closed]),['synthetic-open']);
 assert.equal(life.eventState(open,now),'unknown');assert.equal(life.registrationState(open,now),'open');
 assert.equal(life.registrationLabel(open,now),'Registration listed as open');
 assert.deepEqual(list([closed],'tab=all&registration=closed'),['synthetic-closed']);
});
test('trusted official/native schedules and existing unknown registration review behavior are retained',()=>{
 for(const type of ['official','native']){
  const trusted={...record,id:'synthetic-'+type,type};
  assert.equal(life.eventState(trusted,now),'ongoing');assert.deepEqual(list([trusted]),[trusted.id]);
 }
});

test('unknown/null origin and a listed past end date do not prove provider closure or event completion',()=>{
 for(const type of [null,undefined,'external']){
  const uncertain={...record,type,end_date:'2026-09-01'};
  assert.equal(life.eventState(uncertain,now),'unknown');assert.equal(life.registrationState(uncertain,now),'unknown');
  assert.deepEqual(list([uncertain]),[]);assert.deepEqual(list([uncertain],'tab=past'),[record.id]);
 }
});
test('exact AlgoRush public direct lookup remains visible with the unchanged approved/unarchived read boundary',async()=>{
 const api=loader.load('src/lib/hackathons/publicBrowsing.ts'),reads=[];
 const client={from(table){assert.equal(table,'hackathons');const filters=[];return {
  select(columns){assert.equal(columns,api.PUBLIC_EVENT_COLUMNS);return this;},eq(key,value){filters.push([key,value]);return this;},
  async maybeSingle(){reads.push(filters);return {data:record,error:null};}
 };}};
 assert.equal((await api.loadPublicEvent(client,record.id)).id,record.id);
 assert.deepEqual(reads[0],[['id',record.id],['status','approved'],['archived',false]]);
});
test('hero removes event total and numeric footer but keeps builders, teams and neutral browsing even with no opportunity cards',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const Hero=harness({'next/link':({href,children})=>React.createElement('a',{href},children),
  '@/components/system':{ButtonLink:({href,children})=>React.createElement('a',{href},children)},
  './primitives':{Container:({children})=>React.createElement('div',null,children)},'./HeroPipeline':{HeroPipeline:()=>null},
 }).load('src/components/landing/LandingHero.tsx').LandingHero;
 const html=renderToStaticMarkup(React.createElement(Hero,{builderCount:321,teamCount:17,hackathonCount:410,upcoming:[]}));
 assert.match(html,/registered builders/);assert.match(html,/teams created/);assert.match(html,/321/);assert.match(html,/>17</);
 assert(!/hackathons? listed|All 410 listed|410/.test(html));assert.match(html,/href="\/hackathons"[^>]*>Browse hackathons/);
});
