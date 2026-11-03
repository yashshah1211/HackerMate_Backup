// Synthetic browser transport only: no credentials, hosted services or writes.
import {useSyncExternalStore} from 'react';
import {record as algorush} from './mission20-unverified/algorush.json';
import providerFacts from './aggregator/provider-facts.cjs';
import {identifySource,parseUnstop} from '@/lib/hackathons/providers';
export default function Link({href,children,...props}) { return <a href={href} {...props}>{children}</a>; }
const replace=history.replaceState.bind(history);
history.replaceState=(...args)=>{replace(...args);window.dispatchEvent(new Event('popstate'));};
const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
export function useSearchParams(){return new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));}
export const useParams=()=>({id:location.pathname.split('/').at(-1)});
export const useRouter=()=>({push:href=>location.assign(href),replace:href=>location.replace(href)});
export const useNotification=()=>({showToast(message){window.fixtureToasts.push(message);},confirm(){throw Error('No destructive action allowed');}});
window.fixtureReads=[];window.fixtureWrites=[];window.fixtureToasts=[];window.fixtureRpcs=[];
const userId='00000000-0000-4000-8000-000000000099';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const event=(n,name,fields={})=>({id:id(n),name,description:'Synthetic event details. Official registration and community membership are separate.',
 status:'approved',archived:false,type:'external',tags:['React'],start_date:'2026-11-05',end_date:'2026-11-07',
 registration_start:'2026-10-01',registration_end:'2026-11-03',registration_status:null,
 created_at:'2026-10-01T00:00:00Z',location:'Mumbai',mode:'hybrid',prize_pool:'INR 10000',currency:'INR',
 website_url:'https://example.invalid/official',min_team_size:1,max_team_size:4,max_participants:null,organizer_id:null,rounds_info:[],...fields});
const rows=[event(2,'Imported registration window'),event(3,'Closed applications future event',{registration_end:'2026-11-01'}),
 event(4,'Unverified availability event',{registration_start:null,registration_end:null}),
 event(5,'Ongoing event closed applications',{start_date:'2026-11-01',registration_end:'2026-10-31'}),
 event(6,'Ended event',{start_date:'2026-10-01',end_date:'2026-10-02',registration_end:'2026-09-30'}),
 event(7,'Registration opens later',{registration_start:'2026-11-04',registration_end:'2026-11-05'}),
 event(8,'India final day deadline',{registration_end:'2026-11-02'}),
 event(9,'Official import 1',{type:'official',website_url:'https://unstop.com/synthetic-1',start_date:'2026-11-01',registration_start:null,registration_end:null}),
 ...Array.from({length:7},(_,i)=>event(20+i,'Official import '+(i+2),{type:'official',website_url:'https://unstop.com/synthetic-'+(i+2)})),
 event(30,'Build with AI: Bootcamps',{description:'Synthetic educational workshop replay; provider category supplied by independent review.'}),
 {...event(10,'AlgoRush replay'),...algorush}];
// Fresh source evidence, synthetic provider facts; no production records are modified.
const source=(row,category='hackathon')=>({version:1,provider:'unstop',provider_id:String(row.id),canonical_url:row.website_url,
 checked_at:'2026-11-02T06:29:00Z',expires_at:'2026-11-03T08:29:00Z',check_status:'ok',category,event_status:row.name==='Ended event'?'ended':'unknown',
 source_hash:'a'.repeat(64),parser_version:'browser-fixture',evidence:{event_date_basis:'explicit_hackathon_build_stage_v2'},issues:[],facts:{...row,registration_status:row.registration_end==='2026-11-01'||row.registration_end==='2026-10-31'?'closed':'open',rounds_info:[]}});
for(const n of [2,3,5,6,8]){const row=rows.find(r=>r.id===id(n));row.source_metadata=source(row);}
const boot=rows.find(r=>r.id===id(30));boot.source_metadata=source(boot,'other');
const algo=rows.find(r=>r.id===algorush.id);algo.source_metadata=source({...algo,start_date:'2026-08-15T00:00:00+05:30',end_date:'2026-08-30T07:05:00+05:30',registration_end:'2026-08-15T22:51:56+05:30',max_team_size:1});algo.source_metadata.provider_id='1737089';algo.source_metadata.category='unknown';algo.source_metadata.facts.registration_start='2026-08-15T00:00:00+05:30';algo.source_metadata.event_status='unknown';algo.source_metadata.evidence={event_date_basis:'unverified'};algo.source_metadata.facts.registration_status='closed';
const params=new URLSearchParams(location.search),member=params.get('role')==='member';
// Actual parser outputs, rather than hand-minted provenance, exercise adjacent-stage rejection.
for(const [index,[title,display_text]]of [['Grand Finale','Final judging of the hackathon.'],['Presentations','The actual hackathon presentations take place in this stage.'],['Orientation','The actual hackathon participants attend a compulsory orientation session.']].entries())for(const past of [false,true]){
 const n=31+index*2+Number(past),raw=JSON.parse(JSON.stringify(providerFacts.unstop)),c=raw.data.competition;
 c.title='Adjacent stage '+n;c.regnRequirements.reg_status='CLOSED';c.rounds=[providerFacts.buildStage('2026-11-01',past?'2026-11-01':'2026-11-03')];Object.assign(c.rounds[0].details[0],{title,display_text});
 const m=parseUnstop(identifySource('https://unstop.com/hackathons/synthetic-1234'),raw,Date.parse('2026-11-02T12:00:00+05:30'),'a'.repeat(64));
 rows.push({...event(n,c.title),...m.facts,source_metadata:m});
}
rows.sort((a,b)=>a.id.localeCompare(b.id)); // Match the public reader's ORDER BY id contract.
const visible=params.get('case')==='boundary'?rows.filter(r=>r.id===id(8)).map(r=>({...r,type:'native'})):params.get('case')==='native'?rows.filter(r=>r.id===id(2)).map(r=>({...r,type:'native',name:'Native open event'})):rows;
const user=member?{id:userId,email:'synthetic@example.invalid'}:null;
export const supabase={auth:{getSession:async()=>({data:{session:user?{user}:null},error:null}),getUser:async()=>({data:{user},error:null}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 async rpc(name){window.fixtureRpcs.push(name);
  if(name==='get_hackathon_registration_counts')return {data:[{registration_count:0,confirmed_count:0,waitlisted_count:0}],error:null};
  if(name==='list_event_discovery_builders')return {data:{items:[],total:0,offset:0,limit:50},error:null};
  throw Error('Unexpected/future RPC: '+name);
 },from(table){
  let columns='',single=false,cursor=null,limit=Infinity;const filters=[];
  const mutation=()=>{window.fixtureWrites.push(table);throw Error('Unexpected mutation: '+table);};
  const result=()=>{
   window.fixtureReads.push({table,columns,filters});
   if(table==='hackathons'){
    const selected=visible.filter(row=>filters.every(([k,v])=>row[k]===v)&&(cursor===null||row.id>cursor)).slice(0,limit);
    return {data:single?selected[0]||null:selected,error:null};
   }
   if(!member)throw Error('Guest private read: '+table);
   if(table==='profiles')return {data:{id:userId,is_banned:false,onboarding_completed:true,skills:['React']},error:null};
   if(table==='saved_hackathons')return {data:[{hackathon_id:id(3)},{hackathon_id:id(6)},{hackathon_id:algorush.id},{hackathon_id:id(9)},{hackathon_id:id(30)}],error:null};
   if(!['hackathon_registrations','teams','team_hackathons','partner_configs','hackathon_resources','hackathon_stages'].includes(table))throw Error('Unexpected table: '+table);
   return {data:single?null:[],error:null};
  };
  return {select(value){columns=value;return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},
   gt(k,v){if(k!=='id')throw Error('Unexpected cursor');cursor=v;return this;},limit(n){limit=n;return this;},abortSignal(){return this;},in(){return this;},
   maybeSingle(){single=true;return this;},single(){single=true;return this;},then(resolve,reject){return Promise.resolve().then(result).then(resolve,reject);},
   insert:mutation,update:mutation,delete:mutation};
 }};
