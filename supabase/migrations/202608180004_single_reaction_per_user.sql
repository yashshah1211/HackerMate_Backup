-- Migration: 202608180004_single_reaction_per_user.sql
-- Enforces strictly 1 reaction per user per message (swaps emoji on new selection or removes on re-click)

-- 1. Deduplicate any existing multi-emoji reactions per user per message if any exist
DELETE FROM public.message_reactions r1
USING public.message_reactions r2
WHERE r1.message_id = r2.message_id
  AND r1.user_id = r2.user_id
  AND r1.created_at < r2.created_at;

-- 2. Replace the multi-emoji constraint with a strict (message_id, user_id) unique constraint
ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS uq_message_reaction;

ALTER TABLE public.message_reactions
  ADD CONSTRAINT uq_message_reaction_single_per_user UNIQUE (message_id, user_id);

-- 3. Update the atomic toggle function to swap or untoggle
CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  p_message_id UUID,
  p_emoji TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
  v_existing_emoji TEXT;
  v_action TEXT;
  v_allowed BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate participant access
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = v_user_id
    LEFT JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = v_user_id
    WHERE m.id = p_message_id
      AND (cp.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Access denied to this conversation';
  END IF;

  -- Check existing reaction for this user on this message
  SELECT id, emoji INTO v_existing_id, v_existing_emoji
  FROM public.message_reactions
  WHERE message_id = p_message_id
    AND user_id = v_user_id;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_emoji = p_emoji THEN
      -- Same emoji: untoggle / delete
      DELETE FROM public.message_reactions WHERE id = v_existing_id;
      v_action := 'removed';
    ELSE
      -- Different emoji: update / swap to new emoji
      UPDATE public.message_reactions
      SET emoji = p_emoji, created_at = now()
      WHERE id = v_existing_id;
      v_action := 'updated';
    END IF;
  ELSE
    -- No previous reaction: insert new
    INSERT INTO public.message_reactions (message_id, user_id, emoji)
    VALUES (p_message_id, v_user_id, p_emoji);
    v_action := 'added';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action,
    'message_id', p_message_id,
    'emoji', p_emoji,
    'previous_emoji', v_existing_emoji
  );
END;
$$;
