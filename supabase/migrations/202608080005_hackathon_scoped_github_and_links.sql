-- Migration: 202608080005_hackathon_scoped_github_and_links
-- 1. Create team_github_repos table for hackathon-scoped GitHub repository URLs.
-- 2. Add optional hackathon_id to team_links for event-specific vs global resource links.

-- 1. Create team_github_repos table
CREATE TABLE IF NOT EXISTS public.team_github_repos (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE,
  github_repo_url TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (team_id, hackathon_id)
);

ALTER TABLE public.team_github_repos ENABLE ROW LEVEL SECURITY;

-- Select Policy for team_github_repos
CREATE POLICY team_github_repos_select ON public.team_github_repos
  FOR SELECT TO authenticated, anon
  USING (true);

-- Insert Policy for team_github_repos
CREATE POLICY team_github_repos_insert ON public.team_github_repos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = team_id
      AND team_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_id
      AND teams.owner_id = auth.uid()
    )
  );

-- Update Policy for team_github_repos
CREATE POLICY team_github_repos_update ON public.team_github_repos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = team_github_repos.team_id
      AND team_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_github_repos.team_id
      AND teams.owner_id = auth.uid()
    )
  );

-- Backfill team_github_repos from teams.github_repo_url where present
INSERT INTO public.team_github_repos (team_id, hackathon_id, github_repo_url)
SELECT 
  t.id AS team_id,
  th.hackathon_id AS hackathon_id,
  t.github_repo_url
FROM public.teams t
JOIN public.team_hackathons th ON th.team_id = t.id
WHERE t.github_repo_url IS NOT NULL AND t.github_repo_url <> ''
ON CONFLICT (team_id, hackathon_id) DO NOTHING;

-- 2. Add optional hackathon_id column to team_links
ALTER TABLE public.team_links
  ADD COLUMN IF NOT EXISTS hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_team_links_hackathon ON public.team_links(team_id, hackathon_id);
