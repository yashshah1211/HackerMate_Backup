-- Migration: 202607210001_organizer_leads
-- Create table public.organizer_leads for tracking hackathon outreach to organizers, restricted exclusively to yashshah7117@gmail.com.

CREATE TABLE IF NOT EXISTS public.organizer_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    college_or_host TEXT,
    unstop_url TEXT UNIQUE NOT NULL,
    organizer_email TEXT,
    event_date TEXT,
    status TEXT DEFAULT 'new', -- 'new', 'pitch_sent', 'replied', 'archived'
    pitch_sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.organizer_leads ENABLE ROW LEVEL SECURITY;

-- Policy: Restrict ALL access exclusively to yashshah7117@gmail.com
DROP POLICY IF EXISTS organizer_leads_yash_only ON public.organizer_leads;

CREATE POLICY organizer_leads_yash_only ON public.organizer_leads
    FOR ALL
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'yashshah7117@gmail.com')
    WITH CHECK ((auth.jwt() ->> 'email') = 'yashshah7117@gmail.com');
