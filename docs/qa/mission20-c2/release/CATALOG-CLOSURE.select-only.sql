-- REVIEW ONLY. Independent authorized read-only catalog capture; no Codex live
-- connection. Keep complete output private. Run in the SAME repeatable-read,
-- read-only transaction/snapshot as CATALOG-REQUESTS.select-only.sql after the
-- operator has independently verified project identity and ledger presence.
-- Broad schema capture catches objects omitted by the focused table list.
SELECT current_database(),current_user,session_user,version(),
 current_setting('transaction_read_only'),current_setting('transaction_isolation'),
 pg_current_snapshot()::text AS snapshot,clock_timestamp() AS captured_at;

SELECT n.nspname,c.relname,c.relkind,c.relpersistence,c.relispartition,
 pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.reloptions,
 CASE WHEN c.relkind IN('v','m') THEN pg_get_viewdef(c.oid,true) END AS view_definition,
 CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END AS partition_key,
 pg_get_expr(c.relpartbound,c.oid) AS partition_bound
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2;
SELECT n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
 a.attnotnull,a.attidentity,a.attgenerated,a.attacl,coll.collname,
 pg_get_expr(d.adbin,d.adrelid) AS default_expression
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
 WHERE a.attnum>0 AND NOT a.attisdropped
 AND n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2,3;
SELECT n.nspname,c.relname,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,
 pg_get_constraintdef(k.oid,true) AS definition
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations')
 OR k.confrelid IN(SELECT c2.oid FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid=c2.relnamespace
 WHERE n2.nspname IN('public','auth','storage','matchmaking','mission20_private')) ORDER BY 1,2,3;
SELECT n.nspname,c.relname,x.indexrelid::regclass::text AS index_name,
 x.indisunique,x.indisprimary,x.indisvalid,x.indisready,pg_get_indexdef(x.indexrelid)
 FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2,3;
SELECT * FROM pg_policies WHERE schemaname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations')
 ORDER BY schemaname,tablename,policyname;
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,t.tgisinternal,
 pg_get_triggerdef(t.oid,true),t.tgfoid::regprocedure::text AS function
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2,3;
SELECT n.nspname,p.oid::regprocedure::text AS signature,p.prokind,pg_get_userbyid(p.proowner) AS owner,
 l.lanname,p.prosecdef,p.provolatile,p.proisstrict,p.proleakproof,p.proparallel,p.proconfig,p.proacl,
 pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS raw_body_sha256,pg_get_functiondef(p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE p.prokind IN('f','p') AND n.nspname IN('public','auth','storage','matchmaking','mission20_private') ORDER BY 1,2;
SELECT r.rolname,n.nspname,c.relname,v.privilege,
 has_table_privilege(r.oid,c.oid,v.privilege) AS effective
 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
 WHERE r.rolname IN('anon','authenticated','authenticator','service_role') AND c.relkind IN('r','p','v','m','f')
 AND n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2,3,4;
SELECT r.rolname,n.nspname,c.relname,a.attname,v.privilege,
 has_column_privilege(r.oid,c.oid,a.attnum,v.privilege) AS effective
 FROM pg_roles r CROSS JOIN pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
 WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN('r','p','v','m','f')
 AND r.rolname IN('anon','authenticated','authenticator','service_role')
 AND n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2,3,4,5;
SELECT r.rolname,n.nspname,p.oid::regprocedure::text AS signature,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute
 FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE r.rolname IN('anon','authenticated','authenticator','service_role')
 AND n.nspname IN('public','auth','storage','matchmaking','mission20_private') ORDER BY 1,2,3;
SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relacl,s.seqtypid::regtype::text,
 s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,s.seqcycle
 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2;
SELECT r.rolname,n.nspname,c.relname,v.privilege,has_sequence_privilege(r.oid,c.oid,v.privilege) AS effective
 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES('SELECT'),('UPDATE'),('USAGE')) v(privilege)
 WHERE r.rolname IN('anon','authenticated','authenticator','service_role') AND c.relkind='S'
 AND n.nspname IN('public','auth','storage','matchmaking','mission20_private','supabase_migrations') ORDER BY 1,2,3,4;
SELECT n.nspname,t.typname,t.typtype,t.typbasetype::regtype::text,t.typnotnull,t.typdefault,t.typacl,
 e.enumlabel,e.enumsortorder,pg_get_constraintdef(k.oid,true) AS domain_constraint
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid=t.oid
 LEFT JOIN pg_constraint k ON k.contypid=t.oid
 WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private') AND t.typtype IN('e','d') ORDER BY 1,2,e.enumsortorder,k.conname;
-- Explicit object edges include inbound dependencies from OTHER schemas.
-- PL/pgSQL/dynamic SQL references are not exhaustively tracked by pg_depend:
-- separately read all relevant bodies and resolve runtime references.
SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent,
 pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced,d.deptype
 FROM pg_depend d WHERE d.objid IN(
 SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private')
 UNION SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private'))
 OR d.refobjid IN(
 SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private')
 UNION SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth','storage','matchmaking','mission20_private')) ORDER BY 1,2,3;
SELECT e.evtname,e.evtevent,pg_get_userbyid(e.evtowner),e.evtenabled,e.evtfoid::regprocedure::text,e.evttags FROM pg_event_trigger e ORDER BY 1;
SELECT extname,extversion,extnamespace::regnamespace::text,pg_get_userbyid(extowner),extrelocatable FROM pg_extension ORDER BY 1;
SELECT schemaname,tablename,rulename,definition FROM pg_rules
 WHERE schemaname IN('public','auth','storage','matchmaking','mission20_private') ORDER BY 1,2,3;
SELECT p.pubname,pg_get_userbyid(p.pubowner),p.puballtables,p.pubinsert,p.pubupdate,p.pubdelete,p.pubtruncate,
 t.schemaname,t.tablename,t.attnames,t.rowfilter
 FROM pg_publication p LEFT JOIN pg_publication_tables t ON t.pubname=p.pubname ORDER BY p.pubname,t.schemaname,t.tablename;
