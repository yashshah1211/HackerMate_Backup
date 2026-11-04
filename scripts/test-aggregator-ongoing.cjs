/* eslint-disable @typescript-eslint/no-require-imports -- Offline fixed-clock evidence regression. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./ppt-vision-harness.cjs'),fixture=require('../qa/fixtures/aggregator/provider-facts.cjs');
const l=harness({}, {URLSearchParams}),p=l.load('src/lib/hackathons/providers.ts'),s=l.load('src/lib/hackathons/source.ts'),life=l.load('src/lib/hackathons/lifecycle.ts');
const worker=require('./run-hackermate-aggregator.cjs');
const now=Date.parse('2026-11-04T20:00:00Z'),start='2026-11-05T00:30:00+05:30',end='2026-11-05T02:30:00+05:30';
const claim='The actual hackathon build takes place from 5 Nov 2026, 12:30 AM IST to 5 Nov 2026, 2:30 AM IST.';
function observe(change=()=>{}){const raw=structuredClone(fixture.unstop),c=raw.data.competition;c.details=claim;c.rounds=[fixture.buildStage(start,end)];c.rounds[0].details[0].display_text=claim;c.regnRequirements.reg_status='FINISHED';change(c);return p.parseUnstop(p.identifySource('https://unstop.com/hackathons/synthetic-1234'),raw,now,'a'.repeat(64));}
const row=m=>({type:'external',website_url:m.canonical_url,source_metadata:m});
test('exact organizer instants reconcile with build rounds: ongoing with closed registration',()=>{
 const m=observe();assert.equal(m.check_status,'ok');assert.equal(m.facts.start_date,start);
 assert.equal(life.eventState(row(m),now),'ongoing');assert.equal(life.activeOpportunity(row(m),now),true);assert.equal(life.registrationState(row(m),now),'closed');
 assert(worker.admission(s.validateSourceObservation(m),m,now,{windowState:l.load('src/lib/hackathons/sourceEvidence.ts').windowState},true));
 const before={...m,checked_at:new Date(Date.parse(start)-1000).toISOString(),expires_at:new Date(Date.parse(start)+25*3600000).toISOString(),event_status:'upcoming'};
 for(const [at,state] of [[Date.parse(start)-1,'upcoming'],[Date.parse(start),'ongoing'],[Date.parse(end)-1,'ongoing'],[Date.parse(end),'ended']])assert.equal(life.eventState(row(before),at),state);
 assert.equal(life.eventState(row(m),now+26*3600000),'unknown');
});
for(const [name,change] of [
 ['wrong year',c=>c.details=claim.replaceAll('2026','2027')],
 ['wrong timezone',c=>c.details=claim.replaceAll('IST','PST')],
 ['missing timezone',c=>c.details=claim.replaceAll(' IST','')],
 ['date-only prose',c=>c.details='A hackathon. Event Dates: 5 November 2026.'],
 ['negation',c=>c.details='Not '+claim],
 ['extra contradictory clause',c=>c.details=claim+' The event has been postponed.'],
 ['hidden markup',c=>c.details='<span hidden>'+claim+'</span>'],
 ['split markup date conflict',c=>c.details='<p>Event <strong>Dates:</strong> 7 November 2026.</p>'],
 ['truncated organizer text',c=>c.details=claim+'x'.repeat(20001)],
 ['partial inventory',c=>c.rounds.push({status:'LIVE',is_hidden:0,is_inactive:0})],
 ['disjoint build',c=>c.rounds.push(fixture.buildStage('2026-11-07T01:00:00+05:30','2026-11-07T03:00:00+05:30'))],
 ['date-only stage',c=>{c.details='A hackathon.';c.rounds=[fixture.buildStage('2026-11-04','2026-11-05')]}],
 ['contradictory finished stage',c=>{c.rounds[0].status='FINISHED'}],
 ['generic competition only',c=>{c.details='A hackathon.';c.rounds=[];c.start_date=start;c.end_date=end}],
])test('holds '+name,()=>{const m=observe(change);assert.equal(life.eventState(row(m),now),'unknown');assert.equal(life.activeOpportunity(row(m),now),false)});
test('persisted organizer evidence is replayed, not trusted by marker',()=>{const m=observe();assert(s.validateSourceObservation(m).schedule);m.evidence.organizer_text=claim.replaceAll('2026','2027');assert.equal(s.validateSourceObservation(m).metadata,null)});
test('array evidence markers cannot coerce into a trusted basis',()=>{for(const basis of [s.UNSTOP_EVENT_DATE_BASIS,s.UNSTOP_ORGANIZER_DATE_BASIS]){const m=observe();m.evidence.event_date_basis=[basis];assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(life.eventState(row(m),now),'unknown')}});
test('existing vetted v3 evidence still validates',()=>{const m=observe(c=>{c.details='A hackathon.';c.rounds=[fixture.buildStage(start,end)]});m.evidence.event_date_basis=s.UNSTOP_EVENT_DATE_BASIS;delete m.evidence.organizer_text;assert(s.validateSourceObservation(m).schedule)});
test('protected dates and identity collisions cannot promote',()=>{const m=observe();assert.equal(life.eventState(row({...m,protected_fields:['start_date']}),now),'unknown');assert.equal(life.eventState({...row(m),website_url:'https://unstop.com/hackathons/other-9999'},now),'unknown')});
test('labeled organizer build dates agree with explicit stage instants',()=>{assert.equal(observe(c=>{c.details=claim.replace('The actual hackathon build takes place from','Hackathon Build Dates:')}).check_status,'ok')});
test('new date-only Devfolio and Hack2Skill observations cannot establish ongoing',()=>{
 const dev=structuredClone(fixture.devfolio);Object.assign(dev.props.pageProps.hackathon,{starts_at:'2026-11-04',ends_at:'2026-11-05'});
 const a=p.parseDevfolio(p.identifySource('https://synthetic-build.devfolio.co'),'<script id="__NEXT_DATA__">'+JSON.stringify(dev)+'</script>',now,'a'.repeat(64));
 const b=p.parseHack2skill({...p.identifySource('https://hack2skill.com/event/synthetic'),provider_id:'a'.repeat(24)},{success:true,data:{title:'Fake',type:'HACKATHON',startDate:'2026-11-04',endDate:'2026-11-05'}},now,'a'.repeat(64));
 for(const m of [a,b]){assert(m.evidence.schedule_reasons.includes('date_only_event_window'));assert.equal(life.eventState(row(m),now),'unknown')}
});

for(const provider of ['devfolio','hack2skill'])for(const status of ['OPEN','CLOSED'])test(provider+' calendar-only schedule preserves independent '+status+' registration',()=>{
 const registrationStart='2026-11-01T00:00:00Z',registrationEnd='2026-11-06T00:00:00Z';let m;
 if(provider==='devfolio'){
  const raw=structuredClone(fixture.devfolio),h=raw.props.pageProps.hackathon;
  Object.assign(h,{starts_at:'2026-11-04',ends_at:'2026-11-05',event_status:'ONGOING'});Object.assign(h.settings,{reg_starts_at:registrationStart,reg_ends_at:registrationEnd,registration_status:status});
  m=p.parseDevfolio(p.identifySource('https://synthetic-build.devfolio.co'),'<script id="__NEXT_DATA__">'+JSON.stringify(raw)+'</script>',now,'a'.repeat(64));
 }else m=p.parseHack2skill({...p.identifySource('https://hack2skill.com/event/synthetic'),provider_id:'a'.repeat(24)},{success:true,data:{title:'Synthetic',type:'HACKATHON',startDate:'2026-11-04',endDate:'2026-11-05',eventStatus:'ONGOING',registrationStart,registrationEnd,registrationStatus:status}},now,'a'.repeat(64));
 assert.equal(m.check_status,'ok');assert.equal(m.facts.start_date,null);assert.equal(m.facts.end_date,null);
 assert.equal(life.eventState(row(m),now),'unknown');assert.equal(life.registrationState(row(m),now),status.toLowerCase());assert.equal(life.activeOpportunity(row(m),now),status==='OPEN');
 assert.equal(s.hasEventScheduleEvidence(m),false);assert(!Object.hasOwn(l.load('src/lib/hackathons/synchronize.ts').sourcePatch(m),'start_date'));
});
for(const [name,change] of [
 ['reversed calendar schedule',h=>{h.starts_at='2026-11-06';h.ends_at='2026-11-04'}],
 ['ended provider status',h=>{h.event_status='COMPLETED'}],
 ['cancelled provider status',h=>{h.event_status='CANCELLED'}],
 ['invalid registration',h=>{h.settings.reg_ends_at='not-a-date'}],
 ['reversed registration',h=>{h.settings.reg_starts_at='2026-11-07T00:00:00Z'}],
])test('calendar normalization cannot hide '+name,()=>{
 const raw=structuredClone(fixture.devfolio),h=raw.props.pageProps.hackathon;
 Object.assign(h,{starts_at:'2026-11-04',ends_at:'2026-11-05',event_status:'ONGOING'});Object.assign(h.settings,{reg_starts_at:'2026-11-01T00:00:00Z',reg_ends_at:'2026-11-06T00:00:00Z',registration_status:'OPEN'});change(h);
 const m=p.parseDevfolio(p.identifySource('https://synthetic-build.devfolio.co'),'<script id="__NEXT_DATA__">'+JSON.stringify(raw)+'</script>',now,'a'.repeat(64));
 assert.equal(m.check_status,'unresolved');assert.equal(life.eventState(row(m),now),'unknown');assert.equal(life.activeOpportunity(row(m),now),false);
});
for(const [name,change] of [
 ['explicit contradictory narrative',c=>{c.details=claim.replaceAll('2026','2027')}],
 ['absent narrative with incomplete stages',c=>{delete c.details;c.rounds.push({status:'LIVE',is_hidden:0,is_inactive:0})}],
 ['absent narrative with other taxonomy',c=>{delete c.details;c.type='competitions'}],
])test('stage-only compatibility does not admit '+name,()=>{
 const m=observe(c=>{c.regnRequirements.reg_status='OPEN';change(c)});
 assert.equal(life.activeOpportunity(row(m),now),false);
});
for(const narrative of [undefined,null,'',42,'A hackathon. '+ 'x'.repeat(20001)])test('Unstop independent registration survives unavailable narrative '+String(narrative).slice(0,20),()=>{
 const m=observe(c=>{c.details=narrative;c.rounds=[fixture.buildStage(start,end)];c.regnRequirements.reg_status='OPEN'});
 assert.equal(m.check_status,'ok');assert.equal(life.registrationState(row(m),now),'open');assert(life.activeOpportunity(row(m),now));
 assert.equal(life.eventState(row(m),now),narrative==null||narrative===''?'ongoing':'unknown');
});
test('Unstop complete stage-only proof refreshes through the source orchestrator with absent details',async()=>{
 const raw=structuredClone(fixture.unstop),c=raw.data.competition;c.rounds=[fixture.buildStage(start,end)];delete c.details;
 const prior=observe(c=>{c.details='A hackathon.';c.rounds=[fixture.buildStage(start,end)];c.regnRequirements.reg_status='OPEN'});
 const stored={id:'00000000-0000-4000-8000-000000009105',name:'Synthetic',type:'external',status:'approved',archived:false,organizer_id:null,website_url:prior.canonical_url,source_metadata:prior};let reads=0;const calls=[];
 class Clock extends Date {static now(){return now}}
 const loader=harness({'./sourceTransport':{discoverSources:async()=>({identities:[],failures:[],failureDetails:[]})}},{Date:Clock,URLSearchParams});
 const client={from(table){const q={select(){return q},order(){return q},limit(){return q},gt(){return q},abortSignal(){return Promise.resolve({data:table==='hackathons'?(reads++===0?[stored]:[]):[],error:null})}};return q},rpc(name,args){calls.push({name,args});if(name==='apply_hackathon_source_check')stored.source_metadata=args.p_observation;return {abortSignal:async()=>({data:name==='begin_hackathon_source_check'?{status:'leased',snapshot:{}}:{status:'refreshed'},error:null})}}};
 const result=await loader.load('src/lib/hackathons/synchronize.ts').synchronizeCatalog(client,{dryRun:false,transport:{remaining:()=>240000,detail:async()=>({body:JSON.stringify(raw),hash:'a'.repeat(64),checkedAt:now})}});
 assert.equal(result.results[0].status,'refreshed');assert.equal(calls.length,2);assert.equal(stored.source_metadata.check_status,'ok');assert.equal(life.eventState(stored,now),'ongoing');assert.equal(life.registrationState(stored,now),'open');assert(life.activeOpportunity(stored,now));
});
test('future open registration is active, but not ongoing; imported dates are never a substitute',()=>{
 const m=observe(c=>{c.details='A hackathon.';c.rounds=[fixture.buildStage('2026-11-06T09:00:00+05:30','2026-11-07T18:00:00+05:30')];c.regnRequirements.reg_status='OPEN'});
 assert.equal(life.registrationState(row(m),now),'open');assert.equal(life.eventState(row(m),now),'upcoming');assert(life.activeOpportunity(row(m),now));
 assert.equal(life.activeOpportunity({type:'external',start_date:start,end_date:end,registration_status:'closed'},now),false);
});
test('coverage counts only fresh, usable schedules and distinguishes missing data and held conflicts',()=>{
 const summary=l.load('src/lib/hackathons/sourceCoverage.ts').summarizeSourceCoverage;
 const valid=observe(),conflict=observe(c=>c.details=claim.replaceAll('2026','2027')),missing=observe(c=>{c.details='A hackathon.';c.rounds=[]});
 const out=summary([row(valid),row(conflict),row(missing),{type:'external'}],now);
 assert.equal(out.verified_ongoing,1);assert.equal(out.verified_event_schedules,1);assert.equal(out.held_conflicts,1);
 assert.equal(out.unverified_schedule_reasons.not_checked,1);assert.equal(out.unverified_schedule_reasons.missing_build_stages,1);
 assert.equal(summary([row(valid)],now+26*3600000).unverified_schedule_reasons.stale_evidence,1);
});
const transportModule=l.load('src/lib/hackathons/sourceTransport.ts');
function discoveryTransport({closedFailure=false,collision=false}={}){
 const calls=[];return {calls,async get(url){calls.push(url);const u=new URL(url);
  if(u.hostname==='unstop.com'){const status=u.searchParams.get('oppstatus'),page=Number(u.searchParams.get('page'));if(closedFailure&&status==='closed')throw Error('Source HTTP 403');
   const item={id:1234,public_url:'hackathons/synthetic-1234'};
   return {body:JSON.stringify({data:{data:status==='closed'?[item,item]:page===1?[{id:5678,public_url:'hackathons/open-5678'}]:[]}})};}
  if(u.hostname==='devfolio.co')return {body:'<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{dehydratedState:{queries:[{queryKey:'fetchAllHackathonTypes',state:{data:{open_hackathons:collision?[{slug:'past-build',uuid:'other-uuid'}]:[],past_hackathons:[{slug:'past-build',uuid:'stable-uuid'}]}}}]}}}})+'</script>'};
  return {body:JSON.stringify({data:{flagshipEvents:[],communityEvents:[]}})};
 }};
}
test('bounded discovery includes closed/past candidates, dedupes and requires individual verification',async()=>{
 const t=discoveryTransport(),out=await transportModule.discoverSources(t);assert.equal(out.identities.length,3);
 assert.equal(t.calls.filter(url=>url.includes('oppstatus=closed')).length,3);assert(t.calls.length<=11);
 const closed=out.identities.find(i=>i.provider_id==='1234');assert(closed);assert.equal(closed.feed_bucket,'closed');assert(!Object.hasOwn(closed,'event_status'));
 const opened=out.identities.find(i=>i.provider_id==='5678');assert.equal(opened?.feed_bucket,'open');
 assert.equal(out.identities.find(i=>i.provider==='devfolio')?.feed_bucket,'closed');
 const m=observe();assert(worker.admission(s.validateSourceObservation(m,closed),m,now,{windowState:l.load('src/lib/hackathons/sourceEvidence.ts').windowState},true));
 const unverified=observe(c=>{c.rounds=[];c.details='A hackathon.'});assert.equal(worker.admission(s.validateSourceObservation(unverified),unverified,now,{windowState:l.load('src/lib/hackathons/sourceEvidence.ts').windowState},true),false);
});
test('closed-feed refusal is reported without losing open and other-provider candidates',async()=>{
 const out=await transportModule.discoverSources(discoveryTransport({closedFailure:true}));assert.equal(out.identities.length,2);assert.equal(out.failureDetails[0].feed,'closed');assert.match(out.failureDetails[0].reason,/403/);
});
test('conflicting Devfolio UUIDs for one URL are held instead of last-writer-wins',async()=>{
 const out=await transportModule.discoverSources(discoveryTransport({collision:true}));assert(!out.identities.some(i=>i.provider==='devfolio'));assert(out.failureDetails.some(f=>f.reason==='provider_identity_collision'));
});

for(const apply of [false,true])test('unattended worker '+(apply?'apply fixture':'dry-run')+' discovers verified closed ongoing and holds imported overlap',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),workerModule={exports:{}},rows=[],writes=[];
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const good=observe(),bad=observe(c=>{c.rounds=[];c.details='A hackathon.'});
 const identities=[1234,5678].map(n=>({...p.identifySource('https://unstop.com/hackathons/synthetic-'+n),feed_bucket:n===1234?'closed':'open'}));
 const observations=[good,{...bad,provider_id:'5678',canonical_url:identities[1].canonical_url,facts:{...bad.facts,website_url:identities[1].canonical_url}}];
 const fakeClient={from(table){if(table==='partner_configs')return {select(){return {limit(){return Promise.resolve({data:[],error:null})}}}};assert.equal(table,'hackathons');let single=false,cursor=false;const q={select(){return q},order(){return q},limit(){return q},gt(){cursor=true;return q},eq(){return q},single(){single=true;return q},then(resolve){return Promise.resolve({data:single?rows[0]:cursor?[]:rows,error:null}).then(resolve)}};return q},async rpc(name,args){
  writes.push({name,args});assert.equal(name,'apply_hackathon_source_check');assert.equal(args.p_id,null);assert.equal(args.p_patch.registration_status,'closed');
  assert.equal(Object.hasOwn(args.p_identity,'feed_bucket'),false,'Untrusted feed hints must never enter the SQL identity');
  rows.push({id:'00000000-0000-4000-8000-000000009104',type:'external',status:'approved',archived:false,website_url:args.p_identity.canonical_url,source_metadata:args.p_observation});return {data:{status:'created',id:rows[0].id},error:null};
 }};
 const real=harness({}, {Date:Clock,URLSearchParams}),env={NEXT_PUBLIC_SUPABASE_URL:'https://rhryjrbebfrrfhtyyzbs.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic',HACKERMATE_AGGREGATOR_ENABLED:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'yashshah1211/HackerMate_Backup',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule'};
 vm.runInNewContext(fs.readFileSync('scripts/run-hackermate-aggregator.cjs','utf8'),{module:workerModule,exports:workerModule.exports,Date:Clock,URLSearchParams,process:{env},fetch(){throw Error('Network forbidden')},console:{log(){},warn(){},error(){}},require(name){
  if(name==='@supabase/supabase-js')return {createClient:()=>fakeClient};
  if(name==='./ppt-vision-harness.cjs')return {harness:()=>({load(file){
   if(file.endsWith('sourceTransport.ts'))return {SourceTransport:class{remaining(){return 240000}},discoverSources:async()=>({identities,failures:[],failureDetails:[]})};
   if(file.endsWith('synchronize.ts'))return {...real.load(file),observe:async id=>observations.find(m=>m.provider_id===id.provider_id)};
   return real.load(file);
  }})};return require(name);
 }});
 const out=await workerModule.exports.main(apply?'--apply':'--dry-run');assert.equal(out.created,1);assert.equal(out.discovery_held,1);assert.equal(out.accepted_closed_registration_ongoing,1);assert.equal(out.observed_evidence.verified_ongoing,1);
 assert.equal(out.catalog_evidence.verified_ongoing,apply?1:0);assert.equal(writes.length,apply?1:0);assert.equal(out.registration_open,0);
 if(apply)assert.equal(out.write_preview,undefined,'No source preview should appear in apply logs');
 else {
   assert.equal(out.write_preview.create.length,1);
   assert.equal(out.write_preview.create[0].provider,'unstop');
   assert.equal(out.write_preview.create[0].provider_id,'1234');
   assert.equal(out.write_preview.create[0].feed_bucket,'closed');
   assert(out.write_preview.create[0].patch_fields.includes('registration_status'));
   assert.equal(out.write_preview.adoption.length,0);
   assert.equal(out.write_preview.refresh.length,0);
 }
});
