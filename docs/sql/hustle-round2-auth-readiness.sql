-- READ ONLY: proposed security-remediation preflight/postflight, NOT execution.
-- Operator independently verifies dashboard project ref rhryjrbebfrrfhtyyzbs.
-- Inspect every row. Before: 139 ledger rows, new version/helper absent, 10 RPCs.
-- After: 140 ledger rows, new version once, helper present, 11 RPCs.
-- Never infer project identity from current_database() = postgres alone.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT current_database() AS database_name, current_user AS inspector,
 current_setting('server_version') AS postgres_version,
 current_setting('transaction_read_only') AS read_only,
 current_setting('supabase.project_ref',true) AS project_ref_if_available,
 (SELECT NOT rolsuper AND rolbypassrls FROM pg_roles WHERE rolname='postgres') AS trusted_owner_mode;

SELECT count(*) AS ledger_entries,
 count(*) FILTER(WHERE version='20261018082156') AS original_version_entries,
 count(*) FILTER(WHERE version='20261018174144') AS remediation_version_entries
FROM supabase_migrations.schema_migrations;
SELECT version,name,cardinality(statements) AS statement_elements,
 encode(sha256(convert_to(replace(array_to_string(statements,E'\n'),E'\r\n',E'\n'),'UTF8')),'hex') AS canonical_source_sha256
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261018082156','20261018174144') ORDER BY version;

SELECT has_schema_privilege('postgres','auth','USAGE') AS owner_auth_usage,
 has_column_privilege('postgres','auth.sessions','id','SELECT') AS owner_session_id,
 has_column_privilege('postgres','auth.sessions','user_id','SELECT') AS owner_session_user,
 has_column_privilege('postgres','auth.sessions','not_after','SELECT') AS owner_session_expiry;
SELECT r AS role_name,
 NOT has_any_column_privilege(r,'auth.sessions','SELECT') AS no_session_rows,
 NOT has_column_privilege(r,'auth.users','id','SELECT') AS no_auth_user_id,
 NOT has_column_privilege(r,'auth.users','email','SELECT') AS no_auth_email
FROM unnest(ARRAY['anon','authenticated','service_role']) r;

SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef,p.provolatile,p.proconfig,p.proacl,
 pg_get_functiondef(p.oid) AS reviewed_definition
FROM pg_proc p WHERE p.oid IN (to_regprocedure('public.is_admin(uuid)'),
 to_regprocedure('public.handle_profile_roles_update()'),
 to_regprocedure('public.hustle_phase2_snapshot()'),
 to_regprocedure('public.hustle_phase2_has_active_session()')) ORDER BY p.proname;

-- All checks true; 10 rows before, 11 after. Two read RPCs only after install.
SELECT p.oid::regprocedure AS signature,
 pg_get_userbyid(p.proowner)='postgres' AS trusted_owner,
 p.proconfig=ARRAY['search_path=""'] AS locked_path,
 p.prosecdef=(p.proname IN ('hustle_phase2_authorized','hustle_phase2_snapshot','hustle_phase2_has_active_session')) AS correct_security_mode,
 has_function_privilege('authenticated',p.oid,'EXECUTE')=(p.proname IN ('hustle_phase2_snapshot','hustle_phase2_has_active_session')) AS correct_browser_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE')=(p.proname NOT IN ('hustle_phase2_snapshot','hustle_phase2_has_active_session')) AS correct_service_execute,
 NOT has_function_privilege('anon',p.oid,'EXECUTE') AS denies_anon,
 NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE a.grantee NOT IN (p.proowner,CASE WHEN p.proname IN ('hustle_phase2_snapshot','hustle_phase2_has_active_session')
   THEN 'authenticated'::regrole::oid ELSE 'service_role'::regrole::oid END)) AS no_extra_grantees
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'hustle_phase2_%' ORDER BY p.proname;
SELECT count(*) AS table_count,
 bool_and(c.relrowsecurity AND pg_get_userbyid(c.relowner)='postgres') AS all_rls_trusted
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'hustle_phase2_%';
SELECT r AS role_name,t AS table_name,
 NOT has_any_column_privilege(r,'public.'||t,'SELECT') AS no_raw_select,
 NOT has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS no_raw_write
FROM unnest(ARRAY['anon','authenticated']) r CROSS JOIN
 unnest(ARRAY['hustle_phase2_batches','hustle_phase2_teams','hustle_phase2_invites','hustle_phase2_audit','hustle_phase2_limits']) t;

-- Compare this fingerprint before/after. Captures metadata only, no user rows.
-- Excludes only the two intentionally changed bodies and the one new helper.
-- Concurrent unrelated DDL can change it: STOP and investigate, never repair.
WITH objects AS (
 SELECT 'relation' AS kind,c.oid::regclass::text AS identity,
  jsonb_build_array(c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
   (SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,a.attacl) ORDER BY a.attnum)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) AS metadata
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v') AND (n.nspname='public' OR (n.nspname='auth' AND c.relname IN ('users','sessions')))
 UNION ALL
 SELECT 'function',p.oid::regprocedure::text,
  jsonb_build_array(p.proowner,p.proacl,CASE WHEN p.oid IN
   (to_regprocedure('public.is_admin(uuid)'),to_regprocedure('public.hustle_phase2_snapshot()'))
   THEN NULL ELSE pg_get_functiondef(p.oid) END)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.proname<>'hustle_phase2_has_active_session'
 UNION ALL
 SELECT 'policy',schemaname||'.'||tablename||'.'||policyname,to_jsonb(p)
 FROM pg_policies p WHERE schemaname='public'
 UNION ALL
 SELECT 'trigger',t.tgrelid::regclass::text||'.'||t.tgname,to_jsonb(pg_get_triggerdef(t.oid))
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal
)
SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(kind,identity,metadata)
 ORDER BY kind,identity)::text,'UTF8')),'hex') AS unchanged_metadata_fingerprint FROM objects;
ROLLBACK;
