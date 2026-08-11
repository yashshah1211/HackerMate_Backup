-- Create sih_spoc_allowlist table if not exists
CREATE TABLE IF NOT EXISTS public.sih_spoc_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    college_name TEXT NOT NULL DEFAULT 'D.J. Sanghvi College of Engineering (DJSCE)',
    role TEXT NOT NULL DEFAULT 'spoc',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sih_spoc_allowlist ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT ON public.sih_spoc_allowlist TO authenticated, anon;
GRANT ALL ON public.sih_spoc_allowlist TO service_role;

-- RLS Policies
DROP POLICY IF EXISTS "Allow public select on sih_spoc_allowlist" ON public.sih_spoc_allowlist;
CREATE POLICY "Allow public select on sih_spoc_allowlist"
    ON public.sih_spoc_allowlist
    FOR SELECT
    USING (true);
