-- Migration: 202607100008_prevent_anonymous_reports_and_spam
-- Security fix M3: Prevent anonymous report spam in user_reports.
--
-- Drops the weak INSERT policy that allowed reporter_id to be NULL,
-- and replaces it with a policy requiring reporter_id to match auth.uid().
--
-- Adds a unique constraint on (reporter_id, reported_id) to prevent duplicate
-- reports from a single user against the same target.

-- 1. Recreate the INSERT policy on user_reports
DROP POLICY IF EXISTS "Allow authenticated to submit reports" ON public.user_reports;

CREATE POLICY "Allow authenticated to submit reports" ON public.user_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- 2. Clean up any existing duplicate reports (keep the oldest one) to prevent constraint failure
DELETE FROM public.user_reports a
USING public.user_reports b
WHERE a.id > b.id
  AND a.reporter_id = b.reporter_id
  AND a.reported_id = b.reported_id;

-- 3. Add UNIQUE constraint to prevent duplicate reporting
ALTER TABLE public.user_reports
  ADD CONSTRAINT unique_reporter_reported UNIQUE (reporter_id, reported_id);
