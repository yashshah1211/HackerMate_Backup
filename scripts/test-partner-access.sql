-- Synthetic fixture only. The runner creates a fresh local PostgreSQL cluster;
-- this file refuses other database names/addresses before any DDL is executed.
\set ON_ERROR_STOP on
SELECT current_database() = 'partner_authz_fixture'
  AND inet_server_addr() = '127.0.0.1'::inet AS local_fixture \gset
\if :local_fixture
\else
  \echo 'Refusing to run outside the disposable local partner_authz_fixture database.'
  \quit 3
\endif

CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id), role text, is_banned boolean
);
CREATE TABLE public.hackathons (
  id uuid PRIMARY KEY, organizer_id uuid REFERENCES public.profiles(id), type text
);

-- Preserve existing table/policy state; foundation must not touch registrations.
CREATE TABLE public.hackathon_registrations (id uuid PRIMARY KEY);
ALTER TABLE public.hackathon_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_registration_policy ON public.hackathon_registrations
  FOR SELECT TO anon USING (true);
GRANT SELECT ON public.hackathon_registrations TO anon;

INSERT INTO auth.users VALUES
 ('00000000-0000-4000-8000-000000000001', 'organizer@example.invalid'),
 ('00000000-0000-4000-8000-000000000002', 'admin@example.invalid'),
 ('00000000-0000-4000-8000-000000000003', ' YASHshah7117@GMAIL.COM '),
 ('00000000-0000-4000-8000-000000000004', 'native@example.invalid'),
 ('00000000-0000-4000-8000-000000000005', 'ordinary@example.invalid'),
 ('00000000-0000-4000-8000-000000000006', 'missing@example.invalid'),
 ('00000000-0000-4000-8000-000000000007', 'yashshah7117+alias@gmail.com'),
 ('00000000-0000-4000-8000-000000000008', 'unknown@example.invalid');
INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-000000000001', 'user', false),
 ('00000000-0000-4000-8000-000000000002', 'admin', false),
 ('00000000-0000-4000-8000-000000000003', 'user', false),
 ('00000000-0000-4000-8000-000000000004', 'user', false),
 ('00000000-0000-4000-8000-000000000005', 'user', false),
 ('00000000-0000-4000-8000-000000000007', 'user', false),
 ('00000000-0000-4000-8000-000000000008', 'admin', NULL);
INSERT INTO public.hackathons VALUES
 ('10000000-0000-4000-8000-000000000001', NULL, 'external'),
 ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'native'),
 ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', 'external');

\ir ../supabase/migrations/202610060002_partner_organizer_access.sql

CREATE FUNCTION public.fixture_assert(value boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
SELECT public.fixture_assert(public.has_partner_admin_access(), 'authoritative admin');
SELECT public.fixture_assert(public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'admin event access');
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000099'), 'nonexistent event denied to admin');
INSERT INTO public.event_organizers(hackathon_id, user_id, created_by) VALUES
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', auth.uid());
DO $$ BEGIN
  BEGIN
    INSERT INTO public.event_organizers(hackathon_id, user_id, created_by) VALUES
      ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', auth.uid());
    RAISE EXCEPTION 'Duplicate assignment accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: unique event/user assignment'; END;
  BEGIN
    INSERT INTO public.event_organizers(hackathon_id, user_id, created_by) VALUES
      ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005');
    RAISE EXCEPTION 'Forged creator accepted';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: provisioning actor bound to auth.uid'; END;
  BEGIN
    INSERT INTO public.event_organizers(hackathon_id, user_id, created_by) VALUES
      ('10000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000001', auth.uid());
    RAISE EXCEPTION 'Missing event accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: event foreign key'; END;
  BEGIN
    INSERT INTO public.event_organizers(hackathon_id, user_id, created_by) VALUES
      ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000006', auth.uid());
    RAISE EXCEPTION 'Missing profile accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: profile foreign key'; END;
END $$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
SELECT public.fixture_assert(public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'assigned organizer correct event');
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000002'), 'cross-event organizer denied');
SELECT public.fixture_assert((SELECT count(*) = 1 FROM public.event_organizers), 'organizer reads own assignment');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.event_organizers(hackathon_id, user_id, created_by) VALUES
      ('10000000-0000-4000-8000-000000000002', auth.uid(), auth.uid());
    RAISE EXCEPTION 'Organizer self-provisioning accepted';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: organizer cannot self-provision'; END;
  BEGIN
    UPDATE public.event_organizers SET hackathon_id = '10000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'Organizer update accepted';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: no membership UPDATE grant'; END;
END $$;
DELETE FROM public.event_organizers;
SELECT public.fixture_assert((SELECT count(*) = 1 FROM public.event_organizers), 'organizer cannot revoke assignments');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', false);
SELECT set_config('request.jwt.claim.email', 'yashshah7117@gmail.com', false);
SELECT public.fixture_assert(NOT public.has_partner_admin_access(), 'spoofed email claim is not auth.users identity');
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'normal user denied despite event/config existence');
SELECT public.fixture_assert((SELECT count(*) = 0 FROM public.event_organizers), 'normal user cannot list memberships');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);
SELECT public.fixture_assert(NOT public.has_partner_admin_access(), 'founder alias denied');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000008', false);
SELECT public.fixture_assert(NOT public.has_partner_admin_access(), 'unknown admin ban state denied');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', false);
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'missing profile denied');
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'missing identity denied');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
SELECT public.fixture_assert(public.can_access_partner_event('10000000-0000-4000-8000-000000000002'), 'supported native owner');
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000003'), 'external organizer_id alone not a native grant');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
SELECT public.fixture_assert(public.has_partner_admin_access(), 'normalized exact founder parity');
SELECT public.fixture_assert(public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'founder event access');
DELETE FROM public.event_organizers;
SELECT public.fixture_assert((SELECT count(*) = 0 FROM public.event_organizers), 'founder can revoke');
INSERT INTO public.event_organizers(hackathon_id, user_id, created_by) VALUES
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', auth.uid());
SELECT public.fixture_assert((SELECT count(*) = 1 FROM public.event_organizers), 'founder can provision');

RESET ROLE;
UPDATE public.profiles SET is_banned = true WHERE id IN
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'banned organizer denied');
SELECT public.fixture_assert((SELECT count(*) = 0 FROM public.event_organizers), 'banned organizer cannot read assignment');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
SELECT public.fixture_assert(NOT public.has_partner_admin_access(), 'banned admin denied');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
SELECT public.fixture_assert(NOT public.has_partner_admin_access(), 'banned founder denied');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000002'), 'banned native owner denied');

RESET ROLE;
UPDATE public.profiles SET is_banned = false WHERE id = '00000000-0000-4000-8000-000000000001';
DELETE FROM public.event_organizers;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
SELECT public.fixture_assert(NOT public.can_access_partner_event('10000000-0000-4000-8000-000000000001'), 'revoked organizer denied');
DO $$ BEGIN
  BEGIN
    PERFORM public.can_access_partner_event('10000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000002'::uuid);
    RAISE EXCEPTION 'Caller supplied identity accepted';
  EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'PASS: no caller identity argument'; END;
END $$;

SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.can_access_partner_event('10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Anonymous RPC accepted';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon RPC revoked'; END;
  BEGIN
    PERFORM 1 FROM public.event_organizers;
    RAISE EXCEPTION 'Anonymous membership access accepted';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon table access revoked'; END;
END $$;

RESET ROLE;
SELECT public.fixture_assert(NOT has_table_privilege('service_role', 'public.event_organizers', 'SELECT'), 'no unnecessary service-role table grant');
SELECT public.fixture_assert(NOT has_table_privilege('authenticated', 'public.event_organizers', 'UPDATE'), 'no raw membership updates');
SELECT public.fixture_assert(NOT has_table_privilege('authenticated', 'public.event_organizers', 'TRUNCATE'), 'no raw membership truncate');
SELECT public.fixture_assert(NOT has_function_privilege('anon', 'public.has_partner_admin_access()', 'EXECUTE'), 'anon admin predicate revoked');
SELECT public.fixture_assert(NOT has_function_privilege('service_role', 'public.can_access_partner_event(uuid)', 'EXECUTE'), 'service-role RPC revoked');
SELECT public.fixture_assert((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp']) FROM pg_proc WHERE oid IN ('public.has_partner_admin_access()'::regprocedure, 'public.can_access_partner_event(uuid)'::regprocedure)), 'definer search_path pinned');
SELECT public.fixture_assert(has_table_privilege('anon', 'public.hackathon_registrations', 'SELECT') AND EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'hackathon_registrations' AND policyname = 'fixture_registration_policy'), 'existing registration boundary unchanged by foundation');
\echo 'All local PostgreSQL partner-access assertions passed.'
