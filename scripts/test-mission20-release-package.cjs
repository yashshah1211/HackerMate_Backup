/* eslint-disable @typescript-eslint/no-require-imports -- Immutable review-package guards, never SQL execution. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {createHash}=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('docs/qa/mission20-c2/release/SQL-MANIFEST.json','utf8'));
test('release manifest covers every proposal, locks source hashes and excludes fixture promotion',()=>{
 const files=fs.readdirSync('docs/qa/mission20-c1/sql').map(f=>'docs/qa/mission20-c1/sql/'+f)
  .concat('docs/qa/mission20-c2/sql/01-cancel.proposed.sql').sort();
 assert.deepEqual(manifest.files.map(f=>f.path).sort(),files);
 for(const f of manifest.files){
  assert.equal(createHash('sha256').update(fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n')).digest('hex'),f.sha256,f.path);
  if(manifest.fixturesNeverPromote.includes(f.id))assert.equal(f.candidateForSeparatelyReviewedPackaging,false);
 }
 assert.equal(manifest.activeMigrationVersionsAllocated,false);
 assert.deepEqual(manifest.atomicFutureExpansion,['expand','per-team','writer-protocol','existing-writers','cancel']);
});
test('independent catalog packet contains SELECT statements only, no writable CTE or side-effect primitives',()=>{
 const sql=fs.readFileSync('docs/qa/mission20-c2/release/CATALOG-REQUESTS.select-only.sql','utf8')
  .replace(/--[^\r\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
 const statements=sql.split(';').map(s=>s.trim()).filter(Boolean);assert(statements.length>=15);
 for(const statement of statements){assert.match(statement,/^SELECT\b/);
  assert(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|DO|CALL|COPY|SET|set_config|pg_terminate_backend|pg_read_file|dblink|lo_import)\b/i.test(statement));
 }
});
test('readiness follow-up does not change application, active migrations, dependencies, environment or approved SQL',()=>{
 const diff=cp.execFileSync('git',['diff',manifest.baseline,'--name-only','--','src','supabase','package.json','package-lock.json',
  '.env','.env.local','docs/qa/mission20-c1/sql','docs/qa/mission20-c2/sql'],{encoding:'utf8'});
 assert.equal(diff.trim(),'');
});
