-- STAB-027. REVIEW ONLY: production application requires founder approval.
-- Inventory and installed snapshots precede permission edits.
-- No columns, existing policies, owners, ACLs or Mission03 permissions change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- These fingerprints cover reviewed SQL code, never credentials or customer rows.
DO $preflight$
DECLARE expected record; actual record;
BEGIN
  FOR expected IN SELECT * FROM(VALUES
      ('can_access_conversation(uuid)','f418a8eba5291ca574d3d13bf888e559','9131b0af8e985d6a4967545206673daa',true),
      ('is_conversation_participant(uuid)','bb575536135dd91bfd19dbeb718ba42a','4c0e08f645d0b08b78039de70ec66c7b',true),
      ('get_my_dm_conversations()','da1c46ff529c6b5d7aa52c1ad2deb695','cbbe3299a4a29a6972c43d20ac061b07',true),
      ('ensure_team_conversation(uuid)','71d757e8eee3efbbe951e288ae0a97ca','f02f293f7187967d253af4263545d5e2',true),
      ('delete_message(uuid)','27269a2c52c0129154f38e4ef3377eb4','64ce40ad342b4e9888401103a4900be7',false),
      ('toggle_message_reaction(uuid,text)','2e88348a1adcd617f721a04aa8303b2c','1e2f5590d34ccaa19331619856db4824',false),
      ('get_or_create_dm(uuid)','5ef801736db70bdbd953bf7c74506d1a','905b08fd37c33933712329ccf3828aba',true)
  ) AS f(signature,old_body,new_body,service_exec) LOOP
    SELECT p.* INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||expected.signature);
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing reviewed function: %',expected.signature; END IF;
    IF NOT actual.prosecdef OR actual.proowner<>(SELECT relowner FROM pg_class WHERE oid='public.messages'::regclass)
      OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
      OR has_function_privilege('anon',actual.oid,'EXECUTE')
      OR NOT has_function_privilege('authenticated',actual.oid,'EXECUTE')
      OR has_function_privilege('service_role',actual.oid,'EXECUTE') IS DISTINCT FROM expected.service_exec
      OR md5(replace(actual.prosrc,E'\r\n',E'\n')) NOT IN(expected.old_body,expected.new_body) THEN
      RAISE EXCEPTION 'Reviewed function metadata/body drift: %',expected.signature;
    END IF;
  END LOOP;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_banned=false)
  AND EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=p_conversation_id AND (
    (c.team_id IS NOT NULL AND (
      EXISTS(SELECT 1 FROM public.teams t WHERE t.id=c.team_id AND t.owner_id=(SELECT auth.uid()))
      OR EXISTS(SELECT 1 FROM public.team_members tm WHERE tm.team_id=c.team_id AND tm.user_id=(SELECT auth.uid()))
    )) OR (c.team_id IS NULL AND EXISTS(SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id=c.id AND cp.user_id=(SELECT auth.uid())))
  ));
$function$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT public.can_access_conversation(conv_id) AND EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=conv_id AND user_id=(SELECT auth.uid())); $function$;

CREATE OR REPLACE FUNCTION public.get_my_dm_conversations()
 RETURNS TABLE(conversation_id uuid, other_user_id uuid, last_message text, last_message_at timestamp with time zone, unread_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_my_id uuid := (SELECT auth.uid());
BEGIN
  IF v_my_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_my_id AND is_banned=false) THEN
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
    WHERE cp.user_id = v_my_id AND public.can_access_conversation(c.id)
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
$function$;

CREATE OR REPLACE FUNCTION public.ensure_team_conversation(p_team_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conversation_id uuid;
BEGIN
  -- Only team members may call this
  IF NOT public.is_team_member(p_team_id) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_banned=false) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sender_id UUID;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_caller_id AND is_banned=false) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT sender_id INTO v_sender_id
  FROM public.messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF v_sender_id != v_caller_id THEN
    RAISE EXCEPTION 'You can only delete your own messages';
  END IF;

  IF NOT public.can_access_conversation((SELECT conversation_id FROM public.messages WHERE id=p_message_id)) THEN
    RAISE EXCEPTION 'Conversation access denied';
  END IF;

  DELETE FROM public.messages
  WHERE id = p_message_id;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id uuid, p_emoji text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
  v_action TEXT;
  v_allowed BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user_id AND is_banned=false) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate participant access
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = v_user_id
    LEFT JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = v_user_id
    WHERE m.id = p_message_id AND public.can_access_conversation(m.conversation_id)
      AND (cp.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Access denied to this conversation';
  END IF;

  -- Check if reaction already exists for this user and emoji
  SELECT id INTO v_existing_id
  FROM public.message_reactions
  WHERE message_id = p_message_id
    AND user_id = v_user_id
    AND emoji = p_emoji;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM public.message_reactions WHERE id = v_existing_id;
    v_action := 'removed';
  ELSE
    INSERT INTO public.message_reactions (message_id, user_id, emoji)
    VALUES (p_message_id, v_user_id, p_emoji);
    v_action := 'added';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action,
    'message_id', p_message_id,
    'emoji', p_emoji
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_dm(other_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null or other_user_id = v_user_id then
    raise exception 'Invalid direct-message recipient';
  end if;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user_id AND is_banned=false) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  if not exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and (
        (sender_id = v_user_id and receiver_id = other_user_id)
        or (sender_id = other_user_id and receiver_id = v_user_id)
      )
  ) then
    raise exception 'You can only message connected builders';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(least(v_user_id::text, other_user_id::text) || ':' ||
      greatest(v_user_id::text, other_user_id::text), 1)
  );

  select c.id into v_conversation_id
  from public.conversations c
  where c.type = 'dm'
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = v_user_id
    )
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = other_user_id
    )
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (type)
    values ('dm')
    returning id into v_conversation_id;
    insert into public.conversation_participants (conversation_id, user_id)
    values
      (v_conversation_id, v_user_id),
      (v_conversation_id, other_user_id);
  end if;

  return v_conversation_id;
end;
$function$;

DROP POLICY IF EXISTS messages_active_actor ON public.messages;
CREATE POLICY messages_active_actor ON public.messages AS RESTRICTIVE FOR ALL TO authenticated
USING(public.can_access_conversation(conversation_id)) WITH CHECK(public.can_access_conversation(conversation_id));

DROP POLICY IF EXISTS message_reactions_active_actor ON public.message_reactions;
CREATE POLICY message_reactions_active_actor ON public.message_reactions AS RESTRICTIVE FOR ALL TO authenticated
USING(EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_reactions.message_id AND public.can_access_conversation(m.conversation_id))) WITH CHECK(EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_reactions.message_id AND public.can_access_conversation(m.conversation_id)));

DROP POLICY IF EXISTS conversations_active_actor ON public.conversations;
CREATE POLICY conversations_active_actor ON public.conversations AS RESTRICTIVE FOR ALL TO authenticated
USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_banned=false)) WITH CHECK(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_banned=false));

DROP POLICY IF EXISTS conversation_participants_active_actor ON public.conversation_participants;
CREATE POLICY conversation_participants_active_actor ON public.conversation_participants AS RESTRICTIVE FOR ALL TO authenticated
USING(public.can_access_conversation(conversation_id)) WITH CHECK(public.can_access_conversation(conversation_id));

COMMIT;
