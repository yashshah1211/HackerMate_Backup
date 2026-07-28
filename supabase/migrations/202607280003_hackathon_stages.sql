-- Migration: 202607280003_hackathon_stages
-- Creates hackathon_stages table for event schedule and stage management with RLS policies.

CREATE TABLE IF NOT EXISTS public.hackathon_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  stage_type VARCHAR(50) DEFAULT 'other',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.hackathon_stages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hackathon_stages
DROP POLICY IF EXISTS hackathon_stages_read ON public.hackathon_stages;
CREATE POLICY hackathon_stages_read ON public.hackathon_stages
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS hackathon_stages_insert ON public.hackathon_stages;
CREATE POLICY hackathon_stages_insert ON public.hackathon_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hackathon_stages_update ON public.hackathon_stages;
CREATE POLICY hackathon_stages_update ON public.hackathon_stages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hackathon_stages_delete ON public.hackathon_stages;
CREATE POLICY hackathon_stages_delete ON public.hackathon_stages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );
