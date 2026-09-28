-- =============================================================================
-- phase1_prestate.sql - ROLLBACK / REFERENCE ARTIFACT. NOT A MIGRATION.
-- =============================================================================
-- DO NOT EXECUTE THIS FILE AGAINST ANY DATABASE AS A WHOLE.
-- Everything below is inside one block comment on purpose. To roll back a
-- specific Phase 1 change, copy ONLY the relevant section into a reviewed,
-- transactional script.
--
-- Captured: 2026-09-27, read-only, via Supabase MCP (role: supabase_read_only_user)
-- against the HackerMate production project.
-- Source queries: ENGINEERING_AUDIT.md §10.9 Q2 plus the Phase 1A ACL pre-state query.
-- §F extended the same day (round three) with the exact profiles privilege pre-state for anon
-- and authenticated.
-- Contains: function definitions, EXECUTE ACLs, function config, one policy, profiles privileges.
-- Contains NO secrets and NO user data. Vault-reading functions are listed by ACL only.
-- Line endings in the captured bodies were normalised to LF; code is otherwise verbatim.
-- =============================================================================

/*

-- -----------------------------------------------------------------------------
-- A. EXECUTE ACL PRE-STATE (as captured)
--    Notation: "=X/postgres" means EXECUTE granted to PUBLIC (anon inherits it).
-- -----------------------------------------------------------------------------
-- function                                              | proconfig                     | acl
-- add_user_to_team(uuid,uuid,text)                      | search_path=public, pg_temp   | {postgres=X, authenticated=X, service_role=X}
-- check_rate_limit(text,integer,interval)               | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- cleanup_lapsed_streaks()                              | search_path=public            | {postgres=X, authenticated=X, service_role=X}
-- delete_message(uuid)                                  | search_path=public            | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- delete_user_completely(uuid)                          | search_path=public, pg_temp   | {postgres=X, anon=X, authenticated=X, service_role=X}
-- generate_team_invite_token(uuid)                      | search_path=public, pg_temp   | {postgres=X, anon=X, authenticated=X, service_role=X}
-- get_authorized_profile_email(uuid)                    | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- get_authorized_profile_email(uuid,uuid)               | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- get_pending_deadline_reminders()                      | (none)                        | {PUBLIC=X, postgres=X, authenticated=X, service_role=X}
-- get_public_builder_profile(text,uuid)                 | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- is_admin(uuid)                                        | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, authenticated=X, service_role=X}
-- join_team_instantly(uuid,text)                        | search_path=public, pg_temp   | {postgres=X, anon=X, authenticated=X, service_role=X}
-- mark_deadline_reminder_sent(uuid[])                   | (none)                        | {PUBLIC=X, postgres=X, authenticated=X, service_role=X}
-- record_daily_visit()                                  | search_path=public            | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- send_connection_request(uuid)                         | search_path=public, pg_temp   | {postgres=X, authenticated=X, service_role=X}
-- send_connection_request(uuid,text)                    | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- send_message(uuid,text,uuid)                          | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- send_message_with_mentions(uuid,text,uuid[],uuid)     | search_path=public, pg_temp   | {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- toggle_message_reaction(uuid,text)                    | search_path=public, pg_catalog| {PUBLIC=X, postgres=X, anon=X, authenticated=X, service_role=X}
-- All owners: postgres. All prosecdef = true. All provolatile = 'v'.

-- -----------------------------------------------------------------------------
-- B. ACL RESTORE STATEMENTS (reproduce section A exactly)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.add_user_to_team(uuid, uuid, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, interval) TO PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cleanup_lapsed_streaks() TO authenticated, service_role;
ALTER FUNCTION public.cleanup_lapsed_streaks() SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_message(uuid) TO PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.delete_message(uuid) SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_team_invite_token(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_team_instantly(uuid, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_pending_deadline_reminders() TO PUBLIC, authenticated, service_role;
ALTER FUNCTION public.get_pending_deadline_reminders() RESET search_path;
GRANT EXECUTE ON FUNCTION public.mark_deadline_reminder_sent(uuid[]) TO PUBLIC, authenticated, service_role;
ALTER FUNCTION public.mark_deadline_reminder_sent(uuid[]) RESET search_path;

GRANT EXECUTE ON FUNCTION public.get_public_builder_profile(text, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_daily_visit() TO PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.record_daily_visit() SET search_path = public;

GRANT EXECUTE ON FUNCTION public.send_connection_request(uuid, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[], uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text) TO PUBLIC, anon, authenticated, service_role;
-- After re-creating a dropped function (section C), apply its ACL line:
--   get_authorized_profile_email(uuid)       -> TO PUBLIC, anon, authenticated, service_role
--   get_authorized_profile_email(uuid,uuid)  -> TO PUBLIC, anon, authenticated, service_role
--   send_connection_request(uuid)            -> TO authenticated, service_role   (and REVOKE ALL ... FROM PUBLIC first)

-- -----------------------------------------------------------------------------
-- C. FUNCTION DEFINITIONS THAT PHASE 1A REPLACES OR DROPS (live bodies)
-- -----------------------------------------------------------------------------

-- C1. add_user_to_team (replaced in 1A-1: role whitelist + revoke)
CREATE OR REPLACE FUNCTION public.add_user_to_team(p_team_id uuid, p_user_id uuid, p_role text DEFAULT 'member'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_max_members integer;
  v_member_count integer;
  v_conversation_id uuid;
BEGIN
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

-- C2. get_public_builder_profile (replaced in 1A-3). NOTE: the live body differs from
--     the repo (20260808184000): it adds the team_projects block (ledger-only
--     migrations 20260830173700..20260830192000, not in the repo). 1A-3 MUST start
--     from THIS body, not the repo version.
CREATE OR REPLACE FUNCTION public.get_public_builder_profile(p_target_id text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_uuid uuid;
  v_profile record;
  v_email_val text := NULL;
  v_is_teammate boolean := false;
  v_registrations jsonb;
  v_teams jsonb;
  v_submissions jsonb;
  v_projects jsonb;
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

  -- Check if caller is authorized to view email (self OR accepted teammate)
  IF p_caller_id IS NOT NULL THEN
    IF p_caller_id = v_user_uuid THEN
      v_is_teammate := true;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.team_members tm1
        JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
        WHERE tm1.user_id = p_caller_id AND tm2.user_id = v_user_uuid
      ) INTO v_is_teammate;
    END IF;
  END IF;

  IF v_is_teammate THEN
    v_email_val := v_profile.email;
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

  -- Fetch user projects
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', tp.id,
      'team_id', tp.team_id,
      'title', tp.title,
      'slug', tp.slug,
      'tagline', tp.tagline,
      'visibility', tp.visibility,
      'created_at', tp.created_at
    ) ORDER BY tp.created_at DESC
  ), '[]'::jsonb)
  INTO v_projects
  FROM public.team_projects tp
  WHERE tp.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = v_user_uuid)
    AND tp.visibility != 'private'
    AND (
      tp.visibility = 'public'
      OR (
        tp.visibility = 'unlisted'
        AND p_caller_id IS NOT NULL
        AND (
          p_caller_id = v_user_uuid
          OR EXISTS (
            SELECT 1 
            FROM public.team_members caller_tm 
            WHERE caller_tm.team_id = tp.team_id 
              AND caller_tm.user_id = p_caller_id
          )
        )
      )
    );

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
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
    ),
    'registrations', v_registrations,
    'teams', v_teams,
    'submissions', v_submissions,
    'projects', v_projects
  );
END;
$function$;

-- C3. get_authorized_profile_email(uuid, uuid) (dropped in 1A-4)
CREATE OR REPLACE FUNCTION public.get_authorized_profile_email(p_target_user_id uuid, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_effective_caller UUID;
  v_caller_role TEXT;
  v_target_email TEXT;
  v_is_teammate BOOLEAN := false;
  v_is_connected BOOLEAN := false;
BEGIN
  v_effective_caller := COALESCE(auth.uid(), p_caller_id);
  
  IF v_effective_caller IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Self Check
  IF v_effective_caller = p_target_user_id THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 2. Admin Check
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_effective_caller;
  IF v_caller_role = 'admin' THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 3. Teammate Check (Both belong to at least 1 common team)
  SELECT EXISTS (
    SELECT 1 
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = v_effective_caller 
      AND tm2.user_id = p_target_user_id
  ) INTO v_is_teammate;

  IF v_is_teammate THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 4. Accepted Connection Check
  SELECT EXISTS (
    SELECT 1 
    FROM public.connection_requests
    WHERE status = 'accepted'
      AND ((sender_id = v_effective_caller AND receiver_id = p_target_user_id)
        OR (sender_id = p_target_user_id AND receiver_id = v_effective_caller))
  ) INTO v_is_connected;

  IF v_is_connected THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  RETURN NULL;
END;
$function$;

-- C4. get_authorized_profile_email(uuid) (live-only; dropped in 1A-4)
CREATE OR REPLACE FUNCTION public.get_authorized_profile_email(p_target_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_target_email TEXT;
  v_is_teammate BOOLEAN := false;
  v_is_connected BOOLEAN := false;
BEGIN
  v_caller_id := auth.uid();
  
  -- If caller is not authenticated, return NULL immediately
  IF v_caller_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Self Check
  IF v_caller_id = p_target_user_id THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 2. Admin Check
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role = 'admin' THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 3. Teammate Check (Both belong to at least 1 common team)
  SELECT EXISTS (
    SELECT 1 
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = v_caller_id 
      AND tm2.user_id = p_target_user_id
  ) INTO v_is_teammate;

  IF v_is_teammate THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- 4. Accepted Connection Check
  SELECT EXISTS (
    SELECT 1 
    FROM public.connection_requests
    WHERE status = 'accepted'
      AND ((sender_id = v_caller_id AND receiver_id = p_target_user_id)
        OR (sender_id = p_target_user_id AND receiver_id = v_caller_id))
  ) INTO v_is_connected;

  IF v_is_connected THEN
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
    RETURN v_target_email;
  END IF;

  -- Otherwise, access denied -> return NULL
  RETURN NULL;
END;
$function$;

-- C5. send_connection_request(uuid) — legacy overload (dropped in 1A-10)
CREATE OR REPLACE FUNCTION public.send_connection_request(p_receiver_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sender_id uuid := auth.uid();
  v_request_id uuid;
begin
  if v_sender_id is null or p_receiver_id = v_sender_id then
    raise exception 'Invalid connection request';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(least(v_sender_id::text, p_receiver_id::text) || ':' ||
      greatest(v_sender_id::text, p_receiver_id::text), 0)
  );
  if exists (
    select 1 from public.friend_requests
    where (sender_id = v_sender_id and receiver_id = p_receiver_id)
       or (sender_id = p_receiver_id and receiver_id = v_sender_id)
  ) then
    raise exception 'A connection or request already exists';
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_sender_id, p_receiver_id, 'pending')
  returning id into v_request_id;
  insert into public.notifications (user_id, message, link)
  values (p_receiver_id, 'You have a new connection request', '/connections');
  return v_request_id;
end;
$function$;

-- C6. check_rate_limit (replaced in 1A-6 with the atomic body). Live = non-atomic 202607180009 body.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_ip text, p_limit integer, p_window_interval interval)
 RETURNS TABLE(allowed boolean, remaining integer, reset_time timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_count INTEGER;
  v_reset_time TIMESTAMP WITH TIME ZONE;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  -- Select existing record
  SELECT request_count, rate_limits.reset_time INTO v_current_count, v_reset_time
  FROM public.rate_limits
  WHERE ip = p_ip;

  IF NOT FOUND THEN
    -- First request
    v_reset_time := v_now + p_window_interval;
    INSERT INTO public.rate_limits (ip, request_count, reset_time)
    VALUES (p_ip, 1, v_reset_time);
    RETURN QUERY SELECT TRUE, p_limit - 1, v_reset_time;
  ELSIF v_now > v_reset_time THEN
    -- Reset window
    v_reset_time := v_now + p_window_interval;
    UPDATE public.rate_limits
    SET request_count = 1, reset_time = v_reset_time
    WHERE ip = p_ip;
    RETURN QUERY SELECT TRUE, p_limit - 1, v_reset_time;
  ELSIF v_current_count >= p_limit THEN
    -- Blocked
    RETURN QUERY SELECT FALSE, 0, v_reset_time;
  ELSE
    -- Increment
    v_current_count := v_current_count + 1;
    UPDATE public.rate_limits
    SET request_count = v_current_count
    WHERE ip = p_ip;
    RETURN QUERY SELECT TRUE, p_limit - v_current_count, v_reset_time;
  END IF;
END;
$function$;

-- C7. Reminder functions (1A only pins search_path + changes ACL; bodies unchanged — for reference)
CREATE OR REPLACE FUNCTION public.get_pending_deadline_reminders()
 RETURNS TABLE(saved_id uuid, user_id uuid, user_email text, user_name text, hackathon_id uuid, hackathon_name text, registration_end timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    sh.id AS saved_id,
    sh.user_id AS user_id,
    p.email::TEXT AS user_email,
    p.full_name::TEXT AS user_name,
    h.id AS hackathon_id,
    h.name::TEXT AS hackathon_name,
    h.registration_end AS registration_end
  FROM public.saved_hackathons sh
  JOIN public.profiles p ON p.id = sh.user_id
  JOIN public.hackathons h ON h.id = sh.hackathon_id
  LEFT JOIN public.hackathon_registrations hr ON hr.hackathon_id = sh.hackathon_id AND hr.user_id = sh.user_id
  WHERE 
    sh.reminder_sent_at IS NULL
    AND hr.id IS NULL -- Only builders who have NOT registered yet
    AND h.registration_end IS NOT NULL
    AND h.registration_end >= NOW()
    AND h.registration_end <= NOW() + INTERVAL '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_deadline_reminder_sent(p_saved_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.saved_hackathons
  SET reminder_sent_at = NOW()
  WHERE id = ANY(p_saved_ids);
END;
$function$;

-- C8. delete_message / record_daily_visit / cleanup_lapsed_streaks: 1A only pins
--     search_path and changes ACL; bodies are unchanged and match the repo files
--     202608180006, 202608180007 and 20260901203500. Rollback = section B lines.

-- -----------------------------------------------------------------------------
-- D. POLICY DROPPED IN 1A-12 (live definition)
-- -----------------------------------------------------------------------------
CREATE POLICY conversation_participants_insert ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (can_access_conversation(conversation_id));

-- -----------------------------------------------------------------------------
-- E. CONSTRAINT ADDED IN 1A-2 (rollback)
-- -----------------------------------------------------------------------------
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
-- Pre-state: no role CHECK constraint; values observed (aggregate only): owner=31, member=22.

-- -----------------------------------------------------------------------------
-- F. PROFILES UPDATE PRIVILEGE PRE-STATE (for 1B rollback)
-- -----------------------------------------------------------------------------
-- Round one (founder live result 1, 2026-09-27): authenticated had UPDATE on all 35 profiles columns.
--
-- Exact pre-state for BOTH anon and authenticated (round three, 2026-09-27, read-only via
-- Supabase MCP; captured twice the same day with identical results; ENGINEERING_AUDIT.md §10.11 E5).
--
-- Table ACL (pg_class.relacl for public.profiles):
--   {postgres=arwdDxtm/postgres,anon=awdDxtm/postgres,authenticated=awdDxtm/postgres,service_role=arwdDxtm/postgres}
--   anon and authenticated: table-level INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
--   Neither holds table-level SELECT; their SELECT is column-level (below).
--
-- Column ACLs (pg_attribute.attacl):
--   year_of_study : {anon=r/postgres,authenticated=rw/postgres}   <- the only column-level UPDATE (authenticated)
--   email         : no column ACL
--   the other 33 columns: {anon=r/postgres,authenticated=r/postgres}
--     id, full_name, college, bio, github_url, linkedin_url, avatar_url, created_at, skills,
--     github_stats, github_stats_updated_at, onboarding_completed, is_banned, role, last_seen_at,
--     is_available, has_participated_hackathon, hackathon_participations, has_won_hackathon,
--     hackathon_wins, onboarding_nudge_sent_at, referrer_source, profile_nudge_count,
--     last_nudge_sent_at, updated_at, gender, sih_broadcast_sent_at, last_onboarding_nudge_sent_at,
--     username, show_track_record, current_streak, longest_streak, last_active_date
--
-- Effective UPDATE (has_table_privilege / has_column_privilege): true on the table and on all
-- 35 columns for anon AND for authenticated.
--
-- Rollback for 1B (restores the exact pre-state for both roles; copy into a reviewed,
-- transactional script, never run this file). The REVOKE first clears the 20 column-level
-- grants that 1B adds; the last line reproduces the pre-1B year_of_study column grant.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE ON public.profiles TO anon, authenticated;
GRANT UPDATE (year_of_study) ON public.profiles TO authenticated;
-- Superseded one-line rollback (restored only the authenticated half):
--   GRANT UPDATE ON public.profiles TO authenticated;

-- -----------------------------------------------------------------------------
-- G. REFERENCE ONLY — live triggers on profiles / teams / team_members (Q3)
-- -----------------------------------------------------------------------------
-- profiles:     matchmaking_profile_changed (AFTER INSERT OR UPDATE OF skills, college, is_available,
--                 hackathon_participations, hackathon_wins, has_won_hackathon, onboarding_completed, is_banned)
--               on_profile_before_delete (BEFORE DELETE) -> handle_profile_before_delete()
--               set_profiles_updated_at (BEFORE UPDATE) -> handle_updated_at()
--               trigger_profile_roles_update (BEFORE UPDATE) -> handle_profile_roles_update()
-- teams:        matchmaking_team_changed; trg_create_team_conversation (AFTER INSERT) -> create_team_conversation()
-- team_members: matchmaking_member_changed; trg_add_member_to_team_conversation (AFTER INSERT);
--               trg_remove_member_from_team_conversation (AFTER DELETE) -> remove_member_from_team_conversation()
-- Phase 1 does not modify any trigger.

*/
