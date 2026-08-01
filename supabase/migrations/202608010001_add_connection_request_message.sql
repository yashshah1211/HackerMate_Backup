-- Add optional custom pitch message column to friend_requests table
ALTER TABLE public.friend_requests ADD COLUMN IF NOT EXISTS message text;

-- Update send_connection_request stored procedure to accept optional pitch message
CREATE OR REPLACE FUNCTION public.send_connection_request(
  p_receiver_id uuid,
  p_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_request_id uuid;
  v_sender_name text;
BEGIN
  IF v_sender_id IS NULL OR p_receiver_id = v_sender_id THEN
    RAISE EXCEPTION 'Invalid connection request';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(LEAST(v_sender_id::text, p_receiver_id::text) || ':' ||
      GREATEST(v_sender_id::text, p_receiver_id::text), 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE (sender_id = v_sender_id AND receiver_id = p_receiver_id)
       OR (sender_id = p_receiver_id AND receiver_id = v_sender_id)
  ) THEN
    RAISE EXCEPTION 'A connection or request already exists';
  END IF;

  INSERT INTO public.friend_requests (sender_id, receiver_id, status, message)
  VALUES (v_sender_id, p_receiver_id, 'pending', p_message)
  RETURNING id INTO v_request_id;

  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = v_sender_id;

  INSERT INTO public.notifications (user_id, message, link)
  VALUES (
    p_receiver_id,
    COALESCE(v_sender_name, 'Someone') || ' sent you a connection request' || 
      CASE WHEN p_message IS NOT NULL AND length(trim(p_message)) > 0 
        THEN ': "' || substring(trim(p_message) from 1 for 50) || '..."' 
        ELSE '' 
      END,
    '/connections'
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_connection_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.send_connection_request(uuid, text) TO authenticated;
