/* eslint-disable @typescript-eslint/no-require-imports -- Disposable synthetic PostgreSQL authorization regression. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFixture, IDS, EVENT, quote } = require('./hustle-phase2-local-db.cjs');
let checks = 0;
const check = (value, label) => { assert(value, label); checks++; };
const SID = '20000000-0000-4000-8000-000000000001';
const OLD_SESSION = '20000000-0000-4000-8000-000000000099';
async function main() {
  const db = await createFixture();
  const scalar = q => db.sql(q).split(/\r?\n/).at(-1);
  const user = (id, q, sid = SID, patch = {}) => {
    const claims = { sub: id, role: 'authenticated', session_id: sid, ...patch };
    return `SET ROLE authenticated; SET request.jwt.claim.sub=${quote(id)}; SET request.jwt.claims=${quote(JSON.stringify(claims))}; ${q}`;
  };
  const denied = (q, label) => { assert.throws(() => db.sql(q), /permission denied|Access denied|Admin privileges/, label); checks++; };
  try {
    // The old generic fixture is extended with production-equivalent profile
    // policies/guard and strict Auth grants, not a copy of production user data.
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
      ALTER TABLE profiles ADD COLUMN full_name text;
      ALTER TABLE profiles ADD CONSTRAINT fixture_profile_auth FOREIGN KEY(id) REFERENCES auth.users(id) ON DELETE CASCADE;
      ALTER TABLE profiles OWNER TO postgres; ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE hackathons OWNER TO postgres; ALTER TABLE event_organizers OWNER TO postgres;
      GRANT SELECT(id,role,is_banned,full_name) ON profiles TO anon,authenticated;
      GRANT INSERT,UPDATE,DELETE ON profiles TO anon,authenticated;
      CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=user_id AND role='admin') $$;
      ALTER FUNCTION public.is_admin(uuid) OWNER TO postgres;
      REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
      CREATE FUNCTION public.handle_profile_roles_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
       IF auth.uid() IS NOT NULL AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_banned IS DISTINCT FROM NEW.is_banned) THEN
        IF NOT public.is_admin(auth.uid()) THEN NEW.role:=OLD.role; NEW.is_banned:=OLD.is_banned; END IF;
       END IF; RETURN NEW; END $$;
      ALTER FUNCTION public.handle_profile_roles_update() OWNER TO postgres;
      CREATE TRIGGER trigger_profile_roles_update BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION public.handle_profile_roles_update();
      CREATE POLICY profiles_admin_update ON profiles FOR UPDATE TO authenticated USING(is_admin(auth.uid())) WITH CHECK(is_admin(auth.uid()));
      CREATE POLICY profiles_update_self ON profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
      CREATE POLICY profiles_create_self ON profiles FOR INSERT TO authenticated WITH CHECK(id=auth.uid());
      CREATE POLICY profiles_read ON profiles FOR SELECT TO authenticated USING(id=auth.uid() OR is_banned=false OR is_admin(auth.uid()));
      CREATE POLICY profiles_read_anon ON profiles FOR SELECT TO anon USING(true);
      CREATE TABLE public.user_reports(id uuid PRIMARY KEY);
      CREATE TABLE public.user_badges(user_id uuid,hackathon_id uuid,badge_type text,badge_name text,issuer_name text,rank_title text,metadata jsonb,issued_at timestamptz DEFAULT now(),UNIQUE(user_id,hackathon_id,badge_type));
      ALTER TABLE user_badges OWNER TO postgres;
      ALTER TABLE user_reports OWNER TO postgres; ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,DELETE ON user_reports TO authenticated;
      CREATE POLICY user_reports_admin_select ON user_reports FOR SELECT TO authenticated USING(is_admin(auth.uid()));
      CREATE POLICY user_reports_admin_delete ON user_reports FOR DELETE TO authenticated USING(is_admin(auth.uid()));
      INSERT INTO user_reports VALUES('30000000-0000-4000-8000-000000000001');
      INSERT INTO auth.sessions VALUES('${SID}','${IDS.admin}',NULL);
      UPDATE auth.users SET email='yashshah7117@gmail.com' WHERE id='${IDS.foreign}';`);
    const functions = db.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'hustle_phase2_%' OR proname IN ('has_partner_admin_access','can_access_partner_event'))").split(/\r?\n/);
    for (const signature of functions) db.sql(`ALTER FUNCTION public.${signature} OWNER TO postgres`);
    for (const table of ['batches', 'teams', 'invites', 'audit', 'limits']) db.sql(`ALTER TABLE public.hustle_phase2_${table} OWNER TO postgres`);
    const badgeSource = fs.readFileSync(path.join(db.ROOT, 'supabase/migrations/202607260001_axcentra_and_partner_engine.sql'), 'utf8');
    const badgeStart = badgeSource.indexOf('CREATE OR REPLACE FUNCTION public.grant_hackathon_winner_badges(');
    const badgeEnd = badgeSource.indexOf('$$;', badgeStart);
    assert(badgeStart >= 0 && badgeEnd > badgeStart);
    db.sql(badgeSource.slice(badgeStart, badgeEnd + 3));
    db.sql('ALTER FUNCTION public.grant_hackathon_winner_badges(uuid,uuid[],text,text,text,text,jsonb) OWNER TO postgres');
    // Reproduce both failures before installing the fix in this disposable DB.
    db.sql(`UPDATE profiles SET is_banned=true WHERE id='${IDS.admin}'`);
    check(scalar(user(IDS.admin, `SELECT is_admin('${IDS.admin}')`)) === 't', 'baseline role-only predicate authorizes banned admin');
    db.sql(user(IDS.admin, `UPDATE profiles SET is_banned=false WHERE id='${IDS.admin}'`));
    check(scalar(`SELECT NOT is_banned FROM profiles WHERE id='${IDS.admin}'`) === 't', 'baseline self-unban actually succeeds');
    check(scalar(user(IDS.admin, 'SELECT hustle_phase2_snapshot() IS NOT NULL', OLD_SESSION)) === 't', 'baseline snapshot ignores absent/revoked session');
    const originalSource = fs.readFileSync(path.join(db.ROOT, 'supabase/migrations/20261018082156_hustle_phase2_shortlist.sql'), 'utf8').replaceAll('\r\n', '\n');
    const proposedSource = fs.readFileSync(path.join(db.ROOT, 'supabase/migrations/20261018174144_hustle_round2_auth_guards.sql'), 'utf8').replaceAll('\r\n', '\n');
    db.sql(`CREATE SCHEMA supabase_migrations AUTHORIZATION postgres;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
      ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;
      INSERT INTO supabase_migrations.schema_migrations SELECT 'synthetic-'||n,'synthetic',ARRAY['-- synthetic'] FROM generate_series(1,138) n;
      INSERT INTO supabase_migrations.schema_migrations VALUES('20261018082156','hustle_phase2_shortlist',ARRAY[${quote(originalSource)}]);`);
    const readinessSql = fs.readFileSync(path.join(db.ROOT, 'docs/sql/hustle-round2-auth-readiness.sql'), 'utf8');
    const beforeReadiness = db.sql('SET ROLE postgres;\n' + readinessSql);
    check(beforeReadiness.endsWith('ROLLBACK'), 'read-only operator preflight parses under nonsuperuser owner');
    const profileAcl = scalar("SELECT relacl::text FROM pg_class WHERE oid='public.profiles'::regclass");
    const adminAcl = scalar("SELECT proacl::text FROM pg_proc WHERE oid='public.is_admin(uuid)'::regprocedure");
    const snapshotAcl = scalar("SELECT proacl::text FROM pg_proc WHERE oid='public.hustle_phase2_snapshot()'::regprocedure");
    const trigger = scalar("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trigger_profile_roles_update'");
    db.sql('SET ROLE postgres;\n' + proposedSource);
    db.sql(`INSERT INTO supabase_migrations.schema_migrations VALUES('20261018174144','hustle_round2_auth_guards',ARRAY[${quote(proposedSource)}]);`);
    const afterReadiness = db.sql('SET ROLE postgres;\n' + readinessSql);
    check(afterReadiness.endsWith('ROLLBACK'), 'read-only operator postflight parses under nonsuperuser owner');
    const fingerprint = output => output.split(/\r?\n/).filter(line => /^[a-f0-9]{64}$/.test(line));
    check(fingerprint(beforeReadiness).length === 1 && JSON.stringify(fingerprint(beforeReadiness)) === JSON.stringify(fingerprint(afterReadiness)), 'metadata fingerprint preserves unrelated objects, policies, grants and triggers');
    check(scalar("SELECT relacl::text FROM pg_class WHERE oid='public.profiles'::regclass") === profileAcl, 'profile privileges unchanged');
    check(scalar("SELECT proacl::text FROM pg_proc WHERE oid='public.is_admin(uuid)'::regprocedure") === adminAcl, 'global helper EXECUTE ACL unchanged');
    check(scalar("SELECT proacl::text FROM pg_proc WHERE oid='public.hustle_phase2_snapshot()'::regprocedure") === snapshotAcl, 'snapshot EXECUTE ACL unchanged');
    check(scalar("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trigger_profile_roles_update'") === trigger, 'existing profile protection trigger unchanged');
    check(scalar("SELECT NOT rolsuper AND rolbypassrls FROM pg_roles WHERE rolname='postgres'") === 't', 'trusted owner uses production-like NOSUPERUSER/BYPASSRLS');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const col of ['id', 'user_id', 'not_after']) check(scalar(`SELECT NOT has_column_privilege('${role}','auth.sessions','${col}','SELECT')`) === 't', `${role} cannot read session ${col}`);
    }
    check(scalar(user(IDS.admin, 'SELECT hustle_phase2_has_active_session()')) === 't', 'active admin session accepted');
    check(scalar(user(IDS.admin, 'SELECT hustle_phase2_snapshot() IS NOT NULL')) === 't', 'active admin snapshot succeeds');
    check(scalar(user(IDS.admin, `SELECT grant_hackathon_winner_badges('${EVENT}',ARRAY['${IDS.unrelated}'::uuid])`)) === '1', 'existing admin badge RPC preserved');
    for (const session of [null, '', 'not-a-uuid', OLD_SESSION]) {
      check(scalar(user(IDS.admin, 'SELECT hustle_phase2_has_active_session()', session)) === 'f', 'missing/malformed/unknown session denied');
      denied(user(IDS.admin, 'SELECT hustle_phase2_snapshot()', session), 'snapshot denies missing/malformed/revoked session');
    }
    check(scalar(user(IDS.unrelated, 'SELECT hustle_phase2_has_active_session()')) === 'f', 'another user cannot reuse valid session ID');
    check(scalar(user(IDS.admin, 'SELECT hustle_phase2_has_active_session()', SID, { role: 'service_role' })) === 'f', 'unexpected JWT role denied');
    db.sql(`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='${SID}'`);
    check(scalar(user(IDS.admin, 'SELECT hustle_phase2_has_active_session()')) === 'f', 'expired not_after denied');
    db.sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='${SID}'; UPDATE profiles SET is_banned=true WHERE id='${IDS.admin}'`);
    check(scalar(user(IDS.admin, `SELECT is_admin('${IDS.admin}')`)) === 'f', 'banned admin loses global authority');
    db.sql(user(IDS.admin, `UPDATE profiles SET is_banned=false,role='admin',full_name='Synthetic update' WHERE id='${IDS.admin}'`));
    check(scalar(`SELECT is_banned AND role='admin' FROM profiles WHERE id='${IDS.admin}'`) === 't', 'existing trigger blocks self-unban/privilege restoration');
    db.sql(user(IDS.admin, `INSERT INTO profiles(id,role,is_banned) VALUES('${IDS.admin}','admin',false) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_banned=EXCLUDED.is_banned`));
    check(scalar(`SELECT is_banned FROM profiles WHERE id='${IDS.admin}'`) === 't', 'profile upsert cannot bypass protected UPDATE trigger');
    denied(user(IDS.admin, 'SELECT hustle_phase2_snapshot()'), 'banned admin denied even with live session');
    denied(user(IDS.admin, `SELECT grant_hackathon_winner_badges('${EVENT}',ARRAY['${IDS.unrelated}'::uuid])`), 'banned admin cannot bypass ban through existing badge RPC');
    check(scalar(user(IDS.admin, 'SELECT count(*) FROM user_reports')) === '0', 'banned admin loses global admin RLS reads');
    db.sql(user(IDS.admin, 'DELETE FROM user_reports'));
    check(scalar('SELECT count(*) FROM user_reports') === '1', 'banned admin cannot delete through admin RLS');
    db.sql(user(IDS.admin, `UPDATE profiles SET role='admin',is_banned=false WHERE id='${IDS.unrelated}'`));
    check(scalar(`SELECT role='user' AND NOT is_banned FROM profiles WHERE id='${IDS.unrelated}'`) === 't', 'banned admin cannot promote another account');
    db.sql(`UPDATE profiles SET is_banned=NULL WHERE id='${IDS.admin}'`);
    check(scalar(user(IDS.admin, `SELECT is_admin('${IDS.admin}')`)) === 'f', 'unknown ban state fails closed');
    db.sql(`UPDATE profiles SET is_banned=false WHERE id='${IDS.admin}'`);
    check(scalar(user(IDS.admin, 'SELECT count(*) FROM user_reports')) === '1', 'non-banned admin RLS read preserved');
    db.sql(user(IDS.admin, `UPDATE profiles SET is_banned=true WHERE id='${IDS.unrelated}'`));
    check(scalar(`SELECT is_banned FROM profiles WHERE id='${IDS.unrelated}'`) === 't', 'legitimate admin ban preserved');
    db.sql(user(IDS.admin, `UPDATE profiles SET is_banned=false WHERE id='${IDS.unrelated}'`));
    check(scalar(`SELECT NOT is_banned FROM profiles WHERE id='${IDS.unrelated}'`) === 't', 'legitimate admin unban preserved');
    for (const [name, id, allow] of [['founder', IDS.foreign, true], ['organizer', IDS.organizer, true], ['unrelated', IDS.unrelated, false]]) {
      const sid = '20000000-0000-4000-8000-' + (name === 'founder' ? '000000000002' : name === 'organizer' ? '000000000003' : '000000000004');
      db.sql(`INSERT INTO auth.sessions VALUES('${sid}','${id}',NULL)`);
      if (allow) check(scalar(user(id, 'SELECT hustle_phase2_snapshot() IS NOT NULL', sid)) === 't', `active ${name} allowed`);
      else denied(user(id, 'SELECT hustle_phase2_snapshot()', sid), 'active unrelated user denied');
      db.sql(`DELETE FROM auth.sessions WHERE id='${sid}'`);
      denied(user(id, 'SELECT hustle_phase2_snapshot()', sid), `revoked ${name} session denied`);
    }
    db.sql(`DELETE FROM auth.sessions WHERE id='${SID}'`);
    check(scalar(user(IDS.admin, 'SELECT hustle_phase2_has_active_session()')) === 'f', 'revoked admin session denied without changing profile');
    denied(user(IDS.admin, 'SELECT hustle_phase2_snapshot()'), 'revoked admin cannot read private shortlist');
    for (const role of ['anon', 'service_role']) denied(`SET ROLE ${role}; SELECT hustle_phase2_has_active_session()`, `${role} cannot execute boolean session helper`);
    check(scalar("SELECT prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=\"\"'] AND pg_get_userbyid(proowner)='postgres' FROM pg_proc WHERE oid='hustle_phase2_has_active_session()'::regprocedure") === 't', 'session helper owner/security/search path/stability');
    console.log(JSON.stringify({ passed: checks, failed: 0, postgres: scalar('SHOW server_version'), scope: 'disposable synthetic SQL; no hosted JWT/session compatibility claim' }));
  } finally { await db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
