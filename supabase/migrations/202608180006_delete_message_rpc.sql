-- Migration: 202608180006_delete_message_rpc.sql
-- Description: Adds secure delete_message RPC allowing users to delete their own messages.

CREATE OR REPLACE FUNCTION public.delete_message(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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

  DELETE FROM public.messages
  WHERE id = p_message_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_message(UUID) TO authenticated;
