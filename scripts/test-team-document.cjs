/* eslint-disable @typescript-eslint/no-require-imports -- Existing offline TS harness. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');
const { TeamDocumentEditor, documentGateway, parseDocument, DOCUMENT_COLUMNS } = harness().load('src/lib/teamDocument.ts');
const TEAM = '10000000-0000-0000-0000-000000000001';
const row = (revision = 1, content = 'Original', extra = {}) => ({ id: 'document', team_id: TEAM, revision, content,
  updated_at: '2026-10-12T00:00:00Z', updated_by: 'member', ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
async function editor(gateway = {}) {
  const view = new TeamDocumentEditor({ load: async () => row(), save: async (expected, content) => ({status:'saved',document:row(expected.revision+1,content)}), ...gateway }, TEAM);
  await view.load(); return view;
}

test('two editors: A commits and B keeps both texts when stale save conflicts', async () => {
  let server = row();
  const gateway = { load: async () => server, save: async (expected, content) => {
    if (expected.revision !== server.revision) return {status:'conflict',document:server};
    server = row(server.revision+1,content); return {status:'saved',document:server};
  }};
  const a = await editor(gateway), b = await editor(gateway);
  a.edit('A text'); b.edit('B text'); await a.save(); await b.save();
  assert.equal(server.content,'A text'); assert.equal(b.getSnapshot().draft,'B text');
  assert.equal(b.getSnapshot().conflict.content,'A text'); assert.equal(b.getSnapshot().base.revision,1);
  await b.save(b.getSnapshot().conflict);
  assert.equal(server.content,'B text'); assert.equal(server.revision,3); assert.equal(b.getSnapshot().conflict,null);
});

test('C commits while B reviews: override checks reviewed revision and conflicts again', async () => {
  const calls=[]; const b=await editor({save:async(expected)=>{calls.push(expected.revision);return {status:'conflict',document:row(3,'C text')};}});
  b.edit('B text');b.receive(row(2,'A text'));await b.save(b.getSnapshot().conflict);
  assert.deepEqual(calls,[2]);assert.equal(b.getSnapshot().draft,'B text');assert.equal(b.getSnapshot().conflict.content,'C text');
});

test('a stale rendered Keep mine / Load theirs handler cannot act on a newer review',async()=>{
  let calls=0;const b=await editor({save:async()=>{calls++;}});b.edit('B');b.receive(row(2,'A'));
  const reviewed=b.getSnapshot().conflict;b.receive(row(3,'C'));await b.save(reviewed);b.loadTheirs(reviewed);
  assert.equal(calls,0);assert.equal(b.getSnapshot().draft,'B');assert.equal(b.getSnapshot().conflict.revision,3);
});

test('delayed and out-of-order realtime, including same-user saves, never rewind revisions',async()=>{
  const b=await editor();b.receive(row(3,'Same user in another tab'));b.receive(row(2,'Old'));b.receive(row(1,'Original'));
  assert.equal(b.getSnapshot().draft,'Same user in another tab');assert.equal(b.getSnapshot().base.revision,3);
  b.edit('Local');b.receive(row(5,'Latest'));b.receive(row(4,'Late'));assert.equal(b.getSnapshot().conflict.revision,5);assert.equal(b.getSnapshot().draft,'Local');
});

test('repeated Save is synchronous single-flight; typing after click remains dirty',async()=>{
  const pending=deferred();let calls=0;const b=await editor({save:()=>{calls++;return pending.promise;}});
  b.edit('Submitted');const one=b.save();const two=b.save();b.edit('Typed later');
  assert.equal(calls,1);assert.equal(b.getSnapshot().saving,true);assert.equal(b.getSnapshot().notice,null);
  pending.resolve({status:'saved',document:row(2,'Submitted')});await Promise.all([one,two]);
  assert.equal(b.getSnapshot().base.content,'Submitted');assert.equal(b.getSnapshot().draft,'Typed later');assert.match(b.getSnapshot().notice,/unsaved/);
});

test('own realtime echo before response is reconciled, newer remote response is retained',async()=>{
  const pending=deferred();const b=await editor({save:()=>pending.promise});b.edit('Submitted');const save=b.save();
  b.receive(row(2,'Submitted'));b.edit('Typed later');b.receive(row(3,'C newer'));
  pending.resolve({status:'saved',document:row(2,'Submitted')});await save;
  assert.equal(b.getSnapshot().base.revision,2);assert.equal(b.getSnapshot().conflict.revision,3);assert.equal(b.getSnapshot().draft,'Typed later');
});

for (const error of [new Error('offline'),{code:'42501'},{code:'PGRST202'}]) test(`failed save retains work: ${error.code||'network'}`,async()=>{
  const b=await editor({save:async()=>{throw error;}});b.edit('Unsaved');await b.save();
  assert.equal(b.getSnapshot().draft,'Unsaved');assert.equal(b.getSnapshot().base.revision,1);assert.equal(b.getSnapshot().saving,false);assert.equal(b.getSnapshot().notice,null);
  assert.match(b.getSnapshot().error,error.code==='42501'?/permission/:error.code==='PGRST202'?/workspace update/:/connection/);
});

test('uncertain network result safely retries with the original revision',async()=>{
  const calls=[];let failed=false;const b=await editor({save:async(expected,content)=>{
    calls.push(expected.revision);if(!failed){failed=true;throw new Error('lost response after commit');}
    return {status:'conflict',document:row(2,content)};
  }});b.edit('Local');await b.save();await b.save();assert.deepEqual(calls,[1,1]);assert.equal(b.getSnapshot().conflict.revision,2);
});

test('missing document is not success and never recreates during save',async()=>{
  const b=await editor({save:async()=>({status:'missing'})});b.edit('Local');await b.save();
  assert.equal(b.getSnapshot().notice,null);assert.match(b.getSnapshot().error,/no longer available/);assert.equal(b.getSnapshot().draft,'Local');
});

test('refetch retains edits; Load theirs retains a copy; recovery swaps without deleting current text',async()=>{
  const b=await editor({load:async()=>row(2,'Remote')});b.edit('Local');b.receive(row(3,'Newer'));await b.load();
  assert.equal(b.getSnapshot().draft,'Local');b.loadTheirs(b.getSnapshot().conflict);
  assert.equal(b.getSnapshot().draft,'Newer');assert.equal(b.getSnapshot().recovery,'Local');b.restoreRecovery();
  assert.equal(b.getSnapshot().draft,'Local');assert.equal(b.getSnapshot().recovery,'Newer');
});

test('team switching/unmount invalidates a pending load and a pending save',async()=>{
  const pending=deferred();const old=new TeamDocumentEditor({load:()=>pending.promise},TEAM);
  const load=old.load();old.dispose();pending.resolve(row());await load;assert.equal(old.getSnapshot().base,null);
  const savePending=deferred();const b=await editor({save:()=>savePending.promise});b.edit('Local');const save=b.save();b.dispose();
  savePending.resolve({status:'saved',document:row(2,'Local')});await save;assert.equal(b.getSnapshot().base.revision,1);
  const fresh=await editor();assert.equal(fresh.getSnapshot().draft,'Original');
});

test('superseded initial loads and reconnect loads cannot rewind or clear text',async()=>{
  const first=deferred(),second=deferred();let n=0;const b=new TeamDocumentEditor({load:()=>++n===1?first.promise:second.promise},TEAM);
  const p1=b.load(),p2=b.load();second.resolve(row(2,'Fresh'));await p2;b.edit('Local');first.resolve(row());await p1;
  assert.equal(b.getSnapshot().base.revision,2);assert.equal(b.getSnapshot().draft,'Local');
});

test('invalid realtime and another team/document never replace content',async()=>{
  const b=await editor();b.edit('Local');b.receive(row(2,'Bad',{team_id:'other'}));b.receive(row(2,'Bad',{revision:undefined}));b.receive(row(1,'Recreated',{id:'other'}));
  assert.equal(b.getSnapshot().draft,'Local');assert.match(b.getSnapshot().error,/replaced/);
});

test('gateway creation race rereads the unique winner with explicit projections',async()=>{
  const calls=[];const responses=[{data:null,error:null},{data:null,error:{code:'23505'}},{data:row(),error:null}];
  const client={from(table){calls.push(table);const result=responses.shift();return {select(columns){calls.push(columns);return this;},eq(){return this;},insert(){calls.push('insert');return this;},maybeSingle:async()=>result,single:async()=>result};}};
  const result=await documentGateway(client,TEAM).load();assert.equal(result.content,'Original');assert.equal(calls.filter(x=>x===DOCUMENT_COLUMNS).length,3);assert.equal(calls.filter(x=>x==='insert').length,1);
});

test('RPC contract rejects empty/null, invalid or unconfirmed responses, preserving explicit failures',async()=>{
  for(const data of [null,[],{}, {status:'saved',document:row()}, {status:'saved',document:row(2,'Wrong')}, {status:'saved',document:row(2,'Local',{id:'other'})}]) {
    await assert.rejects(documentGateway({rpc:async()=>({data,error:null})},TEAM).save(row(),'Local'));
  }
  const calls=[];const api=documentGateway({rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'saved',document:row(2,'Local')},error:null};}},TEAM);
  assert.equal((await api.save(row(),'Local')).status,'saved');assert.equal(calls[0].args.p_expected_revision,1);assert.equal(calls[0].args.p_team_id,TEAM);
  assert.throws(()=>parseDocument(row(0),TEAM));
});

// Run real component event handlers and rendered markup with the repo's existing
// lightweight hook harness. PostgreSQL semantics are tested by the local suite.
function ui(editor, canEdit=true) {
  const hooks={...React,useMemo:fn=>fn(),useState:start=>[start,()=>{}],useEffect(){},useSyncExternalStore:(_subscribe,snapshot)=>snapshot()};
  const el=tag=>({children,...props})=>{const safe={...props};for(const key of ['loading','icon','size','variant'])delete safe[key];return React.createElement(tag,safe,children);};
  const system={Button:el('button'),FieldLabel:el('label'),Panel:el('section'),Segmented:()=>null,Spinner:()=>null,Textarea:el('textarea')};
  const Component=harness({react:hooks,'@/lib/supabase':{supabase:{}},'@/lib/teamDocument':{documentGateway:()=>({}),TeamDocumentEditor:class{constructor(){return editor;}}},'@/components/system':system}).load('src/components/workspace/SharedTeamDocument.tsx').default;
  let tree;
  const render=()=>{tree=Component({teamId:TEAM,canEdit,renderMarkdown:text=>text});return renderToStaticMarkup(tree);};
  function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}return null;}
  return {render,button:label=>find(tree,n=>n.props?.children===label),input:id=>find(tree,n=>n.props?.id===id)};
}

test('actual UI conflict review, actions, recovery and save status',async()=>{
  const b=await editor();const view=ui(b);view.render();view.input('ws-doc').props.onChange({target:{value:'Local'}});b.receive(row(2,'Remote'));
  assert.match(view.render(),/saved revision 2/);assert.equal(view.input('ws-doc-theirs').props.value,'Remote');assert.equal(view.input('ws-doc').props.value,'Local');
  assert.equal(view.button('Save doc').props.disabled,true);view.button('Load theirs').props.onClick();assert.match(view.render(),/Recover previous local edits/);
  view.button('Restore to editor').props.onClick();view.render();view.button('Save doc').props.onClick();await new Promise(r=>setImmediate(r));assert.match(view.render(),/Document saved/);
});

test('actual UI nonmembers have no editor, save or conflict controls',async()=>{
  const b=await editor();b.edit('Local');b.receive(row(2,'Private'));const html=ui(b,false).render();
  assert.match(html,/for team members/);assert(!/textarea|Keep mine|Save doc|Private/.test(html));
});

test('actual UI keeps typing enabled while submitted save is pending',async()=>{
  const p=deferred();const b=await editor({save:()=>p.promise});const view=ui(b);b.edit('Local');view.render();view.button('Save doc').props.onClick();
  assert.match(view.render(),/Saving submitted/);assert.equal(view.input('ws-doc').props.disabled,false);view.input('ws-doc').props.onChange({target:{value:'Later'}});
  p.resolve({status:'saved',document:row(2,'Local')});await new Promise(r=>setImmediate(r));assert.match(view.render(),/unsaved edits/);assert.equal(view.input('ws-doc').props.value,'Later');
});
