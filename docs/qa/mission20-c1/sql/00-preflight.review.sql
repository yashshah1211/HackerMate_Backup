-- REVIEW ONLY. SELECT-only future preflight; not executed during C1.
-- Capture output privately under separate read-only approval before rollout.
SELECT version(), current_user, session_user, current_setting('transaction_isolation'), current_setting('TimeZone');
SELECT nspname, pg_get_userbyid(nspowner), nspacl FROM pg_catalog.pg_namespace
WHERE nspname IN ('public', 'mission20_private');
SELECT current_setting('pgrst.db_schemas', true) AS configured_exposed_schemas_if_available;
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner, c.relacl
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('hackathons', 'hackathon_registrations');
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
AND table_name IN ('hackathons', 'hackathon_registrations') ORDER BY table_name, ordinal_position;
SELECT c.relname, a.attname, a.attacl FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('hackathons', 'hackathon_registrations') AND a.attnum > 0 AND NOT a.attisdropped;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename IN ('hackathons', 'hackathon_registrations')
ORDER BY tablename, policyname;
SELECT r.rolname, r.rolsuper, r.rolinherit, r.rolbypassrls,
  has_table_privilege(r.oid, 'public.hackathon_registrations', 'INSERT') AS table_insert,
  has_any_column_privilege(r.oid, 'public.hackathon_registrations', 'INSERT') AS any_column_insert
FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role');
SELECT pg_get_userbyid(m.member) AS member, pg_get_userbyid(m.roleid) AS inherited_role
FROM pg_catalog.pg_auth_members m WHERE pg_get_userbyid(m.member) IN ('anon', 'authenticated', 'service_role', 'authenticator');
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_catalog.pg_constraint WHERE conrelid IN ('public.hackathon_registrations'::regclass, 'public.hackathons'::regclass, 'public.team_members'::regclass);
SELECT tgrelid::regclass, tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgrelid IN
('public.hackathon_registrations'::regclass, 'public.hackathons'::regclass, 'public.team_members'::regclass);
SELECT n.nspname, p.oid::regprocedure, p.prosecdef, p.provolatile, pg_get_userbyid(p.proowner), p.proacl, p.proconfig, pg_get_functiondef(p.oid)
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'mission20_private') AND
(p.proname LIKE '%registration%' OR p.proname LIKE '%native%' OR p.proname LIKE '%event_identity%' OR p.proname LIKE '%partner_event%' OR p.proname = 'is_team_owner');
-- Aggregate-only legacy classification / capacity readiness; never auto-backfill.
SELECT type, status, archived, count(*) FROM public.hackathons GROUP BY type, status, archived;
SELECT h.id, h.max_participants, count(r.id) FILTER(WHERE r.status = 'confirmed') AS confirmed
FROM public.hackathons h LEFT JOIN public.hackathon_registrations r ON r.hackathon_id = h.id
WHERE h.max_participants IS NOT NULL GROUP BY h.id, h.max_participants
HAVING count(r.id) FILTER(WHERE r.status = 'confirmed') > h.max_participants;
