-- Migration: 202607180009_create_rate_limits_table
-- Creates a distributed, atomic rate limiting table for public forms.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  ip TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 1,
  reset_time TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Rate limiter utility function
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_ip TEXT, p_limit INTEGER, p_window_interval INTERVAL)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_time TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_count INTEGER;
  v_reset_time TIMESTAMP WITH TIME ZONE;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  -- Select existing record
  SELECT request_count, rate_limits.reset_time INTO v_current_count, v_reset_time
  FROM public.rate_limits
  WHERE ip = p_ip;

  IF NOT FOUND THEN
    -- First request
    v_reset_time := v_now + p_window_interval;
    INSERT INTO public.rate_limits (ip, request_count, reset_time)
    VALUES (p_ip, 1, v_reset_time);
    RETURN QUERY SELECT TRUE, p_limit - 1, v_reset_time;
  ELSIF v_now > v_reset_time THEN
    -- Reset window
    v_reset_time := v_now + p_window_interval;
    UPDATE public.rate_limits
    SET request_count = 1, reset_time = v_reset_time
    WHERE ip = p_ip;
    RETURN QUERY SELECT TRUE, p_limit - 1, v_reset_time;
  ELSIF v_current_count >= p_limit THEN
    -- Blocked
    RETURN QUERY SELECT FALSE, 0, v_reset_time;
  ELSE
    -- Increment
    v_current_count := v_current_count + 1;
    UPDATE public.rate_limits
    SET request_count = v_current_count
    WHERE ip = p_ip;
    RETURN QUERY SELECT TRUE, p_limit - v_current_count, v_reset_time;
  END IF;
END;
$$;
