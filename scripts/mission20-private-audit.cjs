/* eslint-disable @typescript-eslint/no-require-imports -- Local private input only; no network or SQL execution. */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {definition,body,bodyTokens}=require('./mission20-atomic-candidate.cjs');
const ROOT=path.resolve(__dirname,'..');
const SIGNATURE='public.ensure_team_conversation(uuid)',SHA256='9ad2c3551805a161decbae3b842f4ac7356b1dc250f81718fadfd6f7db60464b';
const fail=code=>{throw Error(code);};
function requireLocal(){if(process.env.CI!==undefined||process.env.GITHUB_ACTIONS!==undefined)fail('private_audit_forbidden_in_ci');}
function decodeBase64(value){
 if(typeof value!=='string'||value.length>100000||!value.length||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail('private_audit_invalid_base64');
 const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value)fail('private_audit_noncanonical_base64');
 const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))fail('private_audit_invalid_utf8');
 return {bytes,text};
}
function decodeAudit(audit){
 if(!audit||audit.signature!==SIGNATURE||audit.prosrc_sha256!==SHA256||audit.prosrc_encoding!=='base64_of_exact_pg_proc_prosrc_utf8_bytes')fail('private_audit_identity_mismatch');
 if(audit.owner!=='postgres'||audit.security_definer!==true||JSON.stringify(audit.proconfig)!==JSON.stringify(['search_path=public, pg_temp'])||
  audit.acl!=='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')fail('private_audit_metadata_mismatch');
 const {bytes,text}=decodeBase64(audit.prosrc_base64);
 if(createHash('sha256').update(bytes).digest('hex')!==SHA256)fail('private_audit_digest_mismatch');
 const original=body(definition('supabase/migrations/202607070001_ensure_team_conversation.sql','public.ensure_team_conversation'));
 // Never attach private actual/expected values to an assertion or error.
 if(JSON.stringify(bodyTokens(text))!==JSON.stringify(bodyTokens(original))||
  JSON.stringify(text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))!==JSON.stringify(original.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)))fail('private_audit_logic_mismatch');
 return Object.freeze({signature:SIGNATURE,bodySha256:SHA256,prosrc:text,byteLength:bytes.length,privateInput:true});
}
function validatePrivateFixture(value){
 requireLocal();
 if(value?.signature!==SIGNATURE||value.bodySha256!==SHA256||value.privateInput!==true||typeof value.prosrc!=='string'||
  createHash('sha256').update(Buffer.from(value.prosrc,'utf8')).digest('hex')!==SHA256)fail('private_audit_fixture_mismatch');
 return value;
}
// Private statements go directly to local psql stdin, never a script file.
// Server-side decoding preserves CRLF inside dollar-quoted function bodies;
// plaintext psql input can otherwise normalize those bytes before libpq sends it.
const losslessLocalStatement=statement=>`DO $private_audit_load$ BEGIN EXECUTE pg_catalog.convert_from(pg_catalog.decode('${Buffer.from(statement,'utf8').toString('base64')}','base64'),'UTF8'); END; $private_audit_load$;`;
function loadPrivateAudit(file){
 requireLocal();
 if(typeof file!=='string'||!path.isAbsolute(file))fail('private_audit_absolute_path_required');
 const real=fs.realpathSync(file),rel=path.relative(ROOT,real);
 if(!(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)))fail('private_audit_must_remain_outside_checkout');
 for(let folder=path.dirname(real);;){if(fs.existsSync(path.join(folder,'.git')))fail('private_audit_must_remain_outside_git');const parent=path.dirname(folder);if(parent===folder)break;folder=parent;}
 if(fs.statSync(real).size>1000000)fail('private_audit_file_too_large');
 return decodeAudit(JSON.parse(fs.readFileSync(real,'utf8').replace(/^\uFEFF/,'')));
}
module.exports={loadPrivateAudit,validatePrivateFixture,decodeAudit,decodeBase64,requireLocal,losslessLocalStatement,SIGNATURE,SHA256};
