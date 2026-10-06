-- Synthetic data only. No .env, production URL or existing cluster is used.
\set ON_ERROR_STOP on
SELECT current_database() = 'partner_authz_fixture'
  AND inet_server_addr() = '127.0.0.1'::inet AS local_fixture \gset
\if :local_fixture
\else
  \echo 'Refusing to run outside the disposable local fixture database.'
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
CREATE FUNCTION public.fixture_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id), role text, is_banned boolean,
  full_name text, college text, skills text[], avatar_url text,
  show_track_record boolean DEFAULT true, email text, phone text
);
CREATE TABLE public.hackathons (
  id uuid PRIMARY KEY, organizer_id uuid REFERENCES public.profiles(id), type text,
  min_team_size integer, max_team_size integer, status text, ai_feedback jsonb,
  archived boolean DEFAULT false
);
CREATE TABLE public.teams (
  id uuid PRIMARY KEY, name text, created_at timestamptz, is_recruiting boolean,
  roles_needed text[], max_members integer, hackathon_id uuid,
  workspace_secret text -- deliberately unavailable in any projection
);
CREATE TABLE public.team_hackathons (
  team_id uuid REFERENCES public.teams(id), hackathon_id uuid REFERENCES public.hackathons(id),
  PRIMARY KEY(team_id, hackathon_id)
);
CREATE INDEX fixture_th_event ON public.team_hackathons(hackathon_id);
CREATE TABLE public.team_members (
  team_id uuid REFERENCES public.teams(id), user_id uuid REFERENCES auth.users(id),
  PRIMARY KEY(team_id, user_id)
);
-- Permit a synthetic orphan profile to exercise defensive LEFT JOIN behavior;
-- production's registration/profile FK ordinarily prevents this state.
CREATE TABLE public.hackathon_registrations (
  id uuid PRIMARY KEY, hackathon_id uuid REFERENCES public.hackathons(id), user_id uuid REFERENCES auth.users(id),
  status text, looking_for_team boolean, created_at timestamptz, is_hidden boolean DEFAULT false,
  team_id uuid, metadata jsonb, UNIQUE(hackathon_id, user_id)
);
ALTER TABLE public.hackathon_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_registration_read ON public.hackathon_registrations FOR SELECT TO anon USING (true);
GRANT SELECT ON public.hackathon_registrations TO anon;
-- No authenticated base-table SELECT grants: RPCs must work without broad grants.

INSERT INTO auth.users SELECT public.fixture_id(n), 'fixture-' || n || '@example.invalid'
FROM (SELECT generate_series(1,8) n UNION ALL SELECT generate_series(101,111)
  UNION ALL SELECT generate_series(201,220) UNION ALL SELECT generate_series(1001,2005)) AS ids;
UPDATE auth.users SET email = ' YASHshah7117@GMAIL.COM ' WHERE id = public.fixture_id(3);
INSERT INTO public.profiles(id,role,is_banned,full_name,college,skills,avatar_url,email,phone)
SELECT id, CASE WHEN id = public.fixture_id(2) THEN 'admin' ELSE 'user' END, false,
  'Builder ' || right(id::text, 4), ' College A ', ARRAY[' React ', 'react', 'REACT', '', 'SQL', NULL],
  '/fixture-avatar.png', email, 'private phone'
FROM auth.users WHERE id NOT IN (public.fixture_id(6), public.fixture_id(105));
UPDATE public.profiles SET full_name = 'Alice', college = NULL, skills = NULL WHERE id = public.fixture_id(104);
UPDATE public.profiles SET college = 'College B', skills = ARRAY['Python'] WHERE id = public.fixture_id(103);
UPDATE public.profiles SET is_banned = NULL WHERE id = public.fixture_id(8);
INSERT INTO public.hackathons VALUES
 (public.fixture_id(10001), NULL, 'external', 2, 4, 'approved', '{}', false),
 (public.fixture_id(10002), NULL, 'external', NULL, NULL, 'approved', '{}', false),
 (public.fixture_id(10003), NULL, 'external', 1, 4, 'approved', '{}', false),
 (public.fixture_id(10004), NULL, 'external', 1, 4, 'approved', '{}', false),
 (public.fixture_id(10005), public.fixture_id(4), 'native', 1, 4, 'pending', '{}', false),
 (public.fixture_id(10006), public.fixture_id(4), 'native', 1, 4, 'approved', '{}', false),
 (public.fixture_id(10007), NULL, 'external', 1, 4, 'approved', '{}', true),
 (public.fixture_id(10008), NULL, 'external', 1, 4, 'approved', '{}', false);
INSERT INTO public.hackathon_registrations(id,hackathon_id,user_id,status,looking_for_team,created_at,metadata)
SELECT public.fixture_id(30000+n), public.fixture_id(10001), public.fixture_id(n),
  CASE WHEN n IN (104,105) THEN 'waitlisted' ELSE 'confirmed' END, n >= 103,
  '2026-01-01'::timestamptz + n * interval '1 minute', '{"email":"secret@example.invalid","phone":"secret"}'
FROM generate_series(101,105) AS n;
INSERT INTO public.hackathon_registrations(id,hackathon_id,user_id,status,looking_for_team,created_at)
SELECT public.fixture_id(40000+n), public.fixture_id(10008), public.fixture_id(n), 'confirmed', true,
  '2026-01-01'::timestamptz FROM generate_series(1001,1500) AS n;
INSERT INTO public.hackathon_registrations(id,hackathon_id,user_id,status,looking_for_team,created_at)
SELECT public.fixture_id(30000+n), public.fixture_id(10002), public.fixture_id(n), 'confirmed', true,
  '2026-01-01'::timestamptz + n * interval '1 minute' FROM generate_series(201,220) AS n;
INSERT INTO public.hackathon_registrations(id,hackathon_id,user_id,status,looking_for_team,created_at)
SELECT public.fixture_id(30000+n), public.fixture_id(10003), public.fixture_id(n), 'confirmed', true,
  '2026-01-01'::timestamptz + n * interval '1 minute' FROM generate_series(1001,2005) AS n;
INSERT INTO public.teams VALUES
 (public.fixture_id(20001), 'Alpha', '2026-01-01', true, ARRAY['Designer'], 4, NULL, 'secret'),
 (public.fixture_id(20002), 'Beta', '2026-01-02', false, NULL, 4, NULL, 'secret'),
 (public.fixture_id(20003), 'Empty', '2026-01-03', true, ARRAY[]::text[], 0, NULL, 'secret'),
 (public.fixture_id(20004), 'Large', '2026-01-04', true, ARRAY['Developer'], 6, NULL, 'secret'),
 (public.fixture_id(20005), 'Unrelated', '2026-01-05', true, NULL, 4, NULL, 'secret'),
 (public.fixture_id(20006), 'Legacy only', '2026-01-06', true, NULL, 4, public.fixture_id(10001), 'secret');
INSERT INTO public.team_hackathons VALUES
 (public.fixture_id(20001), public.fixture_id(10001)),
 (public.fixture_id(20002), public.fixture_id(10001)),
 (public.fixture_id(20003), public.fixture_id(10001)),
 (public.fixture_id(20004), public.fixture_id(10001)),
 (public.fixture_id(20005), public.fixture_id(10002)),
 (public.fixture_id(20001), public.fixture_id(10008));
INSERT INTO public.team_members VALUES
 (public.fixture_id(20001), public.fixture_id(101)),
 (public.fixture_id(20001), public.fixture_id(103)),
 (public.fixture_id(20001), public.fixture_id(106)),
 (public.fixture_id(20002), public.fixture_id(101)),
 (public.fixture_id(20005), public.fixture_id(102)),
 (public.fixture_id(20006), public.fixture_id(104));
INSERT INTO public.team_members SELECT public.fixture_id(20004), public.fixture_id(n) FROM generate_series(107,111) AS n;

\ir ../supabase/migrations/202610060002_partner_organizer_access.sql
\ir ../supabase/migrations/202610060003_partner_read_projections.sql
INSERT INTO public.event_organizers(hackathon_id,user_id,created_by)
SELECT public.fixture_id(n),public.fixture_id(1),public.fixture_id(2) FROM generate_series(10001,10004) AS n;
INSERT INTO public.event_organizers(hackathon_id,user_id,created_by)
VALUES(public.fixture_id(10008),public.fixture_id(1),public.fixture_id(2));

CREATE FUNCTION public.fixture_assert(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;
CREATE FUNCTION public.fixture_error(command text, expected_state text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected_state THEN RAISE EXCEPTION 'FAIL: % (got %, expected %)', label, SQLSTATE, expected_state; END IF;
    RAISE NOTICE 'PASS: %', label; RETURN;
  END;
  RAISE EXCEPTION 'FAIL: % (accepted)', label;
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', public.fixture_id(1)::text, false);
SELECT public.fixture_assert((SELECT registration_count = 5 AND confirmed_count = 3 AND waitlisted_count = 2
  AND team_count = 4 AND participants_in_team = 2 AND participants_without_team = 3
  AND looking_for_team_count = 3 AND looking_without_team_count = 2
  FROM public.get_partner_organizer_overview(public.fixture_id(10001))), '5-row overview: distinct event members, unrelated/legacy links ignored');
SELECT public.fixture_assert((SELECT registration_count = 20 FROM public.get_partner_organizer_overview(public.fixture_id(10002))), '20 registrations');
SELECT public.fixture_assert((SELECT registration_count = 500 AND confirmed_count = 500
  AND participants_in_team = 0 AND participants_without_team = 500 AND looking_without_team_count = 500
  FROM public.get_partner_organizer_overview(public.fixture_id(10008))), '500-row overview: linked team members are not inferred registrations');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10008),450,100)->>'total')::int = 500
  AND jsonb_array_length(public.list_partner_organizer_participants(public.fixture_id(10008),450,100)->'items') = 50,
  '500-row last page retains authoritative total');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10008),p_limit=>1,p_skill=>' REACT ')->>'total')::int = 500,
  '500-row normalized skill filter total independent of page');
SELECT public.fixture_assert((SELECT registration_count = 1005 FROM public.get_partner_organizer_overview(public.fixture_id(10003))), '1005 registrations beyond REST row cap');
SELECT public.fixture_assert((SELECT registration_count = 0 AND team_count = 0 AND participants_without_team = 0 FROM public.get_partner_organizer_overview(public.fixture_id(10004))), 'zero registrations is a real aggregate');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10003))->>'total')::int = 1005
  AND jsonb_array_length(public.list_partner_organizer_participants(public.fixture_id(10003))->'items') = 50, 'default page has independent total');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10003),1000,10)->>'total')::int = 1005
  AND jsonb_array_length(public.list_partner_organizer_participants(public.fixture_id(10003),1000,10)->'items') = 5, 'last page retains total');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10003),2000,10)->>'total')::int = 1005
  AND jsonb_array_length(public.list_partner_organizer_participants(public.fixture_id(10003),2000,10)->'items') = 0, 'out-of-range page retains total');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001))->'items'->0->>'user_id') = public.fixture_id(105)::text, 'newest first even missing profile');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_sort=>'oldest')->'items'->0->>'user_id') = public.fixture_id(101)::text, 'oldest allowlisted sort');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_sort=>'name_asc')->'items'->0->>'full_name') = 'Alice', 'name sort');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_college=>' college a ')->>'total')::int = 2, 'college exact case/space normalization');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_skill=>' REACT ')->>'total')::int = 2, 'declared skill filter ignores duplicate variants');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_sort=>'oldest')->'items'->0->'skills') = '["react","sql"]'::jsonb, 'skill output normalized, distinct, no null/empty values');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_status=>'waitlisted')->>'total')::int = 2, 'recorded status filter');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_team_state=>'in_team')->>'total')::int = 2, 'in-team filter distinct across multiple teams');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_team_state=>'without_team')->>'total')::int = 3, 'unrelated membership does not satisfy event team filter');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_looking_for_team=>true,p_team_state=>'without_team')->>'total')::int = 2, 'looking without event team combined filter');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_looking_for_team=>false)->>'total')::int = 2, 'explicit false looking state filter');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_search=>'alice')->>'total')::int = 1, 'name substring search');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_search=>'college b')->>'total')::int = 1, 'college substring search');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_search=>'%')->>'total')::int = 0, 'search wildcard is literal');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_search=>'Alice')->'items'->0) @> '{"college":null,"skills":[]}'::jsonb, 'missing college and skills preserved safely');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001))->'items'->0) @> '{"full_name":null,"college":null,"skills":[]}'::jsonb, 'missing registrant profile retained');
SELECT public.fixture_assert(jsonb_array_length(public.list_partner_organizer_participants(public.fixture_id(10001),p_sort=>'oldest')->'items'->0->'event_teams') = 2, 'multiple event memberships summarized');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10001),p_limit=>1,p_skill=>'react')->>'total')::int = 2, 'filtered total independent of page length');
SELECT public.fixture_assert((SELECT registration_count = 5 FROM public.get_partner_organizer_overview(public.fixture_id(10001))), 'paginated/filtered reads never alter overview totals');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10004))->'items') = '[]'::jsonb, 'empty participant list');

SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001))->>'total')::int = 4, 'only event-linked teams, not legacy hackathon_id');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001))->'items'->0) @>
  '{"team_name":"Alpha","member_count":3,"registered_member_count":2,"event_min_team_size":2,"event_max_team_size":4}'::jsonb, 'registered subset differs from full team size');
SELECT public.fixture_assert(jsonb_array_length(public.list_partner_organizer_teams(public.fixture_id(10001))->'items'->0->'roster') = 3, 'current minimal roster includes unregistered member');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_search=>'beta')->'items'->0) @>
  '{"member_count":1,"registered_member_count":1,"roles_needed":[]}'::jsonb, 'same registrant in another team counts once per team');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_search=>'empty')->'items'->0) @>
  '{"member_count":0,"registered_member_count":0,"roster":[],"max_members":null}'::jsonb, 'empty team and invalid capacity');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_recruiting=>true)->>'total')::int = 3, 'recruiting filter');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_recruiting=>false)->>'total')::int = 1, 'not recruiting filter');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_min_members=>1,p_max_members=>3)->>'total')::int = 2, 'numeric size range');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_size_state=>'below_min')->>'total')::int = 2, 'below recorded minimum');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_size_state=>'above_max')->>'total')::int = 1, 'above recorded maximum');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_size_state=>'within_limits')->>'total')::int = 1, 'within recorded size limits only');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10002),p_size_state=>'unknown_limits')->>'total')::int = 1
  AND (public.list_partner_organizer_teams(public.fixture_id(10002),p_size_state=>'within_limits')->>'total')::int = 0, 'missing limits do not fabricate compliance');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_sort=>'size_desc')->'items'->0->>'team_name') = 'Large', 'size descending sort');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),20,1)->>'total')::int = 4
  AND (public.list_partner_organizer_teams(public.fixture_id(10001),20,1)->'items') = '[]'::jsonb, 'empty team page retains total');

-- Strict key allowlists catch accidental future PII/metadata additions.
SELECT public.fixture_assert(NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.list_partner_organizer_participants(public.fixture_id(10001))->'items') item,
    jsonb_object_keys(item) k WHERE k NOT IN ('user_id','full_name','college','skills','status','looking_for_team','created_at','event_teams')),
  'participant projection excludes PII/admin/metadata fields');
SELECT public.fixture_assert(NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.list_partner_organizer_teams(public.fixture_id(10001))->'items') item,
    jsonb_object_keys(item) k WHERE k NOT IN ('team_id','team_name','member_count','registered_member_count','is_recruiting','roles_needed','max_members','event_min_team_size','event_max_team_size','roster')),
  'team projection excludes workspace/chat/tasks/resources and invented success');
SELECT public.fixture_assert(NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.list_partner_organizer_teams(public.fixture_id(10001))->'items') item,
    jsonb_array_elements(item->'roster') member, jsonb_object_keys(member) k
    WHERE k NOT IN ('user_id','full_name','registered_for_event')), 'minimal roster projection');

-- Exercise every private function against every denied identity/state.
RESET ROLE;
CREATE FUNCTION public.fixture_private_denied(label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(10001))', '42501', label || ': overview');
  PERFORM public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001))', '42501', label || ': participants');
  PERFORM public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10001))', '42501', label || ': teams');
END;
$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.fixture_private_denied('missing identity');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(5)::text,false);
SELECT public.fixture_private_denied('ordinary caller');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(6)::text,false);
SELECT public.fixture_private_denied('missing caller profile');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(8)::text,false);
SELECT public.fixture_private_denied('unknown ban state');
RESET ROLE;
INSERT INTO public.event_organizers(hackathon_id,user_id,created_by) VALUES (public.fixture_id(10002),public.fixture_id(7),public.fixture_id(2));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(7)::text,false);
SELECT public.fixture_private_denied('wrong-event organizer');
RESET ROLE;
UPDATE public.profiles SET is_banned = true WHERE id = public.fixture_id(1);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(1)::text,false);
SELECT public.fixture_private_denied('banned organizer');
RESET ROLE;
UPDATE public.profiles SET is_banned = false WHERE id = public.fixture_id(1);
DELETE FROM public.event_organizers WHERE hackathon_id = public.fixture_id(10001) AND user_id = public.fixture_id(1);
SET ROLE authenticated;
SELECT public.fixture_private_denied('revoked organizer');
SET ROLE anon;
SELECT public.fixture_private_denied('anonymous execution');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(2)::text,false);
SELECT public.fixture_assert((SELECT registration_count = 5 FROM public.get_partner_organizer_overview(public.fixture_id(10001)))
  AND (public.list_partner_organizer_participants(public.fixture_id(10001))->>'total')::int = 5
  AND (public.list_partner_organizer_teams(public.fixture_id(10001))->>'total')::int = 4, 'admin all private RPCs');
SELECT public.fixture_assert((SELECT registration_count = 500 AND participants_in_team = 0 FROM public.get_partner_organizer_overview(public.fixture_id(10008))), '500 registrations: shared team link does not count unregistered members');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(10008),p_sort=>'newest')->'items'->0->>'user_id') = public.fixture_id(1001)::text
  AND (public.list_partner_organizer_participants(public.fixture_id(10008),p_offset=>50,p_sort=>'newest')->'items'->0->>'user_id') = public.fixture_id(1051)::text,
  'stable UUID tie-breaker prevents overlap when timestamps match');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(3)::text,false);
SELECT public.fixture_assert((SELECT registration_count = 5 FROM public.get_partner_organizer_overview(public.fixture_id(10001)))
  AND (public.list_partner_organizer_participants(public.fixture_id(10001))->>'total')::int = 5
  AND (public.list_partner_organizer_teams(public.fixture_id(10001))->>'total')::int = 4, 'normalized exact founder all private RPCs');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(4)::text,false);
SELECT public.fixture_assert((SELECT registration_count = 0 FROM public.get_partner_organizer_overview(public.fixture_id(10006)))
  AND (public.list_partner_organizer_participants(public.fixture_id(10006))->>'total')::int = 0
  AND (public.list_partner_organizer_teams(public.fixture_id(10006))->>'total')::int = 0, 'native organizer all private RPCs');
RESET ROLE;
UPDATE public.profiles SET is_banned = true WHERE id IN (public.fixture_id(2),public.fixture_id(3),public.fixture_id(4));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(2)::text,false);
SELECT public.fixture_private_denied('banned admin');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(3)::text,false);
SELECT public.fixture_private_denied('banned founder');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(4)::text,false);
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(10006))','42501','banned native overview');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10006))','42501','banned native participants');
SELECT public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10006))','42501','banned native teams');
RESET ROLE;
UPDATE public.profiles SET is_banned = false WHERE id IN (public.fixture_id(2),public.fixture_id(3),public.fixture_id(4));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(2)::text,false);
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(99999))','42501','nonexistent event denied to admin');
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(NULL)','42501','null event denied');
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(''invalid''::uuid)','22P02','malformed UUID rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_limit=>101)','22023','oversized participant page rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_limit=>NULL)','22023','unknown participant limit rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_offset=>-1)','22023','negative offset rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_offset=>1000001)','22023','excessive offset rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_sort=>''email'')','22023','non-allowlisted sort rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_team_state=>''anything'')','22023','invalid membership filter rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_status=>''anything'')','22023','invalid status filter rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001),p_search=>repeat(''x'',201))','22023','search length bounded');
SELECT public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10001),p_limit=>0)','22023','zero team limit rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10001),p_sort=>''workspace'')','22023','invalid team sort rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10001),p_min_members=>5,p_max_members=>1)','22023','inverted size filter rejected');
SELECT public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10001),p_size_state=>''complete'')','22023','invented compliance filter rejected');

-- Access lookup failures must raise, never return zero/empty success.
RESET ROLE;
BEGIN;
CREATE OR REPLACE FUNCTION public.can_access_partner_event(p_hackathon_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'fixture lookup failed' USING ERRCODE = 'XX000'; END;
$$;
SET LOCAL ROLE authenticated;
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(10001))','XX000','access lookup failure propagates overview');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001))','XX000','access lookup failure propagates participants');
SELECT public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10001))','XX000','access lookup failure propagates teams');
ROLLBACK;
BEGIN;
CREATE OR REPLACE FUNCTION public.can_access_partner_event(p_hackathon_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT NULL::boolean; $$;
SET LOCAL ROLE authenticated;
SELECT public.fixture_private_denied('unknown access result');
ROLLBACK;
BEGIN;
ALTER TABLE public.profiles RENAME TO fixture_unavailable_profiles;
SET LOCAL ROLE authenticated;
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(10001))','42P01','profile relation lookup failure propagates');
ROLLBACK;
BEGIN;
ALTER TABLE public.hackathon_registrations RENAME TO fixture_unavailable_registrations;
SET LOCAL ROLE authenticated;
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(10001))','42P01','overview query failure is not zero');
SELECT public.fixture_error('SELECT public.list_partner_organizer_participants(public.fixture_id(10001))','42P01','participant query failure is not empty success');
SELECT public.fixture_error('SELECT public.list_partner_organizer_teams(public.fixture_id(10001))','42P01','team query failure is not empty success');
SET LOCAL ROLE anon;
SELECT public.fixture_error('SELECT public.list_event_discovery_builders(public.fixture_id(10001))','42P01','discovery query failure is not empty success');
SELECT public.fixture_error('SELECT public.get_hackathon_registration_counts(public.fixture_id(10001))','42P01','public count query failure is not zero');
ROLLBACK;

-- Public discovery eligibility is independent of organizer access.
UPDATE public.hackathon_registrations SET is_hidden = true WHERE user_id = public.fixture_id(201);
UPDATE public.hackathon_registrations SET looking_for_team = false WHERE user_id = public.fixture_id(202);
UPDATE public.profiles SET show_track_record = false WHERE id = public.fixture_id(203);
UPDATE public.profiles SET is_banned = true WHERE id = public.fixture_id(204);
UPDATE public.profiles SET is_banned = NULL WHERE id = public.fixture_id(205);
UPDATE public.profiles SET show_track_record = NULL WHERE id = public.fixture_id(206);
UPDATE public.hackathon_registrations SET is_hidden = NULL WHERE user_id = public.fixture_id(207);
SET ROLE anon;
SELECT public.fixture_assert((SELECT registration_count = 500 FROM public.get_hackathon_registration_counts(public.fixture_id(10008))),
  '500-row public count is an aggregate, not fetched-list length');
SELECT public.fixture_assert((public.list_event_discovery_builders(public.fixture_id(10001))->>'total')::int = 2, 'public only opted-in builders with profiles, including looking member already in team');
SELECT public.fixture_assert((public.list_event_discovery_builders(public.fixture_id(10002))->>'total')::int = 13, 'hidden/non-looking/private/banned/unknown builders excluded');
SELECT public.fixture_assert((public.list_event_discovery_builders(public.fixture_id(10002),p_limit=>1)->>'total')::int = 13, 'public pagination preserves eligible total');
SELECT public.fixture_assert((public.list_event_discovery_builders(public.fixture_id(10003),1000,10)->>'total')::int = 1005
  AND jsonb_array_length(public.list_event_discovery_builders(public.fixture_id(10003),1000,10)->'items') = 5, 'public discovery beyond 1000 rows');
SELECT public.fixture_assert(NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.list_event_discovery_builders(public.fixture_id(10002))->'items') item,
    jsonb_object_keys(item) k WHERE k NOT IN ('user_id','full_name','college','avatar_url','skills')), 'public strict allowlist excludes PII/registration/protected fields');
SELECT public.fixture_assert((SELECT registration_count = 20 AND confirmed_count = 20 AND waitlisted_count = 0
  FROM public.get_hackathon_registration_counts(public.fixture_id(10002))), 'public counts include all registrations as identities-free aggregates');
SELECT public.fixture_assert((SELECT registration_count = 1005 FROM public.get_hackathon_registration_counts(public.fixture_id(10003))), 'public scalar counts are not REST-capped');
SELECT public.fixture_assert((SELECT registration_count = 0 FROM public.get_hackathon_registration_counts(public.fixture_id(10004))), 'public zero-registration count');
SELECT public.fixture_error('SELECT public.list_event_discovery_builders(public.fixture_id(10005))','42501','pending native event not publicly discoverable');
SELECT public.fixture_error('SELECT public.get_hackathon_registration_counts(public.fixture_id(10005))','42501','pending native counts unavailable');
SELECT public.fixture_error('SELECT public.list_event_discovery_builders(public.fixture_id(10007))','42501','archived discovery unavailable');
SELECT public.fixture_error('SELECT public.get_hackathon_registration_counts(public.fixture_id(10007))','42501','archived counts unavailable');
SELECT public.fixture_error('SELECT public.get_hackathon_registration_counts(public.fixture_id(99999))','42501','missing public event is not fake zero');
SELECT public.fixture_error('SELECT public.list_event_discovery_builders(public.fixture_id(10001),p_limit=>101)','22023','public bounded pagination');

RESET ROLE;
SELECT public.fixture_assert((SELECT count(*) = 5 AND bool_and(prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp'])
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('get_partner_organizer_overview',
  'list_partner_organizer_participants','list_partner_organizer_teams','list_event_discovery_builders','get_hackathon_registration_counts')), 'all five definers pin search_path');
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) acl
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('get_partner_organizer_overview',
  'list_partner_organizer_participants','list_partner_organizer_teams','list_event_discovery_builders','get_hackathon_registration_counts')
  AND acl.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname='service_role'))), 'PUBLIC/service role have no execution grants');
SELECT public.fixture_assert(NOT has_table_privilege('authenticated','public.hackathon_registrations','SELECT')
  AND has_table_privilege('anon','public.hackathon_registrations','SELECT')
  AND EXISTS(SELECT 1 FROM pg_policies WHERE policyname='fixture_registration_read'), 'base grants and existing registration policy unchanged');
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name IN ('teams','team_hackathons') AND column_name='track'), 'functions work without production-missing track columns');
UPDATE public.hackathons SET min_team_size = 5, max_team_size = 2 WHERE id = public.fixture_id(10001);
SET ROLE authenticated;
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(10001),p_size_state=>'unknown_limits')->>'total')::int = 4, 'inverted event limits treated as unknown');
RESET ROLE;

-- Review the aggregate query shape at 500 registrations. Set joins/distincts,
-- event indexes and per-page roster aggregation avoid application N+1 reads.
ANALYZE;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
WITH linked AS (SELECT th.team_id FROM public.team_hackathons th WHERE th.hackathon_id=public.fixture_id(10008)),
members AS (SELECT DISTINCT tm.user_id FROM public.team_members tm JOIN linked l ON l.team_id=tm.team_id)
SELECT count(*), count(*) FILTER(WHERE m.user_id IS NOT NULL)
FROM public.hackathon_registrations r LEFT JOIN members m ON m.user_id=r.user_id
WHERE r.hackathon_id=public.fixture_id(10008);
\echo 'All local partner projection/isolation assertions passed.'
