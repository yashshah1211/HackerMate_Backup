-- Repair the existing authenticated account-deletion RPC. No table schema,
-- RLS or table grants change. The admin route uses the verified caller client.
-- Auth deletion here is SQL in the SAME transaction as ownership and cascades;
-- external files are not deleted. Owned Supabase storage objects block deletion.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_user_completely(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller record;
  v_target record;
  v_team record;
  v_successor uuid;
  v_audit_count bigint;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT p.role, p.is_banned, u.email INTO v_caller
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.id = v_caller_id FOR SHARE OF p, u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller not found' USING ERRCODE = '42501';
  END IF;
  -- Keep the existing self-delete entry point. Deleting another account needs
  -- a current non-banned DB admin or the exact authenticated founder identity.
  IF v_caller_id <> p_target_user_id AND (
    v_caller.is_banned IS TRUE OR
    (v_caller.role IS DISTINCT FROM 'admin' AND
      lower(btrim(coalesce(v_caller.email, ''))) <> 'yashshah7117@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  SELECT p.role, u.email INTO v_target
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_target_user_id FOR UPDATE OF p, u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account not found' USING ERRCODE = 'P0002';
  END IF;
  -- Recheck under lock: the HTTP preflight alone cannot protect a role/email
  -- changed between its reads and the deletion transaction.
  IF v_caller_id <> p_target_user_id AND (
    v_target.role = 'admin' OR
    lower(btrim(coalesce(v_target.email, ''))) = 'yashshah7117@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Protected administrator account' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
             WHERE owner = p_target_user_id OR owner_id = p_target_user_id::text) THEN
    RAISE EXCEPTION 'Owned storage objects must be resolved before deletion' USING ERRCODE = 'P0001';
  END IF;

  FOR v_team IN
    SELECT id, name FROM public.teams WHERE owner_id = p_target_user_id
    ORDER BY id FOR UPDATE
  LOOP
    -- Membership is unique on (team_id, user_id). Lock existing memberships
    -- before choosing an owner; never interpret a failed lookup as an empty team.
    PERFORM 1 FROM public.team_members WHERE team_id = v_team.id
    ORDER BY user_id FOR UPDATE;
    v_successor := NULL;
    SELECT m.user_id INTO v_successor
    FROM public.team_members m JOIN public.profiles p ON p.id = m.user_id
    WHERE m.team_id = v_team.id AND m.user_id <> p_target_user_id
      AND p.is_banned IS NOT TRUE
    ORDER BY m.created_at ASC NULLS LAST, m.user_id ASC
    LIMIT 1 FOR UPDATE OF m, p;
    IF v_successor IS NOT NULL THEN
      UPDATE public.teams SET owner_id = v_successor
      WHERE id = v_team.id AND owner_id = p_target_user_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Team ownership changed' USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.team_members SET role = 'member'
      WHERE team_id = v_team.id AND role = 'owner' AND user_id <> v_successor;
      UPDATE public.team_members SET role = 'owner'
      WHERE team_id = v_team.id AND user_id = v_successor;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Successor membership missing' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = v_team.id AND owner_id = v_successor)
        OR NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = v_team.id
                       AND user_id = v_successor AND role = 'owner')
        OR (SELECT count(*) FROM public.team_members WHERE team_id = v_team.id AND role = 'owner') <> 1 THEN
        RAISE EXCEPTION 'Ownership handover incomplete' USING ERRCODE = 'P0001';
      END IF;
      -- Notification failure aborts the transaction rather than hiding a partial
      -- handover. No mutation error is swallowed.
      INSERT INTO public.notifications (user_id, message, link)
      VALUES (v_successor,
        'You have been promoted to owner of team "' || v_team.name || '" because the previous owner left.',
        '/teams/' || v_team.id::text);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Successor notification missing' USING ERRCODE = 'P0001';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM public.team_members
                  WHERE team_id = v_team.id AND user_id <> p_target_user_id) THEN
      RAISE EXCEPTION 'No eligible successor for occupied team' USING ERRCODE = 'P0001';
    ELSE
      DELETE FROM public.teams WHERE id = v_team.id AND owner_id = p_target_user_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Team ownership changed' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  -- Current notifications.user_id has no FK. Other dependent records follow
  -- verified CASCADE / SET NULL constraints; NO ACTION blockers abort everything.
  DELETE FROM public.notifications WHERE user_id = p_target_user_id;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = p_target_user_id) THEN
    RAISE EXCEPTION 'Notification cleanup incomplete' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_audit_count FROM public.deleted_user_logs WHERE user_id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Account deletion incomplete' USING ERRCODE = 'P0001';
  END IF;
  -- The existing audit trigger swallows insert failures. Require its record so
  -- an audit failure rolls back deletion instead of silently losing evidence.
  IF (SELECT count(*) FROM public.deleted_user_logs WHERE user_id = p_target_user_id) <= v_audit_count THEN
    RAISE EXCEPTION 'Deletion audit record missing' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Preserve the hardened authenticated-only boundary (not service_role).
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO authenticated;
COMMIT;
