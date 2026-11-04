/* eslint-disable @typescript-eslint/no-require-imports -- Offline adversarial lifecycle and report-resume regressions. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {harness}=require('./ppt-vision-harness.cjs');
const loader=harness({}, {URLSearchParams}),p=loader.load('src/lib/hackathons/providers.ts'),s=loader.load('src/lib/hackathons/source.ts'),life=loader.load('src/lib/hackathons/lifecycle.ts'),sync=loader.load('src/lib/hackathons/synchronize.ts'),d=loader.load('src/lib/hackathons/discovery.ts');
const now=Date.parse('2026-11-03T12:00:00+05:30'),hash='b'.repeat(64),identity=p.identifySource('https://unstop.com/hackathons/synthetic-987654321');
const buildText='The actual hackathon build takes place in this stage.';
// Synthetic full-day fixtures explicitly publish instants. Production never infers these.
const instant=(v,end=false)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(Date.parse(v+'T00:00:00+05:30')+(end?86400000:0)).toISOString():v;
const round=(start_date,end_date,title='Offline build',display_text=buildText)=>({entity_type:'App\\Model\\OfflineRound',status:'LIVE',is_hidden:0,is_inactive:0,details:[{title,display_text,start_date:instant(start_date),end_date:instant(end_date,true)}]});
function observe(rounds,patch={}){return p.parseUnstop(identity,{data:{competition:{id:987654321,title:'Synthetic lifecycle review',type:'hackathons',status:'LIVE',details:'A hackathon.',regnRequirements:{reg_status:'CLOSED'},rounds,...patch}}},now,hash);}
const row=m=>({id:'fake',name:m.facts.name,type:'external',status:'approved',archived:false,start_date:'2020-01-01',end_date:'2030-01-01',source_metadata:m});
function unsafe(m){
 const event=row(m),patch=sync.sourcePatch(m),preview=sync.reconciliation(event,m);
 assert.equal(s.hasEventScheduleEvidence(m),false,'no authoritative provenance');
 assert.equal(life.eventState(event,now),'unknown');assert.equal(life.eventStateLabel(event,now),'Event schedule unverified');
 assert.equal(life.activeOpportunity(event,now),false);
 for(const tab of ['active','ongoing'])assert.equal(d.discoverEvents([event],d.readDiscoverySettings(new URLSearchParams('tab='+tab)),[],new Set(),now).length,0);
 for(const field of ['start_date','end_date']){assert(!Object.hasOwn(patch,field));assert(!Object.hasOwn(preview.changes,field));}
 assert.notEqual(preview.classification,'confirmed_ended_propose_suppression');
}
const ambiguous=(start,end)=>round(start,end,'Final coding','Teams build prototypes for the final hackathon.');
for(const firstEnd of ['2026-11-01','2026-11-04'])for(const end of [null,undefined,'not-a-date','2026-11-01','2026-11-06',42,{},[]])test('future sibling cannot disappear: '+JSON.stringify([firstEnd,end]),()=>{
 unsafe(observe([round('2026-11-01',firstEnd),ambiguous('2026-11-05',end)]));
});
for(const [start,end]of [[null,'2026-11-04'],[null,null],[{},'2026-11-04'],['2026-11-02',null],['2026-11-02','2026-11-04'],['2026-10-01','2026-10-02']])test('unknown sibling relationship is held: '+JSON.stringify([start,end]),()=>unsafe(observe([round('2026-11-01','2026-11-04'),ambiguous(start,end)])));
for(const [a,b]of [['2026-11-02','2026-11-05'],['2026-11-05','2026-11-02'],[null,'2026-11-05'],['2026-11-05',null]])test('unlinked potential builds are not an inferred whole-event envelope: '+JSON.stringify([a,b]),()=>unsafe(observe([round('2026-11-01','2026-11-04'),round(a,b)])));
test('opaque malformed round inventory is not silently dropped',()=>unsafe(observe([round('2026-11-01','2026-11-04'),null])));
test('public parent without detail inventory is unresolved',()=>unsafe(observe([round('2026-11-01','2026-11-04'),{entity_type:'App\\Model\\OfflineRound',status:'LIVE',is_hidden:0,is_inactive:0,details:[]}])));
for(const activity of ['judging','registration','presentations','orientation'])test('explicitly unrelated '+activity+' needs no event dates',()=>{
 const unrelated=round('2026-11-05',null,activity,'This stage is for '+activity+' only. No building takes place in this stage.');
 const m=observe([round('2026-11-01','2026-11-04'),unrelated]);assert.equal(m.check_status,'ok');assert.equal(life.eventState(row(m),now),'ongoing');assert.equal(sync.sourcePatch(m).end_date,'2026-11-05');
});
test('an unrelated title does not hide mixed or contradictory semantic evidence',()=>unsafe(observe([round('2026-11-01','2026-11-04'),round('2026-11-05',null,'Judging','This stage is for judging only. Building also takes place in this stage.')])));
function linked([start,firstEnd,secondStart,end]=['2026-11-01','2026-11-02','2026-11-03','2026-11-04']){const r=round(start,end);Object.assign(r,{title:'Hackathon build',display_text:buildText,start_date:instant(start),end_date:instant(end,true)});r.details=[round(start,firstEnd).details[0],round(secondStart,end).details[0]];return r;}
for(const [state,dates]of [['upcoming',['2026-11-04','2026-11-05','2026-11-06','2026-11-07']],['ongoing',undefined],['ended',['2026-10-28','2026-10-29','2026-10-30','2026-10-31']]])test('explicit common build parent retains '+state+' whole window',()=>{
 const r=linked(dates),m=observe([r]);assert.equal(m.check_status,'ok');assert.equal(s.hasEventScheduleEvidence(m),true);assert.equal(life.eventState(row(m),now),state);for(const key of ['start_date','end_date'])assert.equal(sync.sourcePatch(m)[key],new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date(r[key])));assert.equal(life.activeOpportunity(row(m),now),state==='ongoing');assert.equal(sync.reconciliation(row(m),m).classification==='confirmed_ended_propose_suppression',state==='ended');
});
for(const mutation of ['gap','overlap','reversed','missing','parent-contradiction','unlinked'])test('linked build inventory rejects '+mutation,()=>{
 const r=linked();if(mutation==='gap')r.details[1].start_date='2026-11-04';if(mutation==='overlap')r.details[1].start_date='2026-11-02';if(mutation==='reversed')r.details.reverse();if(mutation==='missing')r.details[1].end_date=null;if(mutation==='parent-contradiction')r.end_date='2026-11-05';if(mutation==='unlinked')delete r.display_text;unsafe(observe([r]));
});
for(const [state,start,end]of [['upcoming','2026-11-04','2026-11-05'],['ongoing','2026-11-01','2026-11-04'],['ended','2026-11-01','2026-11-01']])test('exactly agreeing build windows retain '+state+' multi-stage evidence',()=>{
 const m=observe([round(start,end),round(start,end,'Coding round','This round is the actual hackathon coding phase.')]);assert.equal(m.check_status,'ok');assert.equal(life.eventState(row(m),now),state);assert.equal(life.activeOpportunity(row(m),now),state==='ongoing');
});
test('linked timestamps preserve exact equivalent UTC/India boundaries',()=>{
 const m=observe([linked(['2026-11-03T00:00:00+05:30','2026-11-03T01:00:00Z','2026-11-03T06:30:00+05:30','2026-11-04T00:00:00+05:30'])]);assert.equal(m.check_status,'ok');assert.equal(life.eventState(row(m),now),'ongoing');assert.equal(life.eventDate(m.facts.start_date),Date.parse('2026-11-02T18:30:00Z'));assert.equal(life.eventState(row(m),Date.parse(m.facts.end_date)),'ended');
});
for(const end of ['2026-11-01','2026-11-04'])test('v2 '+end+' observations require a fresh check even after report reload',()=>{
 const m=observe([round('2026-11-01',end)]);m.evidence.event_date_basis='explicit_hackathon_build_stage_v2';m.parser_version='aggregator-6';unsafe(m);
 const {reinterpretRetained}=require('./reconcile-hackathon-catalog.cjs'),out=reinterpretRetained(row(m),JSON.parse(JSON.stringify(prior(m))));assert.equal(out.classification,'unresolved');assert(!Object.hasOwn(out.changes,'start_date'));assert(!Object.hasOwn(out.changes,'end_date'));
});
const malformed=[['unstop'],{provider:'unstop'},null,undefined,'','UNSTOP','Unstop',' unstop ',42,true];
for(const provider of malformed)test('provider identity is never coerced: '+JSON.stringify(provider),()=>{
 const m=observe([round('2026-11-01','2026-11-04')]);m.provider=provider;delete m.evidence.event_date_basis;
 assert.equal(s.sourceMetadata(m),null);unsafe(m);
});
for(const field of ['provider_id','canonical_url'])for(const value of [['unstop'],{},null,''])test('alternative identity field rejected: '+field+' '+JSON.stringify(value),()=>{
 const m=observe([round('2026-11-01','2026-11-04')]);m[field]=value;delete m.evidence.event_date_basis;assert.equal(s.sourceMetadata(m),null);unsafe(m);
});
for(const field of ['check_status','category','event_status'])test('metadata enum arrays cannot pass validation: '+field,()=>{
 const m=observe([round('2026-11-01','2026-11-04')]);m[field]=[m[field]];assert.equal(s.sourceMetadata(m),null);
});
function prior(evidence){return {id:'fake',provider:'unstop',classification:'confirmed_ended_propose_suppression',changes:{start_date:{before:null,after:'2026-11-01'},end_date:{before:null,after:'2026-11-01'}},requires_adoption:true,...(evidence===undefined?{}:{evidence})};}
for(const evidence of [undefined,null,{},[],{provider:['unstop']}])test('retained report withdraws unsupported proposals: '+JSON.stringify(evidence),()=>{
 const {reinterpretRetained}=require('./reconcile-hackathon-catalog.cjs'),input=prior(evidence),before=JSON.stringify(input),out=reinterpretRetained({id:'fake',name:'fake'},input);
 assert.equal(out.classification,'unresolved');assert.deepEqual(out.changes,{});assert.equal(out.requires_fresh_verification,true);assert.equal(out.original_classification,input.classification);assert.deepEqual(out.original_changes,input.changes);assert.equal(JSON.stringify(input),before);
 const reloaded=JSON.parse(JSON.stringify(out)),again=reinterpretRetained({id:'fake',name:'fake'},reloaded);assert.equal(again.classification,'unresolved');assert.deepEqual(again.changes,{});assert.deepEqual(again.original_changes,input.changes);
});
for(const mode of ['--recheck-active-from','--recheck-status-from'])for(const evidence of [undefined,null,{issues:{}}])test('actual resumed report reload fails closed: '+mode+' '+JSON.stringify(evidence),async()=>{
 const snapshot=JSON.stringify({records:[{id:'fake',name:'fake',website_url:identity.canonical_url}]}),cache={snapshotSha256:crypto.createHash('sha256').update(snapshot).digest('hex'),records:1,results:[prior(evidence)]};
 const files=new Map([['snapshot',snapshot],['prior',JSON.stringify(cache)]]),output='output',reportModule={exports:{}};
 const realHarness=require('./ppt-vision-harness.cjs');
 vm.runInNewContext(fs.readFileSync('scripts/reconcile-hackathon-catalog.cjs','utf8'),{module:reportModule,exports:reportModule.exports,URLSearchParams,fetch:()=>{throw Error('No network');},console:{log(){},error(){}},process:{argv:['node','script','--snapshot','snapshot','--output',output,mode,'prior','--allow-public-fetch']},require(name){
  if(name==='node:fs')return {readFileSync:f=>files.get(path.basename(f)),mkdirSync(){},writeFileSync:(f,value)=>files.set(path.basename(f),value)};
  if(name==='./ppt-vision-harness.cjs')return {harness(...args){const actual=realHarness.harness(...args);return {load(file){if(file.endsWith('sourceTransport.ts'))return {SourceTransport:class {},discoverSources:async()=>({identities:[],failures:[]})};return actual.load(file);}};}};
  return require(name);
 }});
 await reportModule.exports.main();const report=JSON.parse(files.get(output));assert.equal(report.results[0].classification,'unresolved');assert.deepEqual(report.results[0].changes,{});assert.equal(report.results[0].requires_fresh_verification,true);assert.equal(report.productionWrites,0);assert.equal(JSON.stringify(cache.results[0]),JSON.stringify(prior(evidence)));
 files.set('prior',files.get(output));await reportModule.exports.main();const replay=JSON.parse(files.get(output));assert.equal(replay.results[0].classification,'unresolved');assert.deepEqual(replay.results[0].changes,{});assert.deepEqual(replay.results[0].original_changes,prior().changes);
});
test('retained valid observations are reassessed and retain original claims without granting write approval',()=>{
 const {reinterpretRetained}=require('./reconcile-hackathon-catalog.cjs'),m=observe([round('2026-11-01','2026-11-04')]),input=prior(m),out=reinterpretRetained(row(m),input);assert.equal(out.classification,'ongoing_registration_closed');assert.equal(out.original_classification,input.classification);assert.deepEqual(out.original_changes,input.changes);assert.equal(out.requires_fresh_verification,true);assert.equal(out.evidence,input.evidence);
});
