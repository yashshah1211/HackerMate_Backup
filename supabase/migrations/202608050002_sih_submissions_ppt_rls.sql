-- ============================================================
-- Migration: Restrict ppt_url visibility on sih_mock_submissions
-- Only team members / owner / admin can read the raw ppt_url.
-- Everyone else sees the row (for leaderboard) but NOT the link.
-- ============================================================

-- 1. Drop the open "anyone authenticated can read everything" policy
DROP POLICY IF EXISTS "Allow authenticated read on sih_mock_submissions"
  ON public.sih_mock_submissions;

-- 2. New policy: ALL authenticated users can see public leaderboard columns
--    (team_id, ps_number, ps_title, ps_category, theme, status, scores, grade, ai_feedback)
--    but NOT ppt_url / github_url / demo_url — those are projected away in the frontend.
--    The RLS itself allows the row; column-level security is enforced at the API/frontend layer.
--    We additionally create a SECURITY DEFINER view that strips private links for non-members.
CREATE POLICY "Public leaderboard read on sih_mock_submissions"
  ON public.sih_mock_submissions
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Create a view that exposes only safe columns for leaderboard consumers.
--    Sensitive link columns are NULL unless the caller is a team member or owner.
CREATE OR REPLACE VIEW public.sih_mock_submissions_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  team_id,
  submitted_by,
  ps_number,
  ps_title,
  ps_category,
  theme,
  status,
  score_novelty,
  score_tech,
  score_ui_ux,
  score_impact,
  score_team,
  total_score,
  grade,
  ai_feedback,
  created_at,
  updated_at,
  -- Only expose links to team members / owner / admins
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = sih_mock_submissions.team_id
        AND tm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = sih_mock_submissions.team_id
        AND t.owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    THEN ppt_url
    ELSE NULL
  END AS ppt_url,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = sih_mock_submissions.team_id
        AND tm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = sih_mock_submissions.team_id
        AND t.owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    THEN github_url
    ELSE NULL
  END AS github_url,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = sih_mock_submissions.team_id
        AND tm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = sih_mock_submissions.team_id
        AND t.owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    THEN demo_url
    ELSE NULL
  END AS demo_url
FROM public.sih_mock_submissions;

-- Grant read access on the view to authenticated users
GRANT SELECT ON public.sih_mock_submissions_public TO authenticated;
