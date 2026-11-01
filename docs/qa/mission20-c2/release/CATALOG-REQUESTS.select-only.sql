-- REVIEW ONLY. Independent operator executes SELECTs under a separately
-- authorized read-only connection/transaction. Codex has NOT queried hackos.
-- No SET/DO/DDL/DML/function calls with side effects, no user rows or secrets.
-- Save full definitions privately; publish only reviewed/redacted findings.
SELECT version(), current_database(), current_user, session_user,
 current_setting('server_version_num'), current_setting('transaction_isolation'),
 current_setting('TimeZone'), current_setting('statement_timeout'),
 current_setting('lock_timeout'), current_setting('idle_in_transaction_session_timeout');

SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl
 FROM pg_catalog.pg_namespace
 WHERE nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations');

-- Include the real role graph; never read pg_authid/password hashes.
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
 rolbypassrls, ARRAY(SELECT s FROM unnest(rolconfig) s WHERE s LIKE 'statement_timeout=%'
  OR s LIKE 'lock_timeout=%' OR s LIKE 'search_path=%' OR s LIKE 'default_transaction_isolation=%') AS relevant_settings
 FROM pg_catalog.pg_roles
 WHERE rolname IN('postgres','authenticator','authenticated','anon','service_role');
SELECT pg_get_userbyid(member) AS member, pg_get_userbyid(roleid) AS inherited_role,
 admin_option, inherit_option, set_option FROM pg_catalog.pg_auth_members;
SELECT r.rolname,n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
 has_schema_privilege(r.oid,n.oid,'CREATE') AS create_objects
 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_namespace n
 WHERE r.rolname IN('anon','authenticated','service_role','authenticator')
 AND n.nspname IN('public','auth','mission20_private','matchmaking') ORDER BY r.rolname,n.nspname;
-- Role/database settings may contain private deployment values: retain output
-- privately and redact secrets before review; do not paste into public PRs.
SELECT coalesce(d.datname,'ALL') AS database_name, coalesce(r.rolname,'ALL') AS role_name,
 ARRAY(SELECT s FROM unnest(x.setconfig) s WHERE
  s LIKE 'statement_timeout=%' OR s LIKE 'lock_timeout=%' OR s LIKE 'default_transaction_isolation=%'
  OR s LIKE 'search_path=%' OR s LIKE 'idle_in_transaction_session_timeout=%') AS relevant_settings
 FROM pg_catalog.pg_db_role_setting x LEFT JOIN pg_catalog.pg_database d ON d.oid=x.setdatabase
 LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.setrole;

SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
 c.relrowsecurity,c.relforcerowsecurity,c.relacl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN('hackathons','hackathon_registrations','teams','team_members',
 'team_hackathons','profiles','conversations','conversation_participants','team_invites','team_join_requests',
 'notifications','deleted_user_logs','badges','team_submissions','hackathon_announcements','event_organizers'))
 OR (n.nspname='auth' AND c.relname='users') OR (n.nspname='storage' AND c.relname='objects')
 OR n.nspname='matchmaking' ORDER BY n.nspname,c.relname;

SELECT n.nspname,c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
 a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_get_expr(d.adbin,d.adrelid) AS default_expression
 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE a.attnum>0 AND NOT a.attisdropped AND
 ((n.nspname='public' AND c.relname IN('hackathons','hackathon_registrations','teams','team_members',
 'team_hackathons','profiles','conversations','conversation_participants','team_invites','team_join_requests',
 'notifications','deleted_user_logs','badges','team_submissions','hackathon_announcements','event_organizers'))
 OR (n.nspname='auth' AND c.relname='users') OR (n.nspname='storage' AND c.relname='objects')
 OR n.nspname='matchmaking') ORDER BY n.nspname,c.relname,a.attnum;

SELECT n.nspname,t.typname,e.enumlabel,e.enumsortorder FROM pg_catalog.pg_enum e
 JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname IN('public','auth') ORDER BY n.nspname,t.typname,e.enumsortorder;

-- ALL inbound FKs matter to deletion, not only the six confirmed CASCADE edges.
SELECT conrelid::regclass AS child,confrelid::regclass AS parent,conname,contype,
 confdeltype,confupdtype,condeferrable,condeferred,convalidated,pg_get_constraintdef(oid,true) AS definition
 FROM pg_catalog.pg_constraint WHERE
 conrelid IN(to_regclass('public.hackathons'),to_regclass('public.hackathon_registrations'),to_regclass('public.teams'),
 to_regclass('public.team_members'),to_regclass('public.profiles'),to_regclass('auth.users'),to_regclass('public.conversations'),
 to_regclass('public.conversation_participants'),to_regclass('public.team_hackathons'))
 OR confrelid IN(to_regclass('public.hackathons'),to_regclass('public.hackathon_registrations'),to_regclass('public.teams'),
 to_regclass('public.team_members'),to_regclass('public.profiles'),to_regclass('auth.users'),to_regclass('public.conversations'),
 to_regclass('public.conversation_participants')) ORDER BY 1,3;

SELECT n.nspname,t.relname,i.indexrelid::regclass AS index_name,i.indisunique,i.indisprimary,
 i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition
 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
 AND t.relname IN('hackathons','hackathon_registrations','teams','team_members','team_hackathons','conversations','conversation_participants')
 ORDER BY 2,3;

SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
 FROM pg_catalog.pg_policies WHERE schemaname IN('public','auth','storage') AND
 tablename IN('hackathons','hackathon_registrations','teams','team_members','team_hackathons','profiles','conversations',
 'conversation_participants','team_invites','team_join_requests','notifications','objects','event_organizers')
 ORDER BY schemaname,tablename,policyname;

SELECT r.rolname,c.oid::regclass AS relation,
 has_table_privilege(r.oid,c.oid,'SELECT') AS sel,has_table_privilege(r.oid,c.oid,'INSERT') AS ins,
 has_any_column_privilege(r.oid,c.oid,'INSERT') AS any_column_insert,
 has_table_privilege(r.oid,c.oid,'UPDATE') AS upd,has_any_column_privilege(r.oid,c.oid,'UPDATE') AS any_column_update,
 has_table_privilege(r.oid,c.oid,'DELETE') AS del,has_table_privilege(r.oid,c.oid,'TRUNCATE') AS trunc,
 has_table_privilege(r.oid,c.oid,'TRIGGER') AS trig
 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND n.nspname='public'
 AND c.relname IN('hackathons','hackathon_registrations','teams','team_members','team_hackathons','profiles')
 ORDER BY 1,2;
SELECT r.rolname,c.oid::regclass AS relation,a.attname,
 has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS sel,
 has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS ins,
 has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS upd
 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
 JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE r.rolname IN('anon','authenticated','service_role') AND a.attnum>0 AND NOT a.attisdropped
 AND n.nspname='public' AND c.relname IN('hackathons','hackathon_registrations','teams','team_members','profiles')
 ORDER BY 1,2,a.attnum;

SELECT t.tgrelid::regclass AS relation,t.tgname,t.tgenabled,t.tgisinternal,
 pg_get_triggerdef(t.oid,true) AS definition,t.tgfoid::regprocedure AS function
 FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN(to_regclass('public.hackathons'),to_regclass('public.hackathon_registrations'),
 to_regclass('public.teams'),to_regclass('public.team_members'),to_regclass('public.profiles'),to_regclass('auth.users'),
 to_regclass('public.conversations'),to_regclass('public.conversation_participants'),to_regclass('public.team_hackathons'),to_regclass('storage.objects'))
 ORDER BY 1,2;

-- Capture every overload and all functions attached to those triggers.
SELECT n.nspname,p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef,p.provolatile,p.proconfig,p.proacl,pg_get_function_result(p.oid) AS result,
 md5(pg_get_functiondef(p.oid)) AS definition_fingerprint,pg_get_functiondef(p.oid) AS definition
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind IN('f','p') AND (n.nspname IN('mission20_private','matchmaking')
 OR (n.nspname='auth' AND p.proname='uid') OR (n.nspname='public' AND p.proname IN(
 'register_native_hackathon','mission20_remove_team_member','mission20_set_project_role','mission20_delete_team','mission20_cancel_registration',
 'is_team_owner','is_team_member','is_admin','has_verified_event_identity','can_access_partner_event','has_partner_admin_access',
 'add_user_to_team','create_team_with_owner','accept_team_invite','accept_team_join_request','join_team_instantly',
 'ensure_team_conversation','delete_user_completely','create_team_conversation','add_member_to_team_conversation',
 'remove_member_from_team_conversation','handle_profile_before_delete','guard_registration_preferences',
 'get_hackathon_registration_counts','list_event_discovery_builders','get_public_builder_profile'))
 OR p.oid IN(SELECT tgfoid FROM pg_catalog.pg_trigger WHERE tgrelid IN(to_regclass('public.teams'),to_regclass('public.team_members'),
 to_regclass('public.profiles'),to_regclass('auth.users'),to_regclass('public.hackathon_registrations'),to_regclass('public.hackathons'),
 to_regclass('public.conversations'),to_regclass('public.conversation_participants')))) ORDER BY 1,2;

SELECT r.rolname,p.oid::regprocedure AS signature,has_function_privilege(r.oid,p.oid,'EXECUTE') AS execute
 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE r.rolname IN('anon','authenticated','service_role','authenticator') AND
 (n.nspname='mission20_private' OR (n.nspname='public' AND p.proname IN('register_native_hackathon','mission20_remove_team_member',
 'mission20_set_project_role','mission20_delete_team','mission20_cancel_registration','add_user_to_team','create_team_with_owner',
 'accept_team_invite','accept_team_join_request','join_team_instantly','ensure_team_conversation','delete_user_completely')))
 ORDER BY 2,1;
SELECT defaclrole::regrole,coalesce(n.nspname,'ALL') AS schema,defaclobjtype,defaclacl
 FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace;

-- Presence/columns first. Execute the ledger SELECT below only after confirming
-- this table exists and the operator has read permission; never repair it here.
SELECT to_regclass('supabase_migrations.schema_migrations') AS ledger;
SELECT column_name,data_type,is_nullable FROM information_schema.columns
 WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' ORDER BY ordinal_position;
SELECT to_jsonb(m)->>'version' AS version,to_jsonb(m)->>'name' AS name
 FROM supabase_migrations.schema_migrations m ORDER BY to_jsonb(m)->>'version';

-- Optional aggregate-only data readiness after column/type signoff. No user
-- payloads or corrections. Capacity is confirmed registration ROWS, not humans.
SELECT type,status,archived,count(*) FROM public.hackathons GROUP BY type,status,archived;
SELECT count(*) AS invalid_configuration_count FROM public.hackathons
 WHERE max_participants<0 OR (type='native' AND (min_team_size<1 OR max_team_size<1 OR min_team_size>max_team_size));
SELECT h.id,h.max_participants,count(r.id) FILTER(WHERE r.status='confirmed') AS confirmed_rows
 FROM public.hackathons h LEFT JOIN public.hackathon_registrations r ON r.hackathon_id=h.id
 WHERE h.max_participants IS NOT NULL GROUP BY h.id,h.max_participants
 HAVING count(r.id) FILTER(WHERE r.status='confirmed')>h.max_participants;
