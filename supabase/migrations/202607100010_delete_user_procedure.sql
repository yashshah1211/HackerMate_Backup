-- Migration: 202607100010_delete_user_procedure
-- Feature: Secure User Deletion Flow
--
-- Creates the delete_user_completely(target_user_id) function.
-- Resolves team ownership changes or deletion prior to deleting the user
-- from auth.users, letting cascading constraints clean up everything else.

CREATE OR REPLACE FUNCTION public.delete_user_completely(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team_record RECORD;
  v_next_owner_id UUID;
  v_team_name TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify authorization: Caller must be the user themselves OR an admin
  IF v_caller_id != p_target_user_id AND NOT public.is_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Access denied: you cannot delete this user';
  END IF;

  -- Ensure target user exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- 1. Handle teams owned by target user
  FOR v_team_record IN 
    SELECT id, name FROM public.teams WHERE owner_id = p_target_user_id
  LOOP
    -- Find the oldest member in the team excluding the target user
    SELECT user_id INTO v_next_owner_id
    FROM public.team_members
    WHERE team_id = v_team_record.id AND user_id != p_target_user_id
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_next_owner_id IS NOT NULL THEN
      -- Promote the oldest member to owner
      UPDATE public.teams 
      SET owner_id = v_next_owner_id 
      WHERE id = v_team_record.id;

      UPDATE public.team_members 
      SET role = 'owner' 
      WHERE team_id = v_team_record.id AND user_id = v_next_owner_id;

      -- Send a notification to the new owner
      INSERT INTO public.notifications (user_id, message, link)
      VALUES (
        v_next_owner_id, 
        'You have been promoted to owner of team "' || v_team_record.name || '" because the previous owner left.', 
        '/teams/' || v_team_record.id::text
      );
    ELSE
      -- Disband the team if no other members exist
      DELETE FROM public.teams WHERE id = v_team_record.id;
    END IF;
  END LOOP;

  -- 2. Delete user from auth.users (cascades automatically to public.profiles and all related tables)
  DELETE FROM auth.users WHERE id = p_target_user_id;

END;
$$;

-- Revoke all permissions on delete_user_completely from public, grant to authenticated
REVOKE ALL ON FUNCTION public.delete_user_completely(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_completely(UUID) TO authenticated;
