-- Migration: 202608100001_sih_spoc_allowlist
-- Create sih_spoc_allowlist table for explicit SPOC authorization and multi-college data isolation.

CREATE TABLE IF NOT EXISTS public.sih_spoc_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  college_name TEXT NOT NULL,
  role TEXT DEFAULT 'spoc', -- 'spoc', 'hod', 'faculty', 'admin'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.sih_spoc_allowlist ENABLE ROW LEVEL SECURITY;

-- Allow read access to active allowlist entries for SPOC verification check
CREATE POLICY sih_spoc_allowlist_select ON public.sih_spoc_allowlist
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- Seed initial authorized SPOC accounts (including admin & test accounts) so existing access is preserved
INSERT INTO public.sih_spoc_allowlist (email, college_name, role, is_active)
VALUES 
  ('yashshah7117@gmail.com', 'D.J. Sanghvi College of Engineering (DJSCE)', 'admin', true),
  ('yashshah111@gmail.com', 'D.J. Sanghvi College of Engineering (DJSCE)', 'admin', true)
ON CONFLICT (email) DO UPDATE 
SET college_name = EXCLUDED.college_name,
    is_active = true,
    updated_at = timezone('utc'::text, now());
