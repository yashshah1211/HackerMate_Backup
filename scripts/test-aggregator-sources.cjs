/* eslint-disable @typescript-eslint/no-require-imports -- Offline provider and complete lifecycle contract tests. */
const {test}=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./ppt-vision-harness.cjs');
const fixture=require('../qa/fixtures/aggregator/provider-facts.cjs'),{record}=require('../qa/fixtures/mission20-unverified/algorush.json');
const loader=harness({}, {URLSearchParams}),p=loader.load('src/lib/hackathons/providers.ts'),life=loader.load('src/lib/hackathons/lifecycle.ts'),s=loader.load('src/lib/hackathons/source.ts'),d=loader.load('src/lib/hackathons/discovery.ts'),sync=loader.load('src/lib/hackathons/synchronize.ts');
const now=Date.parse('2026-11-02T12:00:00+05:30'),hash='a'.repeat(64),clone=x=>JSON.parse(JSON.stringify(x)),u=p.identifySource('https://unstop.com/hackathons/synthetic-1234');
const observe=(patch={})=>{const raw=clone(fixture.unstop);Object.assign(raw.data.competition,patch);return p.parseUnstop(u,raw,now,hash);};
const event=(m=observe())=>({...record,id:'synthetic',name:m.facts.name,source_metadata:m});
const list=(rows,q='',clock=now)=>Array.from(d.discoverEvents(rows,d.readDiscoverySettings(new URLSearchParams(q)),[],new Set(rows.map(r=>r.id)),clock),r=>r.id);
const html=x=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(x)+'</script>';
test('exact AlgoRush evidence corrects event/stage/deadline/team independently, never promotes it',()=>{
 const m=p.parseUnstop(p.identifySource(record.website_url),fixture.algorush,now,hash),row=event(m),effective=s.synchronizedEvent(row);
 assert.equal(effective.end_date,'2026-08-30T07:05:00+05:30');assert.equal(effective.registration_end,'2026-08-15T22:51:56+05:30');assert.equal(effective.max_team_size,1);
 assert.equal(m.facts.rounds_info[0].start_date,'2026-08-16T07:05:00+05:30');assert.equal(life.eventState(row,now),'ended');assert.equal(life.registrationState(row,now),'closed');assert.deepEqual(list([row]),[]);
 assert.equal(list([row],'tab=all').length,1);assert.equal(list([row],'tab=saved').length,1);assert.equal(sync.reconciliation(record,m).classification,'confirmed_ended_propose_suppression');
});
test('new source-verified future open hackathon appears; imported physical dates are not substituted',()=>{
 const row=event();assert.deepEqual(list([row]),['synthetic']);assert.deepEqual(list([row],'tab=open'),['synthetic']);assert.equal(life.eventState(row,now),'upcoming');assert.equal(life.registrationState(row,now),'open');
 assert.equal(s.synchronizedEvent(row).start_date,'2026-11-06T09:00:00+05:30');assert.equal(sync.sourcePatch(row.source_metadata).start_date,'2026-11-06');
});
test('ongoing with provider-closed registration stays active without reopening applications',()=>{
 const m=observe({start_date:'2026-11-01T09:00:00+05:30',regnRequirements:{...fixture.unstop.data.competition.regnRequirements,reg_status:'FINISHED'}}),row=event(m);
 assert.equal(life.registrationState(row,now),'closed');assert.equal(life.eventState(row,now),'ongoing');assert.deepEqual(list([row]),['synthetic']);assert.deepEqual(list([row],'tab=ongoing'),['synthetic']);assert.deepEqual(list([row],'tab=open'),[]);
 for(const tab of ['active','open','ongoing'])for(const status of ['open','unknown','closed','all'])assert.equal(list([{...record}],`tab=${tab}&registration=${status}`).length,0);
});
test('deadlines and final event instant recalculate without a scrape, using inclusive India date-only days',()=>{
 const raw=clone(fixture.unstop);raw.data.competition.regnRequirements.end_regn_dt='2026-11-02';const row=event(p.parseUnstop(u,raw,now,hash));
 const last=Date.parse('2026-11-02T23:59:59.999+05:30');assert.equal(life.registrationState(row,last),'open');assert.equal(life.registrationState(row,last+1),'closed');assert.deepEqual(list([row],'',last+1),[]);
 const ongoing=event(observe({start_date:'2026-11-02T10:00:00+05:30',end_date:'2026-11-02T13:00:00+05:30'}));
 assert.equal(list([ongoing],'',Date.parse('2026-11-02T13:00:00+05:30')-1).length,1);assert.deepEqual(list([ongoing],'',Date.parse('2026-11-02T13:00:00+05:30')),[]);
 assert.equal(life.eventDate('2026-11-02T12:00:00+05:30'),life.eventDate('2026-11-02T06:30:00Z'));
});
for(const state of ['failed','checking','unresolved'])test(state+' removes promotion while preserving details and direct links',()=>{const m={...observe(),check_status:state},row=event(m);assert.equal(life.registrationState(row,now),'unknown');assert.deepEqual(list([row]),[]);assert.equal(list([row],'tab=all').length,1);assert.equal(s.synchronizedEvent(row).website_url,u.canonical_url);});
test('missed daily check expires at 26h even if deadline is still future; forged future check and extended expiry fail closed',()=>{
 const m=observe();for(const bad of [{...m,expires_at:new Date(now+27*3600000).toISOString()},{...m,checked_at:new Date(now+120000).toISOString()},{...m,protected_fields:['name']}])assert.equal(life.activeOpportunity(event(bad),now),false);
 assert.equal(life.activeOpportunity(event(m),now+26*3600000-1),true);assert.equal(life.activeOpportunity(event(m),now+26*3600000),false);
});
for(const patch of [{type:'workshops'}, {details:'A hackathon bootcamp workshop.'},{details:'Case study challenge.'},{start_date:'2026-02-30'}, {start_date:'2026-11-08',end_date:'2026-11-07'},{regnRequirements:{start_regn_dt:'2026-11-10',end_regn_dt:'2026-11-01'}},{regnRequirements:{min_team_size:4,max_team_size:1}}])test('ambiguous/contradictory publication cannot promote '+JSON.stringify(patch),()=>assert.deepEqual(list([event(observe(patch))]),[]));
test('Devfolio real settings separate registration from event and preserve stable UUID, team size and official external action',()=>{
 const input=clone(fixture.devfolio);input.props.pageProps.hackathon.settings.external_apply_url='https://example.invalid/apply';
 const m=p.parseDevfolio(p.identifySource('https://synthetic-build.devfolio.co'),html(input),now,hash);
 assert.equal(m.provider_id,'synthetic-devfolio-uuid');assert.equal(m.facts.start_date,'2026-11-27T18:30:00Z');assert.equal(m.facts.registration_end,'2026-11-03T18:30:00Z');assert.equal(m.facts.min_team_size,2);assert.equal(life.activeOpportunity(event(m),now),true);assert.equal(s.registrationDestination(event(m)),'https://example.invalid/apply');
 assert.throws(()=>p.parseDevfolio({...p.identifySource('https://other.devfolio.co')},html(input),now,hash));
});
test('Hack2Skill EVENT workshop is not hackathon proof; submission dates never become event dates',()=>{
 const id={...p.identifySource('https://hack2skill.com/event/bootcamps-2026'),provider_id:'a'.repeat(24)},m=p.parseHack2skill(id,fixture.bootcamps,now,hash);
 assert.equal(m.category,'other');assert.equal(m.facts.start_date,null);assert.equal(m.facts.end_date,null);assert.equal(m.facts.registration_status,'open');assert.deepEqual(list([event(m)]),[]);assert.equal(m.facts.min_team_size,null);assert.equal(m.facts.max_team_size,null);
 const h=clone(fixture.bootcamps);h.data.type='HACKATHON';h.data.isRegistrationOverride=true;const uncertain=p.parseHack2skill(id,h,now,hash);assert.equal(uncertain.facts.registration_status,'unknown');assert.deepEqual(list([event(uncertain)]),[]);
});
test('no copied body, guessed team defaults, guessed date or guessed currency in the factual projection',()=>{
 const m=observe({details:'Original private-style wording. A hackathon.',prizes:[{cash:1000}],regnRequirements:{}}),patch=sync.sourcePatch(m);
 assert(!m.facts.description.includes('Original private-style wording'));assert.equal(m.facts.min_team_size,null);assert.equal(m.facts.currency,null);assert(!Object.hasOwn(patch,'min_team_size'));assert(!Object.hasOwn(patch,'registration_end'));assert(!Object.hasOwn(patch,'registration_status'));
});
for(const url of ['http://unstop.com/hackathons/x-123','https://unstop.com.evil.invalid/hackathons/x-123','https://x:y@unstop.com/hackathons/x-123','https://unstop.com:443/hackathons/x-123#bad','https://devfolio.co/hackathons','https://hack2skill.com/api/private'])test('unsupported source not guessed '+url,()=>assert.equal(p.identifySource(url),null));
test('new default and three core tabs preserve explicit Saved, historical and query navigation',()=>{
 assert.equal(d.readDiscoverySettings(new URLSearchParams()).tab,'active');for(const tab of ['active','open','ongoing','all','saved','past','recommended','upcoming']){const q=d.discoveryQuery(new URLSearchParams('source=partner&q=city'),{tab});assert.equal(d.readDiscoverySettings(new URLSearchParams(q)).tab,tab);assert.equal(new URLSearchParams(q).get('source'),'partner');}
});

test('multiple published awards and stage details are preserved without inventing a total prize pool',()=>{
 const m=observe({prizes:[{name:'First',cash:10000,currencyCode:'INR'},{name:'Second',cash:5000,currencyCode:'INR'}],rounds:[{details:[{title:'Build',start_date:'2026-11-06'},{title:'Demo',start_date:'2026-11-07'}]}]});
 assert.equal(m.facts.prize_pool,'First: 10000 INR; Second: 5000 INR');assert.equal(m.facts.currency,null);assert.deepEqual(Array.from(m.facts.rounds_info,r=>r.name),['Build','Demo']);
});

test('registration deadline range filters are independent of event dates and cover final India calendar days',()=>{
 const row=event();assert.equal(list([row],'registrationFrom=2026-11-05&registrationTo=2026-11-05').length,1);assert.deepEqual(list([row],'registrationFrom=2026-11-06'),[]);
 const raw=clone(fixture.unstop);raw.data.competition.regnRequirements.end_regn_dt='2026-11-05';assert.equal(list([event(p.parseUnstop(u,raw,now,hash))],'registrationTo=2026-11-05').length,1);
 const q=d.discoveryQuery(new URLSearchParams('source=partner'),{registrationFrom:'2026-11-05',registrationTo:'2026-11-06'}),read=d.readDiscoverySettings(new URLSearchParams(q));assert.equal(read.registrationFrom,'2026-11-05');assert.equal(read.registrationTo,'2026-11-06');
});

for(const status of ['PAUSED','UNKNOWN','UPCOMING'])test('unknown provider registration state cannot be reopened solely by future dates: '+status,()=>{
 const raw=clone(fixture.unstop);raw.data.competition.regnRequirements.reg_status=status;const m=p.parseUnstop(u,raw,now,hash);assert.equal(m.facts.registration_status,'unknown');assert.equal(life.registrationState(event(m),now),'unknown');assert.deepEqual(list([event(m)]),[]);
});
test('provider cancellation invalidates ongoing promotion rather than trusting the remaining event window',()=>{
 const m=observe({start_date:'2026-11-01',event_status:'CANCELLED'});assert.equal(m.check_status,'unresolved');assert.deepEqual(list([event(m)]),[]);
});

test('source JSON projection never overwrites public identity, approval, archival or owner fields',()=>{
 const m=observe();Object.assign(m.facts,{id:'forged',type:'native',status:'approved',archived:false,organizer_id:'forged'});
 const row={...event(m),id:'original',status:'pending',archived:true,organizer_id:'original-owner'},out=s.synchronizedEvent(row);
 for(const field of ['id','type','status','archived','organizer_id'])assert.equal(out[field],row[field]);
});

test('an unresolved source observation is not promoted to confirmed-ended merely because it carries past dates',()=>{
 const m=observe({status:'UNPUBLISHED',start_date:'2026-08-01',end_date:'2026-08-02'});assert.equal(m.check_status,'unresolved');assert.equal(sync.reconciliation(record,m).classification,'unresolved');
});

test('actual Unstop FINISHED publication is valid historical evidence when its event end is past; it cannot override a contradictory future event window',()=>{
 const id=p.identifySource(record.website_url),past=p.parseUnstop(id,fixture.algorush,now,hash);assert.equal(past.check_status,'ok');assert.equal(past.evidence.publication_status,'FINISHED');assert.equal(sync.reconciliation(record,past).classification,'confirmed_ended_propose_suppression');
 const conflict=observe({status:'FINISHED'});assert.equal(conflict.check_status,'unresolved');assert.deepEqual(list([event(conflict)]),[]);
});
