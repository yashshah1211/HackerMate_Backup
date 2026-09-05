-- ============================================================
-- Migration: 202608160001_weekly_practice_challenges
-- Description: Standalone Weekly Practice Challenges & Submissions
--              Decoupled from SIH and Team Builder tables.
-- ============================================================

-- 1. Create weekly_challenges table
CREATE TABLE IF NOT EXISTS public.weekly_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_number INT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    track TEXT NOT NULL DEFAULT 'Full-Stack / AI',     -- 'Full-Stack / AI' | 'FinTech' | 'Cloud & Systems' | 'Open'
    difficulty TEXT NOT NULL DEFAULT 'Intermediate',   -- 'Beginner' | 'Intermediate' | 'Advanced'
    summary TEXT NOT NULL DEFAULT '',                  -- Short 1-2 sentence hook
    problem_statement TEXT NOT NULL,                  -- Markdown problem context, user stories, requirements
    constraints JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Key constraints
    slide_template JSONB NOT NULL DEFAULT '[]'::jsonb, -- Fixed 5-slide blueprint
    starter_template_url TEXT,                        -- Link to blank Google Slides / PPTX starter deck
    status TEXT NOT NULL DEFAULT 'active',             -- 'draft' | 'active' | 'closed' | 'archived'
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for weekly_challenges
CREATE INDEX IF NOT EXISTS idx_weekly_challenges_status_window ON public.weekly_challenges(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_weekly_challenges_slug ON public.weekly_challenges(slug);
CREATE INDEX IF NOT EXISTS idx_weekly_challenges_number ON public.weekly_challenges(challenge_number DESC);

-- 3. Create challenge_submissions table
CREATE TABLE IF NOT EXISTS public.challenge_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES public.weekly_challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL, -- Nullable: NULL for solo, set if submitted for a team
    submission_mode TEXT NOT NULL DEFAULT 'solo',                -- 'solo' | 'team'
    submission_type TEXT NOT NULL DEFAULT 'pdf_upload',          -- 'pdf_upload' | 'external_link'
    external_link_url TEXT,
    ppt_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    github_url TEXT,
    demo_url TEXT,
    version INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'evaluating',                   -- 'evaluating' | 'completed' | 'failed'
    
    -- Generic 100-Point Practice Rubric
    score_problem INT DEFAULT 0,            -- 0 to 25 pts (Problem Framing & Value Proposition)
    score_solution INT DEFAULT 0,           -- 0 to 25 pts (Proposed Solution & Innovation)
    score_architecture INT DEFAULT 0,       -- 0 to 30 pts (Technical Architecture & Pipeline)
    score_feasibility_impact INT DEFAULT 0, -- 0 to 20 pts (Feasibility, Risks & Metrics)
    total_score INT DEFAULT 0,              -- 0 to 100 pts
    
    grade TEXT DEFAULT 'Evaluating',        -- 'Mastery 🏆' | 'Strong Contender 🚀' | 'Developing 💡' | 'Needs Revision 🛠️'
    strengths JSONB DEFAULT '[]'::jsonb,
    growth_areas JSONB DEFAULT '[]'::jsonb,
    slide_feedback JSONB DEFAULT '{}'::jsonb, -- { slide1: "...", slide2: "...", ... }
    format_violations JSONB DEFAULT '[]'::jsonb,
    score_deductions JSONB DEFAULT '{}'::jsonb,
    ai_raw_feedback JSONB DEFAULT '{}'::jsonb,
    used_ai_fallback BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes for challenge_submissions
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_user ON public.challenge_submissions(challenge_id, user_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_team ON public.challenge_submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_status ON public.challenge_submissions(status);
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_created ON public.challenge_submissions(created_at DESC);

-- 5. Enable RLS
ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_submissions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for weekly_challenges
DROP POLICY IF EXISTS "Public can view active or closed challenges" ON public.weekly_challenges;
CREATE POLICY "Public can view active or closed challenges"
    ON public.weekly_challenges
    FOR SELECT
    USING (status IN ('active', 'closed') OR EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ));

DROP POLICY IF EXISTS "Admins can manage weekly challenges" ON public.weekly_challenges;
CREATE POLICY "Admins can manage weekly challenges"
    ON public.weekly_challenges
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );

-- 7. RLS Policies for challenge_submissions
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
            AND p.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Authenticated users can submit to challenges" ON public.challenge_submissions;
CREATE POLICY "Authenticated users can submit to challenges"
    ON public.challenge_submissions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
    );

-- 8. Storage Bucket for Challenge Pitch Decks
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'challenge_submissions_bucket',
    'challenge_submissions_bucket',
    false,
    15728640, -- 15MB limit
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['application/pdf']::text[];

-- 9. Storage RLS Policies
DROP POLICY IF EXISTS "Allow authenticated users to upload challenge decks" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload challenge decks"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'challenge_submissions_bucket'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Allow users to view their challenge decks" ON storage.objects;
CREATE POLICY "Allow users to view their challenge decks"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'challenge_submissions_bucket'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
            )
        )
    );

-- 10. Seed Initial Practice Challenge #01
INSERT INTO public.weekly_challenges (
    challenge_number,
    title,
    slug,
    track,
    difficulty,
    summary,
    problem_statement,
    constraints,
    slide_template,
    starter_template_url,
    status,
    starts_at,
    ends_at
) VALUES (
    1,
    'AI Emergency Triage & Real-Time Hospital Bed Allocation',
    'ai-emergency-triage-hospital-allocation',
    'Full-Stack / AI',
    'Intermediate',
    'Design an intelligent, distributed triage and ambulance dispatch system that routes emergency patients based on real-time bed telemetry and vital prioritization.',
    '### Background
Urban emergency departments face acute overcrowding and severe bottlenecks during surge events. Ambulances frequently arrive at trauma centers only to find ICU beds, CT scanners, or specialist teams unavailable, adding critical minutes to patient turnaround times.

### Core Problem
Design an intelligent system architecture and pitch deck for an **AI Emergency Triage & Hospital Bed Allocation System**. 
Your system should:
1. **Intake Patient Vitals in Transit:** Stream real-time telemetry (HR, BP, SpO2, Glasgow Coma Scale) from ambulances or emergency dispatch.
2. **Predictive Acuity & Bed Matching:** Compute emergency acuity scores and dynamically route ambulances to regional hospitals with verified capacity and ready trauma teams.
3. **Fail-Safe Offline/Edge Architecture:** Ensure triage decisions remain actionable even under intermittent mobile connectivity or high server load.

### Key Requirements
- **Slide 1:** Problem Framing, target stakeholders (paramedics, triage nurses, hospital admins), and quantified delay pain points.
- **Slide 2:** Core Proposed Solution, system moat, and innovation over legacy dispatch software.
- **Slide 3:** Technical Architecture, data ingestion pipeline (IoT/APIs -> queue -> ML model -> WebSocket dispatch), database choice, and latency considerations (<500ms).
- **Slide 4:** Feasibility, risk mitigations (HIPAA/data privacy, edge fallback when offline, model hallucinations).
- **Slide 5:** Measurable impact metrics (e.g. 35% reduction in patient handoff latency) and milestone execution roadmap.',
    '["Maximum 5 slides total in submission deck", "Must include an end-to-end data pipeline in Slide 3", "Quantified baseline metrics required in Slide 5"]'::jsonb,
    '[
        {"slideNumber": 1, "title": "Slide 1: Problem Understanding & Stakeholders", "category": "Problem & Market Gap"},
        {"slideNumber": 2, "title": "Slide 2: Proposed Solution & Core Innovation", "category": "Solution & Moat"},
        {"slideNumber": 3, "title": "Slide 3: Technical Architecture & Pipeline", "category": "System Architecture"},
        {"slideNumber": 4, "title": "Slide 4: Feasibility & Risk Mitigation", "category": "Feasibility & Risks"},
        {"slideNumber": 5, "title": "Slide 5: Impact Metrics & 48h Roadmap", "category": "Impact & Milestones"}
    ]'::jsonb,
    'https://docs.google.com/presentation/d/1exampleTemplateId/edit',
    'active',
    NOW(),
    NOW() + INTERVAL '14 days'
) ON CONFLICT (challenge_number) DO NOTHING;
