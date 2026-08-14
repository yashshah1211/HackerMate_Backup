-- ============================================================
-- Migration: 20260813190000_team_ppt_evaluations
-- Description: Idempotently ensures team_ppt_evaluations table,
--              private storage bucket team_pitch_decks, and RLS policies.
-- ============================================================

-- 1. Create team_ppt_evaluations table
CREATE TABLE IF NOT EXISTS public.team_ppt_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ps_title TEXT NOT NULL,
    ps_category TEXT NOT NULL DEFAULT 'software', -- 'software' | 'hardware' | 'open_innovation'
    submission_type TEXT NOT NULL DEFAULT 'pdf_upload', -- 'pdf_upload' | 'external_link'
    external_link_url TEXT,
    ppt_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'evaluating', -- 'evaluating' | 'completed' | 'failed'
    score_novelty INT DEFAULT 0,
    score_tech INT DEFAULT 0,
    score_ui_ux INT DEFAULT 0,
    score_team INT DEFAULT 0,
    score_impact INT DEFAULT 0,
    score_plan INT DEFAULT 0,
    score_clarity INT DEFAULT 0,
    total_score INT DEFAULT 0,
    grade TEXT DEFAULT 'Pending Evaluation',
    slide_breakdown JSONB DEFAULT '[]'::jsonb,
    ai_feedback JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_team_ppt_evaluations_team_id ON public.team_ppt_evaluations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_ppt_evaluations_team_version ON public.team_ppt_evaluations(team_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_team_ppt_evaluations_status ON public.team_ppt_evaluations(status);

-- 3. Enable RLS
ALTER TABLE public.team_ppt_evaluations ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Team Members, Team Owners, and Admins can SELECT evaluation history
DROP POLICY IF EXISTS "Allow team members to view pitch evaluations" ON public.team_ppt_evaluations;
CREATE POLICY "Allow team members to view pitch evaluations"
    ON public.team_ppt_evaluations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = team_ppt_evaluations.team_id
            AND tm.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_ppt_evaluations.team_id
            AND t.owner_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- 5. RLS Policy: Team Members, Team Owners, and Admins can INSERT pitch evaluations
DROP POLICY IF EXISTS "Allow team members to insert pitch evaluations" ON public.team_ppt_evaluations;
CREATE POLICY "Allow team members to insert pitch evaluations"
    ON public.team_ppt_evaluations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = submitted_by
        AND (
            EXISTS (
                SELECT 1 FROM public.team_members tm
                WHERE tm.team_id = team_ppt_evaluations.team_id
                AND tm.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.teams t
                WHERE t.id = team_ppt_evaluations.team_id
                AND t.owner_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'admin'
            )
        )
    );

-- 6. Setup private storage bucket `team_pitch_decks`
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'team_pitch_decks',
    'team_pitch_decks',
    false,
    15728640, -- 15MB limit
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['application/pdf']::text[];

-- 7. Storage RLS Policies: Restricted to Team Members and Owners
DROP POLICY IF EXISTS "Allow team members to upload pitch decks" ON storage.objects;
CREATE POLICY "Allow team members to upload pitch decks"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'team_pitch_decks'
        AND (
            EXISTS (
                SELECT 1 FROM public.team_members tm
                WHERE tm.team_id::text = (storage.foldername(name))[1]
                AND tm.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.teams t
                WHERE t.id::text = (storage.foldername(name))[1]
                AND t.owner_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'admin'
            )
        )
    );

DROP POLICY IF EXISTS "Allow team members to view pitch decks" ON storage.objects;
CREATE POLICY "Allow team members to view pitch decks"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'team_pitch_decks'
        AND (
            EXISTS (
                SELECT 1 FROM public.team_members tm
                WHERE tm.team_id::text = (storage.foldername(name))[1]
                AND tm.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.teams t
                WHERE t.id::text = (storage.foldername(name))[1]
                AND t.owner_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'admin'
            )
        )
    );

-- 8. Create Public / Safe View for Non-Secret Evaluation Data
DROP VIEW IF EXISTS public.team_ppt_evaluations_public CASCADE;
CREATE VIEW public.team_ppt_evaluations_public
    WITH (security_invoker = true)
AS
SELECT
    id,
    team_id,
    submitted_by,
    ps_title,
    ps_category,
    submission_type,
    external_link_url,
    file_name,
    version,
    status,
    score_novelty,
    score_tech,
    score_ui_ux,
    score_team,
    score_impact,
    score_plan,
    score_clarity,
    total_score,
    grade,
    slide_breakdown,
    ai_feedback,
    error_message,
    created_at,
    updated_at,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = team_ppt_evaluations.team_id
            AND tm.user_id = auth.uid()
        ) OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_ppt_evaluations.team_id
            AND t.owner_id = auth.uid()
        ) OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
        THEN ppt_url
        ELSE NULL
    END AS ppt_url
FROM public.team_ppt_evaluations;

GRANT SELECT ON public.team_ppt_evaluations_public TO authenticated;
