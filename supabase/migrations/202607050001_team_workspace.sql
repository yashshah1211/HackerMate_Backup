-- Create team_tasks table
CREATE TABLE IF NOT EXISTS public.team_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create team_documents table (shared brainstorm pad)
CREATE TABLE IF NOT EXISTS public.team_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create team_links table (resource hub)
CREATE TABLE IF NOT EXISTS public.team_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('design', 'repo', 'document', 'other')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_links ENABLE ROW LEVEL SECURITY;

-- Enable Policies utilizing is_team_member helper
CREATE POLICY team_tasks_policy ON public.team_tasks
  FOR ALL TO authenticated
  USING (public.is_team_member(team_id))
  WITH CHECK (public.is_team_member(team_id));

CREATE POLICY team_documents_policy ON public.team_documents
  FOR ALL TO authenticated
  USING (public.is_team_member(team_id))
  WITH CHECK (public.is_team_member(team_id));

CREATE POLICY team_links_policy ON public.team_links
  FOR ALL TO authenticated
  USING (public.is_team_member(team_id))
  WITH CHECK (public.is_team_member(team_id));

-- Add tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_links;
