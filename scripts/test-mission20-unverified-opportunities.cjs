/* eslint-disable @typescript-eslint/no-require-imports -- Offline exact-record acceptance replay, no database or provider operations. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./ppt-vision-harness.cjs');
const {record}=require('../qa/fixtures/mission20-unverified/algorush.json');
const loader=harness({}, {URLSearchParams}),life=loader.load('src/lib/hackathons/lifecycle.ts'),discovery=loader.load('src/lib/hackathons/discovery.ts');
const now=Date.parse('2026-11-02T12:00:00+05:30');
const list=(rows,query='tab=recommended',saved=new Set())=>Array.from(discovery.discoverEvents(rows,discovery.readDiscoverySettings(new URLSearchParams(query)),[],saved,now),r=>r.id);
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
test('recorded external registration windows remain explicit metadata, not default promotion',()=>{
 const open={...record,id:'synthetic-open',registration_start:'2026-10-01',registration_end:'2026-11-03'};
 const closed={...record,id:'synthetic-closed',registration_status:'closed'};
 assert.deepEqual(list([record,open,closed]),[]);
 assert.deepEqual(list([open],'tab=all&registration=open'),['synthetic-open']);
 assert.equal(life.eventState(open,now),'unknown');assert.equal(life.registrationState(open,now),'open');
 assert.equal(life.registrationLabel(open,now),'Registration listed as open');
 assert.deepEqual(list([closed],'tab=all&registration=closed'),['synthetic-closed']);
});
test('native schedules and existing unknown registration review behavior are retained',()=>{
 for(const type of ['native']){
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
test('hero labels all public listings without implying active or verified opportunities',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const Hero=harness({'next/link':({href,children})=>React.createElement('a',{href},children),
  '@/components/system':{ButtonLink:({href,children})=>React.createElement('a',{href},children)},
  './primitives':{Container:({children})=>React.createElement('div',null,children)},'./HeroPipeline':{HeroPipeline:()=>null},
 }).load('src/components/landing/LandingHero.tsx').LandingHero;
 const html=renderToStaticMarkup(React.createElement(Hero,{builderCount:321,teamCount:17,hackathonCount:410,upcoming:[]}));
 assert.match(html,/registered builders/);assert.match(html,/teams created/);assert.match(html,/321/);assert.match(html,/>17</);
 assert.match(html,/hackathons listed/); assert.match(html,/>410<\/dd>/);
 assert(!/410 active|410 registration open|All 410 verified/.test(html));assert.match(html,/href="\/hackathons"[^>]*>Browse hackathons/);
});


test('all eight reported official-pattern imports remain unverified regardless of bounded dates or owner metadata',()=>{
 const rows=Array.from({length:8},(_,i)=>({...record,id:'synthetic-official-'+i,name:'Synthetic imported record '+i,type:'official',organizer_id:null,website_url:'https://unstop.com/synthetic-'+i}));
 for(const row of rows){assert.equal(life.scheduleIsUnverified(row),true);assert.equal(life.eventState(row,now),'unknown');assert.equal(life.eventStateLabel(row,now),'Event schedule unverified');}
 assert.deepEqual(list(rows),[]);assert.deepEqual(list(rows,'tab=ongoing'),[]);assert.equal(list(rows,'tab=all').length,8);
 const bounded={...rows[0],organizer_id:'synthetic-owner',registration_start:'2026-10-01',registration_end:'2026-12-01',registration_status:'open',updated_at:'2026-11-02T06:29:59Z'};
 assert.equal(life.activeOpportunity(bounded,now),false);assert.equal(life.scheduleIsUnverified(bounded),true);
});

test('Bootcamps category ambiguity is not resolved by a bounded imported window, keywords, freshness or a title exception',()=>{
 // Founder reports Build with AI: Bootcamps is an educational workshop. Dates below are synthetic; no raw provider response is claimed.
 for(const type of ['external','official'])for(const name of ['Build with AI: Bootcamps','Different synthetic title']){
  const row={...record,id:'synthetic-workshop',type,name,description:'Educational workshop',tags:['AI','Hackathon'],registration_start:'2026-10-01',registration_end:'2026-12-01',registration_status:'open',updated_at:'2026-11-02T06:29:59Z'};
  assert.equal(life.registrationState(row,now),'open');assert.equal(life.activeOpportunity(row,now),false);assert.deepEqual(list([row]),[]);
  assert.deepEqual(list([row],'tab=all'),[row.id]);assert.deepEqual(list([row],'tab=saved',new Set([row.id])),[row.id]);
 }
});

test('November 2 founder aggregate: 410 public listings, 0 native, 8 official and 402 external produce zero default opportunities',()=>{
 // Metadata-pattern cohort matching the independently supplied aggregate, not a live catalog replica.
 const rows=Array.from({length:410},(_,i)=>({...record,id:'synthetic-public-'+i,name:'Public record '+i,type:i<8?'official':'external',organizer_id:null,registration_start:i>=8&&i<10?'2026-10-01':null,registration_end:i>=8&&i<10?'2026-12-01':null}));
 assert.equal(rows.filter(r=>r.type==='official').length,8);assert.equal(rows.filter(r=>r.type==='external').length,402);
 for(const tab of ['recommended','upcoming','ongoing'])assert.deepEqual(list(rows,'tab='+tab),[]);
 assert.equal(list(rows,'tab=all').length,410);assert.equal(rows.filter(r=>life.eventState(r,now)==='unknown').length,410);
 const saved=new Set([rows[0].id,rows[8].id,rows[409].id]);assert.deepEqual(new Set(list(rows,'tab=saved',saved)),saved);
});


test('bare directory opens active source-verified browsing; explicit All retains imported access',()=>{
 const rows=[record,{...record,id:'synthetic-closed-general',registration_status:'closed'},{...record,id:'synthetic-official-general',type:'official'}];
 assert.equal(discovery.readDiscoverySettings(new URLSearchParams()).tab,'active');
 assert.equal(list(rows,'').length,0);assert.equal(list(rows,'tab=all').length,3);assert.equal(list(rows,'tab=recommended').length,0);
 assert.equal(life.eventState(record,now),'unknown');assert.equal(life.activeOpportunity(record,now),false);
 assert.deepEqual(list(rows,'tab=all&q=AlgoRush&registration=unknown'),[record.id,'synthetic-official-general']);
});

test('default All and explicit Opportunities round-trip tab URLs, search, filters and unrelated navigation context',()=>{
 for(const tab of ['all','recommended','upcoming','ongoing','saved','past']){
  const next=new URLSearchParams(discovery.discoveryQuery(new URLSearchParams('source=partner&q=water&mode=online'),{tab}));
  assert.equal(discovery.readDiscoverySettings(next).tab,tab);assert.equal(next.get('source'),'partner');assert.equal(next.get('q'),'water');assert.equal(next.get('mode'),'online');
  if(tab==='recommended')assert.equal(next.get('tab'),'recommended');
 }
 assert.equal(discovery.readDiscoverySettings(new URLSearchParams('tab=bad')).tab,'active');
});


const admissionFilters=['unknown','open','all','closed','recorded','not-closed','not-yet-open'];
function admissionRows(type,tab){
 const base={...record,type,start_date:tab==='ongoing'?'2026-11-01':tab==='past'?'2026-09-01':'2026-11-05',end_date:tab==='past'?'2026-09-02':'2026-11-07'};
 return [
  {...base,id:type+'-open',registration_start:'2026-10-01',registration_end:'2026-11-03',registration_status:null},
  {...base,id:type+'-unknown',registration_start:null,registration_end:null,registration_status:null},
  {...base,id:type+'-closed',registration_start:'2026-10-01',registration_end:'2026-11-03',registration_status:'closed'},
  {...base,id:type+'-not-yet-open',registration_start:'2026-11-04',registration_end:'2026-11-05',registration_status:null},
 ];
}
for(const tab of ['recommended','upcoming','ongoing'])for(const registration of admissionFilters){
 test('non-native admission cannot bypass '+tab+' with registration='+registration,()=>{
  const rows=['external','official'].flatMap(type=>admissionRows(type,tab));
  assert.deepEqual(list(rows,'tab='+tab+'&registration='+registration),[]);
 });
 test('genuine native '+tab+' applies admission before registration='+registration,()=>{
  const rows=admissionRows('native',tab);
  // Open OR actual ongoing admission is mandatory before an explicit registration filter.
  const admitted=tab==='ongoing'?rows:rows.filter(r=>r.id==='native-open');
  const expected=admitted.filter(r=>registration==='all'||registration==='not-closed'&&life.registrationState(r,now)!=='closed'||registration==='recorded'&&r.registration_end!==null||life.registrationState(r,now)===registration).map(r=>r.id);
  assert.deepEqual(new Set(list(rows,'tab='+tab+'&registration='+registration)),new Set(expected));
 });
}
for(const tab of ['all','saved','past'])for(const registration of admissionFilters)test('explicit '+tab+' browsing retains registration='+registration,()=>{
 const rows=['external','official','native'].flatMap(type=>admissionRows(type,tab)),saved=new Set(rows.map(r=>r.id));
 const expected=rows.filter(r=>registration==='all'||registration==='not-closed'&&life.registrationState(r,now)!=='closed'||registration==='recorded'&&r.registration_end!==null||life.registrationState(r,now)===registration).map(r=>r.id);
 assert.deepEqual(new Set(list(rows,'tab='+tab+'&registration='+registration,saved)),new Set(expected));
});
