-- Migration: 20261002233945_expo_leaderboard
-- Description: Creates the shared leaderboard table for the HackerMate Startup Expo, isolated for admin use only.

CREATE TABLE public.expo_leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 30),
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  time_seconds numeric NOT NULL CHECK (time_seconds > 0 AND time_seconds <= 300),
  challenge_id text,
  builder_ids text[],
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Cardinality check: either it's a manual entry (NULLs) or a real judge submission (exactly 4 builders).
  -- Note: Uniqueness of builders is enforced at the application tier.
  CONSTRAINT expo_leaderboard_builders_check CHECK (
    (challenge_id IS NULL AND builder_ids IS NULL) OR
    (challenge_id IS NOT NULL AND builder_ids IS NOT NULL AND cardinality(builder_ids) = 4)
  )
);

ALTER TABLE public.expo_leaderboard_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select expo_leaderboard_entries"
ON public.expo_leaderboard_entries
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert expo_leaderboard_entries"
ON public.expo_leaderboard_entries
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Admins can update expo_leaderboard_entries"
ON public.expo_leaderboard_entries
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete expo_leaderboard_entries"
ON public.expo_leaderboard_entries
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));
