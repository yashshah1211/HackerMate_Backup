-- Migration: Add ensure_team_conversation RPC
-- Used by the frontend when a team's conversation row is missing (data gap).
-- SECURITY DEFINER bypasses RLS so the insert always succeeds for any
-- authenticated team member, matching how all other conversation-creation
-- functions work (create_team_with_owner, get_or_create_dm).

CREATE OR REPLACE FUNCTION public.ensure_team_conversation(p_team_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  -- Only team members may call this
  IF NOT public.is_team_member(p_team_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Try to find an existing conversation first
  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE team_id = p_team_id AND type = 'team'
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    -- Insert, ignoring a race-condition duplicate
    INSERT INTO public.conversations (type, team_id)
    VALUES ('team', p_team_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_conversation_id;

    -- If a concurrent session inserted simultaneously, fetch it now
    IF v_conversation_id IS NULL THEN
      SELECT id INTO v_conversation_id
      FROM public.conversations
      WHERE team_id = p_team_id AND type = 'team'
      LIMIT 1;
    END IF;
  END IF;

  -- Ensure the calling user is a conversation participant
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conversation_id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_team_conversation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_team_conversation(uuid) TO authenticated;
