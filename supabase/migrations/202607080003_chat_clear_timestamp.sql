-- Migration: 202607080003_chat_clear_timestamp
-- Adds a cleared_at column to conversation_participants to support personal chat clearing.
-- Also defines an UPDATE RLS policy to allow users to save their cleared chat timestamps.

ALTER TABLE public.conversation_participants 
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

CREATE POLICY conversation_participants_update ON public.conversation_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
