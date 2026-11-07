/* eslint-disable @typescript-eslint/no-require-imports -- Real auth/route/shared provider boundary, synthetic adapters only. */
const assert=require('node:assert/strict'),{test}=require('node:test'),{randomUUID}=require('node:crypto');
const {NextRequest,NextResponse}=require('next/server');
const {harness}=require('./ppt-vision-harness.cjs');
const {organizerClaimFixture}=require('./organizer-pitch-claim-fixture.cjs');
const ID='00000000-0000-4000-8000-000000000671';
const valid=()=>({intentId:randomUUID(),leadId:ID,recipientEmail:'organizer@example.invalid',subject:'Synthetic',contentHtml:'<p>Synthetic</p>'});
function setup(options={}){
 const state={reads:0,rpcs:[],providerCalls:[],budgetCalls:0,logs:[],writes:[]};
 const lead={id:ID,status:options.status??'new',pitch_sent_at:null,last_sent_to:null};
 const user=options.signedOut?null:{id:ID,email:options.ordinary?'visitor@example.invalid':'owner@example.invalid'};
 const normalRpc=organizerClaimFixture({readLead:()=>lead,writeLead:async(row,payload)=>{state.writes.push(payload);Object.assign(row,payload);return true;}});
 const database={auth:{getUser:async()=>({data:{user},error:options.authError?Error('PRIVATE_DETAIL'):null})},
  from(table){assert.equal(table,'organizer_leads');const q={select(){return q;},eq(){return q;},async maybeSingle(){state.reads++;return{data:options.missing?null:lead,error:options.readError?{code:'42501',message:'PRIVATE_DETAIL'}:null};}};return q;},
  async rpc(name,args){
   state.rpcs.push({name,args});
   if(options.rpcError)return{error:{code:'42501',message:'PRIVATE_DETAIL'},data:null};
   if(options.rpcThrows)throw Error('PRIVATE_DETAIL');
   if(name==='claim_organizer_pitch'&&options.claimReceipt)return{error:null,data:options.claimReceipt(args)};
   if(name==='record_organizer_pitch'&&args.p_event==='dispatching'&&options.startReceipt)return{error:null,data:options.startReceipt(args)};
   return normalRpc(name,args);
  }};
 const h=harness({'next/server':{NextRequest,NextResponse},
  '@supabase/ssr':{createServerClient:()=>database},'@supabase/supabase-js':{createClient:()=>database},
  '@/lib/admin/emailBudgetGuard':{checkEmailBudget:async()=>{state.budgetCalls++;if(options.budgetError)throw Error('PRIVATE_DETAIL');return{allowedCount:options.budgetEmpty?0:1};},recordEmailSendSuccess:async()=>({status:'recorded'})},
 },{console:{error:(...args)=>state.logs.push(args),warn(){},log(){}},fetch:async(url,init)=>{
  assert.equal(url,'https://api.resend.com/emails');state.providerCalls.push({headers:init.headers,body:JSON.parse(init.body)});
  return Response.json({id:'synthetic-provider-receipt'});
 }});
 Object.assign(h.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:1',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',OUTREACH_ADMIN_EMAIL:'owner@example.invalid',
  RESEND_API_KEY:'synthetic-unit-key',RESEND_FROM_EMAIL:'sender@example.invalid',EMAIL_OPEN_TRACKING_SECRET:'ab'.repeat(32)});
 const post=(body=valid(),raw,query='')=>h.load('src/app/api/admin/send-organizer-pitch/route.ts').POST(new NextRequest('http://localhost/api/admin/send-organizer-pitch'+query,{method:'POST',body:raw??JSON.stringify(body)}));
 return{...h,state,post};
}
for(const option of ['signedOut','ordinary','authError'])test(option+' cannot read eligibility, claim or send',async()=>{
 const h=setup({[option]:true});assert.equal((await h.post()).status,403);assert.equal(h.state.reads,0);assert.equal(h.state.rpcs.length,0);assert.equal(h.state.providerCalls.length,0);
});
const malformed=[null,[],{},true,'all',...[
 ['leadId',null],['leadId',[ID]],['leadId','all'],['intentId',null],['intentId',{}],['recipientEmail',[]],['recipientEmail',42],
 ['recipientEmail','a@example.invalid,b@example.invalid'],['recipientEmail','a@example.invalid\r\nBcc:x'],['subject',[]],['subject',null],['subject',' '],['subject','a'.repeat(201)],['subject','a\nb'],
 ['contentHtml',{}],['contentHtml',false],['contentHtml',' '],['contentHtml','a'.repeat(100001)],['contentHtml','\0'],['repeatOf',[]],['repeatOf','all'],
].map(([k,v])=>({...valid(),[k]:v})),{...valid(),all:true}];
malformed.forEach((body,index)=>test('malformed/bulk input '+index+' rejected before claim',async()=>{
 const h=setup();assert.equal((await h.post(body)).status,400);assert.equal(h.state.rpcs.length,0);assert.equal(h.state.providerCalls.length,0);
}));
test('invalid JSON and extra query filters fail without claim',async()=>{
 const h=setup();assert.equal((await h.post(undefined,'{')).status,400);assert.equal((await h.post(valid(),undefined,'?all=true')).status,400);assert.equal(h.state.rpcs.length,0);
});
for(const status of ['removed','archived','email_outcome_unknown','restored_review','declined','future_state'])
 test(status+' remains blocked before quota or claim access',async()=>{
  const h=setup({status});assert.equal((await h.post()).status,409);assert.equal(h.state.budgetCalls,0);assert.equal(h.state.rpcs.length,0);assert.equal(h.state.providerCalls.length,0);
 });
for(const option of ['readError','missing','budgetError','budgetEmpty','rpcError','rpcThrows'])
 test(option+' fails safely without provider or sensitive error details',async()=>{
  const h=setup({[option]:true}),r=await h.post(),body=await r.json();assert(r.status>=400);
  assert.equal(h.state.providerCalls.length,0);assert(!JSON.stringify(body).includes('PRIVATE_DETAIL'));assert(!JSON.stringify(h.state.logs).includes('PRIVATE_DETAIL'));assert.equal(body.retrySafe,false);
 });
for(const [name,receipt]of [
 ['null',()=>null],['scalar',()=>true],['empty',()=>({})],
 ['wrong id',()=>({outcome:'claimed',intent_id:randomUUID(),fingerprint:'a'.repeat(64)})],
 ['wrong fingerprint',args=>({outcome:'claimed',intent_id:args.p_intent_id,fingerprint:'b'.repeat(64)})],
 ['unknown state',args=>({outcome:'duplicate',intent_id:args.p_intent_id,state:'made_up'})],
 ['invalid repeat',args=>({outcome:'approval_required',intent_id:args.p_intent_id,repeat_of:'all'})],
])test('malformed claim receipt '+name+' never reaches provider',async()=>{
 const h=setup({claimReceipt:receipt}),r=await h.post();assert.equal(r.status,503);assert.equal(h.state.providerCalls.length,0);
});
for(const receipt of [()=>null,args=>({intent_id:args.p_intent_id,state:'dispatching',crm:'recorded',accounting:'pending'}),()=>({})])
 test('unconfirmed dispatching transition blocks provider contact',async()=>{
  const h=setup({startReceipt:receipt});assert.equal((await h.post()).status,503);assert.equal(h.state.providerCalls.length,0);
 });
test('one valid normalized send uses durable claim before stable, non-sensitive provider key',async()=>{
 const h=setup(),input=valid();input.recipientEmail='  ORGANIZER@EXAMPLE.INVALID  ';
 const r=await h.post(input),body=await r.json();assert.equal(r.status,200);assert.equal(body.success,true);assert.equal(body.intentId,input.intentId);assert.equal(body.dispatch.status,'accepted');assert.equal(body.retrySafe,false);
 assert.equal(h.state.providerCalls.length,1);assert.equal(h.state.providerCalls[0].body.to,'organizer@example.invalid');
 const key=h.state.providerCalls[0].headers['Idempotency-Key'];assert.equal(key,'hm-organizer-pitch/v1/'+input.intentId);assert(!key.includes('@'));
 assert.deepEqual(h.state.rpcs.map(x=>x.name),['claim_organizer_pitch','record_organizer_pitch','record_organizer_pitch','record_organizer_pitch']);
 assert.equal((await h.post(input)).status,409);assert.equal(h.state.providerCalls.length,1);
});
test('optional provider extension rejects malformed header values before fetch',async()=>{
 const h=setup(),dispatch=h.load('src/lib/emailDispatch.ts').dispatchEmail;
 const payload={from:'sender@example.invalid',to:'test@example.invalid',subject:'Synthetic',html:'Synthetic'};
 for(const key of ['', 'a\r\nb','a'.repeat(257)])assert.equal((await dispatch(payload,{idempotencyKey:key})).status,'not_dispatched');
 assert.equal(h.state.providerCalls.length,0);assert.equal((await dispatch(payload)).status,'accepted');
 assert.equal(h.state.providerCalls.length,1);assert(!('Idempotency-Key' in h.state.providerCalls[0].headers),'Unrelated senders remain opt-in');
});
