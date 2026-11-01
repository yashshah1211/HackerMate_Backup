/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic review artifacts, never active migrations. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),DIR='docs/qa/mission20-c2/release/atomic';
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8').replace(/\r\n/g,'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
// Split only top-level semicolons. Preserve quoted literals, dollar bodies and
// comments byte-for-byte; no regex rewrite inside function bodies is allowed.
function statements(sql){
 let start=0,i=0,quote=null,block=0,line=false;const out=[];
 while(i<sql.length){
  const a=sql[i],b=sql[i+1];
  if(line){if(a==='\n')line=false;i++;continue;}
  if(block){if(a==='/'&&b==='*'){block++;i+=2;}else if(a==='*'&&b==='/'){block--;i+=2;}else i++;continue;}
  if(quote){if(sql.startsWith(quote,i)){if(quote.length===1&&sql[i+1]===quote){i+=2;continue;}i+=quote.length;quote=null;}else i++;continue;}
  if(a==='-'&&b==='-'){line=true;i+=2;continue;}
  if(a==='/'&&b==='*'){block=1;i+=2;continue;}
  if(a==="'"||a==='"'){quote=a;i++;continue;}
  if(a==='$'){const d=sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);if(d){quote=d[0];i+=quote.length;continue;}}
  if(a===';'){out.push(sql.slice(start,i+1));start=i+1;}i++;
 }
 assert(!quote&&!block,'unterminated SQL token');assert(!strip(sql.slice(start)).trim(),'unterminated statement');return out;
}
const strip=s=>s.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,'').trim();
function definition(file,name){
 const s=statements(read(file)).find(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION '+name.replaceAll('.','\\.')+'\\s*\\(','i').test(strip(s)));
 assert(s,name);return strip(s);
}
function body(def){const d=def.match(/\bAS\s+(\$(?:\w+)?\$)/i);assert(d);const start=d.index+d[0].length,end=def.indexOf(d[1],start);assert(end>start);return def.slice(start,end);}
const dependencies=[
 ['public.accept_team_invite(uuid)','supabase/migrations/202607020001_core_security.sql'],
 ['public.accept_team_join_request(uuid)','supabase/migrations/202607020001_core_security.sql'],
 ['public.ensure_team_conversation(uuid)','supabase/migrations/202607070001_ensure_team_conversation.sql'],
 ['public.delete_user_completely(uuid)','supabase/migrations/202610060001_restore_safe_user_deletion.sql'],
 ['public.add_user_to_team(uuid,uuid,text)','supabase/migrations/20260928100000_phase1a_definer_function_privileges.sql']
].map(([signature,file])=>({signature,file,bodySha256:hash(body(definition(file,signature.split('(')[0])))}));
function build(){
 const manifest=JSON.parse(read('docs/qa/mission20-c2/release/SQL-MANIFEST.json'));
 for(const f of manifest.files)assert.equal(hash(read(f.path)),f.sha256,f.path);
 const ids=['expand','per-team','writer-protocol','existing-writers','cancel'];
 const sources=ids.map(id=>manifest.files.find(f=>f.id===id));
 const chunks=sources.flatMap(f=>statements(read(f.path)).map(sql=>({sql,source:f.id})));
 const functionName=s=>strip(s).match(/^CREATE (?:OR REPLACE )?FUNCTION ([\w.]+)\s*\(/i)?.[1].toLowerCase();
 const last=new Map();for(const c of chunks){const n=functionName(c.sql);if(n)last.set(n,c);}
 const emitted=new Set(),selected=[],omitted=[];
 for(const c of chunks){
  const sql=strip(c.sql);if(/^(?:BEGIN|COMMIT);$/i.test(sql))continue;
  const name=functionName(c.sql);
  if(name==='mission20_private.transfer_members'){omitted.push({source:c.source,name,reason:'qualification-only maintenance prototype; no runtime caller'});continue;}
  if(name){if(emitted.has(name))continue;emitted.add(name);const final=last.get(name);
   selected.push({...final,sql:strip(final.sql)});continue;}
  // Remove only the excluded helper's entry in the shared REVOKE list.
  selected.push({...c,sql:sql.replace('mission20_private.transfer_members(jsonb),','')});
 }
 const preflight=`DO $mission20_preflight$\nDECLARE expected record; actual record;\nBEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::integer/10000<>17 THEN
  RAISE EXCEPTION 'reviewed_postgres17_owner_required'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read_committed_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations'
  AND policyname='mission20_release_freeze' AND permissive='RESTRICTIVE' AND cmd='INSERT' AND with_check='false')
  OR has_any_column_privilege('authenticated','public.hackathon_registrations','INSERT') THEN
  RAISE EXCEPTION 'separately_committed_freeze_and_revoked_insert_required'; END IF;
 IF to_regnamespace('mission20_private') IS NOT NULL THEN RAISE EXCEPTION 'mission20_namespace_drift_stop'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='start_date') IS DISTINCT FROM 'date'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='end_date') IS DISTINCT FROM 'date'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='registration_start') IS DISTINCT FROM 'timestamp with time zone'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='registration_end') IS DISTINCT FROM 'timestamp with time zone'
 OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.hackathons'::regclass AND attname='type') IS DISTINCT FROM 'character varying(50)' THEN
  RAISE EXCEPTION 'confirmed_event_column_types_required'; END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'reviewed_ledger_required'; END IF;
 -- The separately committed freeze is a future migration, so expansion sees
 -- baseline 147 + the freeze ledger entry. This candidate never writes it.
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>148 OR
 (SELECT max(version::text) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261102090000'
 OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text='20261025081515') THEN
  RAISE EXCEPTION 'migration_ledger_drift_stop'; END IF;
 FOR expected IN SELECT * FROM (VALUES
 ${dependencies.map(d=>`('${d.signature}','${d.bodySha256}')`).join(',\n ')}
 ) AS required(signature,sha256) LOOP
  SELECT p.*,pg_get_userbyid(p.proowner) AS owner INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
  IF NOT FOUND THEN RAISE EXCEPTION 'missing_baseline_function: %',expected.signature; END IF;
  IF actual.owner<>'postgres' OR NOT actual.prosecdef OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[] OR
   encode(sha256(convert_to(actual.prosrc,'UTF8')),'hex')<>expected.sha256 THEN
   RAISE EXCEPTION 'unreviewed_function_variant_stop: %',expected.signature; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.add_user_to_team(uuid,uuid,text)','EXECUTE') OR
 has_function_privilege('authenticated','public.add_user_to_team(uuid,uuid,text)','EXECUTE') OR
 has_function_privilege('service_role','public.add_user_to_team(uuid,uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'hardened_add_member_private_execute_required'; END IF;
END; $mission20_preflight$;`;
 const header='-- REVIEW ONLY. NOT AN ACTIVE MIGRATION. NO PRODUCTION EXECUTION AUTHORIZATION.\n'+
 '-- Deterministic final definitions only; separate committed freeze MUST precede this transaction.\n'+
 '-- Regenerate with node scripts/mission20-atomic-candidate.cjs --write; never run against an existing database.\n';
 const finalCheck=`DO $mission20_final$ BEGIN
 IF position('LOCK TABLE' in upper(pg_get_functiondef('mission20_private.lock_context(uuid,uuid,boolean,boolean,boolean)'::regprocedure)))>0
 OR position('NOWAIT' in pg_get_functiondef('mission20_private.lock_roster_parents()'::regprocedure))=0
 OR position('NOWAIT' in pg_get_functiondef('mission20_private.guard_registration_write()'::regprocedure))=0
 OR to_regprocedure('public.mission20_cancel_registration(uuid,uuid)') IS NULL
 OR to_regprocedure('mission20_private.transfer_members(jsonb)') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='mission20_release_freeze' AND schemaname='public' AND tablename='hackathon_registrations') THEN
  RAISE EXCEPTION 'atomic_final_protocol_required'; END IF;
END; $mission20_final$;`;
 const sql=header+"BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n"+preflight+'\n'+
 selected.map(c=>`\n-- Source stage: ${c.source}\n${c.sql}\n`).join('')+finalCheck+'\nCOMMIT;\n';
 assert(!/LOCK TABLE public\.team_members/.test(sql));
 const plan={status:'REVIEW_ONLY_NOT_ALLOCATED_NOT_AUTHORIZED',liveLedger:{count:147,latest:'20261025081515',evidence:'founder independent read-only audit; full ledger receipt not supplied'},
  expansionExpectedLedger:{count:148,latest:'20261102090000',reason:'147 baseline plus separately committed freeze migration; loader records it outside this candidate'},
  proposedVersions:[{version:'20261102090000',stage:'separate-committed-freeze',source:'freeze'},
   {version:'20261102090100',stage:'atomic-final-expansion',artifact:DIR+'/01-final-expansion.review.sql'},
   {version:'20261102090200',stage:'contract-after-adapters-and-last-freeze',source:'contract'},
   {version:'20261102090300',stage:'independently-authorized-unfreeze',source:'unfreeze'}],
  versionRule:'Tentative only. Re-query complete ledger and branch migration inventory at release; reserve/generate proper migration filenames only under separate authorization. No ledger write or repair here.',
  dependencies,sources,omitted,candidateSha256:hash(sql),freeze:'Existing 00, committed separately; pauses native AND external/official INSERT. Founder decision unresolved.',
  rollback:'Failed transaction rolls back only expansion; prior committed freeze remains. After commit preserve protocol and re-freeze; no destructive downgrade or vulnerable grant restoration.'};
 return {sql,plan};
}
if(require.main===module){const {sql,plan}=build();const outputs=[[DIR+'/01-final-expansion.review.sql',sql],[DIR+'/CANDIDATE-MANIFEST.json',JSON.stringify(plan,null,2)+'\n']];
 if(process.argv.includes('--write')){fs.mkdirSync(path.join(ROOT,DIR),{recursive:true});for(const [f,s] of outputs)fs.writeFileSync(path.join(ROOT,f),s);}
 else {assert(process.argv.includes('--check'));for(const [f,s] of outputs)assert.equal(read(f),s,f);console.log('Atomic candidate and manifest match source hashes and final-only selection.');}}
module.exports={build,statements,definition,body,dependencies,DIR};
