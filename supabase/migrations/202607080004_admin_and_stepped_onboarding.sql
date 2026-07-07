-- Migration: 202607080004_admin_and_stepped_onboarding
-- Adds role and is_banned fields to profiles.
-- Configures is_admin() helper function, roles-protection trigger, and updated RLS rules.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Security definer helper function to safely check user roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Trigger to prevent standard users from updating their own roles or ban statuses
CREATE OR REPLACE FUNCTION public.handle_profile_roles_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only restrict updates if executed from a user session context (auth.uid() is not null)
  IF auth.uid() IS NOT NULL AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_banned IS DISTINCT FROM NEW.is_banned) THEN
    IF NOT public.is_admin(auth.uid()) THEN
      NEW.role := OLD.role;
      NEW.is_banned := OLD.is_banned;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_profile_roles_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_roles_update();

-- Re-configure SELECT policy on profiles to hide banned users from standard users
DROP POLICY IF EXISTS profiles_read ON public.profiles;

CREATE POLICY profiles_read ON public.profiles
  FOR SELECT
  TO public
  USING (id = auth.uid() OR is_banned = false OR is_admin(auth.uid()));

-- Create profile update policy for admin
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Add SELECT and DELETE policies for admins on user_reports
CREATE POLICY user_reports_admin_select ON public.user_reports
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY user_reports_admin_delete ON public.user_reports
  FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));
