-- Migration: 202607120002_team_submissions
-- Create team_submissions table to support collaborative database-persisted submissions.

CREATE TABLE IF NOT EXISTS public.team_submissions (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  project_title TEXT DEFAULT '',
  demo_url TEXT DEFAULT '',
  github_url TEXT DEFAULT '',
  pitch_video_url TEXT DEFAULT '',
  slides_url TEXT DEFAULT '',
  checklist JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.team_submissions ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow all team members to view submission
CREATE POLICY team_submissions_select ON public.team_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = team_submissions.team_id
      AND team_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_submissions.team_id
      AND teams.owner_id = auth.uid()
    )
  );

-- Insert policy: Allow all team members to insert
CREATE POLICY team_submissions_insert ON public.team_submissions
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

-- Update policy: Allow all team members to update
CREATE POLICY team_submissions_update ON public.team_submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = team_submissions.team_id
      AND team_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_submissions.team_id
      AND teams.owner_id = auth.uid()
    )
  );
