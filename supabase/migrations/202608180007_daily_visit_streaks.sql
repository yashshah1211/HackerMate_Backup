-- Migration: 202608180007_daily_visit_streaks.sql
-- Description: Adds automatic daily visit streak tracking, history table, and RPC

-- 1. Add streak tracking columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT NULL;

-- 2. Create streak history table for tracking check-in history
CREATE TABLE IF NOT EXISTS public.builder_streak_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_visit_date UNIQUE (user_id, visit_date)
);

-- Index for efficient range queries
CREATE INDEX IF NOT EXISTS idx_streak_history_user_date ON public.builder_streak_history(user_id, visit_date);

-- Enable RLS
ALTER TABLE public.builder_streak_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view streak history"
ON public.builder_streak_history FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Users can insert own streak history"
ON public.builder_streak_history FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3. Automatic Daily Visit Streak RPC
CREATE OR REPLACE FUNCTION public.record_daily_visit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_last_date DATE;
  v_current_streak INTEGER;
  v_longest_streak INTEGER;
  v_is_new_record BOOLEAN := false;
  v_streak_updated BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_today := CURRENT_DATE;

  SELECT last_active_date, COALESCE(current_streak, 0), COALESCE(longest_streak, 0)
  INTO v_last_date, v_current_streak, v_longest_streak
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  -- Case 1: Already checked in today
  IF v_last_date = v_today THEN
    RETURN jsonb_build_object(
      'success', true,
      'streak_updated', false,
      'current_streak', v_current_streak,
      'longest_streak', v_longest_streak,
      'is_new_record', false
    );
  END IF;

  -- Case 2: Consecutive day check-in (yesterday)
  IF v_last_date = (v_today - INTERVAL '1 day')::DATE THEN
    v_current_streak := v_current_streak + 1;
    v_streak_updated := true;
  -- Case 3: Missed days or first visit
  ELSE
    v_current_streak := 1;
    v_streak_updated := true;
  END IF;

  IF v_current_streak > v_longest_streak THEN
    v_longest_streak := v_current_streak;
    v_is_new_record := true;
  END IF;

  -- Update profile record
  UPDATE public.profiles
  SET
    current_streak = v_current_streak,
    longest_streak = v_longest_streak,
    last_active_date = v_today
  WHERE id = v_user_id;

  -- Record in streak history table (ignoring duplicate conflicts)
  INSERT INTO public.builder_streak_history (user_id, visit_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, visit_date) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'streak_updated', v_streak_updated,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'is_new_record', v_is_new_record
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_daily_visit() TO authenticated;
