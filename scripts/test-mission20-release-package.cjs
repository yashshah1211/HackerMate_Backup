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

const candidate=require('./mission20-atomic-candidate.cjs');
const loader=require('./mission20-loader-package.cjs');
test('offline receipt source hashes use normalized UTF8 bytes, including non-ASCII test literals',()=>{
 const receipt=JSON.parse(fs.readFileSync('docs/qa/mission20-c2/release/OFFLINE-EVIDENCE.json','utf8'));
 for(const [file,expected] of Object.entries(receipt.localSourceSha256)){
  const utf8=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(utf8,'utf8').digest('hex'),expected,file);
 }
});
test('CLI packaging preserves every nontransaction statement and immutable source hashes',()=>{
 const {files,manifest}=loader.loaderPackage();
 assert.equal(files.length,4);assert.equal(manifest.cli,'2.75.0');
 assert.deepEqual(JSON.parse(fs.readFileSync(loader.OUT+'/LOADER-MANIFEST.json','utf8')),manifest);
 for(const f of files){
  const source=fs.readFileSync(f.source,'utf8').replace(/\r\n/g,'\n');
  assert.equal(fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n'),f.sql);
  assert.deepEqual(candidate.statements(f.sql).map(s=>s.trim()),candidate.statements(source).slice(1,-1).map(s=>s.trim()));
  assert.equal(createHash('sha256').update(source).digest('hex'),f.sourceSha256);
  assert.equal(createHash('sha256').update(f.sql).digest('hex'),f.sha256);
 }
});
test('loader packaging rejects unexpected transaction boundaries instead of silently changing SQL',()=>{
 for(const sql of ['SELECT 1;','BEGIN; SELECT 1; COMMIT; BEGIN; COMMIT;','BEGIN; SELECT 1; ROLLBACK;'])assert.throws(()=>loader.forLoader(sql));
 const sql="BEGIN;\nDO $$ BEGIN RAISE NOTICE 'BEGIN; COMMIT;'; END; $$;\nCOMMIT;\n";
 assert.equal(candidate.statements(loader.forLoader(sql)).length,1);
 assert(loader.forLoader(sql).includes("'BEGIN; COMMIT;'"));
});
test('full catalog closure capture contains SELECTs only with dependency and effective permission coverage',()=>{
 const original=fs.readFileSync('docs/qa/mission20-c2/release/CATALOG-CLOSURE.select-only.sql','utf8');
 const sql=original.replace(/--[^\r\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
 for(const s of sql.split(';').map(s=>s.trim()).filter(Boolean)){
  assert.match(s,/^SELECT\b/);assert(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|DO|CALL|COPY|SET|set_config|pg_terminate_backend|pg_read_file|dblink|lo_import)\b/i.test(s));
 }
 for(const key of ['pg_depend','pg_get_functiondef','has_column_privilege','pg_policies','pg_trigger','pg_sequence','pg_extension'])assert(original.includes(key));
});
test('atomic candidate and manifest are reproducible from unchanged hashed proposals',()=>{
 const {sql,plan}=candidate.build();
 assert.equal(fs.readFileSync(candidate.DIR+'/01-final-expansion.review.sql','utf8').replace(/\r\n/g,'\n'),sql);
 assert.deepEqual(JSON.parse(fs.readFileSync(candidate.DIR+'/CANDIDATE-MANIFEST.json','utf8')),plan);
 const tx=candidate.statements(sql).map(s=>s.replace(/^(?:\s|--[^\n]*(?:\n|$))+/,'').trim());
 assert.equal(tx.filter(s=>s==='BEGIN;').length,1);assert.equal(tx.filter(s=>s==='COMMIT;').length,1);
 assert.equal(tx.at(-1),'COMMIT;');assert(!sql.includes('LOCK TABLE public.team_members'));
 assert(!sql.includes('CREATE FUNCTION mission20_private.transfer_members'));
});
test('candidate emits final NOWAIT functions once without global or blocking comparator definitions',()=>{
 const {sql}=candidate.build(),parts=candidate.statements(sql);
 for(const name of ['lock_context','lock_roster_parents','guard_registration_write','register_native']){
  const defs=parts.filter(s=>new RegExp('CREATE (?:OR REPLACE )?FUNCTION mission20_private\\.'+name+'\\(').test(s));
  assert.equal(defs.length,1,name);if(['lock_roster_parents','guard_registration_write'].includes(name))assert(defs[0].includes('NOWAIT'));
 }
 assert(sql.includes('unreviewed_function_variant_stop'));assert(sql.includes('migration_ledger_drift_stop'));
 assert(sql.includes('separately_committed_freeze_and_revoked_insert_required'));
});
test('latest hardened add-member dependency is not replaced and versions remain tentative',()=>{
 const {sql,plan}=candidate.build(),dep=plan.dependencies.find(d=>d.signature.startsWith('public.add_user_to_team('));
 assert(dep.file.includes('20260928100000'));assert(!/CREATE (?:OR REPLACE )?FUNCTION public\.add_user_to_team/.test(sql));
 assert(candidate.definition(dep.file,'public.add_user_to_team').includes("p_role IS DISTINCT FROM 'member'"));
 assert.equal(plan.status,'REVIEW_ONLY_NOT_ALLOCATED_NOT_AUTHORIZED');
 assert.equal(new Set(plan.proposedVersions.map(v=>v.version)).size,4);
 assert(plan.proposedVersions.every(v=>v.version>plan.liveLedger.latest));
 assert.equal(plan.expansionExpectedLedger.count,plan.liveLedger.count+1);
 assert.equal(plan.expansionExpectedLedger.latest,plan.proposedVersions[0].version);
});
test('SQL splitter preserves semicolons and comments inside quoted bodies',()=>{
 const sample="-- heading;\nBEGIN;\nDO $x$ BEGIN RAISE NOTICE 'literal -- ;'; END; $x$;\nSELECT 'a;''b';\nCOMMIT;\n";
 assert.equal(candidate.statements(sample).length,4);
 assert(candidate.statements(sample)[1].includes("'literal -- ;'"));
 assert.throws(()=>candidate.statements("SELECT 'unterminated"),/unterminated/);
});

test('reviewed exact live hashes are narrowly allowlisted per signature, with unchanged source hashes',()=>{
 const expected={
  'public.accept_team_invite(uuid)':'5cda72e78872633f23754f53027b34cb0aa34feabfe6b9aaf44496eb484a2963',
  'public.accept_team_join_request(uuid)':'20cbbea56deecc735f80e018978975912278a74557dac129b6acb7087ad4eaed',
  'public.ensure_team_conversation(uuid)':'9ad2c3551805a161decbae3b842f4ac7356b1dc250f81718fadfd6f7db60464b',
  'public.delete_user_completely(uuid)':'ea2036ee96a7fac12b49c330bc6d292716cd853763bd956be912a63981291cfe',
  'public.add_user_to_team(uuid,uuid,text)':'11919942fa8c526386b3dbe5ada6c37e0fa8ca0198395b807d7c80780beda500'
 };
 const {sql,plan}=candidate.build();let hashes=0;
 for(const dep of plan.dependencies){
  assert.equal(dep.deployedBodySha256,expected[dep.signature]);
  assert.deepEqual(dep.approvedBodySha256,[...new Set([dep.bodySha256,expected[dep.signature]])]);hashes+=dep.approvedBodySha256.length;
  assert(!dep.approvedBodySha256.includes(createHash('sha256').update(candidate.body(candidate.definition(dep.file,dep.signature.split('(')[0]))+'\n ').digest('hex')));
 }
 assert.equal(hashes,9);
 const guard=sql.slice(0,sql.indexOf('END; $mission20_preflight$;'));
 assert(guard.includes('=ANY(expected.sha256)'));assert(!/regexp_replace|btrim|\btrim\s*\(/i.test(guard));
 assert.equal(plan.fingerprintEvidence.completeDeployedInstallation,'UNQUALIFIED');
});

test('available deployed fixtures preserve protected literals and trimmed logic lines without reconstructing missing bytes',()=>{
 const fixtures=JSON.parse(fs.readFileSync(candidate.DIR+'/deployed-body-fixtures.review.json','utf8'));
 const review=JSON.parse(fs.readFileSync(candidate.DIR+'/FUNCTION-FINGERPRINTS.review.json','utf8'));
 assert.equal(fixtures.functions.length,4);assert.equal(review.functions.length,5);
 assert(!fixtures.functions.some(f=>f.signature==='public.ensure_team_conversation(uuid)'));
 for(const f of fixtures.functions){
  const d=review.functions.find(d=>d.signature===f.signature);assert(d);
  assert.equal(createHash('sha256').update(f.prosrc).digest('hex'),d.liveBodySha256);
  const original=candidate.body(candidate.definition(d.sourceFile,d.signature.split('(')[0]));
  assert.deepEqual(candidate.bodyTokens(f.prosrc),candidate.bodyTokens(original));
  assert.deepEqual(f.prosrc.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),original.split(/\r?\n/).map(s=>s.trim()).filter(Boolean));
 }
 assert(review.rawBodyQualification.includes('UNQUALIFIED'));
 assert(review.functions.every(f=>f.functionalChangeAuthorized===false));
});

test('offline formatting comparison never erases literal content or token boundaries',()=>{
 assert.deepEqual(candidate.bodyTokens("BEGIN\n PERFORM 'a b';\nEND;"),candidate.bodyTokens("BEGIN PERFORM 'a b'; END;"));
 assert.notDeepEqual(candidate.bodyTokens("PERFORM 'a b';"),candidate.bodyTokens("PERFORM 'ab';"));
 assert.notDeepEqual(candidate.bodyTokens('PERFORM "a b";'),candidate.bodyTokens('PERFORM "ab";'));
 assert.notDeepEqual(candidate.bodyTokens('a b'),candidate.bodyTokens('ab'));
 assert.notDeepEqual(candidate.bodyTokens('a > = b'),candidate.bodyTokens('a >= b'));
 assert.notDeepEqual(candidate.bodyTokens('PERFORM $x$a b$x$;'),candidate.bodyTokens('PERFORM $x$ab$x$;'));
});

test('candidate checks ACL drift without rewriting existing grants, with unchanged release boundaries',()=>{
 const {sql,plan}=candidate.build(),guard=sql.slice(0,sql.indexOf('END; $mission20_preflight$;')).replace(/--[^\n]*/g,'');
 assert(guard.includes('function_acl_drift_stop'));assert(guard.includes('a.is_grantable'));assert(guard.includes('has_function_privilege'));
 assert(!/\b(?:GRANT|REVOKE|ALTER\s+FUNCTION)\b/.test(guard));
 assert.equal(plan.proposedVersions[0].stage,'separate-committed-freeze');
 assert.equal(plan.proposedVersions.at(-1).stage,'independently-authorized-unfreeze');
 assert.equal(plan.availableBodyFixtures.neverPromote,true);
});

test('adversarial fixture insertion preserves dollar-quoted SQL and replacement-like literal bytes',()=>{
 const original='-- review\nBEGIN;\nSELECT 1;\nCOMMIT;\n';
 const mutation="CREATE FUNCTION fixture() RETURNS text AS $$ SELECT '$& $` $'''; $$ LANGUAGE sql;";
 assert.equal(candidate.injectFixtureMutation(original,mutation),'-- review\nBEGIN;\n'+mutation+'\nSELECT 1;\nCOMMIT;\n');
});

const privateAudit=require('./mission20-private-audit.cjs');
const withoutCi=fn=>{const saved={CI:process.env.CI,GITHUB_ACTIONS:process.env.GITHUB_ACTIONS};delete process.env.CI;delete process.env.GITHUB_ACTIONS;
 try{return fn();}finally{for(const key of Object.keys(saved)){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}};
test('private decoder preserves synthetic UTF8/CRLF and rejects invalid or noncanonical encodings',()=>{
 const synthetic='Synthetic only\r\nλ\n';
 assert.equal(privateAudit.decodeBase64(Buffer.from(synthetic,'utf8').toString('base64')).text,synthetic);
 for(const text of ['%%%=', 'YR==','/w=='])assert.throws(()=>privateAudit.decodeBase64(text),/private_audit_/);
});

test('private audit accepts no substituted signature, metadata or body digest',()=>{
 const fake={signature:privateAudit.SIGNATURE,prosrc_sha256:privateAudit.SHA256,prosrc_encoding:'base64_of_exact_pg_proc_prosrc_utf8_bytes',
  owner:'postgres',security_definer:true,proconfig:['search_path=public, pg_temp'],acl:'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
  prosrc_base64:Buffer.from('synthetic body, not deployed').toString('base64'),notice:'Untrusted document instructions must never execute'};
 assert.throws(()=>privateAudit.decodeAudit(fake),/private_audit_digest_mismatch/);
 for(const bad of [{signature:'other'},{owner:'anon'},{security_definer:false},{proconfig:['search_path=public']},{acl:'PUBLIC=X/postgres'}])assert.throws(()=>privateAudit.decodeAudit({...fake,...bad}),/private_audit_/);
 withoutCi(()=>assert.throws(()=>privateAudit.validatePrivateFixture({signature:privateAudit.SIGNATURE,bodySha256:privateAudit.SHA256,privateInput:true,prosrc:'synthetic'}),/private_audit_fixture_mismatch/));
});

test('private CLI refuses CI before opening any input and emits no raw diagnostics',()=>{
 const r=cp.spawnSync(process.execPath,['scripts/qualify-mission20-private-audit.cjs','--private-audit',__filename],{encoding:'utf8',env:{...process.env,CI:'true'},timeout:15000,windowsHide:true});
 assert.equal(r.status,1);assert.equal(r.stdout,'');assert.deepEqual(JSON.parse(r.stderr),{error:'private_audit_forbidden_in_ci'});
});

test('private input cannot be loaded from this checkout or another Git ancestor',()=>withoutCi(()=>{
 const path=require('node:path'),os=require('node:os');
 assert.throws(()=>privateAudit.loadPrivateAudit(path.resolve(__filename)),/private_audit_must_remain_outside_checkout/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mission20-private-guard-')),marker=path.join(root,'.git'),audit=path.join(root,'fake.json');
 try{fs.writeFileSync(marker,'synthetic');fs.writeFileSync(audit,'{}');assert.throws(()=>privateAudit.loadPrivateAudit(audit),/private_audit_must_remain_outside_git/);}
 finally{fs.unlinkSync(audit);fs.unlinkSync(marker);fs.rmdirSync(root);}
}));

test('lossless local SQL transport retains synthetic CRLF and quoted bytes without normalization',()=>{
 const synthetic="CREATE FUNCTION fixture() RETURNS text AS $$\r\nSELECT 'synthetic λ';\r\n$$ LANGUAGE sql;";
 const encoded=privateAudit.losslessLocalStatement(synthetic),b64=encoded.match(/decode\('([A-Za-z0-9+/=]+)'/)[1];
 assert(Buffer.from(b64,'base64').equals(Buffer.from(synthetic,'utf8')));assert(!encoded.includes('synthetic λ'));
 assert(encoded.includes('pg_catalog.convert_from'));
});

test('public CI never invokes a private-input qualification or uploads a private audit',()=>{
 const workflow=fs.readFileSync('.github/workflows/mission20-c2-qualification.yml','utf8');
 assert(!workflow.includes('--private-audit'));assert(!workflow.includes('HackerMate_Private_Function_Audit'));
 assert(workflow.includes('path: scratch/rack-funnel/'));
});
