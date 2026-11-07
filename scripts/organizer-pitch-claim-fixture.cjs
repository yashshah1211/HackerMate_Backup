/* eslint-disable @typescript-eslint/no-require-imports -- Unit-only durable claim adapter; real SQL/concurrency is covered separately. */
const {createHash}=require('node:crypto');
function organizerClaimFixture({settings=new Map(),readLead,writeLead,claimError=()=>false,outcomeError=()=>false}){
 const prefix='organizer:pitch:v1:',recipientPrefix='cron:organizer-outreach:v1:recipient:';
 const get=key=>{const raw=settings.get(key);return raw?JSON.parse(raw):null;};
 function answer(data){return{data,error:null};}
 function unavailable(){return{data:null,error:{code:'42501',message:'Synthetic claim fixture failure'}};}
 return async function rpc(name,args){
  const id=args.p_intent_id,key=prefix+'intent:'+id;
  if(name==='claim_organizer_pitch'){
   if(claimError())return unavailable();
   const existing=get(key),recipientHash=createHash('sha256').update(args.p_recipient).digest('hex');
   if(existing)return answer({outcome:existing.fingerprint===args.p_fingerprint?'duplicate':'conflict',intent_id:id,state:existing.state});
   const lead=readLead(args.p_lead_id);if(!lead)return answer({outcome:'blocked',intent_id:id});
   const leadKey=prefix+'lead:'+lead.id,recipientKey=recipientPrefix+recipientHash;
   if(settings.has(leadKey)||settings.has(recipientKey))return answer({outcome:'duplicate',intent_id:id,state:'unknown'});
   const journal={intent_id:id,lead_id:lead.id,fingerprint:args.p_fingerprint,state:'claimed',crm:'pending',accounting:'pending',recipientKey};
   settings.set(key,JSON.stringify(journal));settings.set(leadKey,id);
   settings.set(recipientKey,JSON.stringify({intent_id:id,lead_id:lead.id,status:'claimed'}));
   return answer({outcome:'claimed',intent_id:id,fingerprint:args.p_fingerprint});
  }
  if(name!=='record_organizer_pitch')throw Error('Unexpected claim fixture RPC '+name);
  const j=get(key);if(!j)return unavailable();
  const event=args.p_event;
  if(event==='dispatching'){
   if(j.state!=='claimed')return unavailable();j.state='dispatching';
  }else if(event.startsWith('accounting_')){
   if(!['accepted','sandbox_accepted'].includes(j.state)||j.accounting!=='pending')return unavailable();
   j.accounting=event==='accounting_recorded'?'recorded':'failed';
  }else{
   if(j.state!=='dispatching'||outcomeError())return unavailable();
   const lead=readLead(j.lead_id);
   let crm='not_required';
   if(['accepted','unknown'].includes(event)){
    const payload=event==='accepted'?{status:['opened','replied','negotiating','partner_live'].includes(lead.status)?lead.status:'pitch_sent',
     pitch_sent_at:lead.pitch_sent_at||new Date().toISOString(),last_sent_to:lead.last_sent_to?.trim()?lead.last_sent_to:args.p_recipient,updated_at:new Date().toISOString()}
     :{status:'email_outcome_unknown',updated_at:new Date().toISOString()};
    const changed=await writeLead(lead,payload);
    if(changed===false)return unavailable();
    crm=changed==='zero'?'failed':'recorded';
   }
   Object.assign(j,{state:event,provider_id:args.p_provider_id,crm,accounting:['accepted','sandbox_accepted'].includes(event)?'pending':'not_required'});
   settings.set(j.recipientKey,JSON.stringify({intent_id:id,lead_id:j.lead_id,status:event,provider_id:args.p_provider_id}));
  }
  settings.set(key,JSON.stringify(j));
  return answer({intent_id:id,state:j.state,crm:j.crm,accounting:j.accounting});
 };
}
module.exports={organizerClaimFixture};
