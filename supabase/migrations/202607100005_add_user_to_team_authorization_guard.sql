-- Migration: 202607100005_add_user_to_team_authorization_guard
-- Security fix L7: Add caller authorization check to add_user_to_team().
--
-- The original function accepted any p_user_id from any authenticated caller,
-- allowing any user to add any other user to any team they know the UUID of.
--
-- The guard requires the caller to be:
--   (a) the team owner  -- covers accept_team_join_request (owner adds requester)
--   (b) adding themselves -- covers join_team_instantly and accept_team_invite
--
-- All three SECURITY DEFINER callers continue to work because auth.uid()
-- persists correctly through SECURITY DEFINER call chains.
-- Direct unauthorized calls (caller != p_user_id AND caller != owner) are rejected.

CREATE OR REPLACE FUNCTION public.add_user_to_team(
  p_team_id uuid,
  p_user_id uuid,
  p_role text default 'member'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;
