-- READ ONLY. Run against the separately verified intended project before a
-- future authorized migration. Contains no DDL/DML, account lookup or secret.
-- Every must_* boolean must be true; null is NOT a pass. Save metadata only.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';

SELECT current_database() AS database_name, current_user AS inspection_role,
       current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS must_be_on;

SELECT rolname, rolsuper, rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname IN ('postgres','supabase_auth_admin','anon','authenticated','service_role','authenticator')
ORDER BY rolname;
-- Expect postgres NOSUPERUSER/BYPASSRLS; service_role NOSUPERUSER/BYPASSRLS;
-- anon/authenticated NOSUPERUSER/NOBYPASSRLS. All named roles must exist.
SELECT
 EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres' AND NOT rolsuper AND rolbypassrls) AS must_trust_postgres_owner,
 NOT pg_has_role('anon','service_role','MEMBER') AS must_deny_anon_service_membership,
 NOT pg_has_role('authenticated','service_role','MEMBER') AS must_deny_browser_service_membership,
 pg_has_role('authenticator','authenticated','MEMBER') AS must_allow_authenticated_switch,
 pg_has_role('authenticator','service_role','MEMBER') AS must_allow_service_switch;

SELECT
 has_schema_privilege('postgres','public','USAGE') AS must_owner_use_public,
 has_schema_privilege('postgres','public','CREATE') AS must_owner_create_public,
 has_schema_privilege('postgres','auth','USAGE') AS must_owner_use_auth,
 has_column_privilege('postgres','auth.users','id','SELECT') AS must_owner_read_auth_id,
 has_column_privilege('postgres','auth.users','email','SELECT') AS must_owner_read_auth_email,
 has_column_privilege('postgres','auth.users','id','REFERENCES') AS must_owner_reference_auth,
 has_column_privilege('postgres','public.hackathons','id','REFERENCES') AS must_owner_reference_event,
 has_column_privilege('postgres','public.profiles','id','SELECT') AS must_owner_read_profile_id,
 has_column_privilege('postgres','public.profiles','role','SELECT') AS must_owner_read_profile_role,
 has_column_privilege('postgres','public.profiles','is_banned','SELECT') AS must_owner_read_profile_ban,
 has_schema_privilege('authenticated','public','USAGE') AS must_browser_use_public,
 has_schema_privilege('service_role','public','USAGE') AS must_service_use_public,
 NOT has_schema_privilege('anon','public','CREATE') AS must_deny_anon_schema_create,
 NOT has_schema_privilege('authenticated','public','CREATE') AS must_deny_browser_schema_create;

SELECT
 NOT has_column_privilege('service_role','auth.users','id','SELECT') AS must_preserve_auth_id_denial,
 NOT has_column_privilege('service_role','auth.users','email','SELECT') AS must_preserve_auth_email_denial,
 has_column_privilege('service_role','public.profiles','id','SELECT') AS must_service_read_profile_id,
 has_column_privilege('service_role','public.profiles','role','SELECT') AS must_service_read_profile_role,
 has_column_privilege('service_role','public.profiles','is_banned','SELECT') AS must_service_read_profile_ban,
 has_column_privilege('authenticated','public.profiles','role','SELECT') AS must_caller_read_role,
 has_column_privilege('authenticated','public.profiles','is_banned','SELECT') AS must_caller_read_ban,
 has_column_privilege('authenticated','public.hackathons','id','SELECT') AS must_caller_read_event;

WITH expected(relation_name,column_name,type_name) AS (VALUES
 ('auth.users','id','uuid'),('auth.users','email','character varying(255)'),
 ('public.profiles','id','uuid'),('public.profiles','role','text'),
 ('public.profiles','is_banned','boolean'),('public.hackathons','id','uuid'),
 ('public.hackathons','type','character varying(50)'),('public.hackathons','organizer_id','uuid'),
 ('public.event_organizers','hackathon_id','uuid'),('public.event_organizers','user_id','uuid'))
SELECT e.*, a.attnotnull,
       coalesce(format_type(a.atttypid,a.atttypmod)=e.type_name,false) AS must_match_column_type
FROM expected e LEFT JOIN pg_attribute a
 ON a.attrelid=to_regclass(e.relation_name) AND a.attname=e.column_name
 AND a.attnum>0 AND NOT a.attisdropped
ORDER BY relation_name,column_name;

SELECT n.nspname||'.'||c.relname AS relation_name,
       pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.oid IN ('auth.users'::regclass,'public.profiles'::regclass,
 'public.hackathons'::regclass,'public.event_organizers'::regclass)
ORDER BY relation_name;
-- auth.users owner supabase_auth_admin, other three postgres; RLS enabled.

SELECT relation_name,
 EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a
 ON a.attrelid=c.conrelid AND a.attname='id'
 WHERE c.conrelid=relation_name::regclass AND c.contype IN ('p','u')
 AND c.conkey=ARRAY[a.attnum]::smallint[]) AS must_have_unique_id
FROM unnest(ARRAY['auth.users','public.hackathons']) relation_name;

WITH expected(signature) AS (VALUES
 ('public.has_partner_admin_access()'),('public.can_access_partner_event(uuid)'))
SELECT e.signature,p.oid IS NOT NULL AS must_exist,
       pg_get_userbyid(p.proowner)='postgres' AS must_have_trusted_owner,
       p.prosecdef AS must_be_definer,p.proconfig,p.proacl,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS must_allow_authenticated,
       NOT has_function_privilege('service_role',p.oid,'EXECUTE') AS must_deny_service,
       NOT has_function_privilege('anon',p.oid,'EXECUTE') AS must_deny_anon,
       pg_get_functiondef(p.oid) AS review_current_definition
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
-- Review exact founder/admin, ban, auth.uid and event-assignment semantics.
-- Do not execute these predicates as service_role or grant it their EXECUTE.

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('profiles','hackathons','event_organizers')
ORDER BY tablename,policyname;
SELECT tgname,pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal;
-- Review protected role/ban writes and caller-profile/event SELECT behavior;
-- presence of a policy/trigger alone is not an end-to-end authorization test.

SELECT EXISTS(SELECT 1 FROM public.hackathons
 WHERE id='0da43cba-90dc-449c-a126-a2fc8be8a379'
 AND type='external' AND status='approved' AND archived IS FALSE) AS must_have_expected_event;
-- Only public event metadata is examined; no registrations or accounts read.

SELECT name,to_regclass('public.'||name) IS NULL AS must_be_absent
FROM unnest(ARRAY['hustle_phase2_batches','hustle_phase2_teams',
 'hustle_phase2_invites','hustle_phase2_audit','hustle_phase2_limits']) name;
SELECT count(*)=0 AS must_have_no_phase2_functions
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'hustle_phase2_%';
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
 WHERE version='20261018082156') AS must_have_unapplied_version;
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;
SELECT column_name,data_type FROM information_schema.columns
WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'
ORDER BY ordinal_position;

SELECT current_setting('pgrst.db_schemas',true) AS inspect_if_available;
-- NULL is unknown: independently verify Data API exposure/cache and real JWT
-- routing, actual runtime keys, OAuth callbacks, backups and operator accounts.
-- STOP on a failed/missing check. Never auto-repair by widening auth grants.
ROLLBACK;
