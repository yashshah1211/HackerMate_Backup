-- PREPARED, NOT EXECUTED against production in this audit.
-- Run only through the approved production connection. Catalog metadata only:
-- no customer rows, app_settings values, credentials, trigger bodies or mutations.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';

SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version = '20261105132849';

SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('team_tasks','team_links','team_documents','profiles','app_settings','messages','conversation_participants');

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN
 ('team_tasks','team_links','team_documents','profiles','app_settings','messages','conversation_participants')
ORDER BY tablename, policyname;

-- Include actual role-effective table/column grants, not just direct ACL entries.
SELECT r.rolname, t.table_name,
 has_table_privilege(r.rolname,'public.'||t.table_name,'SELECT') AS table_select,
 has_table_privilege(r.rolname,'public.'||t.table_name,'INSERT') AS table_insert,
 has_table_privilege(r.rolname,'public.'||t.table_name,'UPDATE') AS table_update,
 has_table_privilege(r.rolname,'public.'||t.table_name,'DELETE') AS table_delete
FROM pg_roles r CROSS JOIN (VALUES('team_tasks'),('team_links'),('team_documents'),('app_settings')) t(table_name)
WHERE r.rolname IN ('anon','authenticated','service_role') ORDER BY 1,2;

SELECT r.rolname,c.table_name,c.column_name,
 has_column_privilege(r.rolname,'public.'||c.table_name,c.column_name,'SELECT') AS can_select,
 has_column_privilege(r.rolname,'public.'||c.table_name,c.column_name,'UPDATE') AS can_update
FROM information_schema.columns c CROSS JOIN pg_roles r
WHERE c.table_schema='public' AND r.rolname IN('anon','authenticated','service_role')
 AND (c.table_name IN('team_tasks','team_links') OR
      (c.table_name='profiles' AND c.column_name IN('id','is_banned')))
ORDER BY 1,2,c.ordinal_position;

SELECT p.oid::regprocedure::text AS signature, pg_get_function_result(p.oid) AS result_type,
 p.prosecdef AS security_definer, p.provolatile, p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('is_team_member','is_team_owner','save_team_document','guard_team_document_revision',
  'ensure_team_conversation','send_message_with_mentions','mark_conversation_read')
ORDER BY 1;

-- Safe whitelist: these reviewed function bodies contain no notification secrets.
SELECT p.proname,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('is_team_member','is_team_owner','save_team_document','guard_team_document_revision');

-- Trigger metadata only: never dump notification/email function bodies.
SELECT c.relname,t.tgname,t.tgenabled,p.oid::regprocedure::text AS function_signature
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
WHERE n.nspname='public' AND c.relname IN('team_documents','notifications') AND NOT t.tgisinternal;

SELECT tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public'
 AND tablename IN('team_tasks','team_links','team_documents','messages','conversation_participants');

COMMIT;
