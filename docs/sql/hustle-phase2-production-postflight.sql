-- READ ONLY. For AFTER a future separately authorized migration only.
-- This file does not apply a migration or query participant/team rows.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT n.nspname||'.'||c.relname AS relation_name,
       pg_get_userbyid(c.relowner)='postgres' AS must_have_trusted_owner,
       c.relrowsecurity AS must_enable_rls,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('hustle_phase2_batches','hustle_phase2_teams','hustle_phase2_invites',
 'hustle_phase2_audit','hustle_phase2_limits') ORDER BY c.relname;
-- Require exactly five rows, all owner/RLS checks true.
SELECT p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner)='postgres' AS must_have_trusted_owner,
       p.proconfig=ARRAY['search_path=""'] AS must_lock_search_path,
       p.prosecdef=(p.proname IN ('hustle_phase2_authorized','hustle_phase2_snapshot')) AS must_match_security_mode,
       has_function_privilege('authenticated',p.oid,'EXECUTE')=(p.proname='hustle_phase2_snapshot') AS must_match_browser_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE')=(p.proname<>'hustle_phase2_snapshot') AS must_match_service_execute,
       NOT has_function_privilege('anon',p.oid,'EXECUTE') AS must_deny_anon,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'hustle_phase2_%' ORDER BY p.proname;
-- Require exactly ten expected signatures, all checks true; inspect ACL for no
-- PUBLIC or unexpected role grants. No extra overload/signature is accepted.
SELECT p.oid::regprocedure AS signature,
       NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee NOT IN (p.proowner,
         CASE WHEN p.proname='hustle_phase2_snapshot' THEN 'authenticated'::regrole::oid ELSE 'service_role'::regrole::oid END)) AS must_have_only_expected_execute_roles
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'hustle_phase2_%';
SELECT r AS role_name,t AS relation_name,
       NOT has_any_column_privilege(r,'public.'||t,'SELECT') AS must_deny_raw_select,
       NOT has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS must_deny_raw_writes
FROM unnest(ARRAY['anon','authenticated']) r CROSS JOIN
 unnest(ARRAY['hustle_phase2_batches','hustle_phase2_teams','hustle_phase2_invites','hustle_phase2_audit','hustle_phase2_limits']) t;
SELECT count(*)=0 AS must_have_no_browser_raw_policies FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('hustle_phase2_batches','hustle_phase2_teams','hustle_phase2_invites','hustle_phase2_audit','hustle_phase2_limits');
SELECT NOT has_table_privilege('service_role','public.hustle_phase2_audit','UPDATE,DELETE,TRUNCATE') AS must_keep_audit_append_only,
 NOT has_column_privilege('service_role','auth.users','id','SELECT') AS must_preserve_auth_id_denial,
 NOT has_column_privilege('service_role','auth.users','email','SELECT') AS must_preserve_auth_email_denial,
 NOT has_function_privilege('service_role','public.has_partner_admin_access()','EXECUTE') AS must_preserve_admin_predicate_denial,
 NOT has_function_privilege('service_role','public.can_access_partner_event(uuid)','EXECUTE') AS must_preserve_event_predicate_denial;
SELECT version,name FROM supabase_migrations.schema_migrations WHERE version='20261018082156';
-- Require one reviewed ledger entry and verify its canonical content/checksum
-- through the approved runner's evidence. Raw psql does not record history.
ROLLBACK;
