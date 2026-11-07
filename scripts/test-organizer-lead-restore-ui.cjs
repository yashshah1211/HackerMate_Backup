/* eslint-disable @typescript-eslint/no-require-imports -- Actual React dialog with local request fixtures only. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const { ID, OTHER } = require('./organizer-restore-harness.cjs');
const summary = { id: ID, title: 'Synthetic selected', pitchSentAt: null, hasLastRecipient: true, imageRequests: 3 };

async function view(t, reply, options = {}) {
  const dom = new JSDOM('<button id="opener">Open</button><div id="root"></div>', { url: 'http://localhost/admin' });
  const keys = ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'];
  const saved = new Map(keys.map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const key of keys) Object.defineProperty(globalThis,key,{value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key],configurable:true});
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const state = { writes: [], reads: [], refreshes: 0, closes: 0, deferred: null };
  const h = harness({}, { document: dom.window.document, AbortController, fetch: async (url,init={}) => {
    if (init.method === 'POST') {
      state.writes.push(JSON.parse(init.body));
      if (reply instanceof Error) throw reply;
      if (options.deferred) return new Promise(resolve => {state.deferred=resolve;});
      return reply;
    }
    state.reads.push(url);
    if(options.fetchRead) return options.fetchRead(state.reads.length);
    if (options.readError) return Response.json({error:'Unavailable'},{status:500});
    return Response.json({leads:[summary],nextCursor:null});
  }});
  const Dialog = h.load('src/app/admin/_components/RemovedLeadsReview.tsx').default;
  dom.window.document.getElementById('opener').focus();
  const render = async key => React.act(async () => {
    root.render(React.createElement(Dialog,{key,onClose:()=>{state.closes++;},onRestored:async()=>{state.refreshes++;if(options.refreshError)throw Error('Synthetic refresh failure');}}));
    await new Promise(resolve=>setImmediate(resolve));
  });
  await render('first');
  t.after(async()=>{await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const click = async label => {
    const button = [...dom.window.document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
    assert(button,label); await React.act(async()=>{button.click();await new Promise(resolve=>setImmediate(resolve));});
  };
  return {state,dom,click,render};
}
for (const [name,reply,success] of [
  ['restored',Response.json({success:true,leadId:ID,status:'restored_review'}),true],
  ['missing',Response.json({error:'Gone'},{status:404}),false],
  ['conflict',Response.json({error:'Conflict'},{status:409}),false],
  ['database failure',Response.json({error:'Unavailable'},{status:500}),false],
  ['wrong receipt ID',Response.json({success:true,leadId:OTHER,status:'restored_review'}),false],
  ['unsafe receipt status',Response.json({success:true,leadId:ID,status:'new'}),false],
  ['empty receipt',Response.json({}),false],
  ['non-JSON',new Response('<html>Error</html>',{status:500}),false],
  ['network interruption',Error('Synthetic transport') ,false],
]) test('individual confirmation and '+name+' feedback',async t=>{
  const ui=await view(t,reply);
  assert.equal(ui.state.writes.length,0);
  await ui.click('Review');
  assert.match(ui.dom.window.document.body.textContent,/Prior recipient recorded; send time unavailable/);
  assert.match(ui.dom.window.document.body.textContent,/Restored — review held/);
  assert.match(ui.dom.window.document.body.textContent,/This changes only this lead/);
  await ui.click('Cancel'); assert.equal(ui.state.writes.length,0);
  await ui.click('Review'); await ui.click('Confirm selected restoration');
  assert.deepEqual(ui.state.writes,[{leadId:ID}]);
  assert.equal(ui.state.refreshes,success?1:0);
  assert.equal(ui.dom.window.document.querySelectorAll('[role="alert"]').length,success?0:1);
  assert.equal(ui.state.reads.length,success?2:1);
  if(!success){
    await ui.click('Confirm selected restoration');assert.equal(ui.state.writes.length,1,'Uncertain/conflicting result requires refresh before another attempt');
    await ui.click('Refresh removed list');assert.equal(ui.state.reads.length,2);
  }
});
test('failed browsing exposes refresh and performs no mutation',async t=>{
  const ui=await view(t,null,{readError:true});
  assert.match(ui.dom.window.document.querySelector('[role="alert"]').textContent,/unavailable/);
  assert(![...ui.dom.window.document.querySelectorAll('button')].some(node=>node.textContent==='Review'));
  await ui.click('Refresh removed list');assert.equal(ui.state.reads.length,2);assert.equal(ui.state.writes.length,0);
});
test('pending restore disables dismissal and duplicate writes, refreshes only after receipt',async t=>{
  const ui=await view(t,null,{deferred:true});await ui.click('Review');await ui.click('Confirm selected restoration');
  await ui.click('Restoring…');await ui.click('Close');await ui.click('Cancel');
  assert.equal(ui.state.writes.length,1);assert.equal(ui.state.closes,0);assert.equal(ui.state.refreshes,0);
  ui.dom.window.document.querySelector('[role="dialog"]').dispatchEvent(new ui.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(ui.state.closes,0);
  await React.act(async()=>{ui.state.deferred(Response.json({success:true,leadId:ID,status:'restored_review'}));await new Promise(r=>setImmediate(r));});
  assert.equal(ui.state.refreshes,1);assert.equal(ui.state.writes.length,1);
});
test('dialog traps keyboard focus and Escape dismissal never writes',async t=>{
  const ui=await view(t,null);const panel=ui.dom.window.document.querySelector('[role="dialog"]');
  assert.equal(ui.dom.window.document.activeElement,panel);
  panel.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  assert.equal(ui.dom.window.document.activeElement.textContent,'Close');
  panel.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
  assert.equal(ui.dom.window.document.activeElement.textContent,'Refresh removed list');
  panel.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(ui.state.closes,1);assert.equal(ui.state.writes.length,0);
});

test('a closed dialog cannot overwrite a reopened dialog with a stale page',async t=>{
  let completeOld;
  const ui=await view(t,null,{fetchRead:call=>call===1?new Promise(resolve=>{completeOld=resolve;}):Response.json({leads:[{...summary,id:OTHER,title:'New dialog result'}],nextCursor:null})});
  await ui.render('reopened');
  assert.match(ui.dom.window.document.body.textContent,/New dialog result/);
  await React.act(async()=>{completeOld(Response.json({leads:[summary],nextCursor:null}));await new Promise(r=>setImmediate(r));});
  assert.match(ui.dom.window.document.body.textContent,/New dialog result/);
  assert(!ui.dom.window.document.body.textContent.includes('Synthetic selected'));
  assert.equal(ui.state.writes.length,0);
});
test('confirmed restoration stays truthful when the parent CRM refresh fails',async t=>{
  const ui=await view(t,Response.json({success:true,leadId:ID,status:'restored_review'}),{refreshError:true});
  await ui.click('Review');await ui.click('Confirm selected restoration');
  assert.match(ui.dom.window.document.querySelector('[role="status"]').textContent,/Refresh the CRM table/);
  assert.equal(ui.state.writes.length,1);assert.equal(ui.state.refreshes,1);
});
