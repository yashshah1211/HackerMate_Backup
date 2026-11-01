import React, {useSyncExternalStore} from 'react';
export default function Link({href,children,...props}) { return <a href={href} {...props}>{children}</a>; }
const original=history.replaceState.bind(history);history.replaceState=(...args)=>{original(...args);window.dispatchEvent(new Event('popstate'));};
const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
export function useSearchParams(){const query=useSyncExternalStore(subscribe,()=>location.search);return new URLSearchParams(query);}
const ID='00000000-0000-4000-8000-000000000002',USER='00000000-0000-4000-8000-000000000001';
export const useParams=()=>({id:ID});export const useRouter=()=>({push:href=>location.assign(href),replace:href=>location.replace(href)});
export const useNotification=()=>({showToast(message){window.fixtureToasts.push(message);},confirm(){throw new Error('Unexpected confirmation');}});
window.fixtureReads=[];window.fixtureWrites=[];window.fixtureToasts=[];
const scenario=new URLSearchParams(location.search).get('case')||'open';
const member=new URLSearchParams(location.search).get('role')==='member';
const closed=scenario.includes('closed'),unknown=scenario.includes('unknown');
const row={id:ID,name:'Mission20 fixture',description:'<h2>Eligibility</h2><p>18 years or older.</p><p>2026 students welcome.</p><ul><li>First rule</li></ul><p>Explanation after first rule.</p><ol start="3"><li>Third requirement</li></ol><p>Read <a href="https://example.invalid/rules">official rules</a>.</p><script>window.fixtureXss=true</script>',status:'approved',archived:false,type:scenario.startsWith('native')?'native':'external',tags:['React'],start_date:'2026-10-30',end_date:'2026-11-02',registration_start:unknown?null:'2026-10-01',registration_end:unknown?null:closed?'2026-10-29':'2026-10-31',registration_status:null,location:'Mumbai',mode:'hybrid',prize_pool:'INR 10000',currency:'INR',website_url:'https://example.invalid/event',min_team_size:1,max_team_size:4,max_participants:null,organizer_id:null};
const user=member?{id:USER,email:'fixture@example.invalid'}:null;
export const supabase={auth:{getSession:async()=>({data:{session:member?{user,access_token:'fixture-token'}:null},error:null}),getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async name=>({data:name==='get_hackathon_registration_counts'?[{registration_count:0,confirmed_count:0,waitlisted_count:0}]:{items:[],total:0,offset:0,limit:50},error:null}),from(table){
 let filters=[],columns='',cursor=null,batchSize=Infinity,single=false,payload;
 const result=()=>{window.fixtureReads.push({table,columns,filters});if(payload)window.fixtureWrites.push({table,payload});
  if(table==='hackathons')return {data:single?row:[row].filter(e=>cursor===null||e.id>cursor).slice(0,batchSize),error:null};
  if(!member)throw new Error('Guest private query: '+table);
  if(table==='profiles')return {data:{id:USER,is_banned:false,onboarding_completed:true,skills:['React']},error:null};
  if(table==='hackathon_registrations')return {data:null,error:null};
  return {data:single?null:[],error:null};};
 return {select(value){columns=value;return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},gt(key,value){cursor=value;return this;},limit(value){batchSize=value;return this;},abortSignal(){return this;},in(){return this;},maybeSingle(){single=true;return this;},single(){single=true;return this;},then(resolve,reject){return Promise.resolve().then(result).then(resolve,reject);},insert(value){payload=value;return this;},update(value){payload=value;return this;},delete(){throw new Error('Unexpected deletion');}};
}};
