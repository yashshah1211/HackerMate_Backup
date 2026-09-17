-- Migration: Add DELETE RLS policy for challenge_submissions
-- Allows authors, team owners (if team submission), and admins to delete submissions

DROP POLICY IF EXISTS "Users and teammates can delete their own submissions" ON public.challenge_submissions;

CREATE POLICY "Users and teammates can delete their own submissions"
    ON public.challenge_submissions
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id
        OR (
            team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.teams t
                WHERE t.id = challenge_submissions.team_id
                AND t.owner_id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );
