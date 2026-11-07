/* eslint-disable @typescript-eslint/no-require-imports -- Finite shared-boundary acceptance matrix; filesystem and network intercepted for report tests. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {harness}=require('./ppt-vision-harness.cjs'),h=harness({}, {URLSearchParams});
const p=h.load('src/lib/hackathons/providers.ts'),s=h.load('src/lib/hackathons/source.ts'),life=h.load('src/lib/hackathons/lifecycle.ts'),sync=h.load('src/lib/hackathons/synchronize.ts');
const fx=require('../qa/fixtures/aggregator/provider-facts.cjs'),now=Date.parse('2026-11-03T12:00:00+05:30'),hash='c'.repeat(64);
function payload(){const raw=structuredClone(fx.unstop);Object.assign(raw.data.competition,{rounds:[fx.buildStage('2026-11-02T09:00:00+05:30','2026-11-04T18:00:00+05:30')],regnRequirements:{reg_status:'CLOSED'}});return raw;}
function observation(){return p.parseUnstop(p.identifySource('https://unstop.com/hackathons/synthetic-1234'),payload(),now,hash);}
const row=(m,id='fake')=>({id,name:'Fake',type:'external',status:'approved',archived:false,website_url:m.canonical_url,source_metadata:m});
const corrupt={
 'conflicting-provider':m=>{m.provider='devfolio';delete m.evidence.event_date_basis;},
 'conflicting-source-url':m=>{m.facts.website_url='https://other.devfolio.co';},
 'conflicting-provider-id':m=>{m.provider_id='9876';},
 'reversed-v3':m=>{m.facts.start_date='2026-11-05';m.facts.end_date='2026-11-01';m.event_status='ended';},
 'missing-v3-boundary':m=>{m.facts.end_date=null;},
 'malformed-event-date':m=>{m.facts.start_date='not-a-date';},
 'contradictory-lifecycle':m=>{m.event_status='ended';},
 'contradictory-issues':m=>{m.issues=['incomplete_or_contradictory_build_window'];},
 'malformed-registration':m=>{m.facts.registration_end='abcdefghij';},
 'reversed-registration':m=>{m.facts.registration_start='2026-11-05';m.facts.registration_end='2026-11-01';},
};
for(const [name,mutate]of Object.entries(corrupt))test('contract rejects '+name+' across projection/lifecycle/patch/reconciliation',()=>{
 const m=observation();mutate(m);const before=JSON.stringify(m),event=row(m),r=sync.reconciliation(event,m);
 assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(life.eventState(event,now),'unknown');assert.equal(life.activeOpportunity(event,now),false);
 assert.deepEqual({...sync.sourcePatch(m)},{});assert.equal(r.classification,'unresolved');assert.deepEqual({...r.changes},{});assert.equal(JSON.stringify(m),before);
 assert.notEqual(s.synchronizedEvent(event).start_date,m.facts.start_date);
});
test('a cached marker without replayable stage evidence cannot authorize recommendations',()=>{
 const m=observation();delete m.evidence.build_inventory;
 assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(life.eventState(row(m),now),'unknown');assert.equal(sync.sourcePatch(m).start_date,undefined);
});
test('retained stage evidence is replayed rather than trusting its marker or projected dates',()=>{
 const m=observation();m.evidence.build_inventory=[fx.buildStage('2026-11-05','2026-11-06')];
 assert.equal(s.hasEventScheduleEvidence(m),false);assert.deepEqual({...sync.sourcePatch(m)},{});
});
test('bounded inventory retains private-round exclusions and never truncates oversized evidence into authority',()=>{
 const raw=payload();raw.data.competition.rounds.push({status:'DRAFT',is_hidden:0,is_inactive:0});
 const m=p.parseUnstop(p.identifySource('https://unstop.com/o/1234'),raw,now,hash);assert(s.hasEventScheduleEvidence(m));
 raw.data.competition.rounds=Array.from({length:41},()=>fx.buildStage('2026-11-02','2026-11-04'));
 const large=p.parseUnstop(p.identifySource('https://unstop.com/o/1234'),raw,now,hash);assert.equal(s.hasEventScheduleEvidence(large),false);assert.deepEqual({...sync.sourcePatch(large)},{});
});
test('conflicting request identity is rejected before provider requests',async()=>{
 const {SourceTransport}=h.load('src/lib/hackathons/sourceTransport.ts');let calls=0;
 const transport=new SourceTransport(async()=>{calls++;throw Error('No request allowed');});
 await assert.rejects(transport.detail({...p.identifySource('https://unstop.com/o/1234'),provider:'devfolio'}),/Invalid source identity/);assert.equal(calls,0);
});
test('synchronization isolates conflicting cached identity before lease or write calls',async()=>{
 const m=observation();corrupt['conflicting-provider'](m);let reads=0,rpcs=0;
 const client={from(table){const chain={select(){return chain;},order(){return chain;},limit(){return chain;},gt(){return chain;},abortSignal(){return Promise.resolve({data:table==='hackathons'?(reads++===0?[row(m)]:[]):[],error:null});}};return chain;},rpc(){rpcs++;throw Error('No RPC allowed');}};
 const loader=harness({'./sourceTransport':{discoverSources:async()=>({identities:[],failures:[]}),SourceTransport:class {remaining(){return 240000;}}}},{URLSearchParams});
 const result=await loader.load('src/lib/hackathons/synchronize.ts').synchronizeCatalog(client,{dryRun:false});
 assert.equal(rpcs,0);assert.equal(result.results[0].classification,'unresolved');assert.equal(result.results[0].reason,'invalid_cached_observation');
});
test('supported Unstop aliases bind the same stable identity; unrelated record identity cannot consume evidence',()=>{
 const m=observation();m.canonical_url='https://unstop.com/o/1234';assert(s.hasEventScheduleEvidence(m));
 assert.equal(sync.reconciliation({...row(m),website_url:'https://unstop.com/hackathons/renamed-1234'},m).classification,'ongoing_registration_closed');
 const r=sync.reconciliation({...row(m),website_url:'https://unstop.com/hackathons/another-9999'},m);assert.equal(r.classification,'unresolved');assert.deepEqual({...r.changes},{});
});
test('Devfolio UUID/slug and Hack2Skill listing identity remain supported',()=>{
 const dev=p.parseDevfolio(p.identifySource('https://synthetic-build.devfolio.co/'),'<script id="__NEXT_DATA__">'+JSON.stringify(fx.devfolio)+'</script>',now,hash);
 assert.equal(s.sourceMetadata(dev).provider_id,'synthetic-devfolio-uuid');assert(life.activeOpportunity(row(dev),now));
 const hack=p.parseHack2skill({...p.identifySource('https://hack2skill.com/event/synthetic'),provider_id:'a'.repeat(24)},{success:true,data:{title:'Fake',type:'HACKATHON',startDate:'2026-11-02T09:00:00+05:30',endDate:'2026-11-04T18:00:00+05:30',registrationStatus:'CLOSED',tags:{}}},now,hash);
 assert.equal(life.eventState(row(hack),now),'ongoing');assert(life.activeOpportunity(row(hack),now));
});
test('fresh provider status contradicting published future dates cannot authorize patches',()=>{
 const raw=structuredClone(fx.devfolio);raw.props.pageProps.hackathon.event_status='ENDED';
 const m=p.parseDevfolio(p.identifySource('https://synthetic-build.devfolio.co'),'<script id="__NEXT_DATA__">'+JSON.stringify(raw)+'</script>',now,hash);
 assert.equal(life.eventState(row(m),now),'unknown');assert.deepEqual({...sync.sourcePatch(m)},{});
});
test('observation-time consistency allows the clock to advance across an India calendar boundary',()=>{
 const m=observation();assert(s.hasEventScheduleEvidence(m));assert.equal(life.eventState(row(m),now),'ongoing');
 const raw=structuredClone(fx.unstop);raw.data.competition.rounds=[fx.buildStage('2026-11-03T00:00:00+05:30','2026-11-04T00:00:00+05:30')];raw.data.competition.regnRequirements={reg_status:'CLOSED'};
 const checked=Date.parse('2026-11-03T23:59:00+05:30'),one=p.parseUnstop(p.identifySource('https://unstop.com/o/1234'),raw,checked,hash);
 assert.equal(life.eventState(row(one),Date.parse('2026-11-03T23:59:59.999+05:30')),'ongoing');assert.equal(life.eventState(row(one),Date.parse('2026-11-04T00:00:00+05:30')),'ended');
 assert.equal(life.eventDate('2026-11-03T12:00:00+05:30'),life.eventDate('2026-11-03T06:30:00Z'));
 assert.equal(life.eventDate('2026-02-30'),null);assert.equal(life.eventDate('2026-11-03T24:00:00Z'),null);
 assert.equal(life.eventState({type:'native',start_date:'2026-11-03',end_date:'2026-11-03'},now),'ongoing');
});
async function reportRun(mode,entries){
 const snapshot=JSON.stringify({records:entries.map((r,i)=>({id:String(i),name:'Fake',website_url:'https://unstop.com/hackathons/synthetic-1234'}))});
 const prior={snapshotSha256:crypto.createHash('sha256').update(snapshot).digest('hex'),records:entries.length,results:entries.map((m,i)=>({id:String(i),classification:'confirmed_ended_propose_suppression',changes:{end_date:{before:null,after:'2026-11-01'}},evidence:m}))};
 const files=new Map([['snapshot',snapshot],['prior',JSON.stringify(prior)]]),mod={exports:{}};
 vm.runInNewContext(fs.readFileSync('scripts/reconcile-hackathon-catalog.cjs','utf8'),{module:mod,exports:mod.exports,URLSearchParams,fetch(){throw Error('No network');},console:{log(){},error(){}},process:{argv:['node','script','--snapshot','snapshot','--output','output',mode,'prior','--allow-public-fetch']},require(name){
  if(name==='node:fs')return {readFileSync:f=>files.get(path.basename(f)),mkdirSync(){},writeFileSync:(f,v)=>files.set(path.basename(f),v)};
  if(name==='./ppt-vision-harness.cjs')return {harness(...args){const actual=harness(...args);return {load(f){return f.endsWith('sourceTransport.ts')?{SourceTransport:class {remaining(){return 240000;}async detail(){return {body:JSON.stringify(payload()),checkedAt:now,hash};}},discoverSources:async()=>({identities:[],failures:[]})}:actual.load(f);}};}};return require(name);
 }});
 await mod.exports.main();const first=JSON.parse(files.get('output'));files.set('prior',files.get('output'));await mod.exports.main();return [first,JSON.parse(files.get('output'))];
}
for(const mode of ['--recheck-active-from','--recheck-status-from'])test('mixed corrupt/healthy rows isolated and history preserved in '+mode,async()=>{
 const entries=Object.values(corrupt).map(mutate=>{const m=observation();mutate(m);return m;});entries.push(null,observation());
 const original=JSON.stringify(entries),reports=await reportRun(mode,entries);
 for(const report of reports){assert.equal(report.results.length,entries.length);assert.equal(report.productionWrites,0);
  for(const r of report.results.slice(0,-1)){assert.equal(r.classification,'unresolved');assert.deepEqual(r.changes,{});assert.equal(r.original_classification,'confirmed_ended_propose_suppression');assert.equal(r.original_changes.end_date.after,'2026-11-01');assert(r.validation_errors.length);}
  assert.equal(report.results.at(-1).classification,'ongoing_registration_closed');
 }
 assert.equal(JSON.stringify(entries),original);
});
// Execute the actual lint CLI against synthetic ESLint results. Keep the scoped
// zero-diagnostic gate and all legacy signature/occurrence matching under test.
async function legacyLintRun(before,after,{oldSource='  legacy();\r\n  other();',currentSource='legacy();\nother();',scoped=[]}={}){
 const first={messages:before,errorCount:before.filter(m=>m.severity===2).length,warningCount:before.filter(m=>m.severity===1).length};
 const second={messages:after,errorCount:after.filter(m=>m.severity===2).length,warningCount:after.filter(m=>m.severity===1).length};
 const state={exitCode:0,errors:[],reports:[]};
 await vm.runInNewContext(fs.readFileSync('scripts/lint-aggregator.cjs','utf8'),{
  process:state,console:{log:value=>state.reports.push(value),error:error=>state.errors.push(error)},
  require(name){
   if(name==='eslint')return {ESLint:class {
    async lintFiles(){return [{filePath:'synthetic-scoped.cjs',messages:scoped,errorCount:scoped.filter(m=>m.severity===2).length,warningCount:scoped.filter(m=>m.severity===1).length}];}
    async lintText(source){assert(source===oldSource||source===currentSource);return [source===oldSource?first:second];}
   }};
   if(name==='node:child_process')return {execFileSync:()=>oldSource};
   if(name==='node:fs')return {readdirSync:()=>[],readFileSync:()=>currentSource};
   return require(name);
  },
 });
 return state;
}
const legacyDiagnostic={ruleId:'synthetic/legacy-rule',severity:2,message:'Synthetic existing diagnostic.',line:1};
const otherLegacyDiagnostic={ruleId:'synthetic/other-rule',severity:1,message:'Synthetic existing warning.',line:2};
for(const [name,current,pass]of [
 ['exact equality',[legacyDiagnostic,legacyDiagnostic,otherLegacyDiagnostic],true],
 ['removing one existing occurrence',[legacyDiagnostic,otherLegacyDiagnostic],true],
 ['removing every diagnostic',[],true],
 ['reordering existing occurrences',[otherLegacyDiagnostic,legacyDiagnostic,legacyDiagnostic],true],
 ['adding a new diagnostic',[legacyDiagnostic,legacyDiagnostic,otherLegacyDiagnostic,{...legacyDiagnostic,ruleId:'synthetic/new-rule'}],false],
 ['adding an extra duplicate',[legacyDiagnostic,legacyDiagnostic,legacyDiagnostic,otherLegacyDiagnostic],false],
 ['replacing an existing diagnostic',[legacyDiagnostic,legacyDiagnostic,{...otherLegacyDiagnostic,ruleId:'synthetic/replacement-rule'}],false],
 ['changing severity',[{...legacyDiagnostic,severity:1}],false],
 ['changing message',[{...legacyDiagnostic,message:'Changed diagnostic.'}],false],
 ['moving to a different source line',[{...legacyDiagnostic,line:2}],false],
])test('legacy lint multiset: '+name,async()=>{
 const result=await legacyLintRun([legacyDiagnostic,legacyDiagnostic,otherLegacyDiagnostic],current);
 assert.equal(result.exitCode,pass?0:1);assert.equal(result.errors.length,pass?0:1);
 if(!pass)assert.match(result.errors[0].message,/(?:baseline|legacy) diagnostics/i);
});
test('legacy lint signatures retain normalized source lines across whitespace and CRLF',async()=>{
 const result=await legacyLintRun([legacyDiagnostic],[legacyDiagnostic]);assert.equal(result.exitCode,0);
});
test('legacy lint rejects a changed source line with otherwise identical diagnostics',async()=>{
 const result=await legacyLintRun([legacyDiagnostic],[legacyDiagnostic],{currentSource:'changed();\nother();'});
 assert.equal(result.exitCode,1);assert.match(result.errors[0].message,/(?:baseline|legacy) diagnostics/i);
});
for(const severity of [1,2])test('scoped aggregator lint still rejects severity '+severity,async()=>{
 const result=await legacyLintRun([],[],{scoped:[{...legacyDiagnostic,severity}]});
 assert.equal(result.exitCode,1);assert.match(result.errors[0].message,/No new scoped diagnostics permitted/);
});
