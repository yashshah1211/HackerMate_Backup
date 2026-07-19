-- Migration: 202607190001_admin_delete_team
-- Enable admin users to delete any team from the database.

DROP POLICY IF EXISTS teams_delete_owner ON public.teams;

CREATE POLICY teams_delete_owner ON public.teams
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));
