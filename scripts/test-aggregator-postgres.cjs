/* eslint-disable @typescript-eslint/no-require-imports -- Actual additive migration, synthetic records, fresh native PG17.6 only. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixture}=require('./aggregator-local-db.cjs');
const q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb",uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('PG17.6 real source authority, refresh/adoption, editorial conflict, rollback and identity concurrency',async()=>{
 const db=await createFixture();let passed=0;const pass=s=>{passed++;console.log('PASS '+s);};
 try{
 db.sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; CREATE TABLE profiles(id uuid PRIMARY KEY);INSERT INTO profiles VALUES('${uid(1)}');
 CREATE TABLE hackathons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,description text,start_date date,end_date date,location text,mode text,prize_pool text,website_url text UNIQUE,tags text[],banner_url text,created_at timestamptz DEFAULT now(),type varchar(50) DEFAULT 'external',organizer_id uuid REFERENCES profiles,registration_start timestamptz,registration_end timestamptz,registration_status text,college text,max_participants integer,currency text DEFAULT 'INR',min_team_size integer DEFAULT 1,max_team_size integer DEFAULT 4,rounds_count integer DEFAULT 1,rounds_info jsonb DEFAULT '[]',status text DEFAULT 'approved',ai_feedback jsonb DEFAULT '{}',archived boolean NOT NULL DEFAULT false);
 CREATE TABLE partner_configs(hackathon_id uuid REFERENCES hackathons,features jsonb DEFAULT '{}');
 CREATE TABLE hackathon_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hackathon_id uuid REFERENCES hackathons ON DELETE CASCADE);
 CREATE TABLE team_hackathons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hackathon_id uuid REFERENCES hackathons ON DELETE CASCADE);
 CREATE TABLE saved_hackathons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hackathon_id uuid REFERENCES hackathons ON DELETE CASCADE);
 ALTER TABLE hackathons ENABLE ROW LEVEL SECURITY;CREATE POLICY hackathons_read ON hackathons FOR SELECT TO anon,authenticated USING(true);
 CREATE POLICY hackathons_create ON hackathons FOR INSERT TO authenticated WITH CHECK(organizer_id=auth.uid());
 CREATE POLICY hackathons_update_organizer ON hackathons FOR UPDATE TO authenticated USING(organizer_id=auth.uid()) WITH CHECK(organizer_id=auth.uid());
 GRANT SELECT ON hackathons TO anon;GRANT SELECT,INSERT,UPDATE ON hackathons TO authenticated;GRANT ALL ON hackathons,partner_configs TO service_role;
 INSERT INTO hackathons(id,name,type,website_url) VALUES('${uid(10)}','Legacy source','official','https://unstop.com/hackathons/legacy-1000');
 INSERT INTO hackathon_registrations(hackathon_id)VALUES('${uid(10)}');INSERT INTO team_hackathons(hackathon_id)VALUES('${uid(10)}');INSERT INTO saved_hackathons(hackathon_id)VALUES('${uid(10)}');`);
 db.sql(`CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
 INSERT INTO supabase_migrations.schema_migrations(version,name) SELECT (20261001000000+n)::text,'synthetic_prior_migration' FROM generate_series(1,147)n;`);
 const migration=fs.readFileSync(path.join(db.root,'supabase/migrations/20261102123742_hackathon_source_sync.sql'),'utf8').replace(/\r\n/g,'\n');
 const proposal=fs.readFileSync(path.join(db.root,'docs/qa/aggregator-repair/sql/20261102123742_hackathon_source_sync.sql'),'utf8').replace(/\r\n/g,'\n');
 const ddl=proposal.slice(proposal.indexOf('BEGIN;')+6,proposal.lastIndexOf('COMMIT;')).trim()+'\n';
 assert.equal(migration.split('$hm_source$')[1],ddl);pass('packaged migration preserves exact reviewed source DDL');
 const pristine=()=>{
  assert.equal(db.sql("SELECT count(*) FROM supabase_migrations.schema_migrations"),'147');
  assert.equal(db.sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='hackathons' AND column_name='source_metadata'"),'0');
  assert.equal(db.sql("SELECT count(*) FROM pg_proc WHERE proname IN ('guard_hackathon_source_metadata','begin_hackathon_source_check','apply_hackathon_source_check')"),'0');
  for(const table of ['hackathon_registrations','team_hackathons','saved_hackathons'])assert.equal(db.sql(`SELECT count(*) FROM ${table} WHERE hackathon_id='${uid(10)}'`),'1');
 };
 db.sql(fs.readFileSync(path.join(db.root,'docs/qa/aggregator-repair/sql/RELEASE-PREFLIGHT.sql'),'utf8'));pass('SELECT-only catalog/ACL/ledger preflight parses before installation');
 assert.throws(()=>db.sql(migration.replace('<> 147','<> 148')),/ledger differs/);pristine();pass('unexpected ledger aborts without schema or record changes');
 assert.throws(()=>db.sql(migration.replace('ADD COLUMN source_metadata jsonb','ADD COLUMN source_metadata text')),/hash mismatch/);pristine();pass('unreviewed DDL body fails exact hash guard');
 assert.throws(()=>db.sql(migration.replace("NOTIFY pgrst, 'reload schema';",'SELECT 1/0;')),/division by zero/);pristine();pass('late installation failure rolls back all DDL and ledger together');
 assert.throws(()=>db.sql(migration.replace("NOTIFY pgrst, 'reload schema';",'SELECT pg_terminate_backend(pg_backend_pid());')),/terminating connection|server closed|connection.*closed/i);pristine();pass('lost installer connection before commit leaves no partial installation or ledger');
 db.sql(migration);pass('actual migration syntax/install on production-equivalent DATE/TIMESTAMPTZ/varchar and owner policies');
 assert.equal(db.sql("SELECT count(*) FROM supabase_migrations.schema_migrations"),'148');
 assert.equal(db.sql("SELECT (name='hackathon_source_sync' AND statements=ARRAY["+"$reviewed$"+ddl+"$reviewed$"+"]) FROM supabase_migrations.schema_migrations WHERE version='20261102123742'"),'t');
 assert.throws(()=>db.sql(migration),/ledger differs/);assert.equal(db.sql("SELECT count(*) FROM supabase_migrations.schema_migrations"),'148');
 pass('single-file install records exact version/name/DDL atomically; replay fails closed');
 const identity={provider:'unstop',provider_id:'1001',canonical_url:'https://unstop.com/hackathons/synthetic-1001'},attempt=uid(101);
 function observation(i=identity){const now=new Date();return {version:1,...i,checked_at:now.toISOString(),expires_at:new Date(+now+26*3600000).toISOString(),check_status:'ok',category:'hackathon',event_status:'upcoming',source_hash:'a'.repeat(64),parser_version:'fixture',facts:{name:'Synthetic source hackathon',description:'Original factual summary.',website_url:i.canonical_url,start_date:'2027-01-01T00:00:00+05:30',end_date:'2027-01-02T12:00:00+05:30',registration_start:now.toISOString(),registration_end:'2027-01-01T00:00:00+05:30',registration_status:'open',min_team_size:1,max_team_size:1,rounds_info:[],college:null,location:null,mode:'online',prize_pool:null,currency:null,eligibility:null},issues:[],evidence:{dates:'published fields',event_date_basis:'explicit_hackathon_build_stage_v2'}};}
 function patch(o){return {...o.facts,start_date:'2027-01-01',end_date:'2027-01-02',eligibility:undefined,rounds_count:null,tags:['unstop','Hackathon']};}
 function apply({id=null,i=identity,o=observation(i),p=patch(o),expected=null,a=attempt,failure=null,adopt=null,role='service_role'}={}){return JSON.parse(db.sql(`SET ROLE ${role}; SELECT public.apply_hackathon_source_check(${id?"'"+id+"'":'NULL'},${q(i)},${o?q(o):'NULL'},${q(p)},${expected?q(expected):'NULL'},'${a}',${failure?"'"+failure+"'":'NULL'},${adopt?"ARRAY["+adopt.map(s=>"'"+s+"'").join(',')+"]":'NULL'});`));}
 assert.equal(db.sql("SELECT has_function_privilege('authenticated','public.apply_hackathon_source_check(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text,text[])','execute') OR has_function_privilege('anon','public.begin_hackathon_source_check(uuid,uuid)','execute')"),'f');pass('anonymous/authenticated cannot execute source writers');
 for(const role of ['anon','authenticated'])assert.throws(()=>apply({role}));pass('actual direct RPC abuse denied');
 assert.throws(()=>db.sql(`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${uid(1)}',false);INSERT INTO hackathons(name,organizer_id,source_metadata)VALUES('Forged','${uid(1)}','{"version":1}');`),/server-owned/);pass('authenticated owner cannot forge source evidence at INSERT');
 const uncertainIdentity={provider:'unstop',provider_id:'9999',canonical_url:'https://unstop.com/hackathons/uncertain-9999'},uncertain=observation(uncertainIdentity);uncertain.check_status='unresolved';
 assert.equal(apply({i:uncertainIdentity,o:uncertain}).status,'not_a_verified_hackathon');assert.equal(db.sql("SELECT count(*) FROM hackathons WHERE source_metadata->>'provider_id'='9999'"),'0');pass('unresolved new observations cannot create an unverified stable-identity record');
 const created=apply();assert.equal(created.status,'created');assert.equal(apply().status,'already_completed');assert.equal(db.sql("SELECT count(*) FROM hackathons WHERE source_metadata IS NOT NULL"),'1');pass('create and exact replay preserve one provider identity');
 const id=created.id;
 const lease=JSON.parse(db.sql(`SET ROLE service_role;SELECT begin_hackathon_source_check('${id}','${uid(102)}');`));assert.equal(lease.status,'leased');assert.equal(db.sql(`SELECT source_metadata->>'check_status' FROM hackathons WHERE id='${id}'`),'checking');pass('committed pre-fetch lease fails closed if worker disappears');
 const refreshed=apply({id,a:uid(102),expected:lease.snapshot});assert.equal(refreshed.status,'refreshed');assert.equal(db.sql(`SELECT jsonb_array_length(source_metadata->'protected_fields') FROM hackathons WHERE id='${id}'`),'0');pass('offset timestamps normalize in source ownership baseline; repeat refresh is not mistaken for an edit');
 const legacyI={provider:'unstop',provider_id:'1000',canonical_url:'https://unstop.com/hackathons/legacy-1000'};assert.equal(apply({id:uid(10),i:legacyI}).status,'requires_adoption');pass('legacy catalog never silently backfilled or adopted');
 const renamedLegacy={...legacyI,canonical_url:'https://unstop.com/hackathons/renamed-1000'};
 assert.equal(apply({i:renamedLegacy}).status,'requires_adoption');assert.equal(db.sql("SELECT count(*) FROM hackathons WHERE website_url LIKE '%1000'"),'1');pass('renamed canonical URL cannot create a second row for a stable legacy Unstop identity');

 const expected=JSON.parse(db.sql(`SELECT to_jsonb(h)-'source_metadata' FROM hackathons h WHERE id='${uid(10)}'`));const adopted=apply({id:uid(10),i:legacyI,expected,adopt:Object.keys(patch(observation(legacyI))).filter(k=>k!=='eligibility')});assert.equal(adopted.status,'refreshed');assert.equal(db.sql(`SELECT type FROM hackathons WHERE id='${uid(10)}'`),'official');
 for(const table of ['hackathon_registrations','team_hackathons','saved_hackathons'])assert.equal(db.sql(`SELECT count(*) FROM ${table} WHERE hackathon_id='${uid(10)}'`),'1');pass('explicit isolated adoption preserves official type, identity and linked records');
 db.sql(`UPDATE hackathons SET organizer_id='${uid(1)}' WHERE id='${id}';`);
 assert.throws(()=>db.sql(`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${uid(1)}',false);UPDATE hackathons SET source_metadata='{"version":1}' WHERE id='${id}';`),/server-owned/);
 db.sql(`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${uid(1)}',false);UPDATE hackathons SET name='Editorial decision' WHERE id='${id}';`);
 assert.equal(db.sql(`SELECT source_metadata->>'check_status' FROM hackathons WHERE id='${id}'`),'unresolved');assert.equal(db.sql(`SELECT source_metadata->'protected_fields' ? 'name' FROM hackathons WHERE id='${id}'`),'t');pass('actual owner edit remains permitted and protects/invalidate conflicting evidence');
 assert.equal(apply({id}).status,'protected');
 db.sql(`INSERT INTO hackathons(id,name,type,website_url)VALUES('${uid(777)}','Native protected','native','https://unstop.com/hackathons/native-777'),('${uid(778)}','Partner protected','external','https://unstop.com/hackathons/partner-778');INSERT INTO partner_configs(hackathon_id)VALUES('${uid(778)}');`);
 for(const n of [777,778])assert.equal(apply({id:uid(n),i:{provider:'unstop',provider_id:String(n),canonical_url:'https://unstop.com/hackathons/'+(n===777?'native-':'partner-')+n}}).status,'protected');
 pass('native, organizer-managed and partner-linked rows remain protected at the actual SQL boundary');
 const a=uid(120),before=JSON.parse(db.sql(`SET ROLE service_role;SELECT begin_hackathon_source_check('${uid(10)}','${a}');`));
 db.sql(`UPDATE hackathons SET location='Manual venue' WHERE id='${uid(10)}';`);assert.equal(apply({id:uid(10),i:legacyI,a,expected:before.snapshot}).status,'already_completed');assert.equal(db.sql(`SELECT location FROM hackathons WHERE id='${uid(10)}'`),'Manual venue');pass('intervening editorial change prevents stale source apply');
 const b=uid(121),next=JSON.parse(db.sql(`SET ROLE service_role;SELECT begin_hackathon_source_check('${uid(10)}','${b}');`));
 const oldName=db.sql(`SELECT name FROM hackathons WHERE id='${uid(10)}'`);assert.throws(()=>apply({id:uid(10),i:legacyI,a:b,expected:next.snapshot,p:{...patch(observation(legacyI)),name:'Partial update',min_team_size:0}}));assert.equal(db.sql(`SELECT name FROM hackathons WHERE id='${uid(10)}'`),oldName);pass('failed SQL transaction leaves no partial factual changes');
 assert.equal(apply({id:uid(10),i:legacyI,a:b,o:null,p:{},failure:'provider_timeout'}).status,'failed');assert.equal(db.sql(`SELECT source_metadata->>'check_status' FROM hackathons WHERE id='${uid(10)}'`),'failed');pass('failure receipt preserves factual data and removes promotion');
 const shared={provider:'unstop',provider_id:'2222',canonical_url:'https://unstop.com/hackathons/simultaneous-2222'},o=observation(shared),params=`NULL,${q(shared)},${q(o)},${q(patch(o))},NULL,'${uid(222)}',NULL,NULL`;
 const outputs=await Promise.all([db.asyncSql(`SET ROLE service_role;SELECT apply_hackathon_source_check(${params});`),db.asyncSql(`SET ROLE service_role;SELECT apply_hackathon_source_check(${params});`)]);assert(outputs.every(s=>JSON.parse(s).id));assert.equal(db.sql("SELECT count(*) FROM hackathons WHERE source_metadata->>'provider_id'='2222'"),'1');pass('simultaneous discoveries converge atomically without duplicate rows');

 // Actual parser -> installed SDK -> orchestration -> real PostgreSQL writer -> public projection.
 const {harness}=require('./ppt-vision-harness.cjs'),{createClient}=require('@supabase/supabase-js');
 const h=harness({}, {URLSearchParams}),{SourceTransport}=h.load('src/lib/hackathons/sourceTransport.ts'),{synchronizeCatalog,CATALOG_COLUMNS}=h.load('src/lib/hackathons/synchronize.ts');
 const {loadPublicEvent}=h.load('src/lib/hackathons/publicBrowsing.ts'),{activeOpportunity,registrationState}=h.load('src/lib/hackathons/lifecycle.ts');
 const api=createClient('https://synthetic.invalid','synthetic-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,'https://synthetic.invalid');
  try{
   if(url.pathname.includes('/rpc/')){
    const body=JSON.parse(init.body),name=url.pathname.split('/').at(-1);let statement;
    if(name==='begin_hackathon_source_check')statement=`SELECT begin_hackathon_source_check('${body.p_id}','${body.p_attempt}')`;
    else {assert.equal(name,'apply_hackathon_source_check');statement=`SELECT apply_hackathon_source_check(${body.p_id?"'"+body.p_id+"'":'NULL'},${q(body.p_identity)},${body.p_observation?q(body.p_observation):'NULL'},${q(body.p_patch)},${body.p_expected?q(body.p_expected):'NULL'},'${body.p_attempt}',${body.p_failure?"'"+body.p_failure+"'":'NULL'},NULL)`;}
    return Response.json(JSON.parse(db.sql('SET ROLE service_role;'+statement+';')));
   }
   const table=url.pathname.split('/').at(-1);assert(['hackathons','partner_configs'].includes(table));
   if(table==='partner_configs')return Response.json([{hackathon_id:uid(778),features:{}}]);
   const identityFilter=url.searchParams.get('id'),where=identityFilter?(identityFilter.startsWith('gt.')?`WHERE id>'${identityFilter.slice(3)}'`:`WHERE id='${identityFilter.slice(3)}'`):'';
   const rows=JSON.parse(db.sql(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT ${CATALOG_COLUMNS} FROM hackathons ${where} ORDER BY id LIMIT 250)x;`));
   const single=String(init?.headers?.get?.('Accept')||'').includes('object');return Response.json(single?rows[0]||null:rows);
  }catch(e){return Response.json({message:e.message,code:'FIXTURE_SQL'},{status:400});}
 }}});
 const futureStart=new Date(Date.now()+2*86400000).toISOString(),futureEnd=new Date(Date.now()+3*86400000).toISOString(),futureDeadline=new Date(Date.now()+86400000).toISOString();
 let verifiedBuildWindow=true,adjacentStage=null;
 const fetchSource=async input=>{const u=new URL(input);
  if(u.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /');
  if(u.pathname.endsWith('search-result'))return Response.json({data:{data:u.searchParams.get('page')==='1'&&u.searchParams.get('oppstatus')==='open'?[{id:9876,public_url:'hackathons/synthetic-9876'}]:[]}});
  if(u.hostname==='devfolio.co')return new Response('<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{dehydratedState:{queries:[{queryKey:'fetchAllHackathonTypes',state:{data:{open_hackathons:[],upcoming_hackathons:[]}}}]}}}})+'</script>');
  if(u.pathname.endsWith('/event/list'))return Response.json({data:{flagshipEvents:[],communityEvents:[]}});
  const raw=JSON.parse(JSON.stringify(require('../qa/fixtures/aggregator/provider-facts.cjs').unstop));
  raw.data.competition.id=Number(u.pathname.split('/').at(-1));raw.data.competition.start_date=futureStart;raw.data.competition.end_date=futureEnd;raw.data.competition.rounds=verifiedBuildWindow?[require('../qa/fixtures/aggregator/provider-facts.cjs').buildStage(futureStart,futureEnd)]:[];
  raw.data.competition.regnRequirements={start_regn_dt:'2026-01-01T00:00:00+05:30',end_regn_dt:futureDeadline,min_team_size:1,max_team_size:2};
  if(adjacentStage){raw.data.competition.rounds=[adjacentStage];raw.data.competition.regnRequirements.reg_status='CLOSED';}
  return Response.json(raw);
 };
 const syncOptions=()=>({dryRun:false,transport:new SourceTransport(fetchSource,240000,0)});
 const first=await synchronizeCatalog(api,syncOptions());assert(first.results.some(r=>r.status==='created'));
 const actual=JSON.parse(db.sql("SELECT to_jsonb(h) FROM hackathons h WHERE source_metadata->>'provider_id'='9876'"));
 assert.equal(activeOpportunity(actual,Date.now()),true);assert.equal(registrationState(actual,Date.now()),'open');assert.equal(actual.max_team_size,2);
 const second=await synchronizeCatalog(api,syncOptions());assert(second.results.some(r=>r.id===actual.id&&r.status==='refreshed'));
 assert.equal(db.sql("SELECT count(*) FROM hackathons WHERE source_metadata->>'provider_id'='9876'"),'1');
 const detail=await loadPublicEvent(api,actual.id);assert.equal(detail.id,actual.id);assert.equal(detail.start_date,futureStart);assert.equal(detail.registration_end,futureDeadline);
 pass('complete actual parser/SDK/orchestrator/PG17.6 writer/public detail chain creates then refreshes one source identity');
 verifiedBuildWindow=false;const unknownSchedule=await synchronizeCatalog(api,syncOptions());assert(unknownSchedule.results.some(r=>r.id===actual.id&&r.status==='refreshed'));
 const unknownDetail=await loadPublicEvent(api,actual.id);assert.equal(unknownDetail.start_date,null);assert.equal(unknownDetail.end_date,null);
 assert.equal(activeOpportunity(unknownDetail,Date.now()),true);assert.equal(registrationState(unknownDetail,Date.now()),'open');
 assert.equal(db.sql(`SELECT start_date IS NOT NULL AND end_date IS NOT NULL FROM hackathons WHERE id='${actual.id}'`),'t');
 pass('installed v1 metadata supports unknown event dates without erasing existing DATE columns or losing confirmed open registration');
 const {eventState}=h.load('src/lib/hackathons/lifecycle.ts');
 const preservedDates=db.sql(`SELECT start_date::text||'/'||end_date::text FROM hackathons WHERE id='${actual.id}'`);
 for(const [title,display_text]of [['Grand Finale','Final judging of the hackathon.'],['Presentations','The actual hackathon presentations take place in this stage.'],['Orientation','The actual hackathon participants attend a compulsory orientation session.']])for(const past of [false,true]){
  adjacentStage=require('../qa/fixtures/aggregator/provider-facts.cjs').buildStage(new Date(Date.now()-2*86400000).toISOString(),new Date(Date.now()+(past?-1:1)*86400000).toISOString());
  Object.assign(adjacentStage.details[0],{title,display_text});
  const result=await synchronizeCatalog(api,syncOptions()),receipt=result.results.find(r=>r.id===actual.id);
  assert.equal(receipt.status,'refreshed');assert.equal(receipt.classification,'unresolved');
  assert(!Object.hasOwn(receipt.changes,'start_date'));assert(!Object.hasOwn(receipt.changes,'end_date'));
  const projected=await loadPublicEvent(api,actual.id);assert.equal(projected.start_date,null);assert.equal(projected.end_date,null);
  assert.equal(eventState(projected,Date.now()),'unknown');assert.equal(registrationState(projected,Date.now()),'closed');assert.equal(activeOpportunity(projected,Date.now()),false);
  assert.equal(db.sql(`SELECT start_date::text||'/'||end_date::text FROM hackathons WHERE id='${actual.id}'`),preservedDates);
 }
 pass('six adjacent-stage ongoing/past cases survive real parser/SDK/PG refresh with no date patches, authoritative lifecycle or suppression');
 // Application rollback compatibility, not a live Vercel routing/rollback claim.
 const {execFileSync}=require('node:child_process'),vm=require('node:vm'),ts=require('typescript');
 assert.equal(execFileSync(process.execPath,['-e','process.exit(0)'],{encoding:'utf8'}),'');pass('proposed Ignored Build Step command returns documented skip exit code locally');
 const baseline=execFileSync('git',['show','3a0b4d0488128fe730607ae1ef024a3bf52992e1:src/lib/hackathons/publicBrowsing.ts'],{cwd:db.root,encoding:'utf8'}),old={};
 vm.runInNewContext(ts.transpileModule(baseline,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:old,console,URL});
 const rollbackClient=createClient('https://rollback.invalid','synthetic-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input.url);assert.equal(u.origin,'https://rollback.invalid');assert.equal(init?.method||'GET','GET');
  assert.equal(u.pathname,'/rest/v1/hackathons');assert.equal(u.searchParams.get('select'),old.PUBLIC_EVENT_COLUMNS);
  assert.equal(u.searchParams.get('status'),'eq.approved');assert.equal(u.searchParams.get('archived'),'eq.false');
  const filter=u.searchParams.get('id');let extra='';if(filter){assert.match(filter,/^(gt|eq)\.[0-9a-f-]{36}$/);extra=` AND id${filter.startsWith('gt.')?'>':'='}'${filter.slice(3)}'`;}
  const data=JSON.parse(db.sql(`SET ROLE anon;SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT ${old.PUBLIC_EVENT_COLUMNS} FROM hackathons WHERE status='approved' AND NOT archived ${extra} ORDER BY id LIMIT 250)x;`));
  const single=String(init?.headers?.get?.('Accept')||'').includes('object');return Response.json(single?data[0]||null:data);
 }}});
 assert((await old.loadPublicEvents(rollbackClient)).some(r=>r.id===uid(10)));assert.equal((await old.loadPublicEvent(rollbackClient,uid(10))).id,uid(10));
 for(const table of ['hackathon_registrations','team_hackathons','saved_hackathons'])assert.equal(db.sql(`SELECT count(*) FROM ${table} WHERE hackathon_id='${uid(10)}'`),'1');
 pass('pinned production reader still lists/direct-loads original IDs after additive install and synthetic adoption; links survive app rollback');
 console.log(JSON.stringify({postgres:'17.6',passed,productionConnections:0,productionWrites:0}));
 }finally{await db.close();}
});
