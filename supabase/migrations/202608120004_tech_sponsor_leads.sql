-- Migration: 202608120004_tech_sponsor_leads
-- Create table public.tech_sponsor_leads for tracking tech company sponsorship outreach, restricted exclusively to yashshah7117@gmail.com and service role.

CREATE TABLE IF NOT EXISTS public.tech_sponsor_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    website_url TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    public_source_url TEXT NOT NULL,
    target_role TEXT DEFAULT 'DevRel / Community Lead',
    pitch_type TEXT DEFAULT 'credits_perks',
    status TEXT DEFAULT 'draft', -- 'draft', 'pitch_sent', 'replied', 'partnered', 'opted_out'
    draft_pitch_subject TEXT,
    draft_pitch_body TEXT,
    pitch_sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tech_sponsor_leads ENABLE ROW LEVEL SECURITY;

-- Policy 1: Restrict access exclusively to yashshah7117@gmail.com for authenticated users
DROP POLICY IF EXISTS tech_sponsor_leads_yash_only ON public.tech_sponsor_leads;

CREATE POLICY tech_sponsor_leads_yash_only ON public.tech_sponsor_leads
    FOR ALL
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'yashshah7117@gmail.com')
    WITH CHECK ((auth.jwt() ->> 'email') = 'yashshah7117@gmail.com');

-- Policy 2: Service role full access
DROP POLICY IF EXISTS tech_sponsor_leads_service_role ON public.tech_sponsor_leads;

CREATE POLICY tech_sponsor_leads_service_role ON public.tech_sponsor_leads
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Seed 7 verified public tech sponsor leads
INSERT INTO public.tech_sponsor_leads (company_name, website_url, contact_email, public_source_url, target_role, pitch_type, status)
VALUES
  ('DigitalOcean', 'https://www.digitalocean.com', 'hatch@digitalocean.com', 'https://www.digitalocean.com/hatch', 'Hatch Program Lead', 'credits_perks', 'draft'),
  ('Postman', 'https://www.postman.com', 'studentprograms@postman.com', 'https://www.postman.com/student-program/', 'Student Programs Lead', 'credits_perks', 'draft'),
  ('GitHub', 'https://education.github.com', 'education@github.com', 'https://education.github.com', 'Developer Education Lead', 'credits_perks', 'draft'),
  ('Sentry', 'https://sentry.io', 'open-source@sentry.io', 'https://sentry.io/for/open-source/', 'Open Source / DevRel Lead', 'credits_perks', 'draft'),
  ('Appwrite', 'https://appwrite.io', 'community@appwrite.io', 'https://appwrite.io/community', 'Community & Developer Relations', 'credits_perks', 'draft'),
  ('MongoDB', 'https://www.mongodb.com', 'academic@mongodb.com', 'https://www.mongodb.com/academia', 'Academic & Student Lead', 'credits_perks', 'draft'),
  ('Auth0 by Okta', 'https://auth0.com', 'devrel@auth0.com', 'https://auth0.com/developers', 'Developer Relations', 'credits_perks', 'draft')
ON CONFLICT DO NOTHING;
