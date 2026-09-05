-- Migration: 20260905200000_add_team_id_to_user_pitch_evaluations.sql
-- Description: Adds team_id to user_pitch_evaluations with column-scoped UPDATE permissions and team membership RLS policies

-- 1. Add team_id column with foreign key to teams table
ALTER TABLE public.user_pitch_evaluations
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- 2. Create index for fast team-scoped queries in team workspaces
CREATE INDEX IF NOT EXISTS idx_user_pitch_evaluations_team_id
  ON public.user_pitch_evaluations(team_id);

-- 3. Column-scoped grant: ONLY allow authenticated users to update team_id (prevents tampering with scores/results)
GRANT UPDATE (team_id) ON public.user_pitch_evaluations TO authenticated;

-- 4. RLS Policy: Users can only update their own pitch evaluations
DROP POLICY IF EXISTS "Users can update own pitch evaluations" ON public.user_pitch_evaluations;
CREATE POLICY "Users can update own pitch evaluations"
  ON public.user_pitch_evaluations
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 5. RLS Policy: Allow team members and owners to view pitch evaluations attached to their team
DROP POLICY IF EXISTS "Team members can view team pitch evaluations" ON public.user_pitch_evaluations;
CREATE POLICY "Team members can view team pitch evaluations"
  ON public.user_pitch_evaluations
  FOR SELECT
  TO authenticated
  USING (
    team_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_members.team_id = user_pitch_evaluations.team_id
          AND team_members.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.teams
        WHERE teams.id = user_pitch_evaluations.team_id
          AND teams.owner_id = (SELECT auth.uid())
      )
    )
  );
