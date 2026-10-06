/* eslint-disable @typescript-eslint/no-require-imports -- Offline actual-module test harness. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader, React, renderToStaticMarkup } = require('./organizer-workspace-harness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ADMIN=id(1), TARGET=id(2), EVENT=id(101), OTHER=id(102), PARTNER=id(201), LEAD=id(301);
const configRow = extra => ({id:PARTNER,slug:'fixture-partner',hackathon_id:EVENT,partner_name:'Fixture Partner',tagline:null,logo_url:null,banner_url:null,brand_color:null,accent_color:null,features:{},updated_at:'2026-01-01T00:00:00Z',...extra});
const event = (eventId=EVENT) => ({id:eventId,name:'Fixture Event '+eventId.slice(-3),type:'external',archived:false,start_date:null,end_date:null,mode:null,location:null,min_team_size:null,max_team_size:null});
function harness(options={}) {
  const caller = options.user===null ? null : {id:ADMIN,email:'admin@example.invalid',...options.user};
  const profile = options.profile===null ? null : {id:ADMIN,role:'admin',is_banned:false,...options.profile};
  const target = options.target===null ? null : {id:TARGET,email:'target@example.invalid',...options.target};
  const targetProfile = options.targetProfile===null ? null : {id:TARGET,full_name:'Existing Builder',role:'user',is_banned:false,...options.targetProfile};
  const state = {caller,queries:[],writes:[],clients:[],logs:[],accounts:[caller,target].filter(Boolean),
    tables:{profiles:[profile,targetProfile].filter(Boolean),hackathons:options.events||[event(),event(OTHER)],partner_configs:options.configs||[configRow()],event_organizers:options.organizers||[],organizer_leads:[{id:LEAD,title:'Fixture lead',unstop_url:'https://example.invalid/event',college_or_host:'Fixture College'}]}};
  if(options.matchLegacy) state.tables.hackathons[0].name='Fixture lead';
  const env={NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:1',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',...options.env};
  function client(kind,session=true) {
    return {
      auth:{async getUser(){return {data:{user:session?state.caller:null},error:options.authError||null};},admin:{async getUserById(userId){assert.equal(kind,'service');state.queries.push({account:userId});return {data:{user:state.accounts.find(u=>u.id===userId)||null},error:options.targetAuthError||null};}}},
      from(table) {
        assert(Object.hasOwn(state.tables,table),'Unexpected table '+table);
        if(table==='event_organizers') assert.equal(kind,'session','Assignments must retain JWT/RLS');
        const read={table,kind,filters:[],columns:null,operation:'read'};state.queries.push(read);
        let values,mode='many',sortKey,range;
        function response() {
          if(options.throwTable===table) throw Error('PRIVATE_DATABASE_EXCEPTION');
          const error = table==='profiles'&&kind==='session' ? options.lookupError : options.failTable===table || options.failTargetProfile&&table==='profiles'&&kind==='service' ? {code:'XX000',message:'PRIVATE_DATABASE_ERROR'} : null;
          if(error) return {data:null,error};
          if(options.failOperation===read.operation) return {data:null,error:{code:'XX000',message:'PRIVATE_WRITE_ERROR'}};
          if(options.beforeMutation&&read.operation!=='read') options.beforeMutation(read,state);
          let rows=state.tables[table].filter(row=>read.filters.every(([op,key,value])=> op==='in'?value.includes(row[key]):op==='or'? options.matchLegacy ? row.id===EVENT : false : op==='is'?row[key]==null: JSON.stringify(row[key])===JSON.stringify(key==='features'&&typeof value==='string'?JSON.parse(value):value)));
          if(read.operation==='insert') {
            const record={...values};
            if(table==='event_organizers') {
              assert.equal(record.created_by,state.caller.id);assert.equal(record.user_id,TARGET);
              if(state.tables[table].some(r=>r.user_id===record.user_id&&r.hackathon_id===record.hackathon_id)) return {data:null,error:{code:'23505'}};
            }
            if(table==='partner_configs'&&state.tables[table].some(r=>r.slug===record.slug)) return {data:null,error:{code:'23505'}};
            const inserted={id:id(500+state.writes.length),created_at:'2026-10-06T00:00:00Z',...record};state.tables[table].push(inserted);rows=[inserted];state.writes.push({table,kind,operation:'insert',values:record});
          } else if(read.operation==='update') {
            if(table==='partner_configs'&&state.tables[table].some(r=>r.slug===values.slug&&!rows.includes(r))) return {data:null,error:{code:'23505'}};
            rows.forEach(row=>Object.assign(row,values));if(rows.length)state.writes.push({table,kind,operation:'update',values});
          } else if(read.operation==='delete') {
            state.tables[table]=state.tables[table].filter(row=>!rows.includes(row));if(rows.length)state.writes.push({table,kind,operation:'delete',filters:read.filters});
          }
          if(sortKey) rows=[...rows].sort((a,b)=>String(a[sortKey]).localeCompare(String(b[sortKey])));
          if(range) rows=rows.slice(range[0],range[1]+1);
          if(read.columns&&read.columns!=='*') rows=rows.map(row=>Object.fromEntries(read.columns.split(',').map(k=>k.trim()).map(k=>[k,row[k]??null])));
          return {data:mode==='many'?rows:rows[0]||null,error:null};
        }
        const q={select(columns='*'){read.columns=columns;return q;},eq(key,value){read.filters.push(['eq',key,value]);return q;},is(key,value){read.filters.push(['is',key,value]);return q;},in(key,value){read.filters.push(['in',key,value]);return q;},or(value){read.filters.push(['or','',value]);return q;},order(key){sortKey=key;return q;},range(start,end){range=[start,end];return q;},
          insert(value){read.operation='insert';values=JSON.parse(JSON.stringify(value));return q;},update(value){read.operation='update';values=JSON.parse(JSON.stringify(value));return q;},delete(){read.operation='delete';return q;},
          async maybeSingle(){mode='single';return response();},async single(){mode='single';return response();},then(resolve,reject){return Promise.resolve().then(response).then(resolve,reject);}};
        return q;
      },
      async rpc(name,args){assert.equal(name,'can_access_partner_event');const p=state.tables.profiles.find(row=>row.id===state.caller?.id);return {data:Boolean(p?.is_banned===false&&(p.role==='admin'||state.tables.event_organizers.some(row=>row.user_id===state.caller?.id&&row.hackathon_id===args.p_hackathon_id))),error:null};}
    };
  }
  const load=moduleLoader({'@supabase/supabase-js':{createClient(url,key,config){assert.equal(url,env.NEXT_PUBLIC_SUPABASE_URL);assert(['fixture-anon','fixture-service'].includes(key));const kind=key==='fixture-service'?'service':'session';state.clients.push(kind);return client(kind,kind==='service'||config?.global?.headers?.Authorization==='Bearer fixture-session');}},'@supabase/ssr':{createServerClient(url,key,config){assert.equal(key,'fixture-anon');state.clients.push('session');return client('session',config.cookies.getAll().some(c=>c.name==='fixture-session'));}}}, {process:{env},logs:state.logs});
  async function call(route,method='GET',body,query='',cookie=false) {
    const request=new NextRequest(`https://example.invalid/api/admin/${route}${query?'?'+query:''}`,{method,headers:cookie?{Cookie:'fixture-session=valid'}:{Authorization:'Bearer fixture-session'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await load(`src/app/api/admin/${route}/route.ts`)[method](request);
    return {status:result.status,headers:result.headers,data:await result.json()};
  }
  return {state,load,call};
}
async function uiHarness(component,props={},fetcher) {
  const jsx=require('react/jsx-runtime'),slots=[],deps=[],effects=[],cleanup=[],controls=[],state={requests:[],logs:[],children:[]};let index=0,html;
  const hooks={...React,useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useEffect(fn,values){const i=index++;if(!deps[i]||values.some((v,j)=>v!==deps[i][j])){cleanup[i]?.();deps[i]=values;effects.push(()=>{cleanup[i]=fn();});}}};
  const runtime={...jsx};for(const method of ['jsx','jsxs'])runtime[method]=(type,props,key)=>{if(['button','form','select','input'].includes(type))controls.push({...props,type});return jsx[method](type,props,key);};
  // Child components have their own harnesses so hook slots cannot alias.
  const stub=props=>{state.children.push(props);return React.createElement('div',{},'CHILD_COMPONENT');};
  const load=moduleLoader({react:hooks,'react/jsx-runtime':runtime,
    './PartnerConfigEditor':{__esModule:true,default:stub},'./PartnerOrganizerAccess':{__esModule:true,default:stub}},
    {Error,SyntaxError,JSON,fetch:async(url,init)=>{state.requests.push({url,init});return fetcher(url,init);},logs:state.logs,
      FormData:class {constructor(form){this.values=form.values;}get(key){return this.values[key];}}});
  const Component=load(`src/app/admin/_components/${component}.tsx`).default;
  function render(){index=0;controls.length=0;state.children.length=0;html=renderToStaticMarkup(React.createElement(Component,props));}
  async function flush(){for(let i=0;i<6;i++){render();effects.splice(0).forEach(fn=>fn());await new Promise(r=>setImmediate(r));}render();}
  await flush();
  return {state,controls,get html(){return html;},props,flush,
    async click(label){const c=controls.find(c=>c.type==='button'&&c.children===label);assert(c,'Missing '+label);assert(!c.disabled);await c.onClick();await flush();},
    async choose(value){const c=controls.find(c=>c.type==='select');c.onChange({target:{value}});await flush();},
    async submit(values){let reset=false;const c=controls.find(c=>c.type==='form');await c.onSubmit({preventDefault(){},currentTarget:{values,reset(){reset=true;}}});await flush();return reset;}
  };
}
module.exports={harness,uiHarness,configRow,event,id,ADMIN,TARGET,EVENT,OTHER,PARTNER,LEAD,NextRequest,NextResponse};
