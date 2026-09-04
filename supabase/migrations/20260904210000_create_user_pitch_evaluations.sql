-- Migration: 20260904210000_create_user_pitch_evaluations.sql
-- Description: Creates user_pitch_evaluations table with RLS policies and indexes for signed-in user evaluation history

CREATE TABLE IF NOT EXISTS public.user_pitch_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ps_title TEXT NOT NULL,
    track_id TEXT NOT NULL DEFAULT 'web_dev',
    total_score INT NOT NULL,
    grade TEXT NOT NULL,
    used_ai_engine BOOLEAN NOT NULL DEFAULT true,
    sub_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    evaluation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user history queries ordered by recency
CREATE INDEX IF NOT EXISTS idx_user_pitch_evaluations_user_created 
    ON public.user_pitch_evaluations(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.user_pitch_evaluations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users can only read, insert, and delete their own records
DROP POLICY IF EXISTS "Users can view own pitch evaluations" ON public.user_pitch_evaluations;
CREATE POLICY "Users can view own pitch evaluations"
    ON public.user_pitch_evaluations
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own pitch evaluations" ON public.user_pitch_evaluations;
CREATE POLICY "Users can insert own pitch evaluations"
    ON public.user_pitch_evaluations
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own pitch evaluations" ON public.user_pitch_evaluations;
CREATE POLICY "Users can delete own pitch evaluations"
    ON public.user_pitch_evaluations
    FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- Grants
GRANT SELECT, INSERT, DELETE ON public.user_pitch_evaluations TO authenticated;
