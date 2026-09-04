-- Migration: 20260901203500_fix_lapsed_streaks_and_decay.sql
-- Description: Resets lapsed daily streaks for inactive users and provides a daily maintenance procedure

-- 1. Reset all lapsed current_streaks for users who did not visit today or yesterday
--    (Preserving longest_streak and last_active_date intact)
UPDATE public.profiles
SET current_streak = 0
WHERE (last_active_date IS NULL OR last_active_date < (CURRENT_DATE - INTERVAL '1 day'))
  AND current_streak > 0;

-- 2. Ensure column SELECT permissions for streak tracking are granted to anon & authenticated
GRANT SELECT (current_streak, longest_streak, last_active_date) ON public.profiles TO anon, authenticated;

-- 3. Stored Procedure for daily streak maintenance / decay
CREATE OR REPLACE FUNCTION public.cleanup_lapsed_streaks()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_updated_count INTEGER := 0;
BEGIN
  -- Reset streaks for profiles whose last visit was prior to yesterday
  UPDATE public.profiles
  SET current_streak = 0
  WHERE (last_active_date IS NULL OR last_active_date < (v_today - INTERVAL '1 day'))
    AND current_streak > 0;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'lapsed_streaks_reset', v_updated_count,
    'maintenance_date', v_today
  );
END;
$$;

-- Secure procedure execution permissions
REVOKE ALL ON FUNCTION public.cleanup_lapsed_streaks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_lapsed_streaks() TO authenticated, service_role;
