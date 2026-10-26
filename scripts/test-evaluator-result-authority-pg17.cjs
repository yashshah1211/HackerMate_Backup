/* eslint-disable @typescript-eslint/no-require-imports -- Explicit opt-in existing-target permission verification. */
// Permission-only phase. Never applies migrations or creates accounts/fixtures.
// Full PostgreSQL/PostgREST persistence/CAS tests remain separately BLOCKED.
const { spawnSync } = require('node:child_process');
const PRODUCTION = 'rhryjrbebfrrfhtyyzbs';

function configuration(env) {
  const project = env.HM_EVALUATOR_PG17_PROJECT;
  if (env.HM_EVALUATOR_PG17_APPROVAL !== 'APPROVED_NONPRODUCTION_PERMISSION_CHECK') throw Error('Separate non-production permission-test approval required');
  if (!/^[a-z]{20}$/.test(project || '') || project === PRODUCTION) throw Error('An approved non-production project is required');
  if (env.PGHOST !== `db.${project}.supabase.co` || env.PGPORT !== '5432' || env.PGUSER !== 'postgres' || env.PGDATABASE !== 'postgres') throw Error('Direct approved project connection required');
  if (['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGOPTIONS'].some(key => env[key])) throw Error('Connection overrides are forbidden');
  const childEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD', 'PGPASSFILE', 'PGSSLROOTCERT']) if (env[key]) childEnv[key] = env[key];
  Object.assign(childEnv, { PGSSLMODE: 'verify-full', PGCONNECT_TIMEOUT: '5' });
  return childEnv;
}

function permissionSql() {
  const tables = ['challenge_submissions', 'team_ppt_evaluations', 'user_pitch_evaluations'];
  const lines = ["BEGIN READ ONLY;", "SET LOCAL statement_timeout = '15s';", "SET LOCAL lock_timeout = '2s';",
    `DO $$ BEGIN
      IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN RAISE EXCEPTION 'PostgreSQL 17 required'; END IF;
      IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.challenge_submissions'::regclass,'public.team_ppt_evaluations'::regclass,'public.user_pitch_evaluations'::regclass)
        AND relkind='r' AND relrowsecurity AND pg_get_userbyid(relowner)='postgres') <> 3 THEN RAISE EXCEPTION 'Result ownership/RLS drift'; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.team_ppt_evaluations_public'::regclass
        AND relkind='v' AND pg_get_userbyid(relowner)='postgres' AND 'security_invoker=true'=ANY(coalesce(reloptions,ARRAY[]::text[]))) THEN RAISE EXCEPTION 'Invoker view drift'; END IF;
      IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN ('public.challenge_submissions'::regclass,'public.team_ppt_evaluations'::regclass,'public.user_pitch_evaluations'::regclass)
        AND polcmd NOT IN ('r','d')) THEN RAISE EXCEPTION 'Write/ALL policy drift'; END IF;
      IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN RAISE EXCEPTION 'Service role drift'; END IF;
      IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) THEN RAISE EXCEPTION 'Inherited role drift'; END IF;
      IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')
        AND p.prokind IN ('f','p') AND p.prosrc ~ '(challenge_submissions|team_ppt_evaluations|user_pitch_evaluations)') THEN RAISE EXCEPTION 'Unexpected result RPC dependency'; END IF;
    END $$;`];
  for (const role of ['anon', 'authenticated']) {
    lines.push(`SET LOCAL ROLE ${role};`, `SET LOCAL request.jwt.claims = '{"role":"${role}","sub":"00000000-0000-4000-8000-000000000071"}';`);
    for (const table of [...tables, 'team_ppt_evaluations_public']) {
      const jsonColumn = table === 'challenge_submissions' ? 'ai_raw_feedback' : table === 'user_pitch_evaluations' ? 'evaluation_result' : 'ai_feedback';
      const statements = [`INSERT INTO public.${table} DEFAULT VALUES`,
        `INSERT INTO public.${table}(id,total_score,grade,${jsonColumn}) VALUES ('00000000-0000-4000-8000-000000000072',100,'forged','{}'::jsonb)`];
      if (tables.includes(table)) statements.push(`INSERT INTO public.${table}(id) VALUES ('00000000-0000-4000-8000-000000000072') ON CONFLICT(id) DO UPDATE SET total_score=100`);
      for (const sql of statements) lines.push(`DO $case$ BEGIN
        BEGIN EXECUTE ${"'EXPLAIN " + sql.replaceAll("'", "''") + "'"};
          RAISE EXCEPTION 'Client write unexpectedly planned';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE 'permission denied for %' THEN RAISE; END IF;
        END;
      END $case$;`);
      lines.push(`DO $case$ DECLARE c record; BEGIN
        IF has_table_privilege(current_user, 'public.${table}', 'INSERT') OR has_table_privilege(current_user, 'public.${table}', 'UPDATE') THEN RAISE EXCEPTION 'Client table writer remains'; END IF;
        FOR c IN SELECT attname, attnum FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attnum>0 AND NOT attisdropped LOOP
          IF has_column_privilege(current_user, 'public.${table}', c.attnum, 'INSERT') OR has_column_privilege(current_user, 'public.${table}', c.attnum, 'UPDATE') THEN RAISE EXCEPTION 'Client column writer remains'; END IF;
          IF pg_column_is_updatable('public.${table}'::regclass,c.attnum,false) THEN
          BEGIN EXECUTE format('EXPLAIN UPDATE public.${table} SET %I=%I WHERE false',c.attname,c.attname);
            RAISE EXCEPTION 'Client update unexpectedly planned';
          EXCEPTION WHEN insufficient_privilege THEN
            IF SQLERRM NOT LIKE 'permission denied for %' THEN RAISE; END IF;
          END;
          END IF;
        END LOOP;
      END $case$;`);
      if (tables.includes(table)) lines.push(`DO $$ BEGIN IF has_table_privilege(current_user,'public.${table}','TRUNCATE') OR has_table_privilege(current_user,'public.${table}','TRIGGER') THEN RAISE EXCEPTION 'Destructive client privilege remains'; END IF; END $$;`);
      lines.push(`SELECT id FROM public.${table} WHERE false;`);
    }
    if (role === 'authenticated') lines.push('EXPLAIN DELETE FROM public.user_pitch_evaluations WHERE false;');
    lines.push('RESET ROLE;');
  }
  lines.push('SET LOCAL ROLE service_role;');
  for (const table of tables) lines.push(`EXPLAIN INSERT INTO public.${table} DEFAULT VALUES;`, `EXPLAIN UPDATE public.${table} SET total_score=total_score WHERE false;`, `EXPLAIN DELETE FROM public.${table} WHERE false;`);
  lines.push('RESET ROLE;', 'ROLLBACK;');
  return lines.join('\n');
}

function run(env = process.env, spawn = spawnSync) {
  const childEnv = configuration(env);
  // stdin is fixed SQL, never a connection URI or a migration. No EXPLAIN ANALYZE.
  // ROLLBACK on success; psql -X/ON_ERROR_STOP exits and rolls back on any error.
  let result;
  try {
    result = spawn(env.HM_EVALUATOR_PSQL || 'psql', ['-X', '--no-password', '--set', 'ON_ERROR_STOP=1', '--quiet'],
      { env: childEnv, input: permissionSql(), encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) throw Error('PostgreSQL permission verification failed; no integration success claimed');
    return { status: 'permission_only_passed', fullPersistence: 'BLOCKED: no authorized FK-valid fixtures/accounts', postgrest: 'BLOCKED: no authorized authenticated fixture setup' };
  } finally {
    // spawnSync has terminated/closed the session even on timeout; no transaction
    // or fixture can survive. Do not print libpq stdout/stderr or credentials.
    result = undefined;
  }
}
module.exports = { configuration, permissionSql, run };
if (require.main === module) {
  try { console.log(JSON.stringify(run())); }
  catch (error) { console.error('BLOCKED:', error.message); process.exitCode = 2; }
}
