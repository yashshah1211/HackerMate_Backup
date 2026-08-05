-- Create sih_mock_submissions table for Mock SIH 2026 practice screening & judging
CREATE TABLE IF NOT EXISTS public.sih_mock_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ps_number TEXT NOT NULL,
    ps_title TEXT NOT NULL,
    ps_category TEXT NOT NULL DEFAULT 'software', -- 'software' | 'hardware'
    theme TEXT NOT NULL DEFAULT 'General',
    ppt_url TEXT NOT NULL,
    github_url TEXT,
    demo_url TEXT,
    status TEXT NOT NULL DEFAULT 'submitted', -- 'submitted' | 'evaluating' | 'reviewed'
    score_novelty INT DEFAULT 0,
    score_tech INT DEFAULT 0,
    score_ui_ux INT DEFAULT 0,
    score_impact INT DEFAULT 0,
    score_team INT DEFAULT 0,
    total_score INT DEFAULT 0,
    grade TEXT DEFAULT 'Pending Evaluation', -- 'Nomination Gold' | 'Nomination Ready' | 'Needs Iteration' | 'High Risk'
    ai_feedback JSONB DEFAULT '{}'::jsonb,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sih_mock_submissions_team_unique UNIQUE (team_id)
);

-- Index for fast queries by team_id and status
CREATE INDEX IF NOT EXISTS idx_sih_mock_submissions_team_id ON public.sih_mock_submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_sih_mock_submissions_status ON public.sih_mock_submissions(status);
CREATE INDEX IF NOT EXISTS idx_sih_mock_submissions_total_score ON public.sih_mock_submissions(total_score DESC);

-- Enable RLS
ALTER TABLE public.sih_mock_submissions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone authenticated can view submissions (for leaderboard & public screening feedback)
CREATE POLICY "Allow authenticated read on sih_mock_submissions"
    ON public.sih_mock_submissions
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy 2: Team owners and team members can insert/update their team's submission
CREATE POLICY "Allow team members to manage their sih_mock_submission"
    ON public.sih_mock_submissions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = sih_mock_submissions.team_id
            AND tm.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = sih_mock_submissions.team_id
            AND t.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = sih_mock_submissions.team_id
            AND tm.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = sih_mock_submissions.team_id
            AND t.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- Trigger for auto updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_sih_mock_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_sih_mock_submissions_updated_at ON public.sih_mock_submissions;
CREATE TRIGGER trg_set_sih_mock_submissions_updated_at
    BEFORE UPDATE ON public.sih_mock_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_sih_mock_submissions_updated_at();
