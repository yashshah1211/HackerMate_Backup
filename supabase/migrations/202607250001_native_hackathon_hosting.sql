-- Migration: 202607250001_native_hackathon_hosting
-- Ensure hackathon_posts and hackathon_resources tables exist with RLS policies for Native Event Hosting.

CREATE TABLE IF NOT EXISTS public.hackathon_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  is_announcement BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hackathon_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.hackathon_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathon_resources ENABLE ROW LEVEL SECURITY;

-- Policies for hackathon_posts
DROP POLICY IF EXISTS hackathon_posts_read ON public.hackathon_posts;
CREATE POLICY hackathon_posts_read ON public.hackathon_posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS hackathon_posts_insert ON public.hackathon_posts;
CREATE POLICY hackathon_posts_insert ON public.hackathon_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND (
      EXISTS (
        SELECT 1 FROM public.hackathons h
        WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM public.hackathon_registrations hr
        WHERE hr.hackathon_id = hackathon_id AND hr.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS hackathon_posts_delete ON public.hackathon_posts;
CREATE POLICY hackathon_posts_delete ON public.hackathon_posts
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );

-- Policies for hackathon_resources
DROP POLICY IF EXISTS hackathon_resources_read ON public.hackathon_resources;
CREATE POLICY hackathon_resources_read ON public.hackathon_resources
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS hackathon_resources_insert ON public.hackathon_resources;
CREATE POLICY hackathon_resources_insert ON public.hackathon_resources
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hackathon_resources_delete ON public.hackathon_resources;
CREATE POLICY hackathon_resources_delete ON public.hackathon_resources
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );
