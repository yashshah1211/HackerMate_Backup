/* eslint-disable @typescript-eslint/no-require-imports -- Offline metadata-only adversarial fixtures. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/hustle-phase2/delivery-inventory.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Date,Set,Error,JSON});
const {inspectScheduleInventory,InventoryStop}=m.exports;
const START=Date.parse('2026-10-23T00:45:00Z'),results=[];const check=(v,label)=>{assert(v,label);results.push({pass:true,label})};
const rows=Array.from({length:1501},(_,i)=>({id:crypto.randomUUID(),subject:'Synthetic nonparticipant metadata',created_at:new Date(START-3600000-i*86400000).toISOString(),scheduled_at:null,last_event:'delivered'}));
async function run(patch={},io=400){let now=START,calls=0;const query=async(after)=>{calls++;now+=io;const i=after?rows.findIndex(r=>r.id===after)+1:0;let data=rows.slice(i,i+100).map(r=>({...r})),has_more=i+100<rows.length;
 if(patch.page)({data,has_more}=patch.page({data,has_more,i,calls}));return{data,has_more}};
 return{promise:inspectScheduleInventory(query,()=>now),get calls(){return calls}}}
async function main(){
 let h=await run();let r=await h.promise;check(r.complete&&r.records===1501&&r.pages===16&&!r.hasMore,'full traversal covers >1000 records and has_more false');check(h.calls===17,'head recheck included');check(r.elapsedMs===6800,'measured synthetic 6.8s inventory under strict12s ceiling');check(r.earliestCreatedAt===new Date(Date.parse(rows.at(-1).created_at)).toISOString(),'oldest date recorded, not used to skip pages');
 for(const [label,page]of [
  ['old pending message rescheduled beyond target cutoff',({data,has_more,i})=>({data:i===1500?[{...data[0],subject:'Hustle Carnival Round 2',last_event:'scheduled',scheduled_at:'2026-11-01T08:35:00Z'}]:data,has_more})],
  ['out-of-order creation date',({data,has_more,i})=>({data:i===100?[{...data[0],created_at:new Date(START).toISOString()},...data.slice(1)]:data,has_more})],
  ['cursor loop across pages',({data,has_more,i})=>({data:i===100?[{...rows[0]},...data.slice(1)]:data,has_more})],
  ['empty page with has_more',()=>({data:[],has_more:true})],
  ['malformed date',({data,has_more})=>({data:[{...data[0],created_at:'invalid'}],has_more})],
  ['missing scheduled timestamp metadata',({data,has_more})=>({data:[{...data[0],scheduled_at:undefined}],has_more})],
  ['unknown campaign pending state',({data,has_more})=>({data:[{...data[0],subject:'Hustle',last_event:'unrecognized'}],has_more})],
  ['historical scheduled item with elapsed schedule',({data,has_more})=>({data:[{...data[0],subject:'Hustle',last_event:'scheduled',scheduled_at:'2026-10-22T08:35:00Z'}],has_more})],
  ['inconsistent future schedule with terminal campaign status',({data,has_more})=>({data:[{...data[0],subject:'Hustle',scheduled_at:'2026-10-23T08:35:00Z'}],has_more})],
  ['head changed while scanning',({data,has_more,calls})=>({data:calls===17?[{...data[0],id:crypto.randomUUID()},...data.slice(1)]:data,has_more})],
 ]){h=await run({page});await assert.rejects(h.promise,e=>e instanceof InventoryStop);check(true,label+' => STOP')}
 h=await run({},1000);await assert.rejects(h.promise,e=>e instanceof InventoryStop&&e.evidence.elapsedMs<=12000);check(true,'strict elapsed limit stops traversal without an unbounded scan');
 let calls=0;await assert.rejects(inspectScheduleInventory(async()=>{calls++;throw Error('offline synthetic timeout')}),e=>e instanceof InventoryStop);check(calls===1,'transport uncertainty is not retried');
 const out=path.join(root,'test-results/hustle-autodispatch/inventory-results.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({results,realAccounts:false,mutations:0},null,2));console.log(results.length+'/'+results.length+' offline inventory assertions passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
