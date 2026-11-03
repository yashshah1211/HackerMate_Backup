/* eslint-disable @typescript-eslint/no-require-imports -- Server/operator tool; no default network or writes. */
const fs=require('node:fs'),{createClient}=require('@supabase/supabase-js'),{harness}=require('./ppt-vision-harness.cjs');
async function main(){
 const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
 if(!args.includes('--review')&&!args.includes('--apply-approved-evidence'))throw Error('Choose --review [--after UUID] [--limit 20], or --apply-approved-evidence FILE --confirm-project-ref REF. No default action.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Existing server-side project credentials required');
 const loader=harness({}, {fetch,Date,URLSearchParams}),client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(args.includes('--review')){
  if(args.includes('--apply-approved-evidence'))throw Error('Review and apply are separate actions');
  const r=await loader.load('src/lib/hackathons/legacyEvidence.ts').reviewLegacyEvidenceBatch(client,{afterId:args.includes('--after')?value('--after'):undefined,limit:args.includes('--limit')?Number(value('--limit')):20});
  console.log(JSON.stringify(r,null,2));return;
 }
 if(new URL(url).hostname!==value('--confirm-project-ref')+'.supabase.co')throw Error('Explicit project confirmation required');
 const entries=JSON.parse(fs.readFileSync(value('--apply-approved-evidence'),'utf8'));
 if(!Array.isArray(entries)||!entries.length||entries.length>20||new Set(entries.map(e=>e.approval?.record_id)).size!==entries.length)throw Error('Provide 1–20 distinct {approval, observation} entries from the current review');
 const {CATALOG_COLUMNS}=loader.load('src/lib/hackathons/synchronize.ts');
 const {persistApprovedSourceEvidence}=loader.load('src/lib/hackathons/sourceEvidenceWriter.ts'),results=[];
 for(const {approval,observation} of entries){
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(approval.record_id))throw Error('Invalid approved UUID');
  const {data:row,error}=await client.from('hackathons').select(CATALOG_COLUMNS).eq('id',approval.record_id).maybeSingle();
  if(error){console.error('Evidence adoption read failed:',error);throw Error('Current row unavailable');}
  if(!row)throw Error('Approved record missing');
  results.push({id:row.id,...await persistApprovedSourceEvidence(client,row,observation,approval)});
 }
 console.log(JSON.stringify({mode:'explicitly_approved_metadata_only',results}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
