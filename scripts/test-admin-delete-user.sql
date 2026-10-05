-- ONLY for a fresh disposable localhost PostgreSQL cluster started with
-- -c hm.fixture_only=admin-delete-user. Never run against a real database.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_setting('hm.fixture_only', true) IS DISTINCT FROM 'admin-delete-user' THEN
    RAISE EXCEPTION 'Disposable deletion-test cluster required';
  END IF;
END $$;

CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL, role text DEFAULT 'user', is_banned boolean DEFAULT false,
  full_name text, college text
);
CREATE TABLE public.teams (id uuid PRIMARY KEY, name text NOT NULL, owner_id uuid NOT NULL);
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  created_at timestamptz, UNIQUE(team_id, user_id)
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  message text NOT NULL, link text
);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner uuid, owner_id text);
CREATE TABLE public.fixture_cascade (user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE);
CREATE TABLE public.fixture_set_null (user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL);
CREATE TABLE public.fixture_restrict (user_id uuid REFERENCES auth.users(id));
CREATE TABLE public.fixture_team_asset (team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE);
CREATE TABLE auth.sessions (user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE TABLE public.fixture_results (name text PRIMARY KEY);

-- Use the actual audit migration, including its deliberately nonblocking trigger.
\ir ../supabase/migrations/202608030005_add_deleted_user_logs_audit_trigger.sql
\ir ../supabase/migrations/202610060001_restore_safe_user_deletion.sql

CREATE FUNCTION public.fixture_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION public.fixture_reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('hm.fail_stage', '', false);
  TRUNCATE public.fixture_restrict, storage.objects;
  TRUNCATE public.teams CASCADE;
  TRUNCATE auth.users CASCADE;
  TRUNCATE public.notifications, public.deleted_user_logs;
  INSERT INTO auth.users VALUES
    (fixture_id(1), 'operator@example.invalid'),
    (fixture_id(2), 'target@example.invalid'),
    (fixture_id(3), 'oldest@example.invalid'),
    (fixture_id(4), 'newer@example.invalid'),
    (fixture_id(5), 'banned@example.invalid'),
    (fixture_id(6), 'yashshah7117@gmail.com');
  INSERT INTO public.profiles(id, email, role, is_banned)
  SELECT id, email, CASE WHEN id = fixture_id(1) THEN 'admin' ELSE 'user' END,
    id = fixture_id(5) FROM auth.users;
  INSERT INTO auth.sessions VALUES (fixture_id(2));
  INSERT INTO public.fixture_cascade VALUES (fixture_id(2));
  INSERT INTO public.fixture_set_null VALUES (fixture_id(2));
  INSERT INTO public.notifications(user_id, message) VALUES (fixture_id(2), 'old notification');
  PERFORM set_config('request.jwt.claim.sub', fixture_id(1)::text, false);
END $$;
CREATE FUNCTION public.fixture_team(n integer, member boolean DEFAULT true) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.teams VALUES (fixture_id(n), 'Throwaway team', fixture_id(2));
  INSERT INTO public.team_members(team_id, user_id, role, created_at)
  VALUES (fixture_id(n), fixture_id(2), 'owner', '2026-01-01');
  IF member THEN
    INSERT INTO public.team_members(team_id, user_id, role, created_at) VALUES
      (fixture_id(n), fixture_id(3), 'member', '2026-01-02'),
      (fixture_id(n), fixture_id(4), 'member', '2026-01-03'),
      (fixture_id(n), fixture_id(5), 'member', '2025-01-01');
  END IF;
  INSERT INTO public.fixture_team_asset VALUES (fixture_id(n));
END $$;
CREATE FUNCTION public.fixture_snapshot() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'users', (SELECT jsonb_agg(u ORDER BY id) FROM auth.users u),
    'profiles', (SELECT jsonb_agg(p ORDER BY id) FROM public.profiles p),
    'teams', (SELECT jsonb_agg(t ORDER BY id) FROM public.teams t),
    'members', (SELECT jsonb_agg(m ORDER BY id) FROM public.team_members m),
    'notifications', (SELECT jsonb_agg(n ORDER BY id) FROM public.notifications n),
    'audit', (SELECT jsonb_agg(a ORDER BY id) FROM public.deleted_user_logs a),
    'cascade', (SELECT jsonb_agg(c) FROM public.fixture_cascade c),
    'set_null', (SELECT jsonb_agg(s) FROM public.fixture_set_null s),
    'sessions', (SELECT jsonb_agg(s) FROM auth.sessions s),
    'assets', (SELECT jsonb_agg(a ORDER BY team_id) FROM public.fixture_team_asset a)
  );
$$;
CREATE FUNCTION public.fixture_assert(name text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', name; END IF;
  INSERT INTO public.fixture_results VALUES (name);
END $$;
CREATE FUNCTION public.fixture_expect_failure(name text, code text, target uuid DEFAULT public.fixture_id(2))
RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state jsonb := public.fixture_snapshot(); actual_code text;
BEGIN
  BEGIN
    PERFORM public.delete_user_completely(target);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_code = RETURNED_SQLSTATE;
  END;
  PERFORM public.fixture_assert(name || ' rejects', actual_code = code);
  PERFORM public.fixture_assert(name || ' rolls back every row', before_state = public.fixture_snapshot());
END $$;
CREATE FUNCTION public.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('hm.fail_stage', true) = TG_ARGV[0] THEN
    RAISE EXCEPTION 'Injected local % failure', TG_ARGV[0];
  END IF;
  IF current_setting('hm.fail_stage', true) = TG_ARGV[0] || '_skip' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fixture_owner_update BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.fixture_fail('ownership');
CREATE TRIGGER fixture_membership_update BEFORE UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.fixture_fail('membership');
CREATE TRIGGER fixture_notification_insert BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.fixture_fail('notification');
CREATE TRIGGER fixture_notification_delete BEFORE DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.fixture_fail('notification_cleanup');
CREATE TRIGGER fixture_team_delete BEFORE DELETE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.fixture_fail('team_delete');
CREATE TRIGGER fixture_auth_delete BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.fixture_fail('auth_delete');
CREATE TRIGGER fixture_audit_insert BEFORE INSERT ON public.deleted_user_logs
FOR EACH ROW EXECUTE FUNCTION public.fixture_fail('audit');

SELECT fixture_assert('authenticated execute retained', has_function_privilege('authenticated', 'public.delete_user_completely(uuid)', 'EXECUTE'));
SELECT fixture_assert('anon execute denied', NOT has_function_privilege('anon', 'public.delete_user_completely(uuid)', 'EXECUTE'));
SELECT fixture_assert('service execute denied', NOT has_function_privilege('service_role', 'public.delete_user_completely(uuid)', 'EXECUTE'));
SELECT fixture_assert('search_path pinned', (SELECT proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid = 'public.delete_user_completely(uuid)'::regprocedure));

SELECT fixture_reset();
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT fixture_expect_failure('unauthenticated RPC', '42501');
SELECT set_config('request.jwt.claim.sub', fixture_id(3)::text, false);
SELECT fixture_expect_failure('ordinary caller RPC', '42501');
UPDATE auth.users SET email = 'notAdMiN@admin.example.invalid' WHERE id = fixture_id(3);
SELECT fixture_expect_failure('admin substring RPC', '42501');
UPDATE auth.users SET email = 'yashshah7117+admin@gmail.com' WHERE id = fixture_id(3);
SELECT fixture_expect_failure('near-founder RPC', '42501');
SELECT set_config('request.jwt.claim.sub', fixture_id(1)::text, false);
UPDATE public.profiles SET is_banned = true WHERE id = fixture_id(1);
SELECT fixture_expect_failure('banned admin RPC', '42501');
UPDATE public.profiles SET is_banned = false WHERE id = fixture_id(1);
UPDATE public.profiles SET role = 'admin' WHERE id = fixture_id(2);
SELECT fixture_expect_failure('protected admin RPC', '42501');
UPDATE public.profiles SET role = 'user' WHERE id = fixture_id(2);
UPDATE auth.users SET email = ' YASHSHAH7117@GMAIL.COM ' WHERE id = fixture_id(2);
SELECT fixture_expect_failure('protected authenticated founder RPC', '42501');
UPDATE auth.users SET email = 'target@example.invalid' WHERE id = fixture_id(2);
SELECT fixture_expect_failure('missing target', 'P0002', fixture_id(999));

-- Successful deletion under the authenticated role, with no owner mutations.
SELECT fixture_reset();
SET ROLE authenticated;
SELECT public.delete_user_completely('00000000-0000-4000-8000-000000000002');
RESET ROLE;
SELECT fixture_assert('ordinary target Auth removed', NOT EXISTS(SELECT 1 FROM auth.users WHERE id = fixture_id(2)));
SELECT fixture_assert('profile removed by cascade', NOT EXISTS(SELECT 1 FROM public.profiles WHERE id = fixture_id(2)));
SELECT fixture_assert('session removed by cascade', NOT EXISTS(SELECT 1 FROM auth.sessions WHERE user_id = fixture_id(2)));
SELECT fixture_assert('dependent cascade', NOT EXISTS(SELECT 1 FROM public.fixture_cascade));
SELECT fixture_assert('dependent set-null', EXISTS(SELECT 1 FROM public.fixture_set_null WHERE user_id IS NULL));
SELECT fixture_assert('unconstrained notifications cleaned', NOT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = fixture_id(2)));
SELECT fixture_assert('audit retained', EXISTS(SELECT 1 FROM public.deleted_user_logs WHERE user_id = fixture_id(2)));
SELECT fixture_expect_failure('retry after committed deletion', 'P0002');

SELECT fixture_reset();
SELECT fixture_team(10);
SELECT fixture_team(11, false);
-- A null timestamp does not outrank a recorded membership date.
UPDATE public.team_members SET created_at = NULL WHERE user_id = fixture_id(4);
SELECT public.delete_user_completely(fixture_id(2));
SELECT fixture_assert('oldest eligible created_at successor', (SELECT owner_id = fixture_id(3) FROM public.teams WHERE id = fixture_id(10)));
SELECT fixture_assert('successor membership promoted', EXISTS(SELECT 1 FROM public.team_members WHERE team_id = fixture_id(10) AND user_id = fixture_id(3) AND role = 'owner'));
SELECT fixture_assert('one owner membership', (SELECT count(*) = 1 FROM public.team_members WHERE team_id = fixture_id(10) AND role = 'owner'));
SELECT fixture_assert('successor notification canonical link', EXISTS(SELECT 1 FROM public.notifications WHERE user_id = fixture_id(3) AND link = '/teams/' || fixture_id(10)::text));
SELECT fixture_assert('owner-only team disbanded', NOT EXISTS(SELECT 1 FROM public.teams WHERE id = fixture_id(11)));
SELECT fixture_assert('disbanded team assets cascade', NOT EXISTS(SELECT 1 FROM public.fixture_team_asset WHERE team_id = fixture_id(11)));
SELECT fixture_assert('surviving team assets preserved', EXISTS(SELECT 1 FROM public.fixture_team_asset WHERE team_id = fixture_id(10)));
SELECT fixture_assert('owner deletion continues', NOT EXISTS(SELECT 1 FROM auth.users WHERE id = fixture_id(2)));

SELECT fixture_reset();
SELECT fixture_team(10);
UPDATE public.team_members SET created_at = '2026-01-02' WHERE user_id = fixture_id(4);
SELECT public.delete_user_completely(fixture_id(2));
SELECT fixture_assert('timestamp tie breaks by user ID', (SELECT owner_id = fixture_id(3) FROM public.teams WHERE id = fixture_id(10)));

SELECT fixture_reset();
SELECT fixture_team(10);
UPDATE public.profiles SET is_banned = true WHERE id IN (fixture_id(3), fixture_id(4));
SELECT fixture_expect_failure('occupied team with no eligible successor', 'P0001');

DO $$ DECLARE stage text; BEGIN
  FOREACH stage IN ARRAY ARRAY['ownership', 'membership', 'notification', 'notification_cleanup', 'auth_delete', 'audit'] LOOP
    PERFORM fixture_reset();
    PERFORM fixture_team(10);
    PERFORM fixture_team(11, false);
    PERFORM set_config('hm.fail_stage', stage, false);
    PERFORM fixture_expect_failure(stage || ' failure across multiple teams', 'P0001');
  END LOOP;
  PERFORM fixture_reset();
  PERFORM fixture_team(10);
  PERFORM fixture_team(11, false);
  PERFORM set_config('hm.fail_stage', 'team_delete', false);
  PERFORM fixture_expect_failure('owner-only disband failure after prior transfer', 'P0001');
  FOREACH stage IN ARRAY ARRAY['ownership_skip', 'membership_skip', 'notification_skip', 'notification_cleanup_skip', 'team_delete_skip', 'auth_delete_skip'] LOOP
    PERFORM fixture_reset();
    PERFORM fixture_team(10);
    PERFORM fixture_team(11, false);
    PERFORM set_config('hm.fail_stage', stage, false);
    PERFORM fixture_expect_failure(stage || ' zero-row mutation', 'P0001');
  END LOOP;
  PERFORM fixture_reset();
  PERFORM fixture_team(10);
  INSERT INTO public.deleted_user_logs(user_id) VALUES (fixture_id(2));
  PERFORM set_config('hm.fail_stage', 'audit', false);
  PERFORM fixture_expect_failure('old audit record cannot hide audit failure', 'P0001');
END $$;

SELECT fixture_reset();
SELECT fixture_team(10);
INSERT INTO public.fixture_restrict VALUES (fixture_id(2));
SELECT fixture_expect_failure('NO ACTION FK blocks Auth deletion', '23503');
SELECT fixture_reset();
SELECT fixture_team(10);
INSERT INTO storage.objects(owner_id) VALUES (fixture_id(2)::text);
SELECT fixture_expect_failure('storage owner_id blocks deletion', 'P0001');
TRUNCATE storage.objects;
INSERT INTO storage.objects(owner) VALUES (fixture_id(2));
SELECT fixture_expect_failure('legacy storage owner blocks deletion', 'P0001');

SELECT fixture_reset();
SELECT fixture_team(10);
DO $$ DECLARE before_state jsonb := fixture_snapshot(); actual_code text; BEGIN
  ALTER TABLE public.teams RENAME TO fixture_missing_teams;
  BEGIN
    PERFORM public.delete_user_completely(fixture_id(2));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_code = RETURNED_SQLSTATE;
  END;
  ALTER TABLE public.fixture_missing_teams RENAME TO teams;
  PERFORM fixture_assert('failed team lookup rejects', actual_code = '42P01');
  PERFORM fixture_assert('failed team lookup rolls back every row', before_state = fixture_snapshot());
END $$;

-- Founder exception uses auth.users email, not editable profiles.email.
SELECT fixture_reset();
UPDATE public.profiles SET email = 'yashshah7117@gmail.com' WHERE id = fixture_id(3);
SELECT set_config('request.jwt.claim.sub', fixture_id(3)::text, false);
SELECT fixture_expect_failure('profile email cannot grant founder access', '42501');
SELECT set_config('request.jwt.claim.sub', fixture_id(6)::text, false);
SELECT public.delete_user_completely(fixture_id(2));
SELECT fixture_assert('exact authenticated founder allowed', NOT EXISTS(SELECT 1 FROM auth.users WHERE id = fixture_id(2)));

-- Preserve the settings self-delete RPC; the HTTP admin route blocks self-delete.
SELECT fixture_reset();
SELECT fixture_team(10);
SELECT set_config('request.jwt.claim.sub', fixture_id(2)::text, false);
SELECT public.delete_user_completely(fixture_id(2));
SELECT fixture_assert('existing self-delete RPC preserved', NOT EXISTS(SELECT 1 FROM auth.users WHERE id = fixture_id(2)));

SELECT count(*) AS passed_postgresql_checks FROM public.fixture_results;
SELECT name FROM public.fixture_results ORDER BY name;
