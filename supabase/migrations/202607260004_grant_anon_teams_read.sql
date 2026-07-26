-- Migration: 202607260004_grant_anon_teams_read.sql
-- Description: Grant anonymous/public read access to teams, team_members, and public profiles for shared team links.

-- 1. Create RLS policy for anon SELECT on public.teams
DROP POLICY IF EXISTS teams_read_anon ON public.teams;
CREATE POLICY teams_read_anon ON public.teams 
  FOR SELECT TO anon 
  USING (true);

GRANT SELECT ON public.teams TO anon;

-- 2. Create RLS policy for anon SELECT on public.team_members
DROP POLICY IF EXISTS team_members_read_anon ON public.team_members;
CREATE POLICY team_members_read_anon ON public.team_members 
  FOR SELECT TO anon 
  USING (true);

GRANT SELECT ON public.team_members TO anon;

-- 3. Create RLS policy for anon SELECT on public.profiles
DROP POLICY IF EXISTS profiles_read_anon ON public.profiles;
CREATE POLICY profiles_read_anon ON public.profiles 
  FOR SELECT TO anon 
  USING (true);

GRANT SELECT (
  id,
  full_name,
  avatar_url,
  college,
  bio,
  skills,
  role,
  created_at
) ON public.profiles TO anon;
