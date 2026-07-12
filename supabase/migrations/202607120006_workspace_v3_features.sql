-- Migration: 202607120006_workspace_v3_features
-- Create team_deployments and team_brainstorm_ideas tables.

-- 1. Deployments Table
CREATE TABLE IF NOT EXISTS public.team_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.team_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow team members to view deployments" ON public.team_deployments
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = team_deployments.team_id
        )
    );

CREATE POLICY "Allow team members to manage deployments" ON public.team_deployments
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = team_deployments.team_id
        )
    );


-- 2. Brainstorm Board Ideas Table
CREATE TABLE IF NOT EXISTS public.team_brainstorm_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    category TEXT DEFAULT 'core' NOT NULL,
    upvotes TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.team_brainstorm_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow team members to view brainstorm ideas" ON public.team_brainstorm_ideas
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = team_brainstorm_ideas.team_id
        )
    );

CREATE POLICY "Allow team members to insert brainstorm ideas" ON public.team_brainstorm_ideas
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND 
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = team_brainstorm_ideas.team_id
        )
    );

CREATE POLICY "Allow team members to manage their brainstorm ideas" ON public.team_brainstorm_ideas
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = team_brainstorm_ideas.team_id
        )
    );

-- Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_brainstorm_ideas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_deployments;
