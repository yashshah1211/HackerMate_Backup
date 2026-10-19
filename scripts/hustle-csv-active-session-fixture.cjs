/* eslint-disable @typescript-eslint/no-require-imports -- Disposable synthetic extension; installs PR #33 SQL unchanged on loopback only. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = require('./hustle-phase2-local-db.cjs');
const migration = 'supabase/migrations/20261018174144_hustle_round2_auth_guards.sql';
const withActiveSession = fs.existsSync(path.join(base.ROOT, migration));
assert.equal(withActiveSession, /await requireActiveSession\(/.test(fs.readFileSync(path.join(base.ROOT, 'src/lib/hustle-phase2/server.ts'), 'utf8')),
  'Use a complete candidate: active-session server guard and migration must both be present or both absent.');
const sessionFor = id => '20000000' + id.slice(8);
const claimsFor = id => ({ sub: id, role: 'authenticated', ...(withActiveSession ? { session_id: sessionFor(id) } : {}) });
async function createFixture() {
  const db = await base.createFixture();
  if (!withActiveSession) return db; // Original main has neither guard nor migration; no security guard is skipped.
  try {
    // Minimal local Auth schema, restricted session grants and nonsuperuser
    // trusted owner required by the unchanged remediation's own guard.
    db.sql(`CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS;
      CREATE ROLE supabase_auth_admin NOLOGIN NOSUPERUSER;
      ALTER TABLE auth.users OWNER TO supabase_auth_admin;
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
      ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO postgres,supabase_auth_admin;
      GRANT SELECT(id,email),REFERENCES(id) ON auth.users TO postgres;
      GRANT SELECT(id,user_id,not_after) ON auth.sessions TO postgres;
      GRANT USAGE,CREATE ON SCHEMA public TO postgres;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      ALTER TABLE public.profiles OWNER TO postgres;
      ALTER TABLE public.hackathons OWNER TO postgres;
      ALTER TABLE public.event_organizers OWNER TO postgres;
      CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=user_id AND role='admin') $$;
      ALTER FUNCTION public.is_admin(uuid) OWNER TO postgres;
      REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC,anon,service_role;
      GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
      ${Object.values(base.IDS).map(id => `INSERT INTO auth.sessions VALUES('${sessionFor(id)}','${id}',NULL);`).join('\n')}`);
    const functions = db.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'hustle_phase2_%' OR proname IN ('has_partner_admin_access','can_access_partner_event'))").split(/\r?\n/);
    for (const signature of functions) db.sql(`ALTER FUNCTION public.${signature} OWNER TO postgres`);
    for (const table of ['batches', 'teams', 'invites', 'audit', 'limits']) db.sql(`ALTER TABLE public.hustle_phase2_${table} OWNER TO postgres`);
    db.sql('SET ROLE postgres;\n' + fs.readFileSync(path.join(base.ROOT, migration), 'utf8'));
    return db;
  } catch (error) { await db.close(); throw error; }
}
function installClock(db, initial) {
  base.installClock(db, initial);
  if (withActiveSession) db.sql('GRANT SELECT ON public.fixture_clock TO postgres');
}
module.exports = { ...base, createFixture, installClock, sessionFor, claimsFor, withActiveSession, migration };
