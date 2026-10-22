/* eslint-disable @typescript-eslint/no-require-imports -- GET-only metadata audit; credentials stay in memory. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/hustle-phase2/delivery-inventory.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,Set,Date,JSON,Error});
const {inspectScheduleInventory,InventoryStop}=m.exports;
async function main(){
 const file=process.argv[2];if(!file)throw Error('Provide the existing local credential-file path, never a key argument.');
 const line=fs.readFileSync(file,'utf8').split(/\r?\n/).find(s=>/^RESEND_API_KEY=/.test(s));
 if(!line)throw Error('Configured credential unavailable.');
 const key=line.slice(line.indexOf('=')+1).trim().replace(/^(["'])(.*)\1$/,'$2');
 const worker=process.argv.includes('--worker-budget'),budgetMs=worker?12000:45000,requestMs=worker?2000:3000;
 const timings=[];
 async function get(endpoint,timeout=1000){await new Promise(r=>setTimeout(r,125));const start=performance.now();try{
  const r=await fetch('https://api.resend.com'+endpoint,{method:'GET',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(timeout),redirect:'error',cache:'no-store'});
  if(!r.ok)throw Error('Provider GET unavailable.');return await r.json();
 }finally{timings.push({kind:endpoint.startsWith('/emails?')?'inventory':'preflight',ms:performance.now()-start})}}
 const usage=await get('/usage',10000); // Warm authenticated pool as runtime preflight does.
 const domains=await get('/domains');if(!Array.isArray(domains.data))throw Error('Provider domain metadata unavailable.');
 let inventory,stop=null;
 try{inventory=await inspectScheduleInventory(async(after,timeout)=>{
  const result=await get('/emails?limit=100'+(after?'&after='+encodeURIComponent(after):''),timeout);
  // Discard recipient/sender fields immediately, never fetch a message body.
  return{has_more:result.has_more,data:Array.isArray(result.data)?result.data.map(({id,subject,created_at,scheduled_at,last_event})=>({id,subject,created_at,scheduled_at,last_event})):result.data};
 },()=>Date.now(),budgetMs,requestMs)}catch(error){if(!(error instanceof InventoryStop))throw error;inventory=error.evidence;stop=error.message}
 const stats=items=>{const sorted=items.map(t=>t.ms).sort((a,b)=>a-b),percent=p=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]*100)/100;return{samples:sorted.length,p50:percent(.5),p95:percent(.95),p99:percent(.99),max:percent(1)}};
 const evidence={checkedAt:new Date().toISOString(),result:stop?'STOP':'PASS',stop,inventory,probeBudgetMs:budgetMs,requestTimeoutMs:requestMs,workerBudgetMs:12000,requestLatencyMs:stats(timings),inventoryRequestLatencyMs:stats(timings.filter(t=>t.kind==='inventory')),daily:{used:usage.emails?.daily?.used,limit:usage.emails?.daily?.limit,resetsAt:usage.emails?.daily?.resets_at},monthly:{used:usage.emails?.monthly?.used,limit:usage.emails?.monthly?.limit},scope:'Windows GET-only existing local provider account; not Vercel hosted RPC latency; no bodies/contacts retained; no writes',mutations:0};
 const out=path.join(root,'test-results/hustle-autodispatch/r2-provider-metadata-'+Date.now()+'.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));if(stop)process.exitCode=1;
}
main().catch(()=>{console.error('Read-only provider probe STOP; no response, credentials or contacts logged.');process.exitCode=1});
