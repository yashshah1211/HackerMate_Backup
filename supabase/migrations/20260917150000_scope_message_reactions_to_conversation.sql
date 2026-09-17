-- Migration: 20260917150000_scope_message_reactions_to_conversation.sql
-- Scopes message_reactions to conversation_id for Realtime filtering and RLS optimization.

-- 1. Add conversation_id column
ALTER TABLE public.message_reactions
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;

-- 2. Backfill existing reactions with conversation_id from messages
UPDATE public.message_reactions mr
SET conversation_id = m.conversation_id
FROM public.messages m
WHERE mr.message_id = m.id
  AND mr.conversation_id IS NULL;

-- 3. Create index for conversation_id lookups and filtering
CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation_id ON public.message_reactions(conversation_id);

-- 4. Enable REPLICA IDENTITY FULL so WAL contains conversation_id on DELETE events
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

-- 5. Trigger to automatically populate conversation_id on direct INSERT if not supplied
CREATE OR REPLACE FUNCTION public.set_message_reaction_conversation_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    SELECT conversation_id INTO NEW.conversation_id
    FROM public.messages
    WHERE id = NEW.message_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_message_reaction_conversation_id ON public.message_reactions;
CREATE TRIGGER trg_set_message_reaction_conversation_id
  BEFORE INSERT ON public.message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_reaction_conversation_id();

-- 6. Update toggle_message_reaction RPC to populate conversation_id and validate access
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
  v_conversation_id UUID;
  v_existing_id UUID;
  v_existing_emoji TEXT;
  v_action TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate participant access and retrieve conversation_id
  SELECT m.conversation_id INTO v_conversation_id
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = v_user_id
  LEFT JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = v_user_id
  WHERE m.id = p_message_id
    AND (cp.user_id IS NOT NULL OR tm.user_id IS NOT NULL);

  IF v_conversation_id IS NULL THEN
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
    -- No previous reaction: insert new with conversation_id
    INSERT INTO public.message_reactions (message_id, user_id, emoji, conversation_id)
    VALUES (p_message_id, v_user_id, p_emoji, v_conversation_id);
    v_action := 'added';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action,
    'message_id', p_message_id,
    'emoji', p_emoji,
    'previous_emoji', v_existing_emoji,
    'conversation_id', v_conversation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_message_reaction(UUID, TEXT) FROM anon, public;

-- 7. Optimized RLS policies leveraging conversation_id
DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = message_reactions.conversation_id AND cp.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = (select auth.uid())
      WHERE c.id = message_reactions.conversation_id
    )
    -- Fallback for any historical row if conversation_id is temporarily null
    OR (
      message_reactions.conversation_id IS NULL AND EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = (select auth.uid())
        LEFT JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = (select auth.uid())
        WHERE m.id = message_reactions.message_id
          AND (cp.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
      )
    )
  );

DROP POLICY IF EXISTS message_reactions_insert ON public.message_reactions;
CREATE POLICY message_reactions_insert ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = message_reactions.conversation_id AND cp.user_id = (select auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = (select auth.uid())
        WHERE c.id = message_reactions.conversation_id
      )
      OR (
        message_reactions.conversation_id IS NULL AND EXISTS (
          SELECT 1 FROM public.messages m
          JOIN public.conversations c ON c.id = m.conversation_id
          LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = (select auth.uid())
          LEFT JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = (select auth.uid())
          WHERE m.id = message_reactions.message_id
            AND (cp.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
        )
      )
    )
  );
