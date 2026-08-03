-- Migration: 202608030005_add_deleted_user_logs_audit_trigger
-- Creates deleted_user_logs audit table and safe trigger on profiles BEFORE DELETE.

-- 1. Create deleted_user_logs table
CREATE TABLE IF NOT EXISTS public.deleted_user_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT,
  full_name TEXT,
  college TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS with 0 public policies (only admin / service role can access)
ALTER TABLE public.deleted_user_logs ENABLE ROW LEVEL SECURITY;

-- 2. Safe Trigger Function (non-blocking exception handled)
CREATE OR REPLACE FUNCTION public.handle_profile_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.deleted_user_logs (user_id, email, full_name, college, deleted_at)
  VALUES (OLD.id, OLD.email, OLD.full_name, OLD.college, now());
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking safeguard: if logging fails for any reason, proceed with profile deletion smoothly
  RETURN OLD;
END;
$$;

-- 3. Bind BEFORE DELETE trigger to public.profiles
DROP TRIGGER IF EXISTS on_profile_before_delete ON public.profiles;
CREATE TRIGGER on_profile_before_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_before_delete();
