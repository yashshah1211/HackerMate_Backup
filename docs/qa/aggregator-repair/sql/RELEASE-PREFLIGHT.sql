-- SELECT-only. For independently authorized execution on the existing project.
-- Do not export rows, create a snapshot, invoke writers or infer SQL approval.
SELECT current_database(), current_user, current_setting('server_version') AS server_version;
SELECT count(*) AS ledger_entries, max(version) AS latest_version,
       count(*) FILTER (WHERE version='20261102123742') AS candidate_entries
FROM supabase_migrations.schema_migrations;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'
ORDER BY ordinal_position;

-- Compare all projected/typed source fields, defaults and control columns.
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('hackathons','partner_configs')
ORDER BY table_name, ordinal_position;
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('hackathons','partner_configs');
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('hackathons','partner_configs')
ORDER BY tablename, policyname;
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('hackathons','partner_configs')
ORDER BY table_name, grantee, privilege_type;
SELECT table_name, grantee, column_name, privilege_type FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name IN ('hackathons','partner_configs')
ORDER BY table_name, grantee, column_name, privilege_type;
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles
WHERE rolname IN ('postgres','service_role','authenticated','anon');
SELECT has_schema_privilege('service_role','public','USAGE') AS schema_usage,
       (has_table_privilege('service_role','public.hackathons','SELECT')
        AND has_table_privilege('service_role','public.hackathons','INSERT')
        AND has_table_privilege('service_role','public.hackathons','UPDATE')) AS event_access,
       has_table_privilege('service_role','public.partner_configs','SELECT') AS partner_access;

SELECT conrelid::regclass AS on_table, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.hackathons'::regclass,'public.partner_configs'::regclass,
                  'public.hackathon_registrations'::regclass,'public.team_hackathons'::regclass,
                  'public.saved_hackathons'::regclass)
   OR confrelid='public.hackathons'::regclass
ORDER BY conrelid::regclass::text, conname;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('hackathons','partner_configs')
ORDER BY tablename, indexname;

-- Inspect every event trigger's reviewed dependency for outbound hooks/side effects.
-- Hashes identify bodies; this does not copy private function source.
SELECT t.tgname, pg_get_triggerdef(t.oid) AS trigger_definition,
       p.oid::regprocedure AS function_identity, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef, p.proconfig, p.proacl,
       encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS body_sha256
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid IN ('public.hackathons'::regclass,'public.partner_configs'::regclass)
  AND NOT t.tgisinternal ORDER BY t.tgrelid, t.tgname;
SELECT p.oid::regprocedure AS function_identity, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef, p.proconfig, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('guard_hackathon_source_metadata','begin_hackathon_source_check','apply_hackathon_source_check');

-- Expected before install: false/NULL throughout. After: objects present, ledger=148.
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
 AND table_name='hackathons' AND column_name='source_metadata') AS source_column,
 to_regclass('public.hackathons_source_identity_unique') AS source_index,
 EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.hackathons'::regclass
 AND conname='hackathons_source_metadata_shape') AS source_constraint,
 EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.hackathons'::regclass
 AND tgname='hackathons_source_metadata_guard') AS source_trigger;

-- Aggregate invariants only: founder baseline 410 / 8 / 4 / 2 / 7. Legitimate new
-- user activity can change counts; explain differences rather than repairing data.
SELECT (SELECT count(*) FROM public.hackathons WHERE status='approved' AND NOT archived) AS public_events,
       (SELECT count(*) FROM public.hackathon_registrations) AS registrations,
       (SELECT count(*) FROM public.team_hackathons) AS linked_teams,
       (SELECT count(*) FROM public.saved_hackathons) AS saved,
       (SELECT count(*) FROM public.partner_configs) AS partner_configs;

-- Post-install access checks (NULL before install). Both writers: false/false/true.
SELECT signature,
 has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE') AS service_execute
FROM (VALUES ('public.begin_hackathon_source_check(uuid,uuid)'),
 ('public.apply_hackathon_source_check(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text,text[])')) AS f(signature);
