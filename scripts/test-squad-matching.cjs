/* eslint-disable @typescript-eslint/no-require-imports -- Offline tests exercise real client modules. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');
const TEAM = '10000000-0000-0000-0000-000000000001';
const BUILDER = '00000000-0000-0000-0000-000000000003';
const candidate = { id:BUILDER, fullName:'Fixture Backend Builder', avatarUrl:null, bio:'Lists API projects', skills:['FastAPI','Git'], isAvailable:true, matchedRole:'Backend', matchedSkills:['fastapi'], addedSkills:['fastapi'], reasons:['Lists skills relevant to your open Backend role','Lists needed skills missing from the current roster: fastapi'], limitedEvidence:false, fitKind:'role_match' };
const fixture = () => ({ context:{teamId:TEAM,teamName:'Fixture squad',status:'ready',canInvite:true,memberCount:2,capacity:8,teamCapacity:8,eventCapacity:null,rolesNeeded:['Backend'],requiredSkills:['fastapi'],coveredSkills:['react'],gapSkills:['fastapi']},candidates:[{...candidate}],scoreVersion:'squad-v1' });
const api = harness().load('src/lib/squadMatching.ts');
const discovery = harness().load('src/lib/matchingClient.ts');

test('person recommendations retain V3 server order on both surfaces', async () => {
  const data=[{id:'first',compatibility:80},{id:'second',compatibility:80}];const calls=[];
  const result=await discovery.loadTeammateRecommendations({rpc:async(name,args)=>{calls.push({name,args});return {data,error:null};}},'viewer');
  assert.equal(result.matchEngine,'v3');assert.equal(result.data,data);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'get_recommended_teammates_v3',args:{p_user_id:'viewer',p_limit:50}}]);
  const ranked=data.map((r,rank)=>({...r,rank})).reverse().sort(discovery.compareRecommendationRanks);
  assert.deepEqual(ranked.map(r=>r.id),['first','second']);
});
for(const code of ['PGRST202','42883']) test(`both discovery surfaces use the same V2 fallback for ${code}`,async()=>{
  const calls=[];const data=[{id:'server-first',compatibility:81}];
  const result=await discovery.loadTeammateRecommendations({rpc:async(name,args)=>{calls.push({name,args});return name.endsWith('_v3')?{error:{code}}:{data,error:null};}},'viewer');
  assert.equal(result.matchEngine,'v2');assert.equal(result.data,data);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'get_recommended_teammates_v3',args:{p_user_id:'viewer',p_limit:50}},{name:'get_recommended_teammates',args:{p_user_id:'viewer',p_limit:50}}]);
});
test('discovery authorization and transport failures do not trigger an alternate scorer',async()=>{
  for(const code of ['42501','503']) {
    let calls=0;const result=await discovery.loadTeammateRecommendations({rpc:async()=>{calls++;return {error:{code},data:null};}},'viewer');
    assert.equal(calls,1);assert.equal(result.error.code,code);
  }
});
test('rank ordering keeps scored recommendations before unscored discovery without inventing a score',()=>{
  assert(discovery.compareRecommendationRanks({compatibility:40,rank:3},undefined)<0);
  assert(discovery.compareRecommendationRanks(undefined,{compatibility:40,rank:3})>0);
  assert.equal(discovery.compareRecommendationRanks(undefined,undefined),0);
});

test('squad client uses one team-scoped server ranking with no profile scan or local rescore', async () => {
  const calls=[];
  const result=await api.loadSquadRecommendations({rpc:async(name,args)=>{calls.push({name,args});return {data:fixture(),error:null};}},TEAM);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'get_team_builder_recommendations',args:{p_team_id:TEAM,p_limit:8}}]);
  assert.equal(result.candidates[0].id,BUILDER); assert.equal(result.context.capacity,8);
});
test('explicit projection drops private extras and preserves sparse evidence as unknown', () => {
  const raw=fixture(); raw.context.memberIds=['PRIVATE_MEMBER']; raw.candidates[0]={...candidate,email:'PRIVATE_EMAIL',gender:'PRIVATE_GENDER',phone:'PRIVATE_PHONE',skills:[],isAvailable:null,limitedEvidence:true,fitKind:'explore'};
  const result=api.parseSquadRecommendations(raw,TEAM);
  assert(!JSON.stringify(result).includes('PRIVATE_')); assert.equal(result.candidates[0].isAvailable,null);
  assert.equal(api.squadFitLabel(result.candidates[0]),'Explore profile');
});
test('invalid identity, unsupported output and inconsistent capacity fail closed', () => {
  for(const change of [r=>r.context.teamId='other',r=>r.scoreVersion='unknown',r=>r.context.status='unknown',r=>r.context.memberCount=8,r=>r.context.capacity=0]) {
    const raw=fixture();change(raw);assert.throws(()=>api.parseSquadRecommendations(raw,TEAM),/Invalid squad/);
  }
});
for(const status of ['full','closed','needs_capacity','profile_incomplete']) test(`${status} does not expose stale actionable candidates`,()=>{
  const raw=fixture();raw.context.status=status;raw.context.canInvite=false;
  assert.equal(api.parseSquadRecommendations(raw,TEAM).candidates.length,0);
  assert(api.squadStatusCopy[status].body);
});
for(const [code,message] of [['PGRST202','not available yet'],['42883','not available yet'],['42501','Only eligible'],['XX000','Try again']]) test(`RPC ${code} fails safely without unsafe fallback or provider details`,async()=>{
  const calls=[];await assert.rejects(api.loadSquadRecommendations({rpc:async name=>{calls.push(name);return {error:{code,message:'PRIVATE_SQL_DETAIL'}};}},TEAM),new RegExp(message));
  assert.equal(calls.length,1);
});
test('invite client calls the guarded existing workflow adapter and handles rejection truthfully',async()=>{
  const calls=[];await api.sendSquadInvite({rpc:async(name,args)=>{calls.push({name,args});return {error:null};}},TEAM,BUILDER);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'send_squad_invite',args:{p_team_id:TEAM,p_invited_user_id:BUILDER}}]);
  await assert.rejects(api.sendSquadInvite({rpc:async()=>({error:{message:'PRIVATE_DETAIL'}})},TEAM,BUILDER),/Refresh suggestions/);
});

// Lightweight hook runner exercises the real client component, including asynchronous actions.
function ui(initial=fixture(),options={}) {
  let cursor=0;const values=[initial,false,null,null,new Set(),null];const refs=[];let refCursor=0;
  const client=options.client||{rpc:async()=>({data:fixture(),error:null})};
  const hooks={...React,useState(start){const index=cursor++;if(!(index in values))values[index]=start;return [values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},useRef(start){const index=refCursor++;return refs[index]||(refs[index]={current:start});},useEffect(){},useCallback(fn){return fn;}};
  const element=(tag)=>(props)=>React.createElement(tag,{className:props.className,role:props.role,disabled:props.disabled,'aria-label':props['aria-label'],onClick:props.onClick},props.children);
  const system={Avatar:()=>React.createElement('span',null,'Avatar'),Button:element('button'),ButtonLink:element('a'),Chip:element('span'),Panel:element('aside'),Tape:element('span'),SeatMeter:({filled,total})=>React.createElement('span',null,`${filled}/${total}`),Skeleton:element('span'),EmptyState:({title,body})=>React.createElement('section',null,React.createElement('h3',null,title),React.createElement('p',null,body)),ErrorNotice:({title,detail})=>React.createElement('section',null,title,detail)};
  const overrides={react:hooks,'@/lib/supabase':{supabase:client},'@/components/system':system,'next/link':({href,children,...props})=>React.createElement('a',{href,...props},children)};
  const Component=harness(overrides).load('src/components/SmartGapFiller.tsx').default;
  let tree;
  const render=()=>{cursor=0;refCursor=0;tree=Component({teamId:TEAM,teamName:'Fixture squad',members:[],maxMembers:8,isRecruiting:true,isOwnerOrMember:options.member!==false});return renderToStaticMarkup(tree);};
  function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
  return {render,values,button:label=>find(tree,node=>node.props?.['aria-label']===label),refresh:()=>find(tree,node=>node.props?.children==='Refresh')};
}
test('real UI explains role gaps and actual capacity without match probabilities or verified claims',()=>{
  const html=ui().render();assert.match(html,/6 open seats/);assert.match(html,/2\/8/);assert.match(html,/Backend role/);assert.match(html,/self-reported/);assert.match(html,/Invite to squad/);
  assert(!/\d+%|verified expertise|Same College|diversity/.test(html));
});
test('member-only view and sparse-profile cards remain useful without invitation permissions',()=>{
  const raw=fixture();raw.context.canInvite=false;raw.candidates[0]={...candidate,fullName:null,skills:[],isAvailable:null,limitedEvidence:true,fitKind:'explore'};
  const html=ui(raw).render();assert.match(html,/Availability not specified/);assert.match(html,/Limited skill evidence/);assert.match(html,/Only the team owner/);assert(!html.includes('Invite to squad'));
  assert.match(ui(raw,{member:false}).render(),/Squad suggestions are for team members/);
});
test('successful invite prevents duplicate clicks and shows confirmed success only after RPC completion',async()=>{
  let calls=0,resolve;const client={rpc:()=>{calls++;return new Promise(r=>{resolve=r;});}};
  const view=ui(fixture(),{client});view.render();const button=view.button('Invite Fixture Backend Builder');
  button.props.onClick();button.props.onClick();assert.equal(calls,1);assert(!view.render().includes('Invite sent.'));
  resolve({error:null});await new Promise(r=>setImmediate(r));
  const html=view.render();assert.match(html,/Invite sent\./);assert.match(html,/Invited/);
});
test('rejected invitation clears stale actionable cards and offers refresh',async()=>{
  const view=ui(fixture(),{client:{rpc:async()=>({error:{code:'42501'}})}});view.render();view.button('Invite Fixture Backend Builder').props.onClick();await new Promise(r=>setImmediate(r));
  const html=view.render();assert.match(html,/Refresh suggestions/);assert(!html.includes('Invite to squad'));assert.equal(view.values[0],null);
});
test('a slower superseded response cannot replace the refreshed ranking',async()=>{
  const pending=[];const view=ui(fixture(),{client:{rpc:()=>new Promise(resolve=>pending.push(resolve))}});view.render();const action=view.refresh().props.onClick;
  action();action();const newest=fixture();newest.context.teamName='Latest roster';pending[1]({data:newest,error:null});await new Promise(r=>setImmediate(r));
  pending[0]({data:fixture(),error:null});await new Promise(r=>setImmediate(r));assert.equal(view.values[0].context.teamName,'Latest roster');
});
