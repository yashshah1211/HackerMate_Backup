// Synthetic browser transport only: no credentials, hosted services or writes.
import {useSyncExternalStore} from 'react';
import {record as algorush} from './mission20-unverified/algorush.json';
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
const params=new URLSearchParams(location.search),member=params.get('role')==='member';
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
