-- REVIEW ONLY: future local fixture assertions, NOT executed in C1.
-- Reuse scripts/test-registration-privacy.cjs's isolated-cluster lifecycle,
-- but initialize its owner as postgres. Accept NO existing DB/URL/.env input.
-- This file must never be run by ordinary CI or the migration loader.
\set ON_ERROR_STOP on
SELECT current_database() = 'partner_authz_fixture' AND inet_server_addr() = '127.0.0.1'::inet
  AND session_user = 'postgres' AS local_fixture \gset
\if :local_fixture
\else
  \echo 'Refusing anything except the future isolated postgres-owned fixture.'
  \quit 3
\endif
-- Preserve and run the existing 209+ privacy assertions unchanged first.
\ir ../../../../scripts/test-registration-privacy.sql
ALTER TABLE auth.users ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz, ADD COLUMN banned_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT true;
ALTER TABLE public.hackathons ADD COLUMN registration_start timestamptz, ADD COLUMN registration_end timestamptz,
  ADD COLUMN registration_status text, ADD COLUMN max_participants integer;
-- Preserve existing fixture rows while adding the actual deleted-team behavior
-- for new C1 rows. Verify this action against future deployed FK preflight.
ALTER TABLE public.hackathon_registrations ADD CONSTRAINT c1_fixture_team_fk
  FOREIGN KEY(team_id) REFERENCES public.teams(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.hackathons TO authenticated, service_role;
CREATE POLICY hackathons_read ON public.hackathons FOR SELECT TO authenticated USING (true);
CREATE POLICY hackathons_create ON public.hackathons FOR INSERT TO authenticated WITH CHECK (organizer_id = auth.uid());
CREATE POLICY hackathons_update_organizer ON public.hackathons FOR UPDATE TO authenticated
  USING (organizer_id = auth.uid()) WITH CHECK (organizer_id = auth.uid());

INSERT INTO auth.users(id, email) SELECT public.fixture_id(n), 'c1-' || n || '@example.invalid' FROM generate_series(9001,9010) n;
INSERT INTO public.profiles(id, is_banned, full_name, show_track_record, onboarding_completed)
SELECT public.fixture_id(n), false, 'Synthetic C1', true, true FROM generate_series(9001,9009) n;
UPDATE public.profiles SET is_banned = true WHERE id = public.fixture_id(9003);
UPDATE auth.users SET is_anonymous = true WHERE id = public.fixture_id(9004);
UPDATE public.profiles SET onboarding_completed = false WHERE id = public.fixture_id(9005);
UPDATE auth.users SET deleted_at = clock_timestamp() WHERE id = public.fixture_id(9006);
UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 day' WHERE id = public.fixture_id(9007);
UPDATE auth.users SET email = NULL WHERE id = public.fixture_id(9008);
UPDATE auth.users SET email = ' ' WHERE id = public.fixture_id(9009);
INSERT INTO public.teams(id, owner_id, name) VALUES(public.fixture_id(9201), public.fixture_id(9001), 'Synthetic legacy team');
INSERT INTO public.teams(id, owner_id, name) VALUES(public.fixture_id(9202), public.fixture_id(9001), 'Synthetic deletable team');
INSERT INTO public.team_members(team_id, user_id) VALUES(public.fixture_id(9201), public.fixture_id(9002));
INSERT INTO public.hackathons(id, name, type, status, archived, organizer_id, min_team_size, max_team_size, max_participants,
  registration_start, registration_end, end_date)
SELECT public.fixture_id(n), 'Synthetic C1', 'native', 'approved', false, public.fixture_id(9001), 1, 2, 1,
  clock_timestamp() - interval '1 day', clock_timestamp() + interval '1 day', clock_timestamp() + interval '2 days'
FROM generate_series(9101,9112) n;
UPDATE public.hackathons SET registration_start = NULL, registration_end = NULL WHERE id = public.fixture_id(9102);
UPDATE public.hackathons SET registration_end = clock_timestamp() - interval '1 second' WHERE id = public.fixture_id(9103);
UPDATE public.hackathons SET registration_start = clock_timestamp() + interval '1 hour' WHERE id = public.fixture_id(9104);
UPDATE public.hackathons SET archived = true WHERE id = public.fixture_id(9105);
UPDATE public.hackathons SET status = 'rejected' WHERE id = public.fixture_id(9106);
UPDATE public.hackathons SET min_team_size = 2 WHERE id = public.fixture_id(9107);
UPDATE public.hackathons SET max_team_size = 1 WHERE id = public.fixture_id(9108);
UPDATE public.hackathons SET end_date = clock_timestamp() - interval '1 second' WHERE id = public.fixture_id(9109);
UPDATE public.hackathons SET type = CASE WHEN id = public.fixture_id(9110) THEN 'official' ELSE 'external' END,
  min_team_size = 2, registration_end = clock_timestamp() - interval '1 day'
WHERE id IN (public.fixture_id(9110),public.fixture_id(9111));
\ir 01-expand.proposed.sql
\ir 02-contract.proposed.sql

SET TimeZone = 'Pacific/Auckland';
SELECT public.fixture_assert(mission20_private.boundary('2026-10-31', true) = '2026-10-31T18:30:00Z'::timestamptz, 'inclusive final India day independent of session timezone');
SELECT public.fixture_assert(mission20_private.boundary('2026-10-31', false) = '2026-10-30T18:30:00Z'::timestamptz, 'India start midnight');
SELECT public.fixture_assert(mission20_private.boundary('2026-10-31T12:30:00-04:00', true) = '2026-10-31T16:30:00Z'::timestamptz, 'timestamp offset preserved without adding a day');
SELECT public.fixture_assert(mission20_private.boundary('2026-02-30') IS NULL AND mission20_private.boundary('2026-10-31T12:00:00') IS NULL, 'invalid or naive evidence stays unknown');
SELECT mission20_private.assert_window_at('{"registration_start":"2026-10-31","registration_end":"2026-10-31","end_date":"2026-11-02"}',true,false,'2026-10-30T18:30:00Z');
SELECT mission20_private.assert_window_at('{"registration_start":"2026-10-31","registration_end":"2026-10-31","end_date":"2026-11-02"}',true,false,'2026-10-31T18:29:59.999999Z');
SELECT public.fixture_error($q$SELECT mission20_private.assert_window_at('{"registration_start":"2026-10-31","registration_end":"2026-10-31","end_date":"2026-11-02"}',true,true,'2026-10-31T18:30:00Z')$q$,'P0001','exact next-midnight cutoff closes even with review');
SELECT public.fixture_error($q$SELECT mission20_private.assert_window_at('{"registration_start":"2026-10-31","registration_end":"2026-10-31","end_date":"2026-11-02"}',true,true,'2026-10-30T18:29:59.999999Z')$q$,'P0001','exact start minus microsecond not yet open');
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.register_native_hackathon(uuid,uuid,boolean)','EXECUTE'), 'anonymous RPC denied');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','mission20_private.lock_context(uuid,uuid,boolean,boolean,boolean)','EXECUTE'), 'internal helper not callable');

SET ROLE anon;
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9101))', '42501', 'anon cannot invoke registration');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',public.fixture_id(9001)::text,false);
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id,status) VALUES(public.fixture_id(9101),auth.uid(),''confirmed'')','42501','direct native INSERT rejected');
SELECT public.fixture_assert(public.register_native_hackathon(public.fixture_id(9101))->>'status' = 'confirmed', 'first native admission confirmed');
SELECT public.fixture_assert((public.register_native_hackathon(public.fixture_id(9101))->>'alreadyRegistered')::boolean, 'duplicate retry idempotent');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9102))','P0001','unknown requires explicit review');
SELECT public.fixture_assert(public.register_native_hackathon(public.fixture_id(9102),NULL,true)->>'status' = 'confirmed', 'unknown review keeps founder flow');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9103),NULL,true)','P0001','event future does not reopen closed application');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9104),NULL,true)','P0001','upcoming registration cannot be bypassed by consent');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9105),NULL,true)','P0001','archived event denied');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9106),NULL,true)','P0001','rejected event denied');
SELECT public.fixture_assert(public.register_native_hackathon(public.fixture_id(9107),public.fixture_id(9201))->>'status' = 'confirmed','legacy missing owner row still counts owner plus member');
SELECT public.fixture_assert((public.register_native_hackathon(public.fixture_id(9107))->>'alreadyRegistered')::boolean,'retry with no replacement team preserves existing team registration');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9108),public.fixture_id(9201))','P0001','missing owner cannot bypass maximum team size');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9109),NULL,true)','P0001','ended event denied even if registration end is future');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9110),NULL,true)','P0001','official is not native admission');
SELECT public.fixture_assert(public.register_native_hackathon(public.fixture_id(9112),public.fixture_id(9202))->>'status'='confirmed','deletable team admitted');
INSERT INTO public.hackathon_registrations(hackathon_id,user_id,status,looking_for_team,metadata)
VALUES(public.fixture_id(9110),auth.uid(),'waitlisted',true,'{"event_track":"synthetic","event_name":"Synthetic"}');
SELECT public.fixture_assert((SELECT status = 'confirmed' FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(9110)),'official community derives status despite forged waitlist and closed official applications');
INSERT INTO public.hackathon_registrations(hackathon_id,user_id,status) VALUES(public.fixture_id(9111),auth.uid(),'confirmed');
SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(public.fixture_id(9111),public.fixture_id(9002))','42501','community identity spoof denied');
SELECT public.fixture_error('UPDATE public.hackathon_registrations SET status=''waitlisted'' WHERE hackathon_id=public.fixture_id(9101)','42501','status UPDATE denied');
SELECT public.fixture_error('INSERT INTO public.hackathons(id,name,type,status,organizer_id) VALUES(public.fixture_id(9301),''Fake native'',''native'',''approved'',auth.uid())','42501','self approved native create denied');
INSERT INTO public.hackathons(id,name,type,status,organizer_id,ai_feedback)
VALUES(public.fixture_id(9302),'Synthetic pending','native','pending',auth.uid(),'{"status":"pending"}');
INSERT INTO public.hackathons(id,name,type,status,organizer_id,ai_feedback)
VALUES(public.fixture_id(9303),'Synthetic cross-list','external','approved',auth.uid(),'{"status":"approved"}');
SELECT public.fixture_error('UPDATE public.hackathons SET status=''approved'' WHERE id=public.fixture_id(9302)','42501','pending native cannot self approve');
SELECT public.fixture_error('UPDATE public.hackathons SET type=''external'' WHERE id=public.fixture_id(9302)','42501','type-switch approval bypass denied');
SELECT public.fixture_error('UPDATE public.hackathons SET ai_feedback=''{"status":"approved"}'' WHERE id=public.fixture_id(9302)','42501','feedback approval forgery denied');
SELECT public.fixture_error('UPDATE public.hackathons SET max_participants=0 WHERE id=public.fixture_id(9101)','P0001','capacity reduction below confirmed denied');
SELECT set_config('request.jwt.claim.sub',public.fixture_id(9002)::text,false);
SELECT public.fixture_assert(public.register_native_hackathon(public.fixture_id(9101))->>'status' = 'waitlisted', 'full event derives waitlist');
SELECT public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9107),public.fixture_id(9201))','42501','nonowner team denied');
DO $$ DECLARE actor integer; BEGIN
  FOR actor IN 9003..9010 LOOP
    PERFORM set_config('request.jwt.claim.sub',public.fixture_id(actor)::text,false);
    PERFORM public.fixture_error('SELECT public.register_native_hackathon(public.fixture_id(9101))','42501','inactive/unverified fixture actor ' || actor);
  END LOOP;
END; $$;
RESET ROLE;
SET ROLE service_role;
UPDATE public.hackathons SET status='approved', ai_feedback='{"status":"approved","reviewed_by":"synthetic-admin"}' WHERE id=public.fixture_id(9302);
RESET ROLE;
DELETE FROM public.teams WHERE id=public.fixture_id(9202);
SELECT public.fixture_assert((SELECT team_id IS NULL FROM public.hackathon_registrations WHERE hackathon_id=public.fixture_id(9112)),'FK SET NULL retains registration after real team deletion');
SELECT public.fixture_assert((SELECT status='approved' FROM public.hackathons WHERE id=public.fixture_id(9302)),'existing admin service-role approval preserved');
-- The isolated runner must destroy the entire cluster in finally on pass/fail.
-- Additional two-session races and fresh post-contract privacy replay are
-- mandatory in TEST-PLAN.md; these sequential assertions do not prove locking.
