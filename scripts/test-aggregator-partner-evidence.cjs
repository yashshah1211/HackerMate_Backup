/* eslint-disable @typescript-eslint/no-require-imports -- Captured public fields, synthetic SDK responses; no SQL or network. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {harness}=require('./ppt-vision-harness.cjs'),{createClient}=require('@supabase/supabase-js');
const capture=require('../qa/fixtures/aggregator/rack-it-up-captured.json');
const now=Date.parse(capture.provenance.checked_at),h=harness({}, {URLSearchParams}),p=h.load('src/lib/hackathons/providers.ts'),s=h.load('src/lib/hackathons/source.ts'),life=h.load('src/lib/hackathons/lifecycle.ts'),sync=h.load('src/lib/hackathons/synchronize.ts'),writer=h.load('src/lib/hackathons/sourceEvidenceWriter.ts');
const plain=x=>JSON.parse(JSON.stringify(x)),uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
// The original full response was not archived. Only the taxonomy/details wrapper is synthetic;
// all round objects and registration values below are the exact completed live capture.
function payload(){return {data:{competition:{id:1777639,title:capture.name,type:'hackathons',details:'A hackathon competition.',status:'LIVE',region:'online',organisation:{name:capture.organizer},
 regnRequirements:{start_regn_dt:capture.registration.start,end_regn_dt:capture.registration.end,reg_status:capture.registration.status,min_team_size:capture.registration.minTeamSize,max_team_size:capture.registration.maxTeamSize},rounds:structuredClone(capture.rounds)}}};}
function observation(raw=payload(),clock=now){return p.parseUnstop(capture.identity,raw,clock,crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex'));}
function row(metadata=null){return {id:uid(1),name:'Organizer title',description:'Keep the complete organizer description',website_url:capture.identity.canonical_url,college:'Organizer label',start_date:'2026-12-11',end_date:'2026-12-13',registration_start:null,registration_end:null,registration_status:null,min_team_size:1,max_team_size:4,mode:'online',location:'Online',prize_pool:'Organizer awards',currency:'INR',rounds_info:[],rounds_count:1,tags:['Coding','Partner'],type:'external',organizer_id:uid(9),status:'approved',archived:false,source_metadata:metadata};}
const preserved=['name','description','website_url','college','start_date','end_date','min_team_size','max_team_size','mode','location','prize_pool','currency','rounds_info','rounds_count','tags'];
function evidenceMetadata(m=observation()){return {...plain(m),evidence_only:true,protected_fields:[...preserved]};}
const approval=m=>({record_id:uid(1),provider_id:m.provider_id,source_hash:m.source_hash,checked_at:m.checked_at,approved_by:'synthetic reviewer',approved_at:new Date(now).toISOString()});

test('exact captured provider stage and registration fields grant replayed v3 without changing their values',()=>{
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(capture.rounds)).digest('hex'),capture.provenance.inventory_sha256);
 const m=observation(),v=s.validateSourceObservation(m,capture.identity.canonical_url);
 assert.deepEqual(Array.from(v.errors),[]);assert.equal(m.check_status,'ok');assert.equal(m.evidence.event_date_basis,s.UNSTOP_EVENT_DATE_BASIS);
 assert.deepEqual(plain(m.evidence.build_inventory),capture.rounds);assert.equal(v.schedule.start,'2026-12-11T18:00:00+05:30');assert.equal(v.schedule.end,'2026-12-13T18:00:00+05:30');
 assert.equal(m.facts.registration_start,'2026-10-30T00:00:00+05:30');assert.equal(m.facts.registration_end,'2026-12-09T23:59:00+05:30');assert.equal(m.facts.registration_status,'open');
 assert.notEqual(m.source_hash,capture.provenance.original_response_sha256,'Projection fixture is not mislabeled as the complete raw response');
});
test('alternate typed Rounds and numbered build label with an explicit stage statement remain valid',()=>{
 const raw=payload();raw.data.competition.rounds[1].details[0].title='Round 2: Hackathon build';raw.data.competition.rounds[1].details[0].display_text='<p>The actual hackathon build takes place in this stage.</p>';
 assert(s.hasEventScheduleEvidence(observation(raw)));
});
const bad={
 'duration contradicts dates':r=>r[1].details[0].display_text=r[1].details[0].display_text.replace('in 48 hours','in 47 hours'),
 'prose date contradicts structured date':r=>r[1].details[0].display_text=r[1].details[0].display_text.replace('Fri 11 Dec','Sat 12 Dec'),
 'reversed dates':r=>r[1].details[0].end_date='2026-12-10T18:00:00+05:30',
 'missing end':r=>r[1].details[0].end_date=null,
 'hidden build':r=>r[1].is_hidden=1,
 'contradictory child status':r=>r[1].details[0].status='LIVE',
 'contradictory registration child status':r=>r[0].details[0].status='DRAFT',
 'contradictory finals parent dates':r=>Object.assign(r[2],{start_date:'2026-12-14T10:00:00+05:30',end_date:'2026-12-16T18:00:00+05:30'}),
 'ambiguous sibling':r=>r.push({entity_type:'App\\Model\\Rounds',status:'NOT_STARTED',is_hidden:0,is_inactive:0,details:[{title:'More building?',display_text:'Details later',start_date:'2026-12-16',end_date:null}]}),
 'finals also building':r=>r[2].details[0].display_text+='<p>Teams build new prototypes during finals.</p>',
 'overlapping registration':r=>r[0].details[0].end_date='2026-12-12T23:59:00+05:30',
 'unsafe HTML':r=>r[1].details[0].display_text='<span hidden>No building</span>'+r[1].details[0].display_text,
};
for(const [name,mutate]of Object.entries(bad))test('captured format holds '+name,()=>{const raw=payload();mutate(raw.data.competition.rounds);const m=observation(raw);assert.equal(s.hasEventScheduleEvidence(m),false);assert.equal(sync.sourcePatch(m).start_date,undefined);assert.equal(sync.sourcePatch(m).end_date,undefined);assert.equal(life.eventState(row(m),now),'unknown');});
test('contradictory published event assertion and overdue NOT_STARTED do not grant event authority',()=>{
 const raw=payload();raw.data.competition.details='Hackathon. Event Dates: 20–21 December.';assert.equal(s.hasEventScheduleEvidence(observation(raw)),false);
 assert.equal(s.hasEventScheduleEvidence(observation(payload(),Date.parse('2026-12-14T00:00:00Z'))),false);
});
test('editorial locks are field-aware, while registration conflicts, expiry and failures still fail closed',()=>{
 const m=observation();m.protected_fields=['description','tags'];m.check_status='unresolved';m.issues=['editorial_override'];
 const event=row(m);assert(s.sourceFresh(m,now));assert.equal(life.registrationState(event,now),'open');assert.equal(life.eventState(event,now),'upcoming');assert.equal(s.synchronizedEvent(event).description,event.description);
 m.protected_fields.push('registration_end');assert.equal(life.registrationState(event,now),'unknown');assert.equal(life.activeOpportunity(event,now),false);
 const e=evidenceMetadata();assert.equal(life.activeOpportunity(row(e),now),true);assert.equal(life.activeOpportunity(row(e),now+s.SOURCE_MAX_AGE_MS),false);
 for(const status of ['checking','failed']){e.check_status=status;assert.equal(life.activeOpportunity(row(e),now),false);}
});
test('evidence-only projection preserves every organizer field and independently labels verified registration',()=>{
 const event=row(evidenceMetadata()),view=s.synchronizedEvent(event);
 for(const field of preserved)assert.deepEqual(plain(view[field]),plain(event[field]),field);
 assert.equal(life.registrationLabel(event,now),'Registration open');assert.equal(life.registrationState(event,now),'open');assert.equal(life.eventState(event,now),'unknown');assert.equal(life.activeOpportunity(event,now),true);
 assert.deepEqual({...sync.sourcePatch(event.source_metadata)},{});
});
test('actual SDK approved evidence path changes only metadata, preserving participant and partner links',async()=>{
 const m=observation(),stored=row(),registration={id:uid(2),hackathon_id:stored.id},partner={id:uid(3),hackathon_id:stored.id,features:{organizer_description:'Keep me'}};
 const before=JSON.stringify({stored,registration,partner});let calls=0;
 const client=createClient('https://synthetic.invalid','synthetic-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  assert.equal(new URL(input).pathname,'/rest/v1/rpc/store_hackathon_source_evidence');const b=JSON.parse(init.body);calls++;assert.equal(b.p_id,stored.id);assert.equal(b.p_allow_initial,true);assert.equal(b.p_action,'apply');assert.equal(b.p_patch,undefined);
  assert.deepEqual(b.p_expected,plain(writer.evidenceSnapshot(stored)));stored.source_metadata=evidenceMetadata(b.p_observation);return Response.json({status:'evidence_refreshed',id:stored.id});
 }}});
 const receipt=await writer.persistApprovedSourceEvidence(client,stored,m,approval(m),now);assert.equal(receipt.status,'evidence_refreshed');assert.equal(calls,1);
 const saved=stored.source_metadata;stored.source_metadata=null;assert.equal(JSON.stringify({stored,registration,partner}),before);stored.source_metadata=saved;
 assert.equal(life.registrationState(stored,now),'open');assert.equal(life.activeOpportunity(stored,now),true);assert.equal(sync.reconciliation(stored,stored.source_metadata).classification,'registration_open');
});
test('missing, mismatched and stale adoption approval cannot reach RPC',async()=>{
 const m=observation();let calls=0;const client={rpc(){calls++;throw Error('Must not write');}};
 for(const mutate of [a=>a.record_id=uid(99),a=>a.source_hash='b'.repeat(64),a=>a.checked_at='2026-01-01T00:00:00Z',a=>a.approved_by='',a=>a.approved_at='2025-01-01T00:00:00Z']){
  const a=approval(m);mutate(a);await assert.rejects(writer.persistApprovedSourceEvidence(client,row(),m,a,now),/approval required/);
 }
 await assert.rejects(writer.persistApprovedSourceEvidence(client,row(),m,approval(m),now+300001),/invalid, stale/);assert.equal(calls,0);
});
for(const fail of [false,true])test('adopted partner refresh uses only metadata RPC; provider failure='+fail,async()=>{
 const m=evidenceMetadata(),stored=row(m),before=JSON.stringify({...stored,source_metadata:null}),calls=[];
 const raw=payload(),hash=crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
 const transport={discoverSources:async()=>({identities:[],failures:[]}),SourceTransport:class{remaining(){return 240000;}detail(){if(fail)throw Error('Synthetic provider unavailable');return Promise.resolve({body:JSON.stringify(raw),hash,checkedAt:now});}}};
 const client=createClient('https://synthetic.invalid','synthetic-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const url=new URL(input);
  if(url.pathname.includes('/rpc/')){
   assert.equal(url.pathname,'/rest/v1/rpc/store_hackathon_source_evidence');const b=JSON.parse(init.body);calls.push(b.p_action);assert.equal(b.p_allow_initial,false);assert.equal(b.p_patch,undefined);
   if(b.p_action==='lease'){const snapshot=plain(writer.evidenceSnapshot(stored));stored.source_metadata={...stored.source_metadata,check_status:'checking',attempt_id:b.p_attempt};return Response.json({status:'leased',snapshot});}
   assert.equal(stored.source_metadata.attempt_id,b.p_attempt);
   stored.source_metadata=b.p_action==='failure'?{...stored.source_metadata,check_status:'failed'}:evidenceMetadata(b.p_observation);
   return Response.json({status:b.p_action==='failure'?'failed':'evidence_refreshed',id:stored.id});
  }
  return Response.json(url.pathname.endsWith('/partner_configs')?[{hackathon_id:stored.id,features:{}}]:url.searchParams.get('id')?.startsWith('gt.')?[]:[stored]);
 }}});
 const loader=harness({'./sourceTransport':transport},{URLSearchParams});const result=await loader.load('src/lib/hackathons/synchronize.ts').synchronizeCatalog(client,{dryRun:false});
 assert.deepEqual(calls,['lease',fail?'failure':'apply']);assert.equal(JSON.stringify({...stored,source_metadata:null}),before);assert.deepEqual({...result.results[0].changes},{});
 assert.equal(life.registrationState(stored,now),fail?'unknown':'open');assert.equal(life.activeOpportunity(stored,now),!fail);
});
test('legacy cursor covers all 410 records in bounded batches and holds duplicate stable identities',()=>{
 const {legacyEvidenceBatch}=h.load('src/lib/hackathons/legacyEvidence.ts');const rows=Array.from({length:410},(_,i)=>({...row(),id:uid(i+1),website_url:'https://unstop.com/hackathons/fake-'+(10000+i)}));
 rows[409].website_url='https://unstop.com/o/10000';let cursor='',ids=[],held=[];
 for(;;){const b=legacyEvidenceBatch(rows,cursor,20);assert(b.records.length<=20);ids.push(...b.records.map(x=>x.record.id));held.push(...b.records.filter(x=>x.reason).map(x=>x.reason));cursor=b.nextCursor;if(!b.hasMore)break;}
 assert.equal(ids.length,410);assert.equal(new Set(ids).size,410);assert.deepEqual(held,['duplicate_source_identity','duplicate_source_identity']);assert.throws(()=>legacyEvidenceBatch(rows,'',51),/1–50/);
});
test('legacy preview observes partner-linked legacy rows without calling any writer',async()=>{
 let page=0,rpcs=0;const record=row(),client={from(){const q={select(){return q;},order(){return q;},limit(){return q;},gt(){return q;},abortSignal(){return q;},then(resolve){return Promise.resolve({data:page++===0?[record]:[],error:null}).then(resolve);}};return q;},rpc(){rpcs++;throw Error('Forbidden');}};
 const raw=payload(),hash=crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
 const loader=harness({'./sourceTransport':{discoverSources:async()=>({identities:[],failures:[]}),SourceTransport:class{remaining(){return 240000;}detail(){return Promise.resolve({body:JSON.stringify(raw),hash,checkedAt:now});}}}},{URLSearchParams});
 const r=await loader.load('src/lib/hackathons/legacyEvidence.ts').reviewLegacyEvidenceBatch(client,{limit:1});assert.equal(rpcs,0);assert.equal(r.approvedWrites,0);assert.equal(r.results[0].classification,'registration_open');assert.deepEqual({...r.results[0].changes},{});assert(r.results[0].proposedEvidence);
});
test('prepared migration can only assign metadata and keeps existing partner writers untouched',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261103154847_verified_source_evidence.sql','utf8');
 assert(!/\b(?:INSERT INTO|DELETE FROM|CREATE OR REPLACE|ALTER TABLE|GRANT (?:UPDATE|SELECT|INSERT))\b/i.test(sql));
 const assignments=[...sql.matchAll(/UPDATE public\.hackathons SET ([^\n]+)/g)];assert.equal(assignments.length,3);for(const m of assignments)assert(m[1].startsWith('source_metadata='));
 for(const literal of ['SECURITY INVOKER','pg_advisory_xact_lock','p_allow_initial','requires_adoption','source_metadata=metadata','Complete factual/control comparison required','Duplicate source identity','FROM PUBLIC,anon,authenticated'])assert(sql.toLowerCase().includes(literal.toLowerCase())||literal==='Duplicate source identity'&&sql.includes('duplicate source identity'));
 const old=fs.readFileSync('docs/qa/aggregator-repair/sql/20261102123742_hackathon_source_sync.sql','utf8');assert(old.includes("'status','protected'"));assert(old.includes('p.hackathon_id=h.id'));
});
test('empty verified views offer an explicit accessible general-browsing action',()=>{
 const page=fs.readFileSync('src/app/hackathons/page.tsx','utf8');assert(page.includes('Browse all listings ({hackathons.length})'));assert(page.includes('onClick={() => setActiveTab("all")}'));
});
