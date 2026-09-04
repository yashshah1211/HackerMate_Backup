-- Migration: Optimize Chat RLS, Direct Messages Inbox, and Teammate Recommendation
-- Replaces row-by-row can_access_conversation in messages_read policy with an InitPlan-compatible subquery
-- Inlines team checks in can_access_conversation
-- Adds get_my_dm_conversations RPC to eliminate N+1 loop on /messages
-- Optimizes get_recommended_teammates RPC using set theory (inclusion-exclusion principle)

-- 1. Optimized messages_read RLS Policy
DROP POLICY IF EXISTS "messages_read" ON public.messages;
CREATE POLICY "messages_read"
  ON public.messages FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT cp.conversation_id
      FROM public.conversation_participants cp
      WHERE cp.user_id = (SELECT auth.uid())
      UNION ALL
      SELECT c.id
      FROM public.conversations c
      JOIN public.team_members tm ON tm.team_id = c.team_id
      WHERE tm.user_id = (SELECT auth.uid())
      UNION ALL
      SELECT c.id
      FROM public.conversations c
      JOIN public.teams t ON t.id = c.team_id
      WHERE t.owner_id = (SELECT auth.uid())
    )
  );

-- 2. Inline & Optimize can_access_conversation function
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND c.team_id IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM public.teams t WHERE t.id = c.team_id AND t.owner_id = (SELECT auth.uid()))
        OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = c.team_id AND tm.user_id = (SELECT auth.uid()))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_conversation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_access_conversation(uuid) TO authenticated;

-- 3. Stored Procedure: get_my_dm_conversations
-- Returns current user's DM conversations with partner user ID, latest message, and unread count in a single query
CREATE OR REPLACE FUNCTION public.get_my_dm_conversations()
RETURNS TABLE (
  conversation_id uuid,
  other_user_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_my_id uuid := (SELECT auth.uid());
BEGIN
  IF v_my_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH my_dms AS (
    SELECT
      cp.conversation_id,
      cp.cleared_at,
      other_cp.user_id AS other_user_id
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id AND c.type = 'dm'
    JOIN public.conversation_participants other_cp 
      ON other_cp.conversation_id = cp.conversation_id 
     AND other_cp.user_id <> v_my_id
    WHERE cp.user_id = v_my_id
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users b
        WHERE (b.blocker_id = v_my_id AND b.blocked_id = other_cp.user_id)
           OR (b.blocker_id = other_cp.user_id AND b.blocked_id = v_my_id)
      )
  ),
  ranked_messages AS (
    SELECT
      m.conversation_id,
      m.content,
      m.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY m.conversation_id 
        ORDER BY m.created_at DESC
      ) AS rn
    FROM public.messages m
    JOIN my_dms d ON d.conversation_id = m.conversation_id
    WHERE d.cleared_at IS NULL OR m.created_at > d.cleared_at
  ),
  unread_counts AS (
    SELECT
      m.conversation_id,
      count(*) AS unread_cnt
    FROM public.messages m
    JOIN my_dms d ON d.conversation_id = m.conversation_id
    WHERE m.sender_id <> v_my_id
      AND m.is_read = false
      AND (d.cleared_at IS NULL OR m.created_at > d.cleared_at)
    GROUP BY m.conversation_id
  )
  SELECT
    d.conversation_id,
    d.other_user_id,
    rm.content AS last_message,
    rm.created_at AS last_message_at,
    COALESCE(uc.unread_cnt, 0)::bigint AS unread_count
  FROM my_dms d
  LEFT JOIN ranked_messages rm ON rm.conversation_id = d.conversation_id AND rm.rn = 1
  LEFT JOIN unread_counts uc ON uc.conversation_id = d.conversation_id
  ORDER BY rm.created_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_dm_conversations() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dm_conversations() TO authenticated;

-- 4. Optimize get_recommended_teammates RPC using set theory
CREATE OR REPLACE FUNCTION public.get_recommended_teammates(
  p_user_id uuid,
  p_limit   int default 6
)
RETURNS TABLE (
  id            uuid,
  full_name     text,
  avatar_url    text,
  college       text,
  bio           text,
  skills        text[],
  github_url    text,
  linkedin_url  text,
  year_of_study text,
  is_available  boolean,
  compatibility int,
  shared_skills text[],
  same_college  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT
      id,
      array(SELECT DISTINCT lower(btrim(s)) FROM unnest(skills) s WHERE btrim(s) <> '') AS ns,
      lower(btrim(college)) AS ncol
    FROM public.profiles
    WHERE id = p_user_id
  ),

  my_blocks AS (
    SELECT blocked_id AS uid FROM public.blocked_users WHERE blocker_id = p_user_id
    UNION
    SELECT blocker_id AS uid FROM public.blocked_users WHERE blocked_id = p_user_id
  ),

  candidates AS (
    SELECT
      c.id,
      c.full_name,
      c.avatar_url,
      c.college,
      c.bio,
      c.skills,
      c.github_url,
      c.linkedin_url,
      c.year_of_study,
      c.is_available,
      array(SELECT DISTINCT lower(btrim(s)) FROM unnest(c.skills) s WHERE btrim(s) <> '') AS ns,
      lower(btrim(c.college)) AS ncol,
      (regexp_split_to_array(lower(btrim(c.college)), '[\s,()]+'))[1] AS fw
    FROM public.profiles c
    WHERE c.id <> p_user_id
      AND c.onboarding_completed = true
      AND coalesce(c.is_banned, false) = false
      AND c.id NOT IN (SELECT uid FROM my_blocks)
  ),

  scored AS (
    SELECT
      s.id,
      s.full_name,
      s.avatar_url,
      s.college,
      s.bio,
      s.skills,
      s.github_url,
      s.linkedin_url,
      s.year_of_study,
      s.is_available,
      s.ncol,
      s.fw,
      m.ns    AS my_ns,
      m.ncol  AS my_ncol,
      (regexp_split_to_array(coalesce(m.ncol, ''), '[\s,()]+'))[1] AS my_fw,
      array(SELECT unnest(m.ns) INTERSECT SELECT unnest(s.ns)) AS shared_arr,
      -- Set theory: |A union B| = |A| + |B| - |A intersect B|
      (cardinality(m.ns) + cardinality(s.ns) - cardinality(array(SELECT unnest(m.ns) INTERSECT SELECT unnest(s.ns)))) AS union_size
    FROM candidates s
    CROSS JOIN me m
  ),

  ranked AS (
    SELECT
      s.id,
      s.full_name,
      s.avatar_url,
      s.college,
      s.bio,
      s.skills,
      s.github_url,
      s.linkedin_url,
      s.year_of_study,
      s.is_available,
      greatest(5, least(
        CASE WHEN s.union_size > 0
             THEN round((cardinality(s.shared_arr) * 100.0) / s.union_size)::int
             ELSE 0
        END,
        99
      )) AS compatibility,
      coalesce(s.shared_arr, '{}') AS shared_skills,
      (
        s.ncol IS NOT NULL AND s.my_ncol IS NOT NULL AND s.ncol <> ''
        AND (
          s.ncol = s.my_ncol
          OR (
            s.fw IS NOT NULL AND s.my_fw IS NOT NULL
            AND length(s.fw) >= 4
            AND s.fw = s.my_fw
          )
        )
      ) AS same_college
    FROM scored s
  )

  SELECT
    r.id,
    r.full_name,
    r.avatar_url,
    r.college,
    r.bio,
    r.skills,
    r.github_url,
    r.linkedin_url,
    r.year_of_study,
    r.is_available,
    r.compatibility,
    r.shared_skills,
    r.same_college
  FROM ranked r
  ORDER BY
    r.compatibility DESC,
    r.same_college DESC,
    r.is_available DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_recommended_teammates(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_recommended_teammates(uuid, int) TO authenticated;
