-- Migration: 202607100006_restrict_profiles_read_to_authenticated
-- Security fix L3: Restrict profiles_read to authenticated only.
--
-- Drops the public-facing profiles_read SELECT policy and replaces it
-- with one restricted TO authenticated. This prevents anonymous (unauthenticated)
-- users from reading any profile data (including emails, full_name, and bios).
--
-- Since public users can no longer query the profiles table, is_admin() no longer
-- needs to be callable by the anon role. The temporary anon EXECUTE grant on
-- is_admin() is revoked.

-- 1. Update profiles_read SELECT policy to be TO authenticated only
DROP POLICY IF EXISTS profiles_read ON public.profiles;

CREATE POLICY profiles_read ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR is_banned = false OR is_admin(auth.uid()));

-- 2. Revoke the temporary anon execution grant on is_admin() helper
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon;
