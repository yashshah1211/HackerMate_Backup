-- Fix RLS policies for hackathon_registrations
-- 1. Drop existing restricted select policy
DROP POLICY IF EXISTS registrations_read ON public.hackathon_registrations;

-- 2. Create new select policy allowing all authenticated users to read registrations
CREATE POLICY registrations_read ON public.hackathon_registrations
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Create update policy allowing authenticated users to update their own registrations
DROP POLICY IF EXISTS registrations_update_self ON public.hackathon_registrations;
CREATE POLICY registrations_update_self ON public.hackathon_registrations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
