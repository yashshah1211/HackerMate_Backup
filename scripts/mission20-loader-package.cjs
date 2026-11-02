/* eslint-disable @typescript-eslint/no-require-imports -- Review-only loader packaging, no database execution. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {build,statements,DIR}=require('./mission20-atomic-candidate.cjs');
const ROOT=path.resolve(__dirname,'..'),OUT='docs/qa/mission20-c2/release/loader';
const sha=s=>createHash('sha256').update(s).digest('hex');
const clean=s=>s.replace(/^(?:\s|--[^\n]*(?:\n|$))+/,'').trim();
function forLoader(sql){
 const parts=statements(sql),tokens=parts.map(clean);
 assert.equal(tokens.filter(s=>s==='BEGIN;').length,1);
 assert.equal(tokens.filter(s=>s==='COMMIT;').length,1);
 assert.equal(tokens[0],'BEGIN;');assert.equal(tokens.at(-1),'COMMIT;');
 // Remove ONLY the two top-level transaction statements. The pinned CLI
 // owns the implicit transaction containing DDL AND its appended ledger row.
 return parts.slice(1,-1).join('\n').trim()+'\n';
}
function loaderPackage(){
 const {sql,plan}=build(),files=[
  ['freeze','docs/qa/mission20-c1/sql/00-freeze-admission.proposed.sql'],
  ['expansion',DIR+'/01-final-expansion.review.sql'],
  ['contract','docs/qa/mission20-c1/sql/02-contract.proposed.sql'],
  ['unfreeze','docs/qa/mission20-c1/sql/06-unfreeze-admission.proposed.sql']
 ].map(([stage,source],i)=>{
  const original=fs.readFileSync(path.join(ROOT,source),'utf8').replace(/\r\n/g,'\n');
  if(stage==='expansion')assert.equal(original,sql);
  const packaged=forLoader(original);
  return {stage,source,sourceSha256:sha(original),version:plan.proposedVersions[i].version,
   path:OUT+'/'+stage+'.review.sql',sql:packaged,sha256:sha(packaged)};
 });
 return {files,manifest:{status:'REVIEW_ONLY_NOT_ALLOCATED_NOT_AUTHORIZED',cli:'2.75.0',
  windowsArchiveSha256:'c6e3a97a70fbb76b7b1b87c02b4c4d9ddaf69d264e1ae94c054222b25ab22173',
  linuxArchiveSha256:'e5597462f865d5ac72af0453358e37ecb0d85962ad6914a114a53de847303bde',
  transactionOwner:'Supabase CLI ExecBatch: one file DDL plus ledger INSERT in one implicit transaction',
  invocationBoundaries:'Separate invocation and independent gate for freeze, expansion, contract, unfreeze; never queue all stages together',
  files:files.map(({sql:unused,...f})=>{void unused;return f;})}};
}
module.exports={forLoader,loaderPackage,OUT};
if(require.main===module){
 assert.deepEqual(process.argv.slice(2),['--write-review-only']);
 const {files,manifest}=loaderPackage();fs.mkdirSync(path.join(ROOT,OUT),{recursive:true});
 for(const f of files)fs.writeFileSync(path.join(ROOT,f.path),f.sql);
 fs.writeFileSync(path.join(ROOT,OUT,'LOADER-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
}
