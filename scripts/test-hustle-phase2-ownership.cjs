/* eslint-disable @typescript-eslint/no-require-imports -- Exact migration, nonsuperuser ownership, disposable PostgreSQL only. */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {createFixture,installClock,ROOT,IDS,quote}=require('./hustle-phase2-local-db.cjs');
(async()=>{const db=await createFixture();let checks=0;const check=(v,label)=>{assert(v,label);checks++;};try{
 check(db.sql("SELECT current_setting('hm.fixture_only')='hustle-phase2' AND inet_server_addr()='127.0.0.1'::inet")==='t','owned disposable loopback only');
 for(const signature of ['authorized(uuid,boolean)','window(timestamptz)','import(uuid,text,jsonb)','activate(uuid,uuid,text)','invite(uuid,uuid,text)','revoke(uuid,uuid)','inspect(text)','respond(text,text)','snapshot()','limit(text,integer)'])db.sql('DROP FUNCTION public.hustle_phase2_'+signature);
 db.sql('DROP TABLE public.hustle_phase2_audit,public.hustle_phase2_invites,public.hustle_phase2_teams,public.hustle_phase2_batches,public.hustle_phase2_limits');
 db.sql("CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE supabase_auth_admin NOLOGIN NOSUPERUSER; ALTER SCHEMA auth OWNER TO supabase_auth_admin; ALTER TABLE auth.users OWNER TO supabase_auth_admin; ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA auth TO postgres; GRANT SELECT(id,email),REFERENCES(id) ON auth.users TO postgres; GRANT USAGE,CREATE ON SCHEMA public TO postgres; ALTER TABLE public.profiles OWNER TO postgres; ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.hackathons OWNER TO postgres; ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY; ALTER TABLE public.event_organizers OWNER TO postgres; ALTER FUNCTION public.has_partner_admin_access() OWNER TO postgres; ALTER FUNCTION public.can_access_partner_event(uuid) OWNER TO postgres;");
 // Minimal catalog additions needed to syntax-check the metadata-only operator
 // scripts. This is not a claim of hosted Auth/PostgREST equivalence.
 db.sql("CREATE ROLE authenticator NOLOGIN NOINHERIT; GRANT authenticated,service_role TO authenticator; ALTER TABLE auth.users ALTER COLUMN email TYPE varchar(255); ALTER TABLE public.hackathons ALTER COLUMN type TYPE varchar(50); ALTER TABLE public.hackathons ADD COLUMN status text DEFAULT 'approved'; ALTER TABLE public.hackathons ADD COLUMN archived boolean NOT NULL DEFAULT false; GRANT SELECT(id,role,is_banned) ON public.profiles TO authenticated; GRANT SELECT(id) ON public.hackathons TO authenticated; CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[],created_by text,idempotency_key text,rollback text[]);");
 check(db.sql(fs.readFileSync(path.join(ROOT,'docs/sql/hustle-phase2-production-preflight.sql'),'utf8')).endsWith('ROLLBACK'),'read-only preflight parses on synthetic baseline and ends rollback');
 const migration=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261018082156_hustle_phase2_shortlist.sql'),'utf8');
 db.sql('SET ROLE postgres;\n'+migration);
 // History here is synthetic test metadata; the release runbook separately
 // requires the approved versioned runner to record history atomically.
 db.sql("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('20261018082156','hustle_phase2_shortlist')");
 check(db.sql(fs.readFileSync(path.join(ROOT,'docs/sql/hustle-phase2-production-postflight.sql'),'utf8')).endsWith('ROLLBACK'),'read-only postflight parses after local migration');
 check(db.sql("SELECT NOT rolsuper AND rolbypassrls FROM pg_roles WHERE rolname='postgres'")==='t','migration owner is not superuser');
 check(db.sql("SELECT count(*)=10 AND bool_and(pg_get_userbyid(proowner)='postgres') FROM pg_proc WHERE proname LIKE 'hustle_phase2_%'")==='t','all ten functions owned by trusted postgres');
 check(db.sql("SELECT count(*)=5 AND bool_and(pg_get_userbyid(relowner)='postgres' AND relrowsecurity) FROM pg_class WHERE relname LIKE 'hustle_phase2_%' AND relkind='r'")==='t','all five tables owned by postgres with RLS');
 for(const column of ['id','email'])check(db.sql("SELECT NOT has_column_privilege('service_role','auth.users',"+quote(column)+",'SELECT')")==='t','service identity SELECT remains denied');
 for(const name of ['authorized','snapshot'])check(db.sql("SELECT prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE proname='hustle_phase2_"+name+"'")==='t','definer path locked');
 for(const signature of ['has_partner_admin_access()','can_access_partner_event(uuid)'])check(db.sql("SELECT NOT has_function_privilege('service_role','public."+signature+"','EXECUTE')")==='t','existing predicate ACL unchanged');
 const service=q=>db.sql('SET ROLE service_role; '+q).split(/\r?\n/).at(-1);
 const user=(id,q)=>db.sql('SET ROLE authenticated; SET request.jwt.claim.sub='+quote(id)+'; '+q).split(/\r?\n/).at(-1);
 const denied=q=>{assert.throws(()=>db.sql(q),/Access denied|permission denied/);checks++;};
 installClock(db);
 const rows=[1,2].map(n=>({external_team_id:'OWNER-'+n,team_name:'Synthetic owner team '+n,leader_name:'Fixture '+n,leader_email:'owner'+n+'@example.invalid',leader_whatsapp:null,second_member_name:n===2?'Fixture second':null}));
 const digest='d'.repeat(64);const imported=JSON.parse(service('SELECT public.hustle_phase2_import('+quote(IDS.admin)+','+quote(digest)+','+quote(JSON.stringify(rows))+')'));
 check(imported.imported===2&&!imported.active,'actual invoker import succeeds through owned helper');
 const snap=JSON.parse(user(IDS.organizer,'SELECT public.hustle_phase2_snapshot()'));check(snap.counts.shortlisted===2,'caller JWT snapshot definer can read exact-event roster');
 check(JSON.parse(service('SELECT public.hustle_phase2_activate('+quote(IDS.admin)+','+quote(imported.batchId)+','+quote(digest)+')')).active===true,'admin activation');
 const team=snap.teams[0].id,hash='e'.repeat(64);
 check(service('SELECT public.hustle_phase2_invite('+quote(IDS.admin)+','+quote(team)+','+quote(hash)+')')==='t','admin invitation');
 check(service('SELECT public.hustle_phase2_revoke('+quote(IDS.admin)+','+quote(team)+')')==='t','admin revocation');
 for(const role of ['anon','authenticated'])denied('SET ROLE '+role+'; SELECT public.hustle_phase2_authorized('+quote(IDS.admin)+',true)');
 for(const id of [IDS.unrelated,IDS.banned,IDS.foreign])denied('SET ROLE authenticated; SET request.jwt.claim.sub='+quote(id)+'; SELECT public.hustle_phase2_snapshot()');
 check(db.sql("SELECT count(*) FROM hustle_phase2_audit")==='4','four administrator mutations audited under restricted service permissions');
 console.log('PASS: '+checks+' exact-migration nonsuperuser ownership and authorization checks; disposable PostgreSQL only.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
