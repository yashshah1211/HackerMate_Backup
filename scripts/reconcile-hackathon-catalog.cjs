/* eslint-disable @typescript-eslint/no-require-imports -- Read-only public-source reconciliation; no database client or credentials. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {harness}=require('./ppt-vision-harness.cjs');
const offline=harness({}, {URLSearchParams}).load('src/lib/hackathons/synchronize.ts');
function reinterpretRetained(row,result){
 if(!result.evidence)return result;
 const current=offline.reconciliation(row,result.evidence);
 return {...result,original_classification:result.original_classification||result.classification,
  classification:current.classification,changes:current.changes,
  retainedInterpretation:'Original observation/check time retained; classification and patch re-evaluated under current evidence rules, not freshly verified.'};
}
async function main(){
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
 if(!args.includes('--snapshot')||!args.includes('--output')||!args.includes('--allow-public-fetch'))throw Error('Requires --snapshot FILE --output FILE --allow-public-fetch; never connects to a database.');
 const input=fs.readFileSync(path.resolve(get('--snapshot')),'utf8'),snapshot=JSON.parse(input),rows=snapshot.records;
 if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid bounded catalog snapshot');
 const loader=harness({}, {fetch,Date,URLSearchParams}),{SourceTransport,discoverSources}=loader.load('src/lib/hackathons/sourceTransport.ts');
 const {identifySource}=loader.load('src/lib/hackathons/providers.ts'),{observe,reconciliation}=loader.load('src/lib/hackathons/synchronize.ts');
 let transport=new SourceTransport(fetch),discovery=await discoverSources(transport);const byUrl=new Map(discovery.identities.map(i=>[i.canonical_url,i]));
 const resumeKey=args.includes('--recheck-status-from')?'--recheck-status-from':'--recheck-active-from';
 const prior=args.includes(resumeKey)?JSON.parse(fs.readFileSync(path.resolve(get(resumeKey)),'utf8')):null;
 if(prior&&(prior.snapshotSha256!==crypto.createHash('sha256').update(input).digest('hex')||prior.records!==rows.length))throw Error('Resume evidence does not match snapshot');
 const retained=new Map((prior?.results||[]).filter(r=>resumeKey==='--recheck-status-from'?!r.evidence?.issues?.includes('not_publicly_live'):!['registration_open','ongoing_registration_closed','ongoing'].includes(r.classification)).map(r=>[r.id,r]));
 const results=[],startedAt=new Date().toISOString();
 for(let i=0;i<rows.length;i++){
  const row=rows[i];if(retained.has(row.id)){results.push(reinterpretRetained(row,retained.get(row.id)));continue;}
  const identity=identifySource(row.website_url);
  if(!identity){results.push({id:row.id,name:row.name,status:'unresolved',classification:'unresolved',reason:'unsupported_source_identity',changes:{},requires_adoption:true});continue;}
  if(transport.remaining()<15000){await new Promise(r=>setTimeout(r,1000));transport=new SourceTransport(fetch);}
  try{const observation=await observe(byUrl.get(identity.canonical_url)||identity,transport);results.push({...reconciliation(row,observation),snapshot_hash:row.row_snapshot_hash});}
  catch(e){results.push({id:row.id,name:row.name,provider:identity.provider,status:'unresolved',classification:'unresolved',reason:e.message,changes:{},requires_adoption:true});}
  if((i+1)%25===0)console.log('Read-only source checks: '+(i+1)+'/'+rows.length);
 }
 const report={mode:'READ_ONLY_PREVIEW_NO_DATABASE_WRITER',startedAt,finishedAt:new Date().toISOString(),snapshotSha256:crypto.createHash('sha256').update(input).digest('hex'),records:rows.length,
  counts:results.reduce((a,r)=>(a[r.classification]=(a[r.classification]||0)+1,a),{}),discoveryFailures:discovery.failures,productionWrites:0,emails:0,
  retainedObservations:retained.size, recheckReason:prior?(resumeKey==='--recheck-status-from'?'Recheck only observations with unrecognized publication status after exact AlgoRush evidence established FINISHED; preserve prior active/blocked/unsupported observations.':'Only previously active candidates rechecked for missing category/status evidence; other observations retained.'):null,
  note:'Unresolved is not ended or active. All legacy changes require field-ownership review, a fresh source check/current-row comparison and separate founder backfill approval. Archive means proposed suppression; no row deletion or archive update is executed.',results};
 const output=path.resolve(get('--output'));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,counts:report.counts,records:rows.length,productionWrites:0,emails:0}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main,reinterpretRetained};
