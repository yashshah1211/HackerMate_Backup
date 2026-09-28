-- =============================================================================
-- Migration 20260928100000_phase1a_definer_function_privileges
-- Phase 1A: SECURITY DEFINER function privileges (P0 database authorization lockdown)
--
-- Spec:  .kiro/specs/p0-database-authorization-lockdown (design.md "Migration 1A")
-- Audit: SEC-01, SEC-02, SEC-08, SEC-12, SEC-16, FUN-06
--        (ENGINEERING_AUDIT.md §10.4 final four-role model, §10.11 decisions D1-D10)
-- Plan:  PRIORITIZED_ACTION_PLAN.md §1.2 (1A-1 ... 1A-13)
--
-- -----------------------------------------------------------------------------
-- HOW TO APPLY (PRIORITIZED_ACTION_PLAN.md §1.4, decision D10)
-- -----------------------------------------------------------------------------
--   * NEVER apply with `supabase db push` (OPS-08: the production ledger has
--     drifted from the repo).
--   * Prerequisites:
--       - R1 is deployed and verified (rows R-1 ... R-7);
--       - the step-2 pre-state gate passed (scripts/sql/phase1_postcheck.sql,
--         section PRE-1A and ALWAYS rows all pass);
--       - phase1_prestate.sql is versioned (§0.10);
--       - the staging decision (§0.12) is recorded;
--       - the Supabase CLI is installed and linked (§0.9, needed for step 5).
--   * The founder pastes this whole file into the Supabase SQL editor at low
--     traffic. Everything between BEGIN and COMMIT runs as one transaction.
--   * Then: production-safe postchecks (phase1_postcheck.sql, POST-1A rows),
--     then `supabase migration repair --status applied 20260928100000`, then G-6.
--
-- -----------------------------------------------------------------------------
-- FINAL STATE (P/a/A/S = PUBLIC / anon / authenticated / service_role;
-- the owner, postgres, always keeps EXECUTE)
-- -----------------------------------------------------------------------------
--   add_user_to_team(uuid,uuid,text) ............... F/F/F/F  owner only
--   get_public_builder_profile(text,uuid) .......... F/T/T/F
--   get_pending_deadline_reminders() ............... F/F/F/T
--   mark_deadline_reminder_sent(uuid[]) ............ F/F/F/T
--   check_rate_limit(text,integer,interval) ........ F/F/F/T
--   cleanup_lapsed_streaks() ....................... F/F/F/T
--   delete_message, delete_user_completely,
--   generate_team_invite_token, join_team_instantly,
--   record_daily_visit, send_connection_request(uuid,text),
--   send_message, send_message_with_mentions,
--   toggle_message_reaction, is_admin .............. F/F/T/F
--   get_authorized_profile_email(uuid), (uuid,uuid),
--   send_connection_request(uuid) .................. dropped
--   All 16 retained functions: search_path = public, pg_temp (set here).
--   Functions not listed here are not touched, including their service_role grants.
--
-- -----------------------------------------------------------------------------
-- ROLLBACK (manual only; NEVER executed by this migration)
-- -----------------------------------------------------------------------------
-- Authoritative source: frontend/supabase/rollback/phase1_prestate.sql
-- (fully commented reference file; its §C bodies are byte-identical to the live
-- pre-1A definitions). Copy only the needed parts into a reviewed script and run
-- it as ONE transaction, in this order:
--
--   1. add_user_to_team: restore BOTH halves.
--        - Body: paste §C1 verbatim (CREATE OR REPLACE FUNCTION ... $function$;).
--        - ACL:
--            REVOKE ALL ON FUNCTION public.add_user_to_team(uuid, uuid, text)
--              FROM PUBLIC, anon, authenticated, service_role;
--            GRANT EXECUTE ON FUNCTION public.add_user_to_team(uuid, uuid, text)
--              TO authenticated, service_role;
--        WARNING: re-granting authenticated re-opens SEC-01. Only do this if a join
--        path is broken and cannot be fixed forward.
--   2. Replaced bodies: paste §C2 (get_public_builder_profile) and §C6
--      (check_rate_limit) verbatim. Restoring §C2 brings back the FUN-06 failure
--      (42P01 on the missing projects table), so prefer fixing 1A-3 forward.
--   3. Dropped functions: paste §C3 and §C4 (get_authorized_profile_email, both
--      signatures) and §C5 (send_connection_request(uuid)). New functions pick up
--      Supabase default grants, so for each one first run
--        REVOKE ALL ON FUNCTION <sig> FROM PUBLIC, anon, authenticated, service_role;
--      then grant exactly the §A roles:
--        get_authorized_profile_email(uuid), (uuid,uuid) -> PUBLIC, anon, authenticated, service_role
--        send_connection_request(uuid)                   -> authenticated, service_role
--   4. Pre-1A EXECUTE ACLs: apply every §B GRANT line (they include service_role,
--      and PUBLIC / anon where the pre-state had them).
--   5. search_path changes: apply the §B lines
--        ALTER FUNCTION public.cleanup_lapsed_streaks() SET search_path = public;
--        ALTER FUNCTION public.delete_message(uuid) SET search_path = public;
--        ALTER FUNCTION public.record_daily_visit() SET search_path = public;
--        ALTER FUNCTION public.get_pending_deadline_reminders() RESET search_path;
--        ALTER FUNCTION public.mark_deadline_reminder_sent(uuid[]) RESET search_path;
--      plus this line, derived from §A (§B has no line for it):
--        ALTER FUNCTION public.toggle_message_reaction(uuid, text)
--          SET search_path = public, pg_catalog;
--      Functions whose pre-state was already `public, pg_temp` need nothing.
--   6. conversation_participants_insert: recreate it from §D.
--   7. team_members_role_check: run §E
--        ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
--   8. Re-run phase1_postcheck.sql; every PRE-1A row must pass again.
--
-- If R1 is rolled back after this migration, also restore service_role EXECUTE on
-- get_public_builder_profile (§B), because the pre-R1 route calls it with the
-- service role (Req 8.6).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1A-1 add_user_to_team: internal-only helper, and only the 'member' role.
-- Body = live §C1 (identical to repo 202607100005) plus the role check.
-- The three SECURITY DEFINER wrappers (accept_team_invite, accept_team_join_request,
-- join_team_instantly; owner postgres) call it with 'member' and run it as owner.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_user_to_team(p_team_id uuid, p_user_id uuid, p_role text DEFAULT 'member'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_max_members integer;
  v_member_count integer;
  v_conversation_id uuid;
BEGIN
  -- Phase 1A-1: only the 'member' role can be granted through this helper.
  -- Owners are created by create_team_with_owner, which does not call it.
  IF p_role IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'Invalid team role';
  END IF;

  SELECT max_members INTO v_max_members
  FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  -- Authorization guard: caller must be the team owner or adding themselves.
  IF NOT (public.is_team_owner(p_team_id) OR auth.uid() = p_user_id) THEN
    RAISE EXCEPTION 'Access denied: you must be the team owner to add other members';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.team_members WHERE team_id = p_team_id;
  IF v_max_members IS NOT NULL AND v_member_count >= v_max_members THEN
    RAISE EXCEPTION 'This team is full';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'This builder is already a team member';
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (p_team_id, p_user_id, p_role);

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE team_id = p_team_id AND type = 'team'
  LIMIT 1;

  IF v_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = v_conversation_id AND user_id = p_user_id
  ) THEN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conversation_id, p_user_id);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_user_to_team(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
-- No GRANT: no API role executes this helper directly.

-- -----------------------------------------------------------------------------
-- 1A-2 team_members.role constraint (Q6: only 'owner' 31 / 'member' 22 exist,
-- so the constraint is added validated). The column is nullable (attnotnull =
-- false, checked 2026-09-27; 0 NULL rows), and a CHECK passes on NULL, so NULL
-- is rejected explicitly.
-- -----------------------------------------------------------------------------
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_role_check CHECK (role IS NOT NULL AND role IN ('owner', 'member'));

-- -----------------------------------------------------------------------------
-- 1A-3 get_public_builder_profile: same signature and return type.
-- Built from the LIVE body (phase1_prestate.sql §C2), not repo 20260808184000.
-- Changes versus §C2:
--   * the caller comes only from auth.uid(); the second parameter is kept for
--     signature compatibility and ignored (drop in P3);
--   * email: self or legitimate teammate only; no admin branch; independent of
--     show_track_record;
--   * show_track_record = false and caller <> target: restricted response
--     (registrations, teams, submissions, projects all empty);
--   * the query on the dropped projects table is removed; "projects" is always [].
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_builder_profile(p_target_id text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  -- Identity comes only from the request JWT. The second parameter is accepted
  -- for signature compatibility and deliberately ignored.
  v_caller uuid := auth.uid();
  v_user_uuid uuid;
  v_profile record;
  v_email_val text := NULL;
  v_is_teammate boolean := false;
  v_profile_json jsonb;
  v_registrations jsonb;
  v_teams jsonb;
  v_submissions jsonb;
BEGIN
  -- Resolve target UUID (from UUID string or username slug)
  IF p_target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_target_id::uuid;
  ELSE
    SELECT id INTO v_user_uuid FROM public.profiles WHERE LOWER(username) = LOWER(p_target_id);
  END IF;

  IF v_user_uuid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch target profile
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_uuid;
  IF v_profile.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Email: visible to the target (self) and to legitimate teammates only.
  -- Anonymous callers and strangers get null. Admin status grants nothing here;
  -- an admin who is also a teammate gets the teammate result.
  -- This rule is independent of show_track_record.
  IF v_caller IS NOT NULL THEN
    IF v_caller = v_user_uuid THEN
      v_is_teammate := true;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.team_members tm1
        JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
        WHERE tm1.user_id = v_caller AND tm2.user_id = v_user_uuid
      ) INTO v_is_teammate;
    END IF;
  END IF;

  IF v_is_teammate THEN
    v_email_val := v_profile.email;
  END IF;

  v_profile_json := jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'full_name', v_profile.full_name,
    'email', v_email_val,
    'college', v_profile.college,
    'bio', v_profile.bio,
    'avatar_url', v_profile.avatar_url,
    'skills', v_profile.skills,
    'github_url', v_profile.github_url,
    'linkedin_url', v_profile.linkedin_url,
    'created_at', v_profile.created_at,
    'show_track_record', v_profile.show_track_record
  );

  -- show_track_record = false is an explicit privacy choice: everyone except the
  -- target (anon, strangers, teammates, admins) gets the restricted response.
  IF COALESCE(v_profile.show_track_record, true) = false
     AND v_caller IS DISTINCT FROM v_user_uuid THEN
    RETURN jsonb_build_object(
      'profile', v_profile_json,
      'registrations', '[]'::jsonb,
      'teams', '[]'::jsonb,
      'submissions', '[]'::jsonb,
      'projects', '[]'::jsonb
    );
  END IF;

  -- Fetch hackathon registrations
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'registration_id', r.id,
      'hackathon_id', h.id,
      'hackathon_name', h.name,
      'mode', h.mode,
      'location', h.location,
      'prize_pool', h.prize_pool,
      'start_date', h.start_date,
      'end_date', h.end_date,
      'website_url', h.website_url,
      'registration_status', r.status,
      'looking_for_team', r.looking_for_team,
      'registered_at', r.created_at
    ) ORDER BY h.start_date DESC NULLS LAST
  ), '[]'::jsonb)
  INTO v_registrations
  FROM public.hackathon_registrations r
  JOIN public.hackathons h ON h.id = r.hackathon_id
  WHERE r.user_id = v_user_uuid
    AND COALESCE(r.is_hidden, false) = false;

  -- Fetch user teams
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'team_id', t.id,
      'team_name', t.name,
      'description', t.description,
      'user_role', tm.role,
      'joined_at', tm.created_at,
      'team_hackathons', (
        SELECT COALESCE(jsonb_agg(th.hackathon_id), '[]'::jsonb)
        FROM public.team_hackathons th
        WHERE th.team_id = t.id
      ),
      'teammates', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'user_id', tm2.user_id,
            'full_name', p2.full_name,
            'avatar_url', p2.avatar_url,
            'role', tm2.role
          )
        ), '[]'::jsonb)
        FROM public.team_members tm2
        JOIN public.profiles p2 ON p2.id = tm2.user_id
        WHERE tm2.team_id = t.id AND tm2.user_id != v_user_uuid
      )
    )
  ), '[]'::jsonb)
  INTO v_teams
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = v_user_uuid;

  -- Fetch submitted/completed project submissions (only non-empty submissions)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'team_id', ts.team_id,
      'hackathon_id', ts.hackathon_id,
      'project_title', ts.project_title,
      'demo_url', ts.demo_url,
      'github_url', ts.github_url,
      'pitch_video_url', ts.pitch_video_url,
      'slides_url', ts.slides_url,
      'completion_status', ts.completion_status,
      'submitted_at', ts.updated_at
    )
  ), '[]'::jsonb)
  INTO v_submissions
  FROM public.team_submissions ts
  WHERE ts.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = v_user_uuid)
    AND ts.completion_status IN ('submitted', 'completed')
    AND (COALESCE(TRIM(ts.project_title), '') != '' OR COALESCE(TRIM(ts.demo_url), '') != '' OR COALESCE(TRIM(ts.github_url), '') != '');

  -- Projects: the feature is historical and its table no longer exists (FUN-06).
  -- The key is kept for response-shape compatibility and is always empty.
  RETURN jsonb_build_object(
    'profile', v_profile_json,
    'registrations', v_registrations,
    'teams', v_teams,
    'submissions', v_submissions,
    'projects', '[]'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_builder_profile(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_builder_profile(text, uuid) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1A-4 Email RPCs (unused; Q5: no dependents). No CASCADE: abort if anything depends.
-- -----------------------------------------------------------------------------
DROP FUNCTION public.get_authorized_profile_email(uuid, uuid);
DROP FUNCTION public.get_authorized_profile_email(uuid);

-- -----------------------------------------------------------------------------
-- 1A-6 check_rate_limit: atomic INSERT ... ON CONFLICT (ip) DO UPDATE
-- (the body from unapplied migration 20260917160000, written with a table alias).
-- Same signature and RETURNS TABLE as live. The search_path is public, pg_temp,
-- NOT the public, pg_catalog declared in 20260917160000.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_ip text, p_limit integer, p_window_interval interval)
 RETURNS TABLE(allowed boolean, remaining integer, reset_time timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rec record;
  v_now timestamptz := clock_timestamp();
  v_window_end timestamptz := v_now + p_window_interval;
BEGIN
  -- Atomic upsert:
  --   no row            -> insert request_count = 1, reset_time = window end;
  --   window expired    -> reset request_count = 1, reset_time = window end;
  --   window still open -> increment request_count.
  INSERT INTO public.rate_limits AS rl (ip, request_count, reset_time)
  VALUES (p_ip, 1, v_window_end)
  ON CONFLICT (ip) DO UPDATE
  SET
    request_count = CASE
      WHEN rl.reset_time <= v_now THEN 1
      ELSE rl.request_count + 1
    END,
    reset_time = CASE
      WHEN rl.reset_time <= v_now THEN v_window_end
      ELSE rl.reset_time
    END
  RETURNING rl.request_count, rl.reset_time INTO v_rec;

  IF v_rec.request_count <= p_limit THEN
    RETURN QUERY SELECT TRUE, GREATEST(0, p_limit - v_rec.request_count), v_rec.reset_time;
  ELSE
    RETURN QUERY SELECT FALSE, 0, v_rec.reset_time;
  END IF;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 1A-5 / 1A-11: pin search_path on the server-only functions whose bodies don't change.
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.get_pending_deadline_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.mark_deadline_reminder_sent(uuid[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_lapsed_streaks() SET search_path = public, pg_temp;

-- -----------------------------------------------------------------------------
-- 1A-5 / 1A-6 / 1A-11 / 1A-13: server-only utilities -> service_role only (F/F/F/T).
-- Traced callers: /api/cron/reminders, /api/contact, /api/send-email,
-- /api/cron/database-activity-report (all service-role clients).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_pending_deadline_reminders()',
    'public.mark_deadline_reminder_sent(uuid[])',
    'public.check_rate_limit(text, integer, interval)',
    'public.cleanup_lapsed_streaks()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 1A-7 / 1A-8 / 1A-9: authenticated-only client RPCs (F/F/T/F), explicit search_path.
-- Every traced caller is a browser client; there is no service-role caller.
-- toggle_message_reaction moves off public, pg_catalog. is_admin: Q4 found all 7
-- policies using it are TO authenticated; its other callers are SECURITY DEFINER.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.delete_message(uuid)',
    'public.delete_user_completely(uuid)',
    'public.generate_team_invite_token(uuid)',
    'public.join_team_instantly(uuid, text)',
    'public.record_daily_visit()',
    'public.send_connection_request(uuid, text)',
    'public.send_message(uuid, text, uuid)',
    'public.send_message_with_mentions(uuid, text, uuid[], uuid)',
    'public.toggle_message_reaction(uuid, text)',
    'public.is_admin(uuid)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 1A-10 Legacy one-argument overload (unused; Q5: no dependents). No CASCADE.
-- -----------------------------------------------------------------------------
DROP FUNCTION public.send_connection_request(uuid);

-- -----------------------------------------------------------------------------
-- 1A-12 Participant injection (SEC-08). Participants are added only by RPCs
-- and triggers. No other conversation policy is changed.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS conversation_participants_insert ON public.conversation_participants;

COMMIT;
