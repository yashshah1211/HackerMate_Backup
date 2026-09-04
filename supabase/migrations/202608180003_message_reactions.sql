-- Migration: 202608180003_message_reactions.sql
-- Creates message_reactions table with RLS, helper RPC, and Supabase Realtime publication

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) <= 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_message_reaction UNIQUE (message_id, user_id, emoji)
);

-- Performance indexes for lookup and aggregation
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.message_reactions(user_id);

-- Enable Row Level Security
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Select Policy: Authenticated users can view reactions in conversations they participate in
DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
      LEFT JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = auth.uid()
      WHERE m.id = message_reactions.message_id
        AND (cp.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
    )
  );

-- Insert Policy: Authenticated users can only insert their own reactions if they belong to the conversation
DROP POLICY IF EXISTS message_reactions_insert ON public.message_reactions;
CREATE POLICY message_reactions_insert ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
      LEFT JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = auth.uid()
      WHERE m.id = message_reactions.message_id
        AND (cp.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
    )
  );

-- Delete Policy: Users can only delete their own reactions
DROP POLICY IF EXISTS message_reactions_delete ON public.message_reactions;
CREATE POLICY message_reactions_delete ON public.message_reactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Stored Procedure: Atomic toggle reaction
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
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(UUID, TEXT) TO authenticated;

-- Add table to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
