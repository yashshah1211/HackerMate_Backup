-- Migration: 202607260002_grant_anon_hackathons_read.sql
-- Description: Grant anonymous/public read access to hackathon public display fields for partner pages.

-- 1. Create narrow RLS policy for anon SELECT on public.hackathons
DROP POLICY IF EXISTS hackathons_read_anon ON public.hackathons;
CREATE POLICY hackathons_read_anon ON public.hackathons 
  FOR SELECT TO anon 
  USING (true);

-- 2. Scope column-level GRANT for anon role to public display fields only
REVOKE ALL ON public.hackathons FROM anon;
GRANT SELECT (
  id,
  name,
  description,
  start_date,
  end_date,
  location,
  mode,
  prize_pool,
  website_url,
  tags,
  type,
  college,
  created_at
) ON public.hackathons TO anon;
