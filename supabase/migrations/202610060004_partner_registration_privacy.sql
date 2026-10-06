-- Additive Commit 4. Live ledger/policies audited 2026-10-06; never applied by
-- this implementation task. Supersedes all registration policies, not just the
-- two broad SELECT policies (permissive policies combine with OR).
BEGIN;

CREATE FUNCTION public.has_verified_event_identity()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p JOIN auth.users AS u ON u.id = p.id
    WHERE p.id = auth.uid() AND p.is_banned IS FALSE
      AND u.email IS NOT NULL AND u.email <> ''
  );
$$;
REVOKE ALL ON FUNCTION public.has_verified_event_identity() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_verified_event_identity() TO authenticated;

-- Replace every effective policy on this table, including unexpected drift;
-- otherwise an older ALL/SELECT policy could silently reopen raw reads/writes.
DO $$
DECLARE policy record;
BEGIN
  FOR policy IN SELECT policyname FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'hackathon_registrations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.hackathon_registrations', policy.policyname);
  END LOOP;
END;
$$;
ALTER TABLE public.hackathon_registrations ENABLE ROW LEVEL SECURITY;

-- Clear table AND explicit column ACLs; table REVOKE alone leaves column grants.
REVOKE ALL ON public.hackathon_registrations FROM PUBLIC, anon, authenticated;
DO $$
DECLARE columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.hackathon_registrations'::regclass
    AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL (%s) ON public.hackathon_registrations FROM PUBLIC, anon, authenticated', columns);
END;
$$;
GRANT SELECT, DELETE ON public.hackathon_registrations TO authenticated;
GRANT INSERT (hackathon_id, user_id, team_id, status, looking_for_team, metadata, is_hidden)
  ON public.hackathon_registrations TO authenticated;
GRANT UPDATE (looking_for_team, metadata, is_hidden)
  ON public.hackathon_registrations TO authenticated;
-- Existing service-role ACLs are preserved for already-authorized admin/server
-- consumers. No service-role grant or new service-role caller is introduced.

CREATE POLICY registrations_read_scoped ON public.hackathon_registrations
FOR SELECT TO authenticated USING (
  (user_id = (SELECT auth.uid()) AND (SELECT public.has_verified_event_identity()))
  OR public.can_access_partner_event(hackathon_registrations.hackathon_id)
);
CREATE POLICY registrations_create_self ON public.hackathon_registrations
FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND (SELECT public.has_verified_event_identity())
  AND (team_id IS NULL OR public.is_team_owner(team_id))
);
CREATE POLICY registrations_update_self ON public.hackathon_registrations
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND (SELECT public.has_verified_event_identity()))
WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.has_verified_event_identity()));
CREATE POLICY registrations_delete_self ON public.hackathon_registrations
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND (SELECT public.has_verified_event_identity()));

-- Column ACLs protect row/event/user identity, timestamps, status and team.
-- Metadata contains both participant track preferences and private server state.
-- Only the two existing Commit 3 track preferences may change in client writes.
-- SECURITY INVOKER: no elevated authority, no lookup or recursion through RLS.
CREATE FUNCTION public.guard_registration_preferences()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.metadata IS NOT NULL AND (
        jsonb_typeof(NEW.metadata) IS DISTINCT FROM 'object'
        OR (NEW.metadata - ARRAY['event_track', 'event_name']) <> '{}'::jsonb
      ) THEN
        RAISE EXCEPTION 'Registration metadata is protected' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      IF jsonb_typeof(NEW.metadata) IS DISTINCT FROM 'object'
        OR (OLD.metadata IS NOT NULL AND jsonb_typeof(OLD.metadata) IS DISTINCT FROM 'object')
        OR (NEW.metadata - ARRAY['event_track', 'event_name']) IS DISTINCT FROM
          (COALESCE(OLD.metadata, '{}'::jsonb) - ARRAY['event_track', 'event_name']) THEN
        RAISE EXCEPTION 'Registration metadata is protected' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_registration_preferences() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_registration_preferences BEFORE INSERT OR UPDATE
ON public.hackathon_registrations FOR EACH ROW EXECUTE FUNCTION public.guard_registration_preferences();

-- There is no public announcement state in the audited live schema. Keep
-- participant reads private and qualify the outer event to fix the tautology.
DO $$
DECLARE policy record;
BEGIN
  FOR policy IN SELECT policyname FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'hackathon_announcements'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.hackathon_announcements', policy.policyname);
  END LOOP;
END;
$$;
ALTER TABLE public.hackathon_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hackathon_announcements FROM PUBLIC, anon, authenticated;
DO $$
DECLARE columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.hackathon_announcements'::regclass
    AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL (%s) ON public.hackathon_announcements FROM PUBLIC, anon, authenticated', columns);
END;
$$;
GRANT SELECT, DELETE ON public.hackathon_announcements TO authenticated;
GRANT INSERT (hackathon_id, organizer_id, title, message, linked_stage_id, sent_at)
  ON public.hackathon_announcements TO authenticated;
GRANT UPDATE (title, message, linked_stage_id, sent_at)
  ON public.hackathon_announcements TO authenticated;
CREATE POLICY hackathon_announcements_read ON public.hackathon_announcements
FOR SELECT TO authenticated USING (
  public.can_access_partner_event(hackathon_announcements.hackathon_id)
  OR ((SELECT public.has_verified_event_identity()) AND EXISTS (
    SELECT 1 FROM public.hackathon_registrations AS hr
    WHERE hr.hackathon_id = hackathon_announcements.hackathon_id
      AND hr.user_id = (SELECT auth.uid())
  ))
);
-- Preserve existing native broadcast writes and authoritative admin/founder
-- access. Explicit partner assignments grant reads, not new broadcast writes.
CREATE POLICY hackathon_announcements_insert ON public.hackathon_announcements
FOR INSERT TO authenticated WITH CHECK (
  organizer_id = (SELECT auth.uid())
  AND public.can_access_partner_event(hackathon_announcements.hackathon_id)
  AND (public.has_partner_admin_access() OR EXISTS (
    SELECT 1 FROM public.hackathons AS h WHERE h.id = hackathon_announcements.hackathon_id
      AND h.type = 'native' AND h.organizer_id = (SELECT auth.uid())
  ))
);
CREATE POLICY hackathon_announcements_update ON public.hackathon_announcements
FOR UPDATE TO authenticated USING (
  public.can_access_partner_event(hackathon_announcements.hackathon_id)
  AND (public.has_partner_admin_access() OR EXISTS (
    SELECT 1 FROM public.hackathons AS h WHERE h.id = hackathon_announcements.hackathon_id
      AND h.type = 'native' AND h.organizer_id = (SELECT auth.uid())
  ))
) WITH CHECK (
  public.can_access_partner_event(hackathon_announcements.hackathon_id)
  AND (public.has_partner_admin_access() OR EXISTS (
    SELECT 1 FROM public.hackathons AS h WHERE h.id = hackathon_announcements.hackathon_id
      AND h.type = 'native' AND h.organizer_id = (SELECT auth.uid())
  ))
);
CREATE POLICY hackathon_announcements_delete ON public.hackathon_announcements
FOR DELETE TO authenticated USING (
  public.can_access_partner_event(hackathon_announcements.hackathon_id)
  AND (public.has_partner_admin_access() OR EXISTS (
    SELECT 1 FROM public.hackathons AS h WHERE h.id = hackathon_announcements.hackathon_id
      AND h.type = 'native' AND h.organizer_id = (SELECT auth.uid())
  ))
);

-- The public track-record RPC is replaced below from its production-effective
-- Phase 1A body, with only registration visibility/field and identity guards.

CREATE OR REPLACE FUNCTION public.get_public_builder_profile(p_target_id text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  IF v_caller IS NOT NULL AND NOT public.has_verified_event_identity() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
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
  IF v_profile.id IS NULL OR v_profile.is_banned IS DISTINCT FROM false THEN
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
  IF v_profile.show_track_record IS DISTINCT FROM true
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
      'hackathon_id', h.id,
      'hackathon_name', h.name,
      'mode', h.mode,
      'location', h.location,
      'prize_pool', h.prize_pool,
      'start_date', h.start_date,
      'end_date', h.end_date,
      'website_url', h.website_url
    ) || CASE WHEN v_caller = v_user_uuid THEN jsonb_build_object(
      'registration_id', r.id, 'registration_status', r.status,
      'looking_for_team', r.looking_for_team, 'registered_at', r.created_at
    ) ELSE '{}'::jsonb END ORDER BY h.start_date DESC NULLS LAST
  ), '[]'::jsonb)
  INTO v_registrations
  FROM public.hackathon_registrations r
  JOIN public.hackathons h ON h.id = r.hackathon_id
  WHERE r.user_id = v_user_uuid
    AND r.is_hidden IS FALSE
    AND (v_caller = v_user_uuid OR (h.archived IS FALSE AND
      (h.type = 'external' OR h.type IS NULL OR
       COALESCE(h.status, h.ai_feedback->>'status', CASE WHEN h.type <> 'native' THEN 'approved' END) = 'approved')));

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

COMMIT;
