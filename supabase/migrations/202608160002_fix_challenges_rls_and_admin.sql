-- ============================================================================
-- Migration: Fix Weekly Challenges & Submissions RLS Policies
-- Description: Expand admin condition to include role = 'admin', is_admin = true,
--              or super-admin email fallback so RLS succeeds in all environments.
-- ============================================================================

-- 1. Ensure RLS is enabled
ALTER TABLE IF EXISTS public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.challenge_submissions ENABLE ROW LEVEL SECURITY;

-- 2. Update weekly_challenges Select Policy
DROP POLICY IF EXISTS "Public can view active or closed challenges" ON public.weekly_challenges;
CREATE POLICY "Public can view active or closed challenges"
    ON public.weekly_challenges
    FOR SELECT
    USING (
        status IN ('active', 'closed')
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.role = 'admin' OR p.is_admin = true OR p.email = 'yashshah7117@gmail.com')
        )
    );

-- 3. Update weekly_challenges Admin Management Policy
DROP POLICY IF EXISTS "Admins can manage weekly challenges" ON public.weekly_challenges;
CREATE POLICY "Admins can manage weekly challenges"
    ON public.weekly_challenges
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.role = 'admin' OR p.is_admin = true OR p.email = 'yashshah7117@gmail.com')
        )
        OR (auth.jwt() ->> 'email' = 'yashshah7117@gmail.com')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.role = 'admin' OR p.is_admin = true OR p.email = 'yashshah7117@gmail.com')
        )
        OR (auth.jwt() ->> 'email' = 'yashshah7117@gmail.com')
    );

-- 4. Update challenge_submissions View Policy
DROP POLICY IF EXISTS "Users and teammates can view their own submissions" ON public.challenge_submissions;
CREATE POLICY "Users and teammates can view their own submissions"
    ON public.challenge_submissions
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id
        OR (
            team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.team_members tm
                WHERE tm.team_id = challenge_submissions.team_id
                AND tm.user_id = auth.uid()
            )
        )
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
            AND (p.role = 'admin' OR p.is_admin = true OR p.email = 'yashshah7117@gmail.com')
        )
        OR (auth.jwt() ->> 'email' = 'yashshah7117@gmail.com')
    );

-- 5. Update challenge_submissions Insert Policy
DROP POLICY IF EXISTS "Authenticated users can submit to challenges" ON public.challenge_submissions;
CREATE POLICY "Authenticated users can submit to challenges"
    ON public.challenge_submissions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.role = 'admin' OR p.is_admin = true OR p.email = 'yashshah7117@gmail.com')
        )
    );
