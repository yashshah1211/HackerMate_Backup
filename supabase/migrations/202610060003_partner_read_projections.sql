-- Commit 2 only. Production ledger inspected read-only: latest 202610060001;
-- local 202610060002 is the required access foundation. Not applied here.
-- No base-table grants/RLS, data, existing functions or track columns change.
BEGIN;

CREATE FUNCTION public.get_partner_organizer_overview(p_hackathon_id uuid)
RETURNS TABLE (
  registration_count bigint, confirmed_count bigint, waitlisted_count bigint,
  team_count bigint, participants_in_team bigint, participants_without_team bigint,
  looking_for_team_count bigint, looking_without_team_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.can_access_partner_event(p_hackathon_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unable to verify event access' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH linked_teams AS MATERIALIZED (
    SELECT DISTINCT th.team_id FROM public.team_hackathons AS th
    WHERE th.hackathon_id = p_hackathon_id
  ), linked_members AS (
    SELECT DISTINCT tm.user_id FROM public.team_members AS tm
    JOIN linked_teams AS lt ON lt.team_id = tm.team_id
  )
  SELECT count(*), count(*) FILTER (WHERE r.status = 'confirmed'),
    count(*) FILTER (WHERE r.status = 'waitlisted'),
    (SELECT count(*) FROM linked_teams),
    count(*) FILTER (WHERE lm.user_id IS NOT NULL),
    count(*) FILTER (WHERE lm.user_id IS NULL),
    count(*) FILTER (WHERE r.looking_for_team IS TRUE),
    count(*) FILTER (WHERE r.looking_for_team IS TRUE AND lm.user_id IS NULL)
  FROM public.hackathon_registrations AS r
  LEFT JOIN linked_members AS lm ON lm.user_id = r.user_id
  WHERE r.hackathon_id = p_hackathon_id;
END;
$$;

-- Lists return {total, offset, limit, items}; total is independent of the page,
-- including an empty/out-of-range page. Exact text/skill filters trim and fold
-- case. Search is literal substring, never SQL/ILIKE wildcard interpolation.
CREATE FUNCTION public.list_partner_organizer_participants(
  p_hackathon_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50,
  p_search text DEFAULT NULL, p_college text DEFAULT NULL, p_skill text DEFAULT NULL,
  p_status text DEFAULT NULL, p_team_state text DEFAULT 'any',
  p_looking_for_team boolean DEFAULT NULL, p_sort text DEFAULT 'newest'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.can_access_partner_event(p_hackathon_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unable to verify event access' USING ERRCODE = '42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_sort IS NULL OR p_sort NOT IN ('newest', 'oldest', 'name_asc', 'name_desc')
     OR p_team_state IS NULL OR p_team_state NOT IN ('any', 'in_team', 'without_team')
     OR (p_status IS NOT NULL AND p_status NOT IN ('confirmed', 'waitlisted'))
     OR length(p_search) > 200 OR length(p_college) > 200 OR length(p_skill) > 100 THEN
    RAISE EXCEPTION 'Invalid projection parameters' USING ERRCODE = '22023';
  END IF;
  WITH membership AS (
    SELECT tm.user_id, jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name)
      ORDER BY t.name, t.id) AS event_teams
    FROM public.team_hackathons AS th
    JOIN public.teams AS t ON t.id = th.team_id
    JOIN public.team_members AS tm ON tm.team_id = t.id
    WHERE th.hackathon_id = p_hackathon_id
    GROUP BY tm.user_id
  ), filtered AS MATERIALIZED (
    SELECT r.user_id, p.full_name, p.college,
      ARRAY(SELECT DISTINCT lower(btrim(s.skill)) FROM unnest(p.skills) AS s(skill)
        WHERE nullif(btrim(s.skill), '') IS NOT NULL ORDER BY 1) AS skills,
      r.status, r.looking_for_team, r.created_at,
      coalesce(m.event_teams, '[]'::jsonb) AS event_teams
    FROM public.hackathon_registrations AS r
    LEFT JOIN public.profiles AS p ON p.id = r.user_id
    LEFT JOIN membership AS m ON m.user_id = r.user_id
    WHERE r.hackathon_id = p_hackathon_id
      AND (nullif(btrim(p_search), '') IS NULL OR strpos(lower(coalesce(p.full_name, '')), lower(btrim(p_search))) > 0
        OR strpos(lower(coalesce(p.college, '')), lower(btrim(p_search))) > 0)
      AND (nullif(btrim(p_college), '') IS NULL OR lower(btrim(p.college)) = lower(btrim(p_college)))
      AND (nullif(btrim(p_skill), '') IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p.skills) AS s(skill) WHERE lower(btrim(s.skill)) = lower(btrim(p_skill))))
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_team_state = 'any' OR (p_team_state = 'in_team' AND m.user_id IS NOT NULL)
        OR (p_team_state = 'without_team' AND m.user_id IS NULL))
      AND (p_looking_for_team IS NULL OR r.looking_for_team = p_looking_for_team)
  ), ordered AS (
    SELECT f.user_id, f.full_name, f.college, f.skills, f.status, f.looking_for_team,
      f.created_at, f.event_teams, row_number() OVER (ORDER BY
        CASE WHEN p_sort = 'newest' THEN f.created_at END DESC NULLS LAST,
        CASE WHEN p_sort = 'oldest' THEN f.created_at END ASC NULLS LAST,
        CASE WHEN p_sort = 'name_asc' THEN lower(f.full_name) END ASC NULLS LAST,
        CASE WHEN p_sort = 'name_desc' THEN lower(f.full_name) END DESC NULLS LAST,
        f.user_id ASC) AS position
    FROM filtered AS f
  ), page AS (
    SELECT o.user_id, o.full_name, o.college, o.skills, o.status, o.looking_for_team,
      o.created_at, o.event_teams, o.position
    FROM ordered AS o ORDER BY o.position LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'offset', p_offset, 'limit', p_limit,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'user_id', pg.user_id, 'full_name', pg.full_name, 'college', pg.college, 'skills', pg.skills,
      'status', pg.status, 'looking_for_team', pg.looking_for_team,
      'created_at', pg.created_at, 'event_teams', pg.event_teams) ORDER BY pg.position) FROM page AS pg), '[]'::jsonb))
  INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.list_partner_organizer_teams(
  p_hackathon_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50,
  p_search text DEFAULT NULL, p_recruiting boolean DEFAULT NULL,
  p_min_members integer DEFAULT NULL, p_max_members integer DEFAULT NULL,
  p_size_state text DEFAULT 'any', p_sort text DEFAULT 'name_asc'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb; v_min integer; v_max integer;
BEGIN
  IF auth.uid() IS NULL OR public.can_access_partner_event(p_hackathon_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unable to verify event access' USING ERRCODE = '42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR length(p_search) > 200
     OR p_sort IS NULL OR p_sort NOT IN ('newest', 'oldest', 'name_asc', 'name_desc', 'size_asc', 'size_desc')
     OR p_size_state IS NULL OR p_size_state NOT IN ('any', 'below_min', 'above_max', 'within_limits', 'unknown_limits')
     OR p_min_members < 0 OR p_max_members < 0 OR p_min_members > p_max_members THEN
    RAISE EXCEPTION 'Invalid projection parameters' USING ERRCODE = '22023';
  END IF;
  SELECT h.min_team_size, h.max_team_size INTO v_min, v_max
    FROM public.hackathons AS h WHERE h.id = p_hackathon_id;
  -- These are recorded limits, not verified organizer rules or team success.
  -- Missing, nonpositive or inverted limits cannot imply size compliance.
  IF v_min IS NULL OR v_max IS NULL OR v_min < 1 OR v_max < v_min THEN
    v_min := NULL; v_max := NULL;
  END IF;
  WITH linked_teams AS MATERIALIZED (
    SELECT t.id, t.name, t.created_at, t.is_recruiting, t.roles_needed, t.max_members
    FROM public.team_hackathons AS th JOIN public.teams AS t ON t.id = th.team_id
    WHERE th.hackathon_id = p_hackathon_id
  ), sizes AS (
    SELECT tm.team_id, count(*) AS member_count,
      count(*) FILTER (WHERE r.user_id IS NOT NULL) AS registered_member_count
    FROM public.team_members AS tm JOIN linked_teams AS lt ON lt.id = tm.team_id
    LEFT JOIN public.hackathon_registrations AS r ON r.user_id = tm.user_id AND r.hackathon_id = p_hackathon_id
    GROUP BY tm.team_id
  ), filtered AS MATERIALIZED (
    SELECT lt.id, lt.name, lt.created_at, lt.is_recruiting, lt.roles_needed, lt.max_members,
      coalesce(s.member_count, 0) AS member_count,
      coalesce(s.registered_member_count, 0) AS registered_member_count
    FROM linked_teams AS lt LEFT JOIN sizes AS s ON s.team_id = lt.id
    WHERE (nullif(btrim(p_search), '') IS NULL OR strpos(lower(lt.name), lower(btrim(p_search))) > 0)
      AND (p_recruiting IS NULL OR lt.is_recruiting = p_recruiting)
      AND (p_min_members IS NULL OR coalesce(s.member_count, 0) >= p_min_members)
      AND (p_max_members IS NULL OR coalesce(s.member_count, 0) <= p_max_members)
      AND (p_size_state = 'any' OR (p_size_state = 'unknown_limits' AND v_min IS NULL)
        OR (p_size_state = 'below_min' AND coalesce(s.member_count, 0) < v_min)
        OR (p_size_state = 'above_max' AND coalesce(s.member_count, 0) > v_max)
        OR (p_size_state = 'within_limits' AND coalesce(s.member_count, 0) BETWEEN v_min AND v_max))
  ), ordered AS (
    SELECT f.id, f.name, f.created_at, f.is_recruiting, f.roles_needed, f.max_members,
      f.member_count, f.registered_member_count, row_number() OVER (ORDER BY
        CASE WHEN p_sort = 'newest' THEN f.created_at END DESC NULLS LAST,
        CASE WHEN p_sort = 'oldest' THEN f.created_at END ASC NULLS LAST,
        CASE WHEN p_sort = 'name_asc' THEN lower(f.name) END ASC,
        CASE WHEN p_sort = 'name_desc' THEN lower(f.name) END DESC,
        CASE WHEN p_sort = 'size_asc' THEN f.member_count END ASC,
        CASE WHEN p_sort = 'size_desc' THEN f.member_count END DESC, f.id ASC) AS position
    FROM filtered AS f
  ), page AS MATERIALIZED (
    SELECT o.id, o.name, o.created_at, o.is_recruiting, o.roles_needed, o.max_members,
      o.member_count, o.registered_member_count, o.position
    FROM ordered AS o ORDER BY o.position LIMIT p_limit OFFSET p_offset
  ), rosters AS (
    SELECT tm.team_id, jsonb_agg(jsonb_build_object('user_id', tm.user_id,
      'full_name', p.full_name, 'registered_for_event', r.user_id IS NOT NULL) ORDER BY tm.user_id) AS roster
    FROM public.team_members AS tm JOIN page AS pg ON pg.id = tm.team_id
    LEFT JOIN public.profiles AS p ON p.id = tm.user_id
    LEFT JOIN public.hackathon_registrations AS r ON r.user_id = tm.user_id AND r.hackathon_id = p_hackathon_id
    GROUP BY tm.team_id
  )
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'offset', p_offset, 'limit', p_limit,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'team_id', pg.id, 'team_name', pg.name, 'member_count', pg.member_count,
      'registered_member_count', pg.registered_member_count, 'is_recruiting', pg.is_recruiting,
      'roles_needed', coalesce(pg.roles_needed, ARRAY[]::text[]),
      'max_members', CASE WHEN pg.max_members > 0 THEN pg.max_members END,
      'event_min_team_size', v_min, 'event_max_team_size', v_max,
      'roster', coalesce(ro.roster, '[]'::jsonb)) ORDER BY pg.position)
      FROM page AS pg LEFT JOIN rosters AS ro ON ro.team_id = pg.id), '[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.list_event_discovery_builders(
  p_hackathon_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid projection parameters' USING ERRCODE = '22023';
  END IF;
  -- Match existing public listing semantics; fail closed for pending native,
  -- archived, missing events. Aggregate/count calls use the same event gate.
  IF NOT EXISTS (SELECT 1 FROM public.hackathons AS h WHERE h.id = p_hackathon_id
    AND h.archived IS FALSE AND (h.type = 'external' OR h.type IS NULL
      OR coalesce(h.status, h.ai_feedback->>'status', CASE WHEN h.type <> 'native' THEN 'approved' END) = 'approved')) THEN
    RAISE EXCEPTION 'Event is unavailable' USING ERRCODE = '42501';
  END IF;
  WITH discoverable AS MATERIALIZED (
    SELECT p.id AS user_id, p.full_name, p.college, p.avatar_url,
      ARRAY(SELECT DISTINCT lower(btrim(s.skill)) FROM unnest(p.skills) AS s(skill)
        WHERE nullif(btrim(s.skill), '') IS NOT NULL ORDER BY 1) AS skills, r.created_at
    FROM public.hackathon_registrations AS r JOIN public.profiles AS p ON p.id = r.user_id
    WHERE r.hackathon_id = p_hackathon_id AND r.looking_for_team IS TRUE
      AND r.is_hidden IS FALSE AND p.show_track_record IS TRUE AND p.is_banned IS FALSE
  ), page AS (
    SELECT d.user_id, d.full_name, d.college, d.avatar_url, d.skills, d.created_at
    FROM discoverable AS d ORDER BY d.created_at DESC NULLS LAST, d.user_id ASC LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object('total', (SELECT count(*) FROM discoverable), 'offset', p_offset, 'limit', p_limit,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', pg.user_id,
      'full_name', pg.full_name, 'college', pg.college, 'avatar_url', pg.avatar_url, 'skills', pg.skills)
      ORDER BY pg.created_at DESC NULLS LAST, pg.user_id ASC) FROM page AS pg), '[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.get_hackathon_registration_counts(p_hackathon_id uuid)
RETURNS TABLE (registration_count bigint, confirmed_count bigint, waitlisted_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hackathons AS h WHERE h.id = p_hackathon_id
    AND h.archived IS FALSE AND (h.type = 'external' OR h.type IS NULL
      OR coalesce(h.status, h.ai_feedback->>'status', CASE WHEN h.type <> 'native' THEN 'approved' END) = 'approved')) THEN
    RAISE EXCEPTION 'Event is unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT count(*), count(*) FILTER (WHERE r.status = 'confirmed'),
    count(*) FILTER (WHERE r.status = 'waitlisted')
    FROM public.hackathon_registrations AS r WHERE r.hackathon_id = p_hackathon_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_organizer_overview(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_partner_organizer_participants(uuid, integer, integer, text, text, text, text, text, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_partner_organizer_teams(uuid, integer, integer, text, boolean, integer, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_event_discovery_builders(uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_hackathon_registration_counts(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_partner_organizer_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_partner_organizer_participants(uuid, integer, integer, text, text, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_partner_organizer_teams(uuid, integer, integer, text, boolean, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_discovery_builders(uuid, integer, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_hackathon_registration_counts(uuid) TO authenticated, anon;
COMMIT;
