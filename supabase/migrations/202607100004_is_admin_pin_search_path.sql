-- Migration: 202607100004_is_admin_pin_search_path
-- Security fix H5: Add SET search_path = public, pg_temp to is_admin().
--
-- is_admin() is SECURITY DEFINER but was missing a pinned search_path, unlike
-- every other SECURITY DEFINER function in this project. Without it, a malicious
-- extension or a schema injected earlier in the search_path could shadow the
-- public.profiles table and cause the admin check to read the wrong data.
--
-- The function body is identical to the original; only the search_path is added.

CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
$$;
