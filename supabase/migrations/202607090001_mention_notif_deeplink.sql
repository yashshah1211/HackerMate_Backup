-- Fix mention notification deep-link to redirect to the correct team chat
-- instead of the generic /messages page.
-- For team-chat mentions: /teams/{team_id}?tab=chat
-- For DM mentions: /messages (unchanged fallback)

CREATE OR REPLACE FUNCTION public.send_message_with_mentions(
  p_conversation_id uuid,
  p_content text,
  p_mentions uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $`$
DECLARE
  v_message_id uuid;
  v_team_id uuid;
  v_link text;
BEGIN
  v_message_id := public.send_message(
    p_conversation_id,
    p_content
  );

  UPDATE public.messages
  SET mentions = COALESCE(p_mentions, ARRAY[]::uuid[])
  WHERE id = v_message_id;

  -- Look up the team_id for this conversation (NULL for DMs)
  SELECT team_id INTO v_team_id
  FROM public.conversations
  WHERE id = p_conversation_id;

  -- Build deep-link: team chat tab or generic messages page
  IF v_team_id IS NOT NULL THEN
    v_link := '/teams/' || v_team_id::text || '?tab=chat';
  ELSE
    v_link := '/messages';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    message,
    link
  )
  SELECT
    cp.user_id,
    'You were mentioned in a chat',
    v_link
  FROM conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND cp.user_id = ANY(p_mentions)
    AND cp.user_id <> auth.uid();

  RETURN v_message_id;
END;
$`$;
