-- Migration: 202608040004_fix_send_message_overloads
-- Drops older overloaded function definitions to resolve PostgREST ambiguity.

DROP FUNCTION IF EXISTS public.send_message(uuid, text);
DROP FUNCTION IF EXISTS public.send_message_with_mentions(uuid, text, uuid[]);

-- Re-declare canonical single-definition functions with DEFAULT NULL parameters
CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_content text,
  p_reply_to_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_content text := btrim(p_content);
  v_message_id uuid;
  v_match text[];
  v_url text;
  v_domain text;
  v_allowed text[] := array[
    'github.com', 'gitlab.com', 'bitbucket.org', 'vercel.app', 'netlify.app',
    'figma.com', 'miro.com', 'notion.so', 'notion.site', 'discord.gg',
    'discord.com', 'whatsapp.com', 'slack.com', 'zoom.us', 'meet.google.com',
    'google.com', 'linkedin.com', 'x.com', 'twitter.com', 'unstop.com',
    'devpost.com'
  ];
BEGIN
  IF (
    SELECT count(*)
    FROM public.messages
    WHERE sender_id = auth.uid()
      AND created_at > now() - interval '10 seconds'
  ) >= 5 THEN
    RAISE EXCEPTION 'You are sending messages too fast. Please wait a moment.';
  END IF;

  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Conversation access denied';
  END IF;
  IF v_content IS NULL OR char_length(v_content) = 0 OR char_length(v_content) > 5000 THEN
    RAISE EXCEPTION 'Messages must contain between 1 and 5000 characters';
  END IF;
  IF v_content ~* '\m(fuck|shit|bitch|asshole|bastard|cunt|dick|pussy|motherfuck|whore|slut|faggot|nigger|chutiya|bhenchod|madarchod|gandu|bsdk)\M' THEN
    RAISE EXCEPTION 'Message blocked by the community safety filter';
  END IF;

  FOR v_match IN
    SELECT regexp_matches(
      v_content,
      '(https?://[^[:space:]]+|www\.[^[:space:]]+|[a-zA-Z0-9.-]+\.(com|org|net|in|co|io|edu|gov|us|xyz|info|biz|me|cc|tv)(/[^[:space:]]*)?)',
      'gi'
    )
  LOOP
    v_url := lower(v_match[1]);
    v_domain := regexp_replace(v_url, '^(https?://)?(www\.)?([^/:?#]+).*$', '\3');
    IF NOT EXISTS (
      SELECT 1 FROM unnest(v_allowed) allowed
      WHERE v_domain = allowed OR right(v_domain, char_length(allowed) + 1) = '.' || allowed
    ) THEN
      RAISE EXCEPTION 'This link domain is not allowed in HackerMate messages';
    END IF;
  END LOOP;

  INSERT INTO public.messages (conversation_id, sender_id, content, reply_to_id)
  VALUES (p_conversation_id, auth.uid(), v_content, p_reply_to_id)
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_message_with_mentions(
  p_conversation_id uuid,
  p_content text,
  p_mentions uuid[] DEFAULT ARRAY[]::uuid[],
  p_reply_to_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_id uuid;
  v_team_id uuid;
  v_link text;
BEGIN
  v_message_id := public.send_message(
    p_conversation_id,
    p_content,
    p_reply_to_id
  );

  UPDATE public.messages
  SET mentions = COALESCE(p_mentions, ARRAY[]::uuid[])
  WHERE id = v_message_id;

  SELECT team_id INTO v_team_id
  FROM public.conversations
  WHERE id = p_conversation_id;

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
$$;

GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[], uuid) TO authenticated;
