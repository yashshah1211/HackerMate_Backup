/* eslint-disable @typescript-eslint/no-require-imports -- Disposable PostgreSQL and synthetic loopback HTTP provider only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID}=require('node:crypto');const {test}=require('node:test');
const {NextRequest,NextResponse}=require('next/server');
const {createFixture}=require('./admin-hackathon-local-db.cjs');
const {harness}=require('./ppt-vision-harness.cjs');
const ID='00000000-0000-4000-8000-000000000601',OTHER='00000000-0000-4000-8000-000000000602';
const MIGRATION='20261107112640_idempotent_organizer_pitch.sql';
const quote=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''")+"'";
test('durable organizer intents across independent handlers, crashes and provider uncertainty',async t=>{
 const db=await createFixture();let server;
 const state={requests:[],delivered:new Map(),behavior:'accepted',accountingFail:false,recordFail:null,claimFail:false,prefetch:null};
 try{
  db.sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`);
  for(const file of ['202607210001_organizer_leads.sql','202607240001_add_open_tracking_to_organizer_leads.sql','202607240002_add_last_sent_to_organizer_leads.sql'])
   db.sql(fs.readFileSync(path.join(db.root,'supabase/migrations',file),'utf8'));
  db.sql(`CREATE TABLE public.app_settings(key text PRIMARY KEY,value text NOT NULL);
    ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE ON public.app_settings TO service_role;
    GRANT SELECT,UPDATE ON public.organizer_leads TO service_role;`);
  const migration=fs.readFileSync(path.join(db.root,'supabase/migrations',MIGRATION),'utf8');
  await t.test('failed installation rolls back both function definitions',()=>{
   assert.throws(()=>db.sql(migration.replace('TO service_role;','TO nonexistent_hm06_role;')),/does not exist/);
   assert.equal(db.sql("SELECT to_regprocedure('public.claim_organizer_pitch(uuid,uuid,text,text,text,text)') IS NULL;"),'t');
  });
  db.sql(migration);
  db.sql(fs.readFileSync(path.join(db.root,'supabase/migrations/20261107075734_signed_organizer_email_open.sql'),'utf8'));
  server=http.createServer(async(req,res)=>{
   let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw),key=req.headers['idempotency-key'];
   assert.equal(req.headers.authorization,'Bearer synthetic-hm06-key');assert.match(key,/^hm-organizer-pitch\/v1\/[a-f0-9-]{36}$/);
   state.requests.push({body,key});
   if(state.prefetch)await state.prefetch(body);
   if(state.behavior==='timeout'){res.destroy();return;}
   let status=200,result;
   if(state.behavior==='accepted'){
    const prior=state.delivered.get(key);
    if(prior&&prior.raw!==raw){status=409;result={name:'invalid_idempotent_request'};}
    else {result={id:prior?.id||'synthetic-provider-'+randomUUID()};state.delivered.set(key,{raw,id:result.id});}
   }else if(state.behavior==='rejected'){status=422;result={name:'validation_error'};}
   else if(state.behavior==='5xx'){status=503;result={name:'service_unavailable'};}
   else if(state.behavior==='malformed'){res.writeHead(200,{'content-type':'text/html'});res.end('<html>Synthetic</html>');return;}
   else{status=409;result={name:state.behavior};}
   res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(result));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const provider='http://127.0.0.1:'+server.address().port;
  function client(){
   return {from(table){
    if(table==='app_settings')return{async insert(row){
     try{await db.asyncSql(`SET ROLE service_role;INSERT INTO public.app_settings(key,value) VALUES(${quote(row.key)},${quote(row.value)});`);return{error:null};}
     catch(error){return{error:{code:error.message.includes('23505')?'23505':'42501'}};}
    }};
    assert.equal(table,'organizer_leads');const filters=[];let single=false,offset=0,limit=100000,columns='*';
    const col=key=>{assert.match(key,/^[a-z_]+$/);return key;};
    const q={select(value){columns=value;assert(/^[a-z_, ]+$/.test(value));return q;},
     eq(key,value){filters.push(`${col(key)}=${quote(value)}`);return q;},
     is(key,value){assert.equal(value,null);filters.push(`${col(key)} IS NULL`);return q;},
     not(key,op,value){assert.equal(op,'is');assert.equal(value,null);filters.push(`${col(key)} IS NOT NULL`);return q;},
     or(value){assert.equal(value,'pitch_sent_at.not.is.null,last_sent_to.not.is.null,status.eq.email_outcome_unknown,status.eq.restored_review');filters.push("(pitch_sent_at IS NOT NULL OR last_sent_to IS NOT NULL OR status IN ('email_outcome_unknown','restored_review'))");return q;},
     order(){return q;},range(a,b){offset=a;limit=b-a+1;return q;},
     maybeSingle(){single=true;return q;},then(resolve,reject){
      return db.asyncSql(`SET ROLE service_role;SELECT COALESCE(jsonb_agg(l),'[]') FROM(SELECT ${columns} FROM public.organizer_leads${filters.length?' WHERE '+filters.join(' AND '):''} ORDER BY id LIMIT ${limit} OFFSET ${offset})l;`)
       .then(raw=>{const rows=JSON.parse(raw);return{data:single?rows[0]||null:rows,error:null};}).then(resolve,reject);
     }};return q;},async rpc(name,args){
    if(name==='claim_organizer_pitch'&&state.claimFail)return{error:{code:'42501',message:'PRIVATE_DETAIL'},data:null};
    if(name==='record_organizer_pitch'&&args.p_event===state.recordFail)return{error:{code:'42501',message:'PRIVATE_DETAIL'},data:null};
    let expression;
    if(name==='claim_organizer_pitch')expression=`public.claim_organizer_pitch(${quote(args.p_intent_id)}::uuid,${quote(args.p_lead_id)}::uuid,${quote(args.p_recipient)},${quote(args.p_fingerprint)},${quote(args.p_mode)},${quote(args.p_repeat_of)})`;
    else if(name==='record_organizer_pitch')expression=`public.record_organizer_pitch(${quote(args.p_intent_id)}::uuid,${quote(args.p_event)},${quote(args.p_recipient)},${quote(args.p_provider_id)})`;
    else if(name==='record_organizer_email_open')expression=`public.record_organizer_email_open(${quote(args.p_lead_id)}::uuid)`;
    else throw Error('Unexpected RPC '+name);
    try{const raw=await db.asyncSql('SET ROLE service_role; SELECT '+expression+';');return{data:raw?JSON.parse(raw):null,error:null};}
    catch{return{data:null,error:{code:'P0001',message:'PRIVATE_DETAIL'}};}
   }};
  }
  function instance(options={}){
   const logs=[];const database=client();
   const h=harness({'next/server':{NextRequest,NextResponse},
    '@/lib/admin/requireOutreachAdmin':{requireOutreachAdmin:async()=>options.unauthorized?NextResponse.json({error:'Forbidden'},{status:403}):{supabaseAdmin:database}},
    '@supabase/supabase-js':{createClient:()=>database},
    '@/lib/admin/emailBudgetGuard':{checkEmailBudget:async()=>({allowedCount:1}),recordEmailSendSuccess:async()=>{
     if(state.accountingFail)throw Error('PRIVATE_DETAIL');return{status:'recorded'};
    }},
   },{fetch:async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');return fetch(provider,init);},console:{error:(...args)=>logs.push(args),warn(){},log(){}}});
   Object.assign(h.env,{RESEND_API_KEY:'synthetic-hm06-key',RESEND_FROM_EMAIL:'sender@example.invalid',EMAIL_OPEN_TRACKING_SECRET:'ab'.repeat(32)});
   const post=(body,raw)=>h.load('src/app/api/admin/send-organizer-pitch/route.ts').POST(new NextRequest('http://localhost/api/admin/send-organizer-pitch',{method:'POST',body:raw??JSON.stringify(body)}));
   return{...h,post,logs,database};
  }
  const instances=Array.from({length:3},()=>instance());
  const body=(overrides={})=>({intentId:randomUUID(),leadId:ID,recipientEmail:'organizer@example.invalid',subject:'Synthetic proposal',contentHtml:'<p>Synthetic pitch</p>',...overrides});
  function reset(status='new',sent=false){
   state.requests=[];state.delivered.clear();state.behavior='accepted';state.accountingFail=false;state.recordFail=null;state.claimFail=false;state.prefetch=null;
   db.sql(`DELETE FROM public.app_settings;DELETE FROM public.organizer_leads;
    INSERT INTO public.app_settings VALUES('synthetic-quota','preserve');
    INSERT INTO public.organizer_leads(id,title,unstop_url,organizer_email,status,pitch_sent_at,last_sent_to,opened_at,open_count,notes,created_at,updated_at)
    VALUES('${ID}','Synthetic selected','https://unstop.com/competitions/hm06-one','organizer@example.invalid',${quote(status)},${sent?"'2000-01-01Z'":'NULL'},${sent?"'prior@example.invalid'":'NULL'},'2001-01-01Z',9,'Preserve synthetic notes','1999-01-01Z','2002-01-01Z'),
    ('${OTHER}','Synthetic untouched','https://unstop.com/competitions/hm06-two','other@example.invalid','new',NULL,NULL,NULL,0,'Preserve other','1999-01-01Z','2002-01-01Z');`);
  }
  const rows=()=>JSON.parse(db.sql("SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.organizer_leads l;"));
  const journal=id=>JSON.parse(db.sql(`SELECT value FROM public.app_settings WHERE key='organizer:pitch:v1:intent:${id}';`));
  await t.test('functions are invoker, empty path and executable only by service role/browser roles denied',()=>{
   for(const signature of ['claim_organizer_pitch(uuid,uuid,text,text,text,text)','record_organizer_pitch(uuid,text,text,text)']){
    for(const role of ['anon','authenticated'])assert.equal(db.sql(`SELECT has_function_privilege('${role}','public.${signature}','EXECUTE');`),'f');
    assert.equal(db.sql(`SELECT NOT prosecdef AND proconfig=ARRAY['search_path=""'] AND has_function_privilege('service_role',oid,'EXECUTE') FROM pg_proc WHERE oid='public.${signature}'::regprocedure;`),'t');
    assert.equal(db.sql(`SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.${signature}'::regprocedure AND a.grantee=0;`),'0');
   }
   assert.throws(()=>db.sql(`SET ROLE anon;SELECT public.claim_organizer_pitch('${randomUUID()}','${ID}','test@example.invalid','${'a'.repeat(64)}','manual');`),/permission denied for function/);
  });
  await t.test('24 concurrent requests across three independent handlers make one provider request',async()=>{
   reset();const other=rows()[1],input=body();
   const results=await Promise.all(Array.from({length:24},(_,i)=>instances[i%3].post(input)));
   assert.equal(results.filter(r=>r.status===200).length,1);
   assert(results.filter(r=>r.status!==200).every(r=>[409,503].includes(r.status)));
   assert.equal(state.requests.length,1);assert.equal(state.delivered.size,1);
   assert.equal(journal(input.intentId).state,'accepted');assert.equal(journal(input.intentId).accounting,'recorded');
   assert.equal((await instances[0].post(input)).status,409);assert.equal(state.requests.length,1);
   assert.deepEqual(rows()[1],other);assert.equal(db.sql("SELECT value FROM public.app_settings WHERE key='synthetic-quota';"),'preserve');
  });
  for(const variation of ['different-intents','different-recipients','different-content','alternate-lead'])
   await t.test('concurrent '+variation+' cannot bypass lead or recipient exclusion',async()=>{
    reset();if(variation==='alternate-lead')db.sql(`UPDATE public.organizer_leads SET organizer_email='organizer@example.invalid' WHERE id='${OTHER}';`);
    const first=body(),second={...first};
    if(variation!=='different-content')second.intentId=randomUUID();
    if(variation==='different-recipients')second.recipientEmail='second@example.invalid';
    if(variation==='different-content')second.contentHtml='<p>Different</p>';
    if(variation==='alternate-lead')second.leadId=OTHER;
    await Promise.all([instances[0].post(first),instances[1].post(second)]);
    assert.equal(state.requests.length,1);assert.equal(state.delivered.size,1);
   });
  for(const behavior of ['timeout','5xx','malformed','rejected','invalid_idempotent_request','concurrent_idempotent_requests'])
   await t.test(behavior+' remains durable and never retries after status editing or fresh intent',async()=>{
    reset();state.behavior=behavior;const input=body();const r=await instances[0].post(input);const data=await r.json();
    assert.equal(data.retrySafe,false);assert.equal(data.dispatch.status,behavior==='rejected'?'failed':'unknown');
    assert.equal(journal(input.intentId).state,behavior==='rejected'?'rejected':'unknown');
    db.sql(`UPDATE public.organizer_leads SET status='new' WHERE id='${ID}';`);
    await instances[1].post(input);await instances[2].post(body());
    assert.equal(state.requests.length,1);
   });
  await t.test('exception after acquisition and before provider contact leaves claimed evidence',async()=>{
   reset();state.recordFail='dispatching';const input=body();assert.equal((await instances[0].post(input)).status,503);
   assert.equal(journal(input.intentId).state,'claimed');state.recordFail=null;
   await instances[1].post(input);await instances[2].post(body());assert.equal(state.requests.length,0);
  });
  for(const failure of ['crm','accounting','journal'])
   await t.test('provider acceptance survives '+failure+' failure and blocks all further provider calls',async()=>{
    reset();if(failure==='accounting')state.accountingFail=true;
    if(failure==='journal')state.recordFail='accepted';
    if(failure==='crm')db.sql("CREATE FUNCTION public.hm06_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_DETAIL';END $$;CREATE TRIGGER hm06_failure BEFORE UPDATE ON public.organizer_leads FOR EACH ROW EXECUTE FUNCTION public.hm06_failure();");
    const input=body();
    try{
     const r=await instances[0].post(input),data=await r.json();
     assert.equal(r.status,200);assert.equal(data.dispatch.status,'accepted');assert.equal(data.success,true);
     assert(data.dbUpdateFailed||data.accounting.status==='failed');assert.equal(data.retrySafe,false);
     state.accountingFail=false;state.recordFail=null;
     await instances[1].post(input);await instances[2].post(body());assert.equal(state.requests.length,1);
     assert(!JSON.stringify(data).includes('PRIVATE_DETAIL'));assert(!JSON.stringify(instances[0].logs).includes('PRIVATE_DETAIL'));
    }finally{if(failure==='crm')db.sql("DROP TRIGGER hm06_failure ON public.organizer_leads;DROP FUNCTION public.hm06_failure();");}
   });
  await t.test('missing migration and service table privileges fail closed before provider contact',async()=>{
   reset();state.claimFail=true;assert.equal((await instances[0].post(body())).status,503);assert.equal(state.requests.length,0);state.claimFail=false;
   db.sql("REVOKE INSERT ON public.app_settings FROM service_role;");
   try{assert.equal((await instances[0].post(body())).status,503);assert.equal(state.requests.length,0);}
   finally{db.sql("GRANT INSERT ON public.app_settings TO service_role;");}
   db.sql("ALTER FUNCTION public.claim_organizer_pitch(uuid,uuid,text,text,text,text) RENAME TO hm06_temporarily_missing;");
   try{assert.equal((await instances[0].post(body())).status,503);assert.equal(state.requests.length,0);}
   finally{db.sql("ALTER FUNCTION public.hm06_temporarily_missing(uuid,uuid,text,text,text,text) RENAME TO claim_organizer_pitch;");}
  });
  await t.test('explicit completed-predecessor approval permits one separate repeat and preserves old history',async()=>{
   reset();const first=body();assert.equal((await instances[0].post(first)).status,200);const before=rows()[0],prior=journal(first.intentId);
   const next=body();const denied=await instances[0].post(next);const approval=await denied.json();
   assert.equal(denied.status,409);assert.equal(approval.sendState,'approval_required');assert.equal(approval.repeatOf,first.intentId);
   const attempts=Array.from({length:20},()=>body({repeatOf:approval.repeatOf}));
   const results=await Promise.all(attempts.map((input,i)=>instances[i%3].post(input)));
   assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(state.requests.length,2);
   const after=rows()[0];for(const key of ['pitch_sent_at','last_sent_to','opened_at','open_count','notes','created_at'])assert.deepEqual(after[key],before[key],key);
   assert.deepEqual(journal(first.intentId),prior,'Previous provider receipt/history never overwritten');
  });
  await t.test('historical send needs explicit snapshot approval and retains its recorded fields',async()=>{
   reset('pitch_sent',true);const before=rows()[0],input=body();const proposal=await instances[0].post(input);const token=(await proposal.json()).repeatOf;
   assert.match(token,/^legacy:[a-f0-9]{64}$/);assert.equal(state.requests.length,0);
   const r=await instances[0].post({...input,repeatOf:token});assert.equal(r.status,200);
   for(const key of ['pitch_sent_at','last_sent_to','opened_at','open_count','notes','created_at'])assert.deepEqual(rows()[0][key],before[key],key);
  });
  await t.test('old scheduler claims block manual intent, including previously accepted but incomplete state',async()=>{
   for(const status of ['claimed_before_provider_attempt','unknown','failed','accepted']){
    reset();db.sql(`INSERT INTO public.app_settings(key,value) SELECT 'cron:organizer-outreach:v1:recipient:'||encode(sha256(convert_to('organizer@example.invalid','UTF8')),'hex'),jsonb_build_object('status',${quote(status)},'lead_id','${ID}','provider_id','prior-provider')::text;`);
    assert.equal((await instances[0].post(body())).status,409);assert.equal(state.requests.length,0);
   }
  });
  await t.test('signed proxy prefetch before acceptance cannot lose first-send bookkeeping',async()=>{
   reset();const h=instances[0];state.prefetch=async payload=>{
    const url=payload.html.match(/<img src="([^"]+)"/)[1].replaceAll('&amp;','&');
    await h.load('src/app/api/webhooks/email-open/route.ts').GET(new NextRequest(url));
   };
   const input=body();assert.equal((await h.post(input)).status,200);
   assert.equal(journal(input.intentId).crm,'recorded');assert(rows()[0].pitch_sent_at);assert.equal(rows()[0].open_count,9);
  });
  await t.test('manual, scheduled and legacy automatic senders share one recipient exclusion under real parallelism',async()=>{
   reset();db.sql(`UPDATE public.organizer_leads SET notes='[HACKERMATE_OUTREACH_APPROVED_V1]' WHERE id='${ID}';`);
   await Promise.all([
    instances[0].post(body()),
    instances[1].load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(instances[1].database,[{id:ID}]),
    instances[2].load('src/lib/admin/scheduledOrganizerOutreach.ts').runScheduledOrganizerOutreach(instances[2].database),
   ]);
   assert.equal(state.requests.length,1);assert.equal(state.delivered.size,1);
   assert.equal(db.sql("SELECT count(*) FROM public.app_settings WHERE key LIKE 'cron:organizer-outreach:v1:recipient:%';"),'1');
  });
  await t.test('claim transaction rolls back an inserted recipient if journal insertion fails',async()=>{
   reset();db.sql("CREATE FUNCTION public.hm06_claim_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key LIKE 'organizer:pitch:v1:intent:%' THEN RAISE EXCEPTION 'Synthetic journal failure';END IF;RETURN NEW;END $$;CREATE TRIGGER hm06_claim_failure BEFORE INSERT ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.hm06_claim_failure();");
   try{assert.equal((await instances[0].post(body())).status,503);assert.equal(state.requests.length,0);assert.equal(db.sql("SELECT count(*) FROM public.app_settings WHERE key<>'synthetic-quota';"),'0');}
   finally{db.sql("DROP TRIGGER hm06_claim_failure ON public.app_settings;DROP FUNCTION public.hm06_claim_failure();");}
   assert.equal((await instances[0].post(body())).status,200);assert.equal(state.requests.length,1);
  });
  await t.test('complete historical scheduler acceptance can be deliberately repeated without erasing prior evidence',async()=>{
   reset('pitch_sent',true);
   db.sql(`INSERT INTO public.app_settings(key,value) SELECT 'cron:organizer-outreach:v1:recipient:'||encode(sha256(convert_to('organizer@example.invalid','UTF8')),'hex'),jsonb_build_object('status','accepted','lead_id','${ID}','provider_id','historical-provider-id')::text;`);
   const oldReceipt=db.sql("SELECT value FROM public.app_settings WHERE key LIKE 'cron:organizer-outreach:v1:recipient:%';");
   const input=body(),proposal=await instances[0].post(input),token=(await proposal.json()).repeatOf;
   assert.match(token,/^legacy:[a-f0-9]{64}$/);assert.equal(state.requests.length,0);
   assert.equal((await instances[0].post({...input,repeatOf:token})).status,200);assert.equal(state.requests.length,1);
   assert.equal(journal(input.intentId).predecessor,token);
   assert.equal(journal(input.intentId).legacy_claim,oldReceipt,'Exact prior claim evidence is archived before replacement');
   assert.equal(JSON.parse(journal(input.intentId).legacy_claim).provider_id,'historical-provider-id');
   assert.equal(db.sql("SELECT bool_and(key NOT LIKE '%@%' AND value NOT LIKE '%organizer@example.invalid%') FROM public.app_settings;"),'t');
  });
  await t.test('synthetic Resend fixture exercises stable keys, conflicting payloads and unchanged optional behavior',async()=>{
   reset();const h=instances[0],dispatch=h.load('src/lib/emailDispatch.ts').dispatchEmail;
   const key='hm-organizer-pitch/v1/'+randomUUID(),payload={from:'sender@example.invalid',to:'organizer@example.invalid',subject:'Synthetic',html:'<p>Synthetic</p>'};
   const a=await dispatch(payload,{idempotencyKey:key}),b=await dispatch(payload,{idempotencyKey:key});
   assert.equal(a.providerId,b.providerId);assert.equal(state.delivered.size,1);assert.equal(state.requests.length,2);
   const conflict=await dispatch({...payload,html:'Changed'},{idempotencyKey:key});assert.equal(conflict.status,'unknown');assert.equal(conflict.retrySafe,false);assert.equal(state.delivered.size,1);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
