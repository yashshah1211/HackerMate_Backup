-- Migration: 202607120005_workspace_v2_features
-- Create team_task_comments, team_link_upvotes, and team_link_comments tables.

-- 1. Task Comments Table
CREATE TABLE IF NOT EXISTS public.team_task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.team_tasks(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.team_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow team members to view task comments" ON public.team_task_comments
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = (SELECT team_id FROM public.team_tasks WHERE id = task_id)
        )
    );

CREATE POLICY "Allow team members to insert task comments" ON public.team_task_comments
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND 
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = (SELECT team_id FROM public.team_tasks WHERE id = task_id)
        )
    );


-- 2. Resource Link Upvotes Table (Junction)
CREATE TABLE IF NOT EXISTS public.team_link_upvotes (
    link_id UUID REFERENCES public.team_links(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (link_id, user_id)
);

-- RLS
ALTER TABLE public.team_link_upvotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow team members to view link upvotes" ON public.team_link_upvotes
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
        )
    );

CREATE POLICY "Allow team members to manage link upvotes" ON public.team_link_upvotes
    FOR ALL USING (
        auth.uid() = user_id AND 
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
        )
    );


-- 3. Resource Link Comments Table
CREATE TABLE IF NOT EXISTS public.team_link_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID REFERENCES public.team_links(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.team_link_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow team members to view link comments" ON public.team_link_comments
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
        )
    );

CREATE POLICY "Allow team members to insert link comments" ON public.team_link_comments
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND 
        auth.uid() IN (
            SELECT user_id FROM public.team_members 
            WHERE team_id = (SELECT team_id FROM public.team_links WHERE id = link_id)
        )
    );
