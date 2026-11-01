/* eslint-disable @typescript-eslint/no-require-imports -- No CI inputs/uploads; private bytes stay in memory/local disposable DB. */
const {loadPrivateAudit}=require('./mission20-private-audit.cjs');
const {main}=require('./qualify-mission20-c1-postgres.cjs');
const {extension:c2}=require('./qualify-mission20-c2-writers.cjs');
const {qualifyAtomic}=require('./qualify-mission20-atomic-candidate.cjs');
async function runPrivate(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--private-audit')throw Error('private_audit_usage');
 const privateFixture=loadPrivateAudit(args[1]);
 console.log(JSON.stringify({privateAuditVerified:true,signature:privateFixture.signature,sha256:privateFixture.bodySha256,bytes:privateFixture.byteLength,uploaded:false}));
 await main({privateInput:true,async setup(c){if(await c.admin.query('SHOW server_version_num;')!=='170006')throw Error('private_audit_requires_pg17_6');
  if(await c.admin.query("SELECT coalesce(bool_and(auth_method='scram-sha-256'),false) FROM pg_hba_file_rules WHERE error IS NULL;")!=='t')throw Error('private_audit_requires_ephemeral_password_auth');
  await c2.setup(c);},
  async qualify(c){await c2.qualify(c);await qualifyAtomic(c,{privateFixture});}},['--local-pg17-only']);
}
if(require.main===module)runPrivate().catch(error=>{
 // PostgreSQL diagnostics/assertions can include SQL text. Never print those,
 // stack traces, the parsed object, base64, or a query involving private bytes.
 const code=/^private_audit_[a-z0-9_]+$/.test(error?.message||'')?error.message:'private_audit_qualification_failed_redacted';
 const state=(error?.message||'').match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];
 const hashes=/^[a-f0-9]{64}$/.test(error?.actual||'')&&/^[a-f0-9]{64}$/.test(error?.expected||'')?{actualSha256:error.actual,expectedSha256:error.expected}:{};
 console.error(JSON.stringify({error:code,...(state?{sqlstate:state}:{}),...hashes}));process.exitCode=1;
});
module.exports={runPrivate};
