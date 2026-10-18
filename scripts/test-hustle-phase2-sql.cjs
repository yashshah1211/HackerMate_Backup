/* eslint-disable @typescript-eslint/no-require-imports -- Real SQL against a disposable loopback fixture only. */
const assert=require('node:assert/strict');
const {createFixture,installClock,IDS,quote}=require('./hustle-phase2-local-db.cjs');
let checks=0;
const check=(value,label)=>{assert(value,label);checks++;};
async function main(){const db=await createFixture();try{
 const sql=db.sql;
 const service=q=>sql(`SET ROLE service_role; ${q}`).split('\n').at(-1);
 const user=(id,q)=>sql(`SET ROLE authenticated; SET request.jwt.claim.sub=${quote(id)}; ${q}`).split('\n').at(-1);
 const denied=(q,label)=>{assert.throws(()=>sql(q),/permission denied|Access denied/,label);checks++;};
 const tables=['batches','teams','invites','audit','limits'];
 for(const role of ['anon','authenticated'])for(const table of tables)for(const op of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
  check(sql(`SELECT NOT has_table_privilege('${role}','public.hustle_phase2_${table}','${op}')`)==='t',`${role} ${table} ${op} denied`);
 }
 check(sql("SELECT count(*)=5 FROM pg_class WHERE relname LIKE 'hustle_phase2_%' AND relkind='r' AND relrowsecurity")==='t','RLS on every table');
 for(const name of ['authorized','import','activate','invite','revoke','inspect','respond','limit','window'])check(sql(`SELECT NOT has_function_privilege('authenticated',oid,'execute') AND NOT has_function_privilege('anon',oid,'execute') FROM pg_proc WHERE proname='hustle_phase2_${name}'`)==='t',`private ${name} RPC`);
 denied("SET ROLE anon; SELECT public.hustle_phase2_snapshot()",'anon snapshot');
 for(const id of [IDS.unrelated,IDS.banned,IDS.foreign])denied(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; SELECT public.hustle_phase2_snapshot()`,'unrelated/banned/foreign snapshot');
 for(const id of [IDS.organizer,IDS.admin])check(JSON.parse(user(id,'SELECT public.hustle_phase2_snapshot()')).counts.shortlisted===0,'authorized empty snapshot');
 denied(`SET ROLE authenticated; SELECT public.hustle_phase2_import('${IDS.admin}','${'a'.repeat(64)}','[]')`,'forged admin RPC');
 denied(`SET ROLE service_role; SELECT public.hustle_phase2_import('${IDS.organizer}','${'a'.repeat(64)}','[]')`,'organizer cannot import');
 sql(`UPDATE profiles SET is_banned=true WHERE id='${IDS.admin}'`);
 denied(`SET ROLE service_role; SELECT public.hustle_phase2_import('${IDS.admin}','${'a'.repeat(64)}','[]')`,'banned admin import');
 sql(`UPDATE profiles SET is_banned=false WHERE id='${IDS.admin}'`);
 const row=n=>({external_team_id:'SYNTH-'+n,team_name:'Synthetic team '+n,leader_name:'Fixture Leader '+n,leader_email:'leader'+n+'@example.invalid',leader_whatsapp:null,second_member_name:n%2?'Fixture Member '+n:null});
 const imported=JSON.parse(service(`SELECT public.hustle_phase2_import('${IDS.admin}','${'a'.repeat(64)}',${quote(JSON.stringify([row(1),row(2),row(3),row(4)]))})`));
 check(imported.imported===4&&!imported.active,'import inactive 1–2 person teams');
 const teams=JSON.parse(user(IDS.admin,'SELECT public.hustle_phase2_snapshot()')).teams;
 const team=n=>teams.find(t=>t.external_team_id==='SYNTH-'+n).id;
 assert.throws(()=>service(`SELECT public.hustle_phase2_import('${IDS.admin}','${'b'.repeat(64)}',${quote(JSON.stringify([row(5),row(1)]))})`),/duplicate key/);checks++;
 check(sql('SELECT count(*) FROM hustle_phase2_batches')==='1'&&sql('SELECT count(*) FROM hustle_phase2_teams')==='4','whole conflict import rolled back');
 assert.throws(()=>sql(`UPDATE hustle_phase2_teams SET event_id='10000000-0000-4000-8000-000000000099' WHERE id='${team(1)}'`),/check constraint/);checks++;
 assert.throws(()=>service(`SELECT public.hustle_phase2_invite('${IDS.admin}','${team(1)}','${'1'.repeat(64)}')`),/Team not eligible/);checks++;
 for(const [time,state] of [['2026-10-23T04:29:59.999Z','before'],['2026-10-23T04:30:00Z','open'],['2026-10-23T17:29:59.999Z','open'],['2026-10-23T17:30:00Z','closed']])check(service(`SELECT public.hustle_phase2_window('${time}')`)===state,'IST cutoff '+time);
 installClock(db);
 assert.throws(()=>service(`SELECT public.hustle_phase2_activate('${IDS.admin}','${imported.batchId}','${'b'.repeat(64)}')`),/Batch not ready/);checks++;
 service(`SELECT public.hustle_phase2_activate('${IDS.admin}','${imported.batchId}','${'a'.repeat(64)}')`);
 service(`SELECT public.hustle_phase2_activate('${IDS.admin}','${imported.batchId}','${'a'.repeat(64)}')`);
 check(sql("SELECT count(*) FROM hustle_phase2_audit WHERE action='activate'")==='1','activation idempotent');
 for(let n=1;n<=4;n++)service(`SELECT public.hustle_phase2_invite('${IDS.admin}','${team(n)}','${String(n).repeat(64)}')`);
 assert.throws(()=>service(`SELECT public.hustle_phase2_invite('${IDS.admin}','${team(1)}','${'9'.repeat(64)}')`),/Revoke/);checks++;
 const inspection=JSON.parse(service(`SELECT public.hustle_phase2_inspect('${'1'.repeat(64)}')`));
 check(Object.keys(inspection).sort().join(',')==='decision,leader_name,second_member_name,team_name,window','leader projection excludes contacts/hash');
 check(service(`SELECT public.hustle_phase2_inspect('${'f'.repeat(64)}') IS NULL`)==='t','unknown token no data');
 const respond=(hash,decision)=>JSON.parse(service(`SELECT public.hustle_phase2_respond('${hash}',${quote(decision)})`));
 sql("UPDATE fixture_clock SET value='2026-10-23T04:29:59.999Z'");check(respond('1'.repeat(64),'confirmed').status==='closed','before opening denied');
 sql("UPDATE fixture_clock SET value='2026-10-23T04:30:00Z'");check(respond('1'.repeat(64),'confirmed').status==='ok','exact opening accepted');
 check(respond('1'.repeat(64),'confirmed').status==='ok','same replay idempotent');check(respond('1'.repeat(64),'declined').status==='conflict','conflicting replay denied');
 service(`SELECT public.hustle_phase2_revoke('${IDS.admin}','${team(2)}')`);check(respond('2'.repeat(64),'confirmed').status==='invalid','revoked token denied');
 service(`SELECT public.hustle_phase2_invite('${IDS.admin}','${team(2)}','${'a'.repeat(64)}')`);check(respond('2'.repeat(64),'confirmed').status==='invalid','rotated old token denied');check(respond('a'.repeat(64),'declined').status==='ok','decline recorded');
 // Competing processes, not a mocked transaction or Promise around synchronous calls.
 const race=await Promise.all(Array.from({length:12},(_,n)=>db.asyncSql(`SET ROLE service_role; SELECT public.hustle_phase2_respond('${'3'.repeat(64)}','${n%2?'confirmed':'declined'}')`)));
 const results=race.map(v=>JSON.parse(v.split('\n').at(-1)));check(new Set(results.filter(v=>v.status==='ok').map(v=>v.decision)).size===1,'one authoritative race winner');
 check(sql(`SELECT count(*) FROM hustle_phase2_audit WHERE team_id='${team(3)}' AND action IN ('confirmed','declined')`)==='1','exactly one race audit');
 sql("UPDATE fixture_clock SET value='2026-10-23T17:29:59Z'");
 const lock=db.asyncSql(`BEGIN; SELECT id FROM hustle_phase2_teams WHERE id='${team(4)}' FOR UPDATE; SELECT pg_sleep(3); COMMIT;`);
 for(let n=0;n<100;n++){if(sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'SELECT pg_sleep(3)%' AND state='active'")!=='0')break;await new Promise(r=>setTimeout(r,20));}
 const late=db.asyncSql(`SET ROLE service_role; SELECT public.hustle_phase2_respond('${'4'.repeat(64)}','confirmed')`);
 for(let n=0;n<100;n++){if(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%hustle_phase2_respond%'")!=='0')break;await new Promise(r=>setTimeout(r,20));}
 sql("UPDATE fixture_clock SET value='2026-10-23T17:30:00Z'");await lock;
 check(JSON.parse((await late).split('\n').at(-1)).status!=='ok','request waiting across deadline denied');check(sql(`SELECT decision FROM hustle_phase2_teams WHERE id='${team(4)}'`)==='pending','late request did not mutate');
 check(respond('1'.repeat(64),'confirmed').status==='invalid','expired invitation denied even on replay');
 sql(`DELETE FROM event_organizers WHERE user_id='${IDS.organizer}'`);denied(`SET ROLE authenticated; SET request.jwt.claim.sub='${IDS.organizer}'; SELECT public.hustle_phase2_snapshot()`,'revoked organizer immediately denied');
 check(service("SELECT public.hustle_phase2_limit('test',1)")==='t'&&service("SELECT public.hustle_phase2_limit('test',1)")==='f','database rate limit enforced');
 check(sql("SELECT NOT has_table_privilege('service_role','hustle_phase2_audit','UPDATE') AND NOT has_table_privilege('service_role','hustle_phase2_audit','DELETE')")==='t','append-only service audit');
 // Defense in depth: even an accidental SELECT grant does not reveal raw rows.
 sql('GRANT SELECT ON hustle_phase2_teams TO authenticated');check(user(IDS.admin,'SELECT count(*) FROM hustle_phase2_teams')==='0','RLS default-denies even admin raw access');sql('REVOKE SELECT ON hustle_phase2_teams FROM authenticated');
 console.log(`PASS: ${checks} real PostgreSQL authorization, grants/RLS, state, deadline and concurrency checks.`);
}finally{await db.close();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
