-- PROPOSED ONLY. Not executed. Separate founder approval required, including
-- target and an existing read-only access path. No credentials are requested.
-- Catalog metadata only; never select result rows, auth users or ledger SQL text.
-- Session-local timeouts below do not change persistent settings.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

-- Q1: establish server version and ledger existence. Version is not acceptance.
SELECT current_database(), current_user,
  current_setting('server_version_num')::integer AS server_version_num,
  current_setting('transaction_read_only') AS transaction_read_only,
  to_regclass('supabase_migrations.schema_migrations') AS migration_ledger;

-- Q2: owner, RLS and invoker-view preconditions. No view recreation.
SELECT c.oid, n.nspname, c.relname, c.relkind,
  pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity,
  c.relforcerowsecurity, c.reloptions, c.relacl,
  CASE WHEN c.relkind = 'v' THEN pg_get_viewdef(c.oid, true) END AS view_definition
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN
  ('challenge_submissions','team_ppt_evaluations','user_pitch_evaluations','team_ppt_evaluations_public')
ORDER BY c.relname;

-- Q3: role bypass/inheritance and direct membership edges, not role creation.
SELECT rolname, rolsuper, rolinherit, rolcanlogin, rolbypassrls
FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator')
ORDER BY rolname;
SELECT member::regrole AS member, roleid::regrole AS granted_role,
  grantor::regrole AS grantor, admin_option, inherit_option, set_option
FROM pg_auth_members
WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
   OR roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
ORDER BY member, roleid;

-- Q4: effective table privileges, including PUBLIC/inheritance effects.
SELECT r.rolname, c.relname, p.privilege,
  has_table_privilege(r.oid,c.oid,p.privilege) AS allowed
FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
  AND c.relname IN ('challenge_submissions','team_ppt_evaluations','user_pitch_evaluations','team_ppt_evaluations_public')
ORDER BY r.rolname,c.relname,p.privilege;

-- Q5: every live user column, raw ACL and effective INSERT/UPDATE.
SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS data_type,
  a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid) AS default_expression,
  r.rolname,has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS can_insert,
  has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS can_update
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
CROSS JOIN pg_roles r
WHERE n.nspname='public' AND r.rolname IN ('anon','authenticated','service_role')
  AND c.relname IN ('challenge_submissions','team_ppt_evaluations','user_pitch_evaluations','team_ppt_evaluations_public')
ORDER BY c.relname,a.attnum,r.rolname;

-- Q6: policy definitions. Presence/absence alone does not prove row visibility.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN
  ('challenge_submissions','team_ppt_evaluations','user_pitch_evaluations')
ORDER BY tablename,policyname;

-- Q7: directly cataloged dependencies; dynamic SQL/body matching is not exhaustive.
SELECT c.relname,pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,d.deptype
FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE d.refclassid='pg_class'::regclass AND n.nspname='public'
  AND c.relname IN ('challenge_submissions','team_ppt_evaluations','user_pitch_evaluations','team_ppt_evaluations_public')
ORDER BY c.relname,dependent_object;
ROLLBACK;

-- Optional Q8, ONLY after Q1 confirms ledger existence and separate approval:
-- BEGIN READ ONLY;
-- SET LOCAL statement_timeout = '5s';
-- SELECT version,name FROM supabase_migrations.schema_migrations
-- WHERE version='20261024030634';
-- ROLLBACK;
-- A ledger row is not proof of migration bytes, successful historical enforcement,
-- rollback atomicity, PostgREST behavior or current service-role persistence.
