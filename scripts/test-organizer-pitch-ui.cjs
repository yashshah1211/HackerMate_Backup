/* eslint-disable @typescript-eslint/no-require-imports -- Actual React tab and repeat confirmation, synthetic request fixtures only. */
const assert=require('node:assert/strict'),{test}=require('node:test'),{webcrypto}=require('node:crypto');
const React=require('react'),{JSDOM}=require('jsdom'),{harness}=require('./ppt-vision-harness.cjs');
const ID='00000000-0000-4000-8000-000000000681',PREVIOUS='00000000-0000-4000-8000-000000000682';
async function view(t,reply,options={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/admin'});
 const keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key],configurable:true});
 const {createRoot}=require('react-dom/client'),root=createRoot(dom.window.document.getElementById('root'));
 const state={requests:[],prompts:[],toasts:[],refreshes:0};
 const h=harness({'@/context/NotificationContext':{useNotification:()=>({showToast:(...args)=>state.toasts.push(args),confirm:prompt=>state.prompts.push(prompt)})}},{
  crypto:webcrypto,document:dom.window.document,fetch:async(url,init)=>{
   assert.equal(url,'/api/admin/send-organizer-pitch');const payload=JSON.parse(init.body);state.requests.push(payload);
   return reply(payload,state.requests.length);
  },
 });
 const leads=options.leads||[{id:ID,title:'Synthetic pitch',status:'new',organizer_email:'organizer@example.invalid',unstop_url:'https://example.invalid/synthetic',created_at:'2026-01-01'}];
 await React.act(async()=>root.render(React.createElement(h.load('src/app/admin/_tabs/OutreachTab.tsx').default,{leads,setLeads(){},loadingLeads:false,loadLeads:async()=>{state.refreshes++;},searchQuery:'',setSearchQuery(){}})));
 t.after(async()=>{await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 const find=label=>[...dom.window.document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
 const click=async(label,twice=false)=>{const b=find(label);assert(b,label);await React.act(async()=>{b.click();if(twice)b.click();await new Promise(r=>setImmediate(r));});};
 return{state,dom,click,find};
}
test('double-clicks share one intent and one request, provider acceptance remains distinct from delivery',async t=>{
 const ui=await view(t,payload=>Response.json({intentId:payload.intentId,dispatch:{status:'accepted',intendedRecipientAccepted:true},accounting:{status:'recorded'}}));
 await ui.click('Pitch');await ui.click('Send Proposal',true);
 assert.equal(ui.state.requests.length,1);assert.match(ui.state.requests[0].intentId,/^[a-f0-9-]{36}$/);assert.equal(ui.state.refreshes,1);
 assert.match(ui.state.toasts.at(-1)[0],/Delivery is not confirmed/);
});
for(const [name,response]of [
 ['duplicate',()=>Response.json({sendState:'duplicate',attemptState:'dispatching'},{status:409})],
 ['claim unavailable',()=>Response.json({sendState:'unavailable'},{status:503})],
 ['unknown outcome',()=>Response.json({dispatch:{status:'unknown'}},{status:502})],
 ['non-JSON',()=>new Response('<html>Synthetic</html>',{status:500})],
 ['transport',()=>{throw Error('Synthetic network loss');}],
])test(name+' locks automatic resubmission and requires review',async t=>{
 const ui=await view(t,response);await ui.click('Pitch');await ui.click('Send Proposal');
 assert.equal(ui.state.requests.length,1);assert(ui.find('Send Proposal').disabled);
 await ui.click('Send Proposal');assert.equal(ui.state.requests.length,1);assert.equal(ui.state.refreshes,0);
 assert.match(ui.dom.window.document.body.textContent,/review|Review/);
 assert.equal(ui.state.toasts.at(-1)[1],'warning');assert(!ui.find('Review and authorize separate re-pitch'));
});
test('accepted response with incomplete bookkeeping warns DO NOT RESEND',async t=>{
 const ui=await view(t,p=>Response.json({intentId:p.intentId,dispatch:{status:'accepted',intendedRecipientAccepted:true},accounting:{status:'failed'},dbUpdateFailed:true}));
 await ui.click('Pitch');await ui.click('Send Proposal');assert.equal(ui.state.requests.length,1);assert.equal(ui.state.toasts.at(-1)[1],'warning');assert.match(ui.state.toasts.at(-1)[0],/DO NOT RESEND/);
});
test('repeat contact requires a separate explicit confirmation, uses frozen payload and new intent',async t=>{
 const ui=await view(t,(p,n)=>n===1?Response.json({sendState:'approval_required',repeatOf:PREVIOUS},{status:409}):Response.json({intentId:p.intentId,dispatch:{status:'accepted',intendedRecipientAccepted:true},accounting:{status:'recorded'}}));
 await ui.click('Pitch');await ui.click('Send Proposal');assert.equal(ui.state.requests.length,1);
 await ui.click('Review and authorize separate re-pitch');
 assert.equal(ui.state.requests.length,1,'Opening or cancelling the approval writes nothing');assert.equal(ui.state.prompts.length,1);
 assert.equal(ui.state.prompts[0].confirmText,'Authorize another email');assert.match(ui.state.prompts[0].message,/intentionally authorize/);
 await React.act(async()=>{await ui.state.prompts[0].onConfirm();await new Promise(r=>setImmediate(r));});
 assert.equal(ui.state.requests.length,2);const [first,second]=ui.state.requests;
 assert.notEqual(second.intentId,first.intentId);assert.equal(second.repeatOf,PREVIOUS);
 for(const key of ['leadId','recipientEmail','subject','contentHtml'])assert.equal(second[key],first[key],key);
});
test('pending response prevents composer dismissal and duplicate requests',async t=>{
 let finish;const ui=await view(t,()=>new Promise(resolve=>{finish=resolve;}));
 await ui.click('Pitch');await ui.click('Send Proposal',true);assert.equal(ui.state.requests.length,1);assert(ui.find('Cancel').disabled);
 await ui.click('Cancel');await ui.click('Sending...');assert.equal(ui.state.requests.length,1);
 await React.act(async()=>{finish(Response.json({sendState:'duplicate'},{status:409}));await new Promise(r=>setImmediate(r));});
 assert(ui.find('Send Proposal').disabled);
});
test('bulk uses separate stable intents, ignores held rows and never automatically authorizes repeat contact',async t=>{
 const leads=[{id:ID,title:'Synthetic first',status:'new',organizer_email:'first@example.invalid',unstop_url:'https://example.invalid/first',created_at:'2026-01-01'},
  {id:PREVIOUS,title:'Synthetic second',status:'new',organizer_email:'second@example.invalid',unstop_url:'https://example.invalid/second',created_at:'2026-01-01'},
  {id:'00000000-0000-4000-8000-000000000683',title:'Synthetic held',status:'restored_review',organizer_email:'held@example.invalid',unstop_url:'https://example.invalid/held',created_at:'2026-01-01'}];
 const ui=await view(t,()=>Response.json({sendState:'approval_required',repeatOf:PREVIOUS},{status:409}),{leads});
 const boxes=ui.dom.window.document.querySelectorAll('input[type="checkbox"]');
 await React.act(async()=>boxes[0].click());await ui.click('Bulk Pitch3');
 const button=[...ui.dom.window.document.querySelectorAll('button')].find(b=>b.textContent.includes('Dispatch 3 Pitches'));assert(button);
 await React.act(async()=>{button.click();button.click();await new Promise(r=>setTimeout(r,1000));});
 assert.equal(ui.state.requests.length,2);assert.equal(new Set(ui.state.requests.map(p=>p.intentId)).size,2);assert(ui.state.requests.every(p=>p.repeatOf===undefined));assert(!ui.state.requests.some(p=>p.leadId===leads[2].id));
 assert.match(ui.state.toasts.at(-1)[0],/Re-pitch approval is individual/);
});
