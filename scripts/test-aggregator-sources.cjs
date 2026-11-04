/* eslint-disable @typescript-eslint/no-require-imports -- Offline provider and complete lifecycle contract tests. */
const {test}=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./ppt-vision-harness.cjs');
const fixture=require('../qa/fixtures/aggregator/provider-facts.cjs'),{record}=require('../qa/fixtures/mission20-unverified/algorush.json');
const loader=harness({}, {URLSearchParams}),p=loader.load('src/lib/hackathons/providers.ts'),life=loader.load('src/lib/hackathons/lifecycle.ts'),s=loader.load('src/lib/hackathons/source.ts'),d=loader.load('src/lib/hackathons/discovery.ts'),sync=loader.load('src/lib/hackathons/synchronize.ts');
const now=Date.parse('2026-11-02T12:00:00+05:30'),hash='a'.repeat(64),clone=x=>JSON.parse(JSON.stringify(x)),u=p.identifySource('https://unstop.com/hackathons/synthetic-1234');
const observe=(patch={})=>{const raw=clone(fixture.unstop);Object.assign(raw.data.competition,patch);return p.parseUnstop(u,raw,now,hash);};
const event=(m=observe())=>({...record,id:'synthetic',name:m.facts.name,website_url:m.canonical_url,source_metadata:m});
const list=(rows,q='',clock=now)=>Array.from(d.discoverEvents(rows,d.readDiscoverySettings(new URLSearchParams(q)),[],new Set(rows.map(r=>r.id)),clock),r=>r.id);
const html=x=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(x)+'</script>';
test('AlgoRush keeps stage/deadline/team facts without turning its competition or contest window into event completion',()=>{
 const m=p.parseUnstop(p.identifySource(record.website_url),fixture.algorush,now,hash),row=event(m),effective=s.synchronizedEvent(row);
 assert.equal(effective.start_date,null);assert.equal(effective.end_date,null);assert.equal(effective.registration_end,'2026-08-15T22:51:56+05:30');assert.equal(effective.max_team_size,1);
 assert.equal(m.facts.rounds_info[0].start_date,'2026-08-16T07:05:00+05:30');assert.equal(life.eventState(row,now),'unknown');assert.equal(life.registrationState(row,now),'closed');assert.deepEqual(list([row]),[]);
 assert.equal(list([row],'tab=all').length,1);assert.equal(list([row],'tab=saved').length,1);assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'unresolved');
});
test('new source-verified future open hackathon appears; imported physical dates are not substituted',()=>{
 const row=event();assert.deepEqual(list([row]),['synthetic']);assert.deepEqual(list([row],'tab=open'),['synthetic']);assert.equal(life.eventState(row,now),'upcoming');assert.equal(life.registrationState(row,now),'open');
 assert.equal(s.synchronizedEvent(row).start_date,'2026-11-06T09:00:00+05:30');assert.equal(sync.sourcePatch(row.source_metadata).start_date,'2026-11-06');
});
test('ongoing with provider-closed registration stays active without reopening applications',()=>{
 const m=observe({rounds:[fixture.buildStage('2026-11-01T09:00:00+05:30','2026-11-07T18:00:00+05:30')],regnRequirements:{...fixture.unstop.data.competition.regnRequirements,reg_status:'FINISHED'}}),row=event(m);
 assert.equal(life.registrationState(row,now),'closed');assert.equal(life.eventState(row,now),'ongoing');assert.deepEqual(list([row]),['synthetic']);assert.deepEqual(list([row],'tab=ongoing'),['synthetic']);assert.deepEqual(list([row],'tab=open'),[]);
 for(const tab of ['active','open','ongoing'])for(const status of ['open','unknown','closed','all'])assert.equal(list([{...record}],`tab=${tab}&registration=${status}`).length,0);
});
test('deadlines and final event instant recalculate without a scrape, using inclusive India date-only days',()=>{
 const raw=clone(fixture.unstop);raw.data.competition.regnRequirements.end_regn_dt='2026-11-02';const row=event(p.parseUnstop(u,raw,now,hash));
 const last=Date.parse('2026-11-02T23:59:59.999+05:30');assert.equal(life.registrationState(row,last),'open');assert.equal(life.registrationState(row,last+1),'closed');assert.deepEqual(list([row],'',last+1),[]);
 const ongoing=event(observe({rounds:[fixture.buildStage('2026-11-02T10:00:00+05:30','2026-11-02T13:00:00+05:30')]}));
 assert.equal(list([ongoing],'',Date.parse('2026-11-02T13:00:00+05:30')-1).length,1);assert.deepEqual(list([ongoing],'',Date.parse('2026-11-02T13:00:00+05:30')),[]);
 assert.equal(life.eventDate('2026-11-02T12:00:00+05:30'),life.eventDate('2026-11-02T06:30:00Z'));
});
for(const state of ['failed','checking','unresolved'])test(state+' removes promotion while preserving details and direct links',()=>{const m={...observe(),check_status:state},row=event(m);assert.equal(life.registrationState(row,now),'unknown');assert.deepEqual(list([row]),[]);assert.equal(list([row],'tab=all').length,1);assert.equal(s.synchronizedEvent(row).website_url,u.canonical_url);});
test('missed daily check expires at 26h even if deadline is still future; forged future check and extended expiry fail closed',()=>{
 const m=observe();for(const bad of [{...m,expires_at:new Date(now+27*3600000).toISOString()},{...m,checked_at:new Date(now+120000).toISOString()},{...m,protected_fields:['registration_status']}])assert.equal(life.activeOpportunity(event(bad),now),false);
 assert.equal(life.activeOpportunity(event({...m,protected_fields:['name']}),now),true);
 assert.equal(life.activeOpportunity(event(m),now+26*3600000-1),true);assert.equal(life.activeOpportunity(event(m),now+26*3600000),false);
});
for(const patch of [{type:'workshops'}, {details:'A hackathon bootcamp workshop.'},{details:'Case study challenge.'},{rounds:[fixture.buildStage('2026-02-30','2026-11-07')]}, {rounds:[fixture.buildStage('2026-11-08','2026-11-07')]},{regnRequirements:{start_regn_dt:'2026-11-10',end_regn_dt:'2026-11-01'}},{regnRequirements:{min_team_size:4,max_team_size:1}}])test('ambiguous/contradictory publication cannot promote '+JSON.stringify(patch),()=>assert.deepEqual(list([event(observe(patch))]),[]));
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
 const m=observe({status:'UNPUBLISHED',start_date:'2026-08-01',end_date:'2026-08-02'});assert.equal(m.check_status,'unresolved');assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'unresolved');
});

test('FINISHED publication never establishes actual event completion or contradicts an independently supported future build',()=>{
 const past=p.parseUnstop(p.identifySource(record.website_url),fixture.algorush,now,hash);assert.equal(past.check_status,'ok');assert.equal(past.evidence.publication_status,'FINISHED');assert.equal(sync.reconciliation(record,past).classification,'unresolved');
 const future=observe({status:'FINISHED'});assert.equal(future.check_status,'ok');assert.equal(life.eventState(event(future),now),'upcoming');assert.deepEqual(list([event(future)]),['synthetic']);
});

for(const item of fixture.unstopDiscrepancies)test('real discrepancy '+item.id+' never uses competition/assessment dates as the hackathon window',()=>{
 const raw={data:{competition:{...item,type:'hackathons',status:'LIVE',regnRequirements:{start_regn_dt:item.start_date,end_regn_dt:item.end_date,reg_status:'STARTED',min_team_size:item.min,max_team_size:item.max}}}};
 const m=p.parseUnstop(p.identifySource('https://unstop.com/hackathons/synthetic-'+item.id),raw,now,hash),row=event(m);
 assert.equal(m.facts.start_date,null);assert.equal(m.facts.end_date,null);assert.equal(life.eventState(row,now),'unknown');assert.equal(life.eventStateLabel(row,now),'Event schedule unverified');assert.deepEqual(list([row],'tab=ongoing'),[]);
 assert.equal(m.facts.min_team_size,item.min);assert.equal(m.facts.max_team_size,item.max);assert.equal(m.facts.registration_end,item.end_date);
 assert(!Object.hasOwn(sync.sourcePatch(m),'start_date'));assert(!Object.hasOwn(sync.sourcePatch(m),'end_date'));
 if(item.id===1768100){assert(m.issues.includes('mode_contradiction'));assert.equal(m.facts.mode,null);assert.deepEqual(list([row]),[]);}else{assert.equal(m.check_status,'ok');assert.equal(life.registrationState(row,now),'open');assert.deepEqual(list([row]),['synthetic']);}
});

test('past competition end and closed registration alone leave actual event unknown, not ended',()=>{
 const m=observe({rounds:[],start_date:'2026-10-01',end_date:'2026-11-01',status:'FINISHED',regnRequirements:{start_regn_dt:'2026-10-01',end_regn_dt:'2026-11-01',reg_status:'FINISHED'}});
 assert.equal(m.event_status,'unknown');assert.equal(m.facts.start_date,null);assert.equal(m.facts.registration_status,'closed');assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'unresolved');assert.deepEqual(list([event(m)]),[]);
});
test('old Unstop observations cannot promote unsafe dates, label ongoing/ended or patch event dates',()=>{
 const m=observe();delete m.evidence.event_date_basis;m.event_status='ended';m.parser_version='aggregator-4';
 assert.equal(life.eventState(event(m),now),'unknown');assert.equal(s.synchronizedEvent(event(m)).start_date,null);assert(!Object.hasOwn(sync.sourcePatch(m),'start_date'));assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'registration_open');
 m.facts.registration_status='closed';assert.deepEqual(list([event(m)]),[]);
});
for(const field of ['is_hidden','is_inactive','status','entity_type'])test('unsupported/private/draft stage cannot establish actual dates: '+field,()=>{
 const stage=fixture.buildStage('2026-11-01','2026-11-07');stage[field]=field==='status'?'DRAFT':field==='entity_type'?'App\\Model\\AssessmentRound':1;
 const m=observe({rounds:[stage]});assert.equal(m.facts.start_date,null);assert.equal(life.eventState(event(m),now),'unknown');
});
test('multiple build stages are ambiguous, and conflicting labeled team bounds are held',()=>{
 const multiple=observe({rounds:[fixture.buildStage('2026-11-01','2026-11-02'),fixture.buildStage('2026-11-06','2026-11-07')]});assert.equal(multiple.check_status,'unresolved');assert.equal(multiple.facts.start_date,null);
 const team=observe({details:'A hackathon. Team Size: 1–4.'});assert(team.issues.includes('team_size_contradiction'));assert.equal(team.facts.min_team_size,null);assert.deepEqual(list([event(team)]),[]);
});

test('a typed stage mentioning a hackathon is insufficient, and unreconciled prose/later-stage dates are held',()=>{
 const stage=fixture.buildStage('2026-11-01','2026-11-07');stage.details[0].display_text='Briefing before the final hackathon.';
 assert.equal(observe({rounds:[stage]}).facts.start_date,null);
 const text=observe({details:'A hackathon. Event Dates: 19–20 December 2026.'});assert.equal(text.facts.start_date,null);assert(text.issues.includes('event_schedule_requires_reconciliation'));
 const later=observe({rounds:[fixture.buildStage('2026-11-01','2026-11-07'),{is_hidden:0,is_inactive:0,details:[{title:'Future stage',end_date:'2026-11-08'}]}]});assert.equal(later.facts.start_date,null);assert.equal(later.check_status,'unresolved');
 const reversed=observe({rounds:[fixture.buildStage('2026-11-08','2026-11-07')]});assert.equal(reversed.facts.start_date,null);assert.equal(reversed.facts.end_date,null);assert(reversed.issues.includes('event_window_contradiction'));assert(!Object.hasOwn(sync.sourcePatch(reversed),'start_date'));
});

test('explicit build instants cross India calendar days without inferring date-only times',()=>{
 const m=observe({rounds:[fixture.buildStage('2026-11-02T00:00:00+05:30','2026-11-03T00:00:00+05:30')]});
 m.checked_at='2026-11-01T23:59:00+05:30';m.event_status='upcoming';m.expires_at='2026-11-03T01:59:00+05:30';
 for(const [time,state]of [['2026-11-01T23:59:59.999+05:30','upcoming'],['2026-11-02T00:00:00+05:30','ongoing'],['2026-11-02T23:59:59.999+05:30','ongoing'],['2026-11-03T00:00:00+05:30','ended']])assert.equal(life.eventState(event(m),Date.parse(time)),state);
 const offset=observe({rounds:[fixture.buildStage('2026-11-02T18:30:00Z','2026-11-03T01:00:00+05:30')]});assert.equal(life.eventState(event(offset),Date.parse('2026-11-03T00:00:00+05:30')),'ongoing');
});

test('Devfolio and Hack2Skill retain genuine event windows, independently of closed registration',()=>{
 const dev=clone(fixture.devfolio);dev.props.pageProps.hackathon.starts_at='2026-11-01T09:00:00+05:30';dev.props.pageProps.hackathon.ends_at='2026-11-03T18:00:00+05:30';dev.props.pageProps.hackathon.settings.registration_status='CLOSED';
 const m=p.parseDevfolio(p.identifySource('https://synthetic-build.devfolio.co'),html(dev),now,hash);assert.equal(life.eventState(event(m),now),'ongoing');assert.equal(life.registrationState(event(m),now),'closed');assert.equal(life.activeOpportunity(event(m),now),true);
 const h=clone(fixture.bootcamps);Object.assign(h.data,{type:'HACKATHON',startDate:'2026-11-01T09:00:00+05:30',endDate:'2026-11-03T18:00:00+05:30',registrationStatus:'CLOSED'});
 const hm=p.parseHack2skill({...p.identifySource('https://hack2skill.com/event/synthetic'),provider_id:'a'.repeat(24)},h,now,hash);assert.equal(life.eventState(event(hm),now),'ongoing');assert.equal(life.activeOpportunity(event(hm),now),true);
});

test('source uncertainty and contradictory mode/team notices render without implying registration or schedule verification',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const Info=loader.load('src/components/hackathons/SourceInformation.tsx').default;
 const m=observe({rounds:[],details:'A hackathon. Mode: Online. Team Size: 1–4.'});const markup=renderToStaticMarkup(React.createElement(Info,{event:event(m),now}));
 assert.match(markup,/Actual event dates unverified/);assert.match(markup,/Registration timing is assessed separately/);assert.match(markup,/Source facts conflict/);assert(!markup.includes('Source checked:'));
});

test('offline audit derivation withdraws unsupported lifecycle claims without mutating original evidence or approving adoption',()=>{
 const fs=require('node:fs'),crypto=require('node:crypto'),{reassess,adoption}=require('./reassess-aggregator-lifecycle.cjs');const bytes=fs.readFileSync('docs/qa/aggregator-repair/RECONCILIATION-PREVIEW.json'),r=JSON.parse(bytes),original=JSON.stringify(r);
 const a=reassess(r,crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex'));assert.equal(JSON.stringify(r),original);
 assert.equal(a.withdrawnClaims.unstopOngoing,115);assert.equal(a.withdrawnClaims.unstopEnded,204);assert.equal(a.reproducedIndiaCalendarComparisons.activeBothBoundariesEqual,20);assert.equal(a.reproducedIndiaCalendarComparisons.unstopEndedEndEqualsRegistrationDeadline,82);
 assert.equal(a.derivedHistoricalCounts.historical_registration_open_candidate,84);assert.equal(a.derivedHistoricalCounts.historical_supported_event_end,4);assert.equal(a.derivedHistoricalCounts.requires_fresh_evidence,322);assert.equal(a.currentVerifiedCounts,null);
 const shortlist=adoption(a);assert.equal(shortlist.candidates.length,84);assert.equal(new Set(shortlist.candidates.map(r=>r.id)).size,84);assert.equal(shortlist.counts.approvedForWrite,0);
 for(const c of shortlist.candidates){assert.equal(c.approval.approvedFields.length,0);assert.equal(c.freshEvidenceVerified,false);if(c.provider==='unstop')assert(!c.proposedFieldsForReview.some(k=>['start_date','end_date'].includes(k)));}
 assert.deepEqual(JSON.parse(fs.readFileSync('docs/qa/aggregator-repair/LIFECYCLE-REASSESSMENT.json','utf8')),a);assert.deepEqual(JSON.parse(fs.readFileSync('docs/qa/aggregator-repair/ADOPTION-REVIEW.json','utf8')),shortlist);
});

test('partial reconciliation resume cannot retain obsolete Unstop ended classifications or event-date write proposals',()=>{
 const {reinterpretRetained}=require('./reconcile-hackathon-catalog.cjs');const m=JSON.parse(JSON.stringify(observe()));delete m.evidence.event_date_basis;m.event_status='ended';m.facts.registration_status='closed';
 const prior={id:'same-id',classification:'confirmed_ended_propose_suppression',evidence:m,changes:{end_date:{before:'2026-12-18',after:'2026-11-07'}}},before=JSON.stringify(prior);
 const out=reinterpretRetained({id:'same-id',name:'Original'},prior);assert.equal(out.id,prior.id);assert.equal(out.evidence,prior.evidence);assert.equal(JSON.stringify(prior),before);
 assert.equal(out.classification,'unresolved');assert.equal(out.original_classification,'confirmed_ended_propose_suppression');assert(!Object.hasOwn(out.changes,'end_date'));assert.equal(out.evidence.checked_at,m.checked_at);
});

const explicitBuild='The actual hackathon build takes place in this stage.';
const rejectedStages=[
 ['Grand Finale','Final judging of the hackathon.'],
 ['Presentations','The actual hackathon presentations take place in this stage.'],
 ['Orientation','The actual hackathon participants attend a compulsory orientation session.'],
 ...['Judging','Evaluations','Presentations','Pitches','Orientations','Onboarding','Briefings','Assessments','Workshops','Screenings','Submissions','Results','Registration'].map(title=>[title,explicitBuild]),
 ['Final Round','The final hackathon takes place in this stage.'],
 ['Offline build','The actual hackathon build and judging take place in this stage.'],
 ['Hackathon build / judging',explicitBuild],
 ['Offline build',explicitBuild+' Presentations follow during the same stage.'],
 ['Offline build','The actual hackathon build takes place in this stage; evaluations follow.'],
 ['Offline build','THE ACTUAL HACKATHON: PITCHES AND PRESENTATIONS!'],
 ['Offline build','Before the actual hackathon build takes place in this stage, attend orientation.'],
 ['Offline build','The actual hackathon build does not take place in this stage.'],
 ['Offline build','Is this stage the actual hackathon build phase?'],
 ['Coding round','During this round, teams build their prototypes for the final hackathon.'],
 ['Coding round','During this stage, teams code their solutions for the actual hackathon.'],
 ['Solution development','Teams develop their solutions for the final hackathon during this stage.'],
 ['Offline build','<p hidden>'+explicitBuild+'</p>'],
 ['Offline build','<del>'+explicitBuild+'</del>'],
 ['Offline build',''],
 [null,explicitBuild],
 ['Offline build'+' '.repeat(200)+'judging',explicitBuild],
 ['Offline build',explicitBuild+'x'.repeat(20000)+' Not the actual build.'],
];
for(const [index,[title,display_text]]of rejectedStages.entries())for(const window of ['ongoing','past'])test(`adjacent/ambiguous Unstop stage ${index+1} ${title} ${window} cannot authorize lifecycle or patches`,()=>{
 const stage=fixture.buildStage('2026-11-01',window==='past'?'2026-11-01':'2026-11-03');Object.assign(stage.details[0],{title,display_text});
 const m=observe({rounds:[stage],regnRequirements:{...fixture.unstop.data.competition.regnRequirements,reg_status:'CLOSED'}}),row=event(m);
 assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(m.facts.start_date,null);assert.equal(m.facts.end_date,null);assert.equal(m.event_status,'unknown');
 assert.equal(life.eventState(row,now),'unknown');assert.equal(life.eventStateLabel(row,now),'Event schedule unverified');assert.equal(life.activeOpportunity(row,now),false);
 assert.deepEqual(list([row]),[]);assert.deepEqual(list([row],'tab=ongoing'),[]);assert.equal(s.synchronizedEvent(row).start_date,null);
 const patch=sync.sourcePatch(m);assert(!Object.hasOwn(patch,'start_date'));assert(!Object.hasOwn(patch,'end_date'));
 assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'unresolved');assert.equal(life.registrationState(row,now),'closed');
});
for(const [field,value]of [['entity_type','App\\Models\\AssessmentRound\\Assessment'],['is_hidden',1],['is_inactive',1],['status','DRAFT']])test('contradictory detail metadata cannot override public parent stage: '+field,()=>{
 const stage=fixture.buildStage('2026-11-01','2026-11-03');stage.details[0][field]=value;
 const m=observe({rounds:[stage],regnRequirements:{...fixture.unstop.data.competition.regnRequirements,reg_status:'CLOSED'}});
 assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(m.facts.start_date,null);assert.equal(m.event_status,'unknown');assert.equal(life.activeOpportunity(event(m),now),false);
 assert(!Object.hasOwn(sync.sourcePatch(m),'end_date'));assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'unresolved');
});
for(const patch of [{title:'Judging'},{display_text:'The actual hackathon build and judging take place in this stage.'}])test('contradictory parent semantics cannot be hidden by a build detail: '+JSON.stringify(patch),()=>{
 const stage=Object.assign(fixture.buildStage('2026-11-01','2026-11-03'),patch),m=observe({rounds:[stage]});
 assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(m.facts.start_date,null);assert.equal(life.eventState(event(m),now),'unknown');
 assert(!Object.hasOwn(sync.sourcePatch(m),'end_date'));assert.notEqual(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'confirmed_ended_propose_suppression');
});
const supportedStages=[
 ['Offline build',explicitBuild],
 ['Hackathon build','This stage is the actual hackathon build phase.'],
 ['Coding round','This round is the actual hackathon coding phase.'],
 ['Solution development','The final hackathon solution development phase takes place during this round.'],
 ['HACKATHON BUILD','<p>THIS STAGE IS THE ACTUAL HACKATHON BUILD PHASE!</p>'],
 ['Coding phase','The final hackathon coding phase takes place in this stage.'],
];
for(const [title,display_text]of supportedStages)for(const window of ['upcoming','ongoing','ended'])test('explicit build activity retains '+window+' lifecycle: '+title,()=>{
 const start=window==='upcoming'?'2026-11-03':'2026-11-01',end=window==='ended'?'2026-11-01':'2026-11-04';
 const stage=fixture.buildStage(start+'T09:00:00+05:30',end+'T18:00:00+05:30');Object.assign(stage.details[0],{title,display_text});
 const m=observe({rounds:[stage],regnRequirements:{...fixture.unstop.data.competition.regnRequirements,reg_status:'CLOSED'}}),row=event(m);
 assert.equal(m.check_status,'ok');assert.equal(s.hasEventScheduleEvidence(m),true);assert.equal(life.eventState(row,now),window);assert.equal(life.registrationState(row,now),'closed');
 assert.equal(life.activeOpportunity(row,now),window==='ongoing');assert.equal(list([row],'tab=ongoing').length,window==='ongoing'?1:0);
 assert.equal(sync.sourcePatch(m).start_date,start);assert.equal(sync.sourcePatch(m).end_date,end);
 assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,window==='ended'?'confirmed_ended_propose_suppression':window==='ongoing'?'ongoing_registration_closed':'unresolved');
});
test('ambiguous actual stage keeps independently open registration without claiming ongoing',()=>{
 const stage=fixture.buildStage('2026-11-01','2026-11-03');Object.assign(stage.details[0],{title:'Grand Finale',display_text:'Final judging of the hackathon.'});
 const m=observe({rounds:[stage]}),row=event(m);
 assert.equal(life.registrationState(row,now),'open');assert.equal(life.eventState(row,now),'unknown');assert.equal(life.registrationLabel(row,now),'Registration open');
 assert.equal(list([row],'tab=open').length,1);assert.deepEqual(list([row],'tab=ongoing'),[]);assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'registration_open');
});
for(const state of ['ongoing','ended'])test('pre-fix stage provenance cannot survive through cached '+state+' facts',()=>{
 const m=observe({rounds:[fixture.buildStage('2026-11-01',state==='ended'?'2026-11-01':'2026-11-03')],regnRequirements:{...fixture.unstop.data.competition.regnRequirements,reg_status:'CLOSED'}});
 m.parser_version='aggregator-5';m.evidence.event_date_basis='published_hackathon_build_stage';
 const row=event(m);assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(life.eventState(row,now),'unknown');assert.equal(life.activeOpportunity(row,now),false);
 assert.equal(s.synchronizedEvent(row).start_date,null);assert(!Object.hasOwn(sync.sourcePatch(m),'end_date'));assert.equal(sync.reconciliation({...record,website_url:m.canonical_url},m).classification,'unresolved');
 const {reinterpretRetained}=require('./reconcile-hackathon-catalog.cjs');const retained=reinterpretRetained(record,{classification:'confirmed_ended_propose_suppression',evidence:m});
 assert.equal(retained.classification,'unresolved');assert(!Object.hasOwn(retained.changes,'end_date'));
});
test('v2 provenance preserves India midnight, exact UTC boundaries and Native behavior',()=>{
 assert.equal(life.eventDate('2026-11-02'),Date.parse('2026-11-01T18:30:00Z'));
 assert.equal(life.eventDate('2026-11-02',true),Date.parse('2026-11-02T18:30:00Z'));
 for(const bad of ['2026-02-29','2026-11-02T24:00:00+05:30','2026-11-02T12:00:00','2026-11-02T12:60:00Z'])assert.equal(life.eventDate(bad),null);
 const m=observe({rounds:[fixture.buildStage('2026-11-02T18:30:00Z','2026-11-03T01:00:00+05:30')],regnRequirements:{...fixture.unstop.data.competition.regnRequirements,end_regn_dt:'2026-11-02'}});
 const patch=sync.sourcePatch(m);assert.equal(patch.start_date,'2026-11-03');assert.equal(patch.end_date,'2026-11-03');assert.equal(patch.registration_end,'2026-11-02T18:30:00.000Z');
 assert.equal(life.eventState({type:'native',start_date:'2026-11-02',end_date:'2026-11-02'},now),'ongoing');
});
