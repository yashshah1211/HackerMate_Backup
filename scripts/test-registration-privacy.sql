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
  show_track_record boolean DEFAULT true, email text, phone text, username text, bio text, github_url text, linkedin_url text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.hackathons (
  id uuid PRIMARY KEY, organizer_id uuid REFERENCES public.profiles(id), type text,
  min_team_size integer, max_team_size integer, status text, ai_feedback jsonb,
  archived boolean DEFAULT false, name text, mode text, location text, prize_pool text, start_date timestamptz, end_date timestamptz, website_url text
);
CREATE TABLE public.teams (
  id uuid PRIMARY KEY, name text, description text, owner_id uuid, created_at timestamptz, is_recruiting boolean,
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
  role text, created_at timestamptz DEFAULT now(), PRIMARY KEY(team_id, user_id)
);
-- Permit a synthetic orphan profile to exercise defensive LEFT JOIN behavior;
-- production's registration/profile FK ordinarily prevents this state.
CREATE TABLE public.hackathon_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hackathon_id uuid NOT NULL REFERENCES public.hackathons(id), user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','waitlisted')), looking_for_team boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), is_hidden boolean DEFAULT false,
  team_id uuid, metadata jsonb, UNIQUE(hackathon_id, user_id)
);
ALTER TABLE public.hackathon_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_registration_read ON public.hackathon_registrations FOR SELECT TO anon USING (true);
GRANT SELECT ON public.hackathon_registrations TO anon;
-- No authenticated base-table SELECT grants: RPCs must work without broad grants.


GRANT SELECT ON public.hackathons TO authenticated,anon;
CREATE TABLE public.hackathon_stages (id uuid PRIMARY KEY, hackathon_id uuid);
CREATE TABLE public.team_submissions (team_id uuid, hackathon_id uuid, project_title text, demo_url text, github_url text, pitch_video_url text, slides_url text, completion_status text, updated_at timestamptz);
CREATE FUNCTION public.is_team_owner(p_team_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.teams t WHERE t.id=p_team_id AND t.owner_id=auth.uid());
$$;
INSERT INTO auth.users SELECT public.fixture_id(n),'fixture-'||n||'@example.invalid' FROM generate_series(1,18) n;
UPDATE auth.users SET email=' YASHshah7117@GMAIL.COM ' WHERE id=public.fixture_id(8);
UPDATE auth.users SET email=NULL WHERE id=public.fixture_id(13);
INSERT INTO public.profiles(id,role,is_banned,full_name,show_track_record,email,username)
 SELECT id,CASE WHEN id=public.fixture_id(7) THEN 'admin' ELSE 'user' END,false,'Fixture',true,email,'fixture-'||right(id::text,4) FROM auth.users WHERE id<>public.fixture_id(12);
UPDATE public.profiles SET is_banned=true WHERE id IN(public.fixture_id(9),public.fixture_id(10));
UPDATE public.profiles SET is_banned=NULL WHERE id=public.fixture_id(11);
UPDATE public.profiles SET show_track_record=false WHERE id=public.fixture_id(16);
UPDATE public.profiles SET show_track_record=NULL WHERE id=public.fixture_id(17);
INSERT INTO public.hackathons(id,type,organizer_id,status,archived,name) VALUES
 (public.fixture_id(101),'external',public.fixture_id(15),'approved',false,'A'),
 (public.fixture_id(102),'external',NULL,'approved',false,'B'),
 (public.fixture_id(103),'native',public.fixture_id(6),'approved',false,'Native'),
 (public.fixture_id(104),'native',public.fixture_id(6),'pending',false,'Pending'),
 (public.fixture_id(105),'external',NULL,'approved',true,'Archived');
INSERT INTO public.teams(id,name,owner_id) VALUES(public.fixture_id(201),'Own team',public.fixture_id(1)),(public.fixture_id(202),'Other team',public.fixture_id(2));
INSERT INTO public.hackathon_registrations(hackathon_id,user_id,looking_for_team,metadata)
 SELECT public.fixture_id(101),public.fixture_id(n),true,'{"server_secret":"keep","event_track":"a"}'::jsonb FROM unnest(ARRAY[1,9,11,12,13,14,16,17,18]) n;
INSERT INTO public.hackathon_registrations(hackathon_id,user_id,looking_for_team) VALUES
 (public.fixture_id(102),public.fixture_id(2),true),(public.fixture_id(102),public.fixture_id(14),true),
 (public.fixture_id(103),public.fixture_id(1),false),(public.fixture_id(104),public.fixture_id(1),false),
 (public.fixture_id(105),public.fixture_id(1),false);
UPDATE public.hackathon_registrations SET status='waitlisted',team_id=public.fixture_id(201) WHERE user_id=public.fixture_id(1) AND hackathon_id=public.fixture_id(101);
UPDATE public.hackathon_registrations SET is_hidden=true WHERE user_id=public.fixture_id(18);
-- Actual live policies/ACLs, plus deliberately permissive drift and explicit
-- column grants to demonstrate that neither can survive the replacement.
CREATE POLICY registrations_read ON public.hackathon_registrations FOR SELECT TO authenticated USING(true);
CREATE POLICY registrations_read_anon ON public.hackathon_registrations FOR SELECT TO anon USING(true);
CREATE POLICY registrations_create_self ON public.hackathon_registrations FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND (team_id IS NULL OR public.is_team_owner(team_id)));
CREATE POLICY registrations_update_self ON public.hackathon_registrations FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid() AND (team_id IS NULL OR public.is_team_owner(team_id)));
CREATE POLICY registrations_delete_self ON public.hackathon_registrations FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE POLICY unexpected_permissive_drift ON public.hackathon_registrations FOR ALL TO authenticated USING(true) WITH CHECK(true);
GRANT ALL ON public.hackathon_registrations TO anon,authenticated,service_role;
GRANT SELECT(id), UPDATE(status), INSERT(id) ON public.hackathon_registrations TO PUBLIC,anon,authenticated;
-- Audited production-effective base DDL, not an unrelated migration backlog.
CREATE TABLE public.hackathon_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
 organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 title text NOT NULL, message text NOT NULL, linked_stage_id uuid REFERENCES public.hackathon_stages(id) ON DELETE SET NULL,
 sent_at timestamptz, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.hackathon_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY hackathon_announcements_read ON public.hackathon_announcements FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.hackathons h WHERE h.id=hackathon_announcements.hackathon_id AND h.organizer_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.hackathon_registrations hr WHERE hr.hackathon_id=hr.hackathon_id AND hr.user_id=auth.uid())
);
CREATE POLICY hackathon_announcements_insert ON public.hackathon_announcements FOR INSERT TO authenticated WITH CHECK(
 EXISTS(SELECT 1 FROM public.hackathons h WHERE h.id=hackathon_announcements.hackathon_id AND h.organizer_id=auth.uid())
);
CREATE POLICY hackathon_announcements_update ON public.hackathon_announcements FOR UPDATE TO authenticated USING(
 EXISTS(SELECT 1 FROM public.hackathons h WHERE h.id=hackathon_announcements.hackathon_id AND h.organizer_id=auth.uid())
) WITH CHECK(
 EXISTS(SELECT 1 FROM public.hackathons h WHERE h.id=hackathon_announcements.hackathon_id AND h.organizer_id=auth.uid())
);
CREATE POLICY hackathon_announcements_delete ON public.hackathon_announcements FOR DELETE TO authenticated USING(
 EXISTS(SELECT 1 FROM public.hackathons h WHERE h.id=hackathon_announcements.hackathon_id AND h.organizer_id=auth.uid())
);
GRANT ALL ON public.hackathon_announcements TO anon,authenticated,service_role;
INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message)
 SELECT public.fixture_id(n),public.fixture_id(6),'Title','Private message' FROM generate_series(101,105) n;
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

CREATE FUNCTION public.fixture_rows(command text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE affected bigint;
BEGIN EXECUTE command; GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected; END;
$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(1)::text,false);
SELECT public.fixture_assert((SELECT count(*)=5 FROM public.hackathon_announcements),'baseline reproduces ANY-event announcement bug');
RESET ROLE;
\ir ../supabase/migrations/202610060002_partner_organizer_access.sql
\ir ../supabase/migrations/202610060003_partner_read_projections.sql
\ir ../supabase/migrations/202610060004_partner_registration_privacy.sql
INSERT INTO public.event_organizers(hackathon_id,user_id,created_by) VALUES
 (public.fixture_id(101),public.fixture_id(4),public.fixture_id(7)),
 (public.fixture_id(102),public.fixture_id(5),public.fixture_id(7)),
 (public.fixture_id(101),public.fixture_id(10),public.fixture_id(7));
SELECT public.fixture_assert((SELECT count(*)=4 FROM pg_policies WHERE tablename='hackathon_registrations'),'exactly four scoped policies remain');
SELECT public.fixture_assert(NOT has_column_privilege('anon','public.hackathon_registrations','id','SELECT'),'anon explicit column grant removed');
SELECT public.fixture_assert(NOT has_column_privilege('authenticated','public.hackathon_registrations','status','UPDATE'),'protected update column grant removed');
SELECT public.fixture_assert(NOT has_table_privilege('authenticated','public.hackathon_registrations','TRUNCATE'),'no authenticated truncate');
SELECT public.fixture_assert(has_table_privilege('service_role','public.hackathon_registrations','DELETE'),'existing server cleanup grant retained');
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.fixture_error('SELECT * FROM public.hackathon_registrations','42501','anon raw SELECT denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(101),public.fixture_id(3))','42501','anon raw INSERT denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET looking_for_team=false','42501','anon raw UPDATE denied');
SELECT public.fixture_error('DELETE FROM public.hackathon_registrations','42501','anon raw DELETE denied');
SELECT public.fixture_error('SELECT * FROM public.hackathon_announcements','42501','anon announcements private');
SELECT public.fixture_assert((SELECT registration_count=9 FROM public.get_hackathon_registration_counts(public.fixture_id(101))),'anon count projection survives raw revoke');
SELECT public.fixture_assert((public.list_event_discovery_builders(public.fixture_id(101))->>'total')::int=3,'anon discovery filters privacy/bans after revoke');
SELECT public.fixture_assert(NOT (public.list_event_discovery_builders(public.fixture_id(101))::text LIKE '%server_secret%'),'discovery excludes metadata');
SELECT public.fixture_assert(jsonb_array_length(public.get_public_builder_profile(public.fixture_id(1)::text)->'registrations')=2,'public history contains public nonhidden events only');
SELECT public.fixture_assert(NOT ((public.get_public_builder_profile(public.fixture_id(1)::text)->'registrations'->0) ?| ARRAY['registration_id','registration_status','looking_for_team','registered_at','metadata','email','user_id']),'public history omits private registration fields');
SELECT public.fixture_assert(public.get_public_builder_profile(public.fixture_id(1)::text,public.fixture_id(1))->'profile'->>'email' IS NULL,'caller identity parameter cannot expose email');
SELECT public.fixture_assert(jsonb_array_length(public.get_public_builder_profile(public.fixture_id(16)::text)->'registrations')=0,'private track record hidden');
SELECT public.fixture_assert(jsonb_array_length(public.get_public_builder_profile(public.fixture_id(17)::text)->'registrations')=0,'unknown track record privacy hidden');
SELECT public.fixture_assert(jsonb_array_length(public.get_public_builder_profile(public.fixture_id(18)::text)->'registrations')=0,'hidden participation hidden');
SELECT public.fixture_assert(public.get_public_builder_profile(public.fixture_id(9)::text) IS NULL,'banned target profile hidden');
SELECT public.fixture_error('SELECT public.has_verified_event_identity()','42501','anon cannot execute identity helper');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(1)::text,false);
SELECT public.fixture_assert((SELECT count(*)=4 FROM public.hackathon_registrations),'participant A: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=4 FROM public.hackathon_announcements),'participant A: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'participant A: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'participant A: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','participant A: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(2)::text,false);
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.hackathon_registrations),'participant B: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.hackathon_announcements),'participant B: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'participant B: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'participant B: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','participant B: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(3)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'unregistered: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'unregistered: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'unregistered: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'unregistered: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(2))','42501','unregistered: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(4)::text,false);
SELECT public.fixture_assert((SELECT count(*)=9 FROM public.hackathon_registrations),'organizer A: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.hackathon_announcements),'organizer A: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'organizer A: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'organizer A: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','organizer A: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(5)::text,false);
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.hackathon_registrations),'organizer B: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.hackathon_announcements),'organizer B: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'organizer B: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'organizer B: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','organizer B: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(6)::text,false);
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.hackathon_registrations),'native organizer: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.hackathon_announcements),'native organizer: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'native organizer: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'native organizer: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','native organizer: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(7)::text,false);
SELECT public.fixture_assert((SELECT count(*)=14 FROM public.hackathon_registrations),'admin: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=5 FROM public.hackathon_announcements),'admin: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'admin: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'admin: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','admin: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(8)::text,false);
SELECT public.fixture_assert((SELECT count(*)=14 FROM public.hackathon_registrations),'founder: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=5 FROM public.hackathon_announcements),'founder: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'founder: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'founder: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','founder: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(9)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'banned participant: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'banned participant: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'banned participant: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'banned participant: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','banned participant: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(10)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'banned organizer: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'banned organizer: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'banned organizer: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'banned organizer: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','banned organizer: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(11)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'unknown ban: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'unknown ban: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'unknown ban: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'unknown ban: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','unknown ban: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(12)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'missing profile: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'missing profile: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'missing profile: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'missing profile: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','missing profile: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(13)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'missing email: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'missing email: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'missing email: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'missing email: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','missing email: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(14)::text,false);
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.hackathon_registrations),'multi event participant: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.hackathon_announcements),'multi event participant: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'multi event participant: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'multi event participant: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','multi event participant: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(15)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'external owner without assignment: direct raw select scoped');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'external owner without assignment: direct announcements scoped');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(18)')=0,'external owner without assignment: other participant update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(18)')=0,'external owner without assignment: other participant delete denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(103),public.fixture_id(3))','42501','external owner without assignment: spoofed identity insert denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(1)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations WHERE user_id=public.fixture_id(2)),'ordinary cannot read other raw registration');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements WHERE hackathon_id=public.fixture_id(102)),'A participant cannot read B announcement');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE hackathon_id=public.fixture_id(101)')=1,'discovery off updates own row');
SELECT public.fixture_assert((SELECT status='waitlisted' AND team_id=public.fixture_id(201) AND metadata->>'server_secret'='keep' FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(101)),'off preserves status team private metadata');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true, metadata=metadata || ''{"event_track":"b","event_name":"B"}''::jsonb WHERE hackathon_id=public.fixture_id(101)')=1,'discovery on merges permitted track preferences');
SELECT public.fixture_assert((SELECT metadata->>'server_secret'='keep' FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(101)),'track update preserves server metadata');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET is_hidden=true WHERE hackathon_id=public.fixture_id(101)')=1,'own visibility preference permitted');
SELECT public.fixture_assert((public.get_public_builder_profile(public.fixture_id(1)::text)->'registrations'->0) ? 'registration_status','verified owner retains own history fields');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET user_id=public.fixture_id(2) WHERE hackathon_id=public.fixture_id(101)','42501','protected user_id update denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET hackathon_id=public.fixture_id(102) WHERE hackathon_id=public.fixture_id(101)','42501','protected hackathon_id update denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET id=public.fixture_id(999) WHERE hackathon_id=public.fixture_id(101)','42501','protected id update denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET created_at=now() WHERE hackathon_id=public.fixture_id(101)','42501','protected created_at update denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET status=''confirmed'' WHERE hackathon_id=public.fixture_id(101)','42501','protected status update denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET team_id=NULL WHERE hackathon_id=public.fixture_id(101)','42501','protected team_id update denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET metadata=''{}''::jsonb WHERE hackathon_id=public.fixture_id(101)','42501','protected metadata update denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET metadata=metadata || ''{"admin_approved":true}''::jsonb WHERE hackathon_id=public.fixture_id(101)','42501','protected metadata update denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id,team_id) VALUES(public.fixture_id(102),public.fixture_id(1),public.fixture_id(202))','42501','cannot join with another owners team');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id,metadata) VALUES(public.fixture_id(102),public.fixture_id(1),''{"admin_approved":true}'')','42501','cannot inject protected metadata at join');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(id,hackathon_id,user_id) VALUES(public.fixture_id(999),public.fixture_id(102),public.fixture_id(1))','42501','cannot inject registration ID');
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id,team_id,status,looking_for_team,metadata) VALUES(public.fixture_id(102),public.fixture_id(1),public.fixture_id(201),''waitlisted'',true,''{"event_track":"x"}'')')=1,'self community join with owned team survives');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(1)')=1,'explicit own unregister survives');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements WHERE hackathon_id=public.fixture_id(102)),'unregister immediately revokes B announcement access');
SELECT public.fixture_error('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(101),public.fixture_id(1),''x'',''y'')','42501','participant cannot publish announcements');
RESET ROLE;
DELETE FROM public.event_organizers WHERE user_id=public.fixture_id(4);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(4)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'revoked organizer raw denied');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'revoked organizer announcement denied');
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(101))','42501','revoked organizer RPC denied');
RESET ROLE;
INSERT INTO public.event_organizers(hackathon_id,user_id,created_by) VALUES(public.fixture_id(101),public.fixture_id(4),public.fixture_id(7));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(4)::text,false);
SELECT public.fixture_assert((SELECT registration_count=9 FROM public.get_partner_organizer_overview(public.fixture_id(101))),'assigned organizer aggregate works after revoke');
SELECT public.fixture_assert((public.list_partner_organizer_participants(public.fixture_id(101))->>'total')::int=9,'assigned organizer participants projection works');
SELECT public.fixture_assert((public.list_partner_organizer_teams(public.fixture_id(101))->>'total')::int=0,'assigned organizer team projection works');
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(102))','42501','wrong event organizer RPC denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(101),public.fixture_id(4),''x'',''y'')','42501','read assignment does not grant broadcast');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(6)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(103),public.fixture_id(6),''x'',''y'')')=1,'native organizer existing announcement write works');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_announcements SET title=''updated'' WHERE hackathon_id=public.fixture_id(103)')=2,'native organizer updates own event announcements');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_announcements WHERE title=''x''')=0,'native delete remains event scoped');
SELECT public.fixture_error('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(101),public.fixture_id(6),''x'',''y'')','42501','native wrong event write denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(7)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(101),public.fixture_id(7),''admin'',''y'')')=1,'admin announcement publish retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_announcements WHERE title=''admin''')=1,'admin announcement delete retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(8)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(102),public.fixture_id(8),''founder'',''y'')')=1,'founder announcement publish retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_announcements WHERE title=''founder''')=1,'founder announcement delete retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(9)::text,false);
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(9))','42501','invalid identity 9: self insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(9)')=0,'invalid identity 9: own update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(9)')=0,'invalid identity 9: own delete denied');
SELECT public.fixture_error('SELECT public.get_public_builder_profile(public.fixture_id(1)::text)','42501','invalid identity 9: public RPC cannot bypass ban');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(10)::text,false);
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(10))','42501','invalid identity 10: self insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(10)')=0,'invalid identity 10: own update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(10)')=0,'invalid identity 10: own delete denied');
SELECT public.fixture_error('SELECT public.get_public_builder_profile(public.fixture_id(1)::text)','42501','invalid identity 10: public RPC cannot bypass ban');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(11)::text,false);
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(11))','42501','invalid identity 11: self insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(11)')=0,'invalid identity 11: own update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(11)')=0,'invalid identity 11: own delete denied');
SELECT public.fixture_error('SELECT public.get_public_builder_profile(public.fixture_id(1)::text)','42501','invalid identity 11: public RPC cannot bypass ban');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(12)::text,false);
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(12))','42501','invalid identity 12: self insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(12)')=0,'invalid identity 12: own update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(12)')=0,'invalid identity 12: own delete denied');
SELECT public.fixture_error('SELECT public.get_public_builder_profile(public.fixture_id(1)::text)','42501','invalid identity 12: public RPC cannot bypass ban');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(13)::text,false);
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(13))','42501','invalid identity 13: self insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=false WHERE user_id=public.fixture_id(13)')=0,'invalid identity 13: own update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE user_id=public.fixture_id(13)')=0,'invalid identity 13: own delete denied');
SELECT public.fixture_error('SELECT public.get_public_builder_profile(public.fixture_id(1)::text)','42501','invalid identity 13: public RPC cannot bypass ban');
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'missing JWT denies raw read');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'missing JWT denies announcements');
RESET ROLE;
-- Simulate a protected-profile lookup error. It must abort, never grant access.
ALTER TABLE public.profiles RENAME COLUMN is_banned TO fixture_ban_unavailable;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(1)::text,false);
SELECT public.fixture_error('SELECT * FROM public.hackathon_registrations','42703','profile lookup error fails closed');
RESET ROLE;
ALTER TABLE public.profiles RENAME COLUMN fixture_ban_unavailable TO is_banned;
SET ROLE service_role;
SELECT public.fixture_assert((SELECT count(*)=14 FROM public.hackathon_registrations),'existing authorized server reads retained');
RESET ROLE;
SELECT public.fixture_assert((SELECT bool_and(p.proconfig @> ARRAY['search_path=public, pg_temp']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('has_verified_event_identity','guard_registration_preferences','get_public_builder_profile')),'all new/replaced helpers pin search path');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(3)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(3))')=1,'valid identity 3: own join retained');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(3)')=1,'valid identity 3: own preference retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(3)')=1,'valid identity 3: own unregister retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(4)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(4))')=1,'valid identity 4: own join retained');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(4)')=1,'valid identity 4: own preference retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(4)')=1,'valid identity 4: own unregister retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(5)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(5))')=1,'valid identity 5: own join retained');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(5)')=1,'valid identity 5: own preference retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(5)')=1,'valid identity 5: own unregister retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(6)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(6))')=1,'valid identity 6: own join retained');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(6)')=1,'valid identity 6: own preference retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(6)')=1,'valid identity 6: own unregister retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(7)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(7))')=1,'valid identity 7: own join retained');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(7)')=1,'valid identity 7: own preference retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(7)')=1,'valid identity 7: own unregister retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(8)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(8))')=1,'valid identity 8: own join retained');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(8)')=1,'valid identity 8: own preference retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(8)')=1,'valid identity 8: own unregister retained');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(15)::text,false);
SELECT public.fixture_assert(public.fixture_rows('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(102),public.fixture_id(15))')=1,'valid identity 15: own join retained');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_registrations SET looking_for_team=true WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(15)')=1,'valid identity 15: own preference retained');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(102) AND user_id=public.fixture_id(15)')=1,'valid identity 15: own unregister retained');
RESET ROLE;
UPDATE public.profiles SET is_banned=true WHERE id IN(public.fixture_id(6),public.fixture_id(7),public.fixture_id(8));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(6)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'banned authority 6: direct read denied');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'banned authority 6: announcement denied');
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(103))','42501','banned authority 6: private RPC denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(103),public.fixture_id(6),''x'',''y'')','42501','banned authority 6: announcement insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_announcements SET title=''unauthorized''')=0,'banned authority 6: announcement update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_announcements')=0,'banned authority 6: announcement delete denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(7)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'banned authority 7: direct read denied');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'banned authority 7: announcement denied');
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(103))','42501','banned authority 7: private RPC denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(103),public.fixture_id(7),''x'',''y'')','42501','banned authority 7: announcement insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_announcements SET title=''unauthorized''')=0,'banned authority 7: announcement update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_announcements')=0,'banned authority 7: announcement delete denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(8)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'banned authority 8: direct read denied');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'banned authority 8: announcement denied');
SELECT public.fixture_error('SELECT public.get_partner_organizer_overview(public.fixture_id(103))','42501','banned authority 8: private RPC denied');
SELECT public.fixture_error('INSERT INTO public.hackathon_announcements(hackathon_id,organizer_id,title,message) VALUES(public.fixture_id(103),public.fixture_id(8),''x'',''y'')','42501','banned authority 8: announcement insert denied');
SELECT public.fixture_assert(public.fixture_rows('UPDATE public.hackathon_announcements SET title=''unauthorized''')=0,'banned authority 8: announcement update denied');
SELECT public.fixture_assert(public.fixture_rows('DELETE FROM public.hackathon_announcements')=0,'banned authority 8: announcement delete denied');
RESET ROLE;
UPDATE public.profiles SET is_banned=false WHERE id IN(public.fixture_id(6),public.fixture_id(7),public.fixture_id(8));
SELECT public.fixture_assert(NOT has_table_privilege('authenticated','public.hackathon_announcements','TRUNCATE'),'announcement truncate revoked');
SELECT public.fixture_assert(NOT has_column_privilege('authenticated','public.hackathon_announcements','hackathon_id','UPDATE'),'announcement event cannot be moved');
SELECT public.fixture_assert(NOT has_column_privilege('authenticated','public.hackathon_announcements','organizer_id','UPDATE'),'announcement creator cannot be spoofed');
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.has_verified_event_identity()','EXECUTE'),'identity helper anon ACL denied');
SELECT public.fixture_assert(NOT has_function_privilege('service_role','public.has_verified_event_identity()','EXECUTE'),'identity helper service ACL denied');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.guard_registration_preferences()','EXECUTE'),'trigger has no RPC grant');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(999)::text,false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_registrations),'unverifiable JWT denies raw read');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.hackathon_announcements),'unverifiable JWT denies announcements');
RESET ROLE;
UPDATE public.hackathon_registrations SET is_hidden=NULL WHERE user_id=public.fixture_id(18);
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.fixture_assert(jsonb_array_length(public.get_public_builder_profile(public.fixture_id(18)::text)->'registrations')=0,'unknown row visibility excludes public history');
RESET ROLE;

-- Caller-role matrix: safe projections do not confer caller authority and are
-- intentionally usable even when the caller cannot access private event data.
-- Auth-invalid transport still fails at the API; these exercise database roles.
SET ROLE authenticated;
DO $$
DECLARE actor integer; discovery jsonb;
BEGIN
  FOREACH actor IN ARRAY ARRAY[1,4,5,6,7,8,9,10,12,13,999] LOOP
    PERFORM set_config('request.jwt.claim.sub',public.fixture_id(actor)::text,false);
    PERFORM public.fixture_assert((SELECT registration_count >= 0
      AND confirmed_count + waitlisted_count <= registration_count
      FROM public.get_hackathon_registration_counts(public.fixture_id(101))),
      format('safe count actor %s: public aggregate independent of caller authority',actor));
    discovery := public.list_event_discovery_builders(public.fixture_id(101));
    PERFORM public.fixture_assert(NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(discovery->'items') item, jsonb_object_keys(item) k
      WHERE k NOT IN ('user_id','full_name','college','avatar_url','skills')),
      format('safe discovery actor %s: approved public fields only',actor));
  END LOOP;
END;
$$;
RESET ROLE;
