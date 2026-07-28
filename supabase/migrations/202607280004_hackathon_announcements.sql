-- Migration: 202607280004_hackathon_announcements
-- Creates hackathon_announcements table for organizer broadcasts with RLS policies.

CREATE TABLE IF NOT EXISTS public.hackathon_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE NOT NULL,
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  linked_stage_id UUID REFERENCES public.hackathon_stages(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.hackathon_announcements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hackathon_announcements
DROP POLICY IF EXISTS hackathon_announcements_read ON public.hackathon_announcements;
CREATE POLICY hackathon_announcements_read ON public.hackathon_announcements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.hackathon_registrations hr
      WHERE hr.hackathon_id = hackathon_id AND hr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hackathon_announcements_insert ON public.hackathon_announcements;
CREATE POLICY hackathon_announcements_insert ON public.hackathon_announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hackathon_announcements_update ON public.hackathon_announcements;
CREATE POLICY hackathon_announcements_update ON public.hackathon_announcements
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

DROP POLICY IF EXISTS hackathon_announcements_delete ON public.hackathon_announcements;
CREATE POLICY hackathon_announcements_delete ON public.hackathon_announcements
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hackathons h
      WHERE h.id = hackathon_id AND h.organizer_id = auth.uid()
    )
  );
